/**
 * T22 MVT（Mapbox Vector Tile）解码
 *
 * MVT 是 protobuf 编码的瓦片容器：一个 Tile 里有若干 Layer，每个 Layer 里有
 * 要素（Feature），要素的几何被压缩成「命令 + 参数」的整数数组。这里不引入
 * 第三方 protobuf / 矢量瓦片库：
 *
 *   ① 只用到 protocol buffers 的 varint / length-delimited 两种线格式，
 *      手写一个 Reader 比引入通用 runtime 更小、更好测；
 *   ② 几何命令只有 MoveTo(1) / LineTo(2) / ClosePath(7)，坐标是 zigzag 增量；
 *   ③ 输出统一成 GeoJSON 几何，直接复用 T06 的要素类型。
 *
 * 坐标换算：MVT 的坐标是瓦片内像素（0..extent，y 向下），本身不含 z/x/y。
 * 想知道经纬度就必须由调用方给出瓦片编号；没给时保留瓦片内坐标，不做猜测。
 *
 * ⛔ 不做的事：不请求任何切片服务、不缓存、不上传。纯函数，可单测。
 */

import { gunzipSync } from 'fflate'

import type { VectorFeature, VectorFeatureCollection } from './types'
import type { GeoJsonGeometry } from './wkt'

/** 单文件上限，与 T06 保持一致 */
export const MVT_MAX_BYTES = 20 * 1024 * 1024

/** 规范默认的瓦片内部坐标系边长 */
export const DEFAULT_EXTENT = 4096

/** 与 T14 一致的最大缩放级别 */
export const MAX_TILE_ZOOM = 22

export interface MvtTileId {
  z: number
  x: number
  y: number
}

export type MvtErrorCode =
  | 'empty'
  | 'too-large'
  | 'base64'
  | 'gzip'
  | 'protobuf'
  | 'geometry'
  | 'no-layers'
  | 'tile-range'

export class MvtError extends Error {
  readonly code: MvtErrorCode

  constructor(code: MvtErrorCode, message: string) {
    super(message)
    this.name = 'MvtError'
    this.code = code
  }
}

export type MvtWarningCode =
  | 'gzip'
  | 'unknown-geometry'
  | 'bad-geometry'
  | 'tags-odd'
  | 'no-tile'
  | 'missing-close'

export interface MvtWarning {
  code: MvtWarningCode
  count: number
}

export interface MvtLayerSummary {
  name: string
  version: number
  extent: number
  features: number
  points: number
  lines: number
  polygons: number
  unknown: number
}

export interface MvtFeature {
  layer: string
  id?: number
  type: 'Point' | 'LineString' | 'Polygon'
  geometry: GeoJsonGeometry
  properties: Record<string, unknown>
}

export interface MvtDecodeResult {
  layers: MvtLayerSummary[]
  features: MvtFeature[]
  collection: VectorFeatureCollection
  warnings: MvtWarning[]
  gzipped: boolean
  /** 字节数（解压前） */
  size: number
}

/* ------------------------------------------------------------------ *
 * protobuf 读取
 * ------------------------------------------------------------------ */

const decoder = new TextDecoder('utf-8')

class Reader {
  private pos = 0
  private readonly view: DataView

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  }

  get done(): boolean {
    return this.pos >= this.buf.length
  }

  tag(): { field: number; wire: number } {
    const key = this.varint()
    const field = Math.floor(key / 8)
    const wire = key % 8
    if (field <= 0) throw new MvtError('protobuf', 'invalid field number')
    return { field, wire }
  }

  varint(): number {
    let result = 0
    let shift = 0
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.buf.length) throw new MvtError('protobuf', 'truncated varint')
      const b = this.buf[this.pos++]
      result += (b & 0x7f) * 2 ** shift
      if ((b & 0x80) === 0) return result
      shift += 7
    }
    throw new MvtError('protobuf', 'varint longer than 10 bytes')
  }

  varintBig(): bigint {
    let result = 0n
    let shift = 0n
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.buf.length) throw new MvtError('protobuf', 'truncated varint')
      const b = this.buf[this.pos++]
      result |= BigInt(b & 0x7f) << shift
      if ((b & 0x80) === 0) return result
      shift += 7n
    }
    throw new MvtError('protobuf', 'varint longer than 10 bytes')
  }

  bytes(): Uint8Array {
    const len = this.varint()
    if (this.pos + len > this.buf.length) throw new MvtError('protobuf', 'truncated field')
    const out = this.buf.subarray(this.pos, this.pos + len)
    this.pos += len
    return out
  }

  string(): string {
    return decoder.decode(this.bytes())
  }

  float32(): number {
    if (this.pos + 4 > this.buf.length) throw new MvtError('protobuf', 'truncated float')
    const value = this.view.getFloat32(this.pos, true)
    this.pos += 4
    return value
  }

  float64(): number {
    if (this.pos + 8 > this.buf.length) throw new MvtError('protobuf', 'truncated double')
    const value = this.view.getFloat64(this.pos, true)
    this.pos += 8
    return value
  }

  skip(wire: number): void {
    switch (wire) {
      case 0:
        this.varint()
        return
      case 1:
        this.advance(8)
        return
      case 2:
        this.advance(this.varint())
        return
      case 5:
        this.advance(4)
        return
      default:
        throw new MvtError('protobuf', `unsupported wire type ${wire}`)
    }
  }

  private advance(n: number): void {
    if (this.pos + n > this.buf.length) throw new MvtError('protobuf', 'truncated field')
    this.pos += n
  }
}

/** 读取 packed / unpacked 的 repeated uint32 */
function readUint32List(r: Reader, wire: number, out: number[]): void {
  if (wire === 0) {
    out.push(r.varint())
    return
  }
  if (wire !== 2) {
    r.skip(wire)
    return
  }
  const packed = new Reader(r.bytes())
  while (!packed.done) out.push(packed.varint())
}

function readValue(buf: Uint8Array): unknown {
  const r = new Reader(buf)
  let out: unknown = null
  while (!r.done) {
    const { field, wire } = r.tag()
    if (field === 1 && wire === 2) out = r.string()
    else if (field === 2 && wire === 5) out = r.float32()
    else if (field === 3 && wire === 1) out = r.float64()
    else if (field === 4 && wire === 0) out = Number(BigInt.asIntN(64, r.varintBig()))
    else if (field === 5 && wire === 0) out = Number(r.varintBig())
    else if (field === 6 && wire === 0) {
      const raw = r.varintBig()
      out = Number((raw >> 1n) ^ -(raw & 1n))
    } else if (field === 7 && wire === 0) out = r.varint() !== 0
    else r.skip(wire)
  }
  return out
}

interface RawFeature {
  id?: number
  type: number
  tags: number[]
  geometry: number[]
}

interface RawLayer {
  name: string
  version: number
  extent: number
  keys: string[]
  values: unknown[]
  features: RawFeature[]
}

function readFeature(buf: Uint8Array): RawFeature {
  const r = new Reader(buf)
  const feature: RawFeature = { type: 0, tags: [], geometry: [] }
  while (!r.done) {
    const { field, wire } = r.tag()
    if (field === 1 && wire === 0) {
      feature.id = Number(r.varintBig())
    } else if (field === 2) {
      readUint32List(r, wire, feature.tags)
    } else if (field === 3 && wire === 0) {
      feature.type = r.varint()
    } else if (field === 4) {
      readUint32List(r, wire, feature.geometry)
    } else {
      r.skip(wire)
    }
  }
  return feature
}

function readLayer(buf: Uint8Array): RawLayer {
  const r = new Reader(buf)
  const layer: RawLayer = {
    name: '',
    version: 1,
    extent: DEFAULT_EXTENT,
    keys: [],
    values: [],
    features: []
  }
  const featureBufs: Uint8Array[] = []

  while (!r.done) {
    const { field, wire } = r.tag()
    if (field === 1 && wire === 2) {
      layer.name = r.string()
    } else if (field === 2 && wire === 2) {
      featureBufs.push(r.bytes())
    } else if (field === 3 && wire === 2) {
      layer.keys.push(r.string())
    } else if (field === 4 && wire === 2) {
      layer.values.push(readValue(r.bytes()))
    } else if (field === 5 && wire === 0) {
      const extent = r.varint()
      layer.extent = extent > 0 ? extent : DEFAULT_EXTENT
    } else if (field === 15 && wire === 0) {
      layer.version = r.varint()
    } else {
      r.skip(wire)
    }
  }

  // Feature 在 wire 里可能排在 keys / values / extent 之前，因此延后解析
  layer.features = featureBufs.map(readFeature)
  return layer
}

/* ------------------------------------------------------------------ *
 * 几何命令解码
 * ------------------------------------------------------------------ */

const MOVE_TO = 1
const LINE_TO = 2
const CLOSE_PATH = 7

function unzigzag(value: number): number {
  return value % 2 === 0 ? value / 2 : -(value + 1) / 2
}

interface GeometryCommand {
  id: number
  points: [number, number][]
}

function* iterateCommands(cmds: readonly number[]): Generator<GeometryCommand> {
  let x = 0
  let y = 0
  let i = 0

  while (i < cmds.length) {
    const head = cmds[i++]
    const id = head & 0x7
    const count = head >>> 3

    if (id === MOVE_TO || id === LINE_TO) {
      const points: [number, number][] = []
      for (let k = 0; k < count; k++) {
        if (i + 1 >= cmds.length) throw new MvtError('geometry', 'geometry command truncated')
        x += unzigzag(cmds[i++])
        y += unzigzag(cmds[i++])
        points.push([x, y])
      }
      yield { id, points }
      continue
    }

    if (id === CLOSE_PATH) {
      yield { id, points: [] }
      continue
    }

    throw new MvtError('geometry', `unknown geometry command ${id}`)
  }
}

function decodePoints(cmds: readonly number[]): [number, number][] {
  const out: [number, number][] = []
  for (const command of iterateCommands(cmds)) {
    if (command.id === CLOSE_PATH) continue
    out.push(...command.points)
  }
  return out
}

function decodeLines(cmds: readonly number[]): [number, number][][] {
  const lines: [number, number][][] = []
  let current: [number, number][] | null = null

  for (const command of iterateCommands(cmds)) {
    if (command.id === MOVE_TO) {
      // 规范里一条线由一个 MoveTo 起始；count 大于 1 属于异常编码，
      // 这里按「每个点单独成线」降级，仍然保留全部坐标
      if (current && current.length > 0) lines.push(current)
      current = []
      for (const point of command.points) {
        if (current.length > 0) {
          lines.push(current)
          current = []
        }
        current.push(point)
      }
    } else if (command.id === LINE_TO) {
      if (!current) current = []
      current.push(...command.points)
    }
  }

  if (current && current.length > 0) lines.push(current)
  return lines
}

function decodeRings(cmds: readonly number[], warn: Warnings): [number, number][][] {
  const rings: [number, number][][] = []
  let current: [number, number][] | null = null

  for (const command of iterateCommands(cmds)) {
    if (command.id === MOVE_TO) {
      if (current && current.length > 0) rings.push(closeRing(current))
      current = []
      current.push(...command.points)
    } else if (command.id === LINE_TO) {
      if (!current) current = []
      current.push(...command.points)
    } else {
      if (!current || current.length === 0) continue
      rings.push(closeRing(current))
      current = null
    }
  }

  if (current && current.length > 0) {
    rings.push(closeRing(current))
    warn.add('missing-close')
  }
  return rings
}

function closeRing(ring: [number, number][]): [number, number][] {
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
  return ring
}

function signedArea(ring: readonly (readonly [number, number])[]): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]
    const b = ring[i + 1]
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return sum / 2
}

/* ------------------------------------------------------------------ *
 * 瓦片内坐标 → 经纬度
 * ------------------------------------------------------------------ */

function assertTile(tile: MvtTileId): void {
  const { z, x, y } = tile
  if (!Number.isInteger(z) || z < 0 || z > MAX_TILE_ZOOM) {
    throw new MvtError('tile-range', `zoom must be an integer in 0..${MAX_TILE_ZOOM}`)
  }
  const size = 2 ** z
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) {
    throw new MvtError('tile-range', 'tile index outside the grid')
  }
}

function projectPoint(
  x: number,
  y: number,
  extent: number,
  tile: MvtTileId
): [number, number] {
  const size = 2 ** tile.z
  const lng = ((tile.x + x / extent) / size) * 360 - 180
  const lat =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y + y / extent)) / size))) * 180) / Math.PI
  return [lng, lat]
}

/** 环方向：GeoJSON 要求外环逆时针（面积为正），内环顺时针 */
function orientRing(ring: [number, number][], positive: boolean): number[][] {
  const open = ring.slice(0, ring.length - 1)
  const area = signedArea(open)
  const wantReverse = positive ? area < 0 : area > 0
  const oriented = wantReverse ? ring.slice().reverse() : ring
  return oriented.map(([lng, lat]) => [lng, lat])
}

/** 把瓦片内坐标的各个环按「外环 + 内环」组装成 Polygon / MultiPolygon */
function assemblePolygons(
  rings: [number, number][][],
  extent: number,
  tile: MvtTileId | null
): GeoJsonGeometry | null {
  if (rings.length === 0) return null

  const areas = rings.map((ring) => signedArea(ring))
  const positive = areas.filter((area) => area > 0).length
  // MVT v2 规定外环在屏幕坐标系里是顺时针（y 向下时面积为正）。
  // 但个别编码器方向相反，按多数环的方向自适应，避免把整层判成一堆洞。
  const exteriorPositive = positive >= areas.length - positive

  const polygons: [number, number][][][] = []

  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i]
    const isExterior = (areas[i] > 0) === exteriorPositive
    const coords = tile
      ? ring.map(([x, y]) => projectPoint(x, y, extent, tile))
      : ring.map(([x, y]) => [x, y] as [number, number])

    if (isExterior || polygons.length === 0) {
      polygons.push([coords])
    } else {
      polygons[polygons.length - 1].push(coords)
    }
  }

  const shaped = polygons.map((polygon) =>
    polygon.map((ring, index) => {
      if (!tile) return ring.map(([x, y]) => [x, y])
      return orientRing(ring as [number, number][], index === 0)
    })
  )

  if (shaped.length === 1) return { type: 'Polygon', coordinates: shaped[0] }
  return { type: 'MultiPolygon', coordinates: shaped }
}

/* ------------------------------------------------------------------ *
 * 警告聚合
 * ------------------------------------------------------------------ */

class Warnings {
  private readonly counts = new Map<MvtWarningCode, number>()

  add(code: MvtWarningCode, count = 1): void {
    this.counts.set(code, (this.counts.get(code) ?? 0) + count)
  }

  list(): MvtWarning[] {
    return [...this.counts.entries()].map(([code, count]) => ({ code, count }))
  }
}

/* ------------------------------------------------------------------ *
 * 对外接口
 * ------------------------------------------------------------------ */

export function isValidTile(tile: MvtTileId): boolean {
  try {
    assertTile(tile)
    return true
  } catch {
    return false
  }
}

/**
 * 从文件名猜测瓦片编号，支持 `14_4823_6160.pbf`、`14-4823-6160.mvt`、
 * `14/4823/6160.pbf` 等常见命名。猜不出来返回 null，由用户手填。
 */
export function tileFromFileName(name: string): MvtTileId | null {
  const match = /(\d{1,2})[_./-](\d{1,7})[_./-](\d{1,7})/.exec(name)
  if (!match) return null
  const tile = { z: Number(match[1]), x: Number(match[2]), y: Number(match[3]) }
  return isValidTile(tile) ? tile : null
}

/** Base64（含 data URL 前缀、base64url 与换行）→ 字节 */
export function mvtFromBase64(input: string): Uint8Array {
  let text = input.trim()
  const dataUrl = /^data:[^,]*;base64,/i.exec(text)
  if (dataUrl) text = text.slice(dataUrl[0].length)

  text = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  if (text === '') throw new MvtError('empty', 'base64 input is empty')
  if (!/^[A-Za-z0-9+/]*$/.test(text)) throw new MvtError('base64', 'invalid base64 character')
  if (text.length % 4 === 1) throw new MvtError('base64', 'invalid base64 length')

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup = new Map<string, number>()
  for (let i = 0; i < alphabet.length; i++) lookup.set(alphabet[i], i)

  const out = new Uint8Array(Math.floor((text.length * 3) / 4))
  let outIndex = 0

  for (let i = 0; i < text.length; i += 4) {
    const a = lookup.get(text[i]) ?? 0
    const b = lookup.get(text[i + 1]) ?? 0
    const c = text[i + 2] !== undefined ? (lookup.get(text[i + 2]) ?? 0) : 0
    const d = text[i + 3] !== undefined ? (lookup.get(text[i + 3]) ?? 0) : 0

    if (outIndex < out.length) out[outIndex++] = (a << 2) | (b >> 4)
    if (text[i + 2] !== undefined && outIndex < out.length) out[outIndex++] = ((b & 15) << 4) | (c >> 2)
    if (text[i + 3] !== undefined && outIndex < out.length) out[outIndex++] = ((c & 3) << 6) | d
  }

  return outIndex === out.length ? out : out.subarray(0, outIndex)
}

/**
 * 解码一个 MVT 瓦片。
 *
 * @param input 瓦片字节；带 gzip 头会自动解压
 * @param tile 瓦片编号；给出时输出经纬度，缺省时保留瓦片内坐标
 */
export function decodeMvt(input: Uint8Array, tile?: MvtTileId | null): MvtDecodeResult {
  if (input.length === 0) throw new MvtError('empty', 'tile is empty')
  if (input.length > MVT_MAX_BYTES) throw new MvtError('too-large', 'tile is larger than 20 MB')
  if (tile) assertTile(tile)

  const warnings = new Warnings()
  let bytes = input
  let gzipped = false

  if (input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b) {
    try {
      bytes = gunzipSync(input)
    } catch {
      throw new MvtError('gzip', 'gzip payload could not be inflated')
    }
    gzipped = true
    warnings.add('gzip')
  }

  if (bytes.length === 0) throw new MvtError('empty', 'tile is empty after decompression')
  if (!tile) warnings.add('no-tile')

  const reader = new Reader(bytes)
  const layerBufs: Uint8Array[] = []

  try {
    while (!reader.done) {
      const { field, wire } = reader.tag()
      if (field === 3 && wire === 2) layerBufs.push(reader.bytes())
      else reader.skip(wire)
    }
  } catch (error) {
    if (error instanceof MvtError) throw error
    throw new MvtError('protobuf', 'tile is not valid protobuf')
  }

  if (layerBufs.length === 0) throw new MvtError('no-layers', 'tile contains no layers')

  const layers: MvtLayerSummary[] = []
  const features: MvtFeature[] = []

  for (const buf of layerBufs) {
    const layer = readLayer(buf)
    const summary: MvtLayerSummary = {
      name: layer.name,
      version: layer.version,
      extent: layer.extent,
      features: 0,
      points: 0,
      lines: 0,
      polygons: 0,
      unknown: 0
    }

    for (const feature of layer.features) {
      summary.features++

      const properties: Record<string, unknown> = {}
      for (let i = 0; i + 1 < feature.tags.length; i += 2) {
        const key = layer.keys[feature.tags[i]]
        if (key !== undefined) properties[key] = layer.values[feature.tags[i + 1]] ?? null
      }
      if (feature.tags.length % 2 === 1) warnings.add('tags-odd')

      if (feature.type === 0) {
        summary.unknown++
        warnings.add('unknown-geometry')
        continue
      }

      let geometry: GeoJsonGeometry | null = null
      try {
        geometry = buildGeometry(feature, layer.extent, tile ?? null, warnings)
      } catch (error) {
        if (!(error instanceof MvtError)) throw error
        geometry = null
      }

      if (!geometry) {
        warnings.add('bad-geometry')
        continue
      }

      if (geometry.type === 'Point' || geometry.type === 'MultiPoint') summary.points++
      else if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') summary.lines++
      else summary.polygons++

      const out: MvtFeature = {
        layer: layer.name,
        type:
          geometry.type === 'Point' || geometry.type === 'MultiPoint'
            ? 'Point'
            : geometry.type === 'LineString' || geometry.type === 'MultiLineString'
              ? 'LineString'
              : 'Polygon',
        geometry,
        properties
      }
      if (feature.id !== undefined) out.id = feature.id
      features.push(out)
    }

    layers.push(summary)
  }

  const collection: VectorFeatureCollection = {
    type: 'FeatureCollection',
    features: features.map(
      (feature): VectorFeature => ({
        type: 'Feature',
        geometry: feature.geometry,
        properties: feature.properties
      })
    )
  }

  return {
    layers,
    features,
    collection,
    warnings: warnings.list(),
    gzipped,
    size: input.length
  }
}

function buildGeometry(
  feature: RawFeature,
  extent: number,
  tile: MvtTileId | null,
  warnings: Warnings
): GeoJsonGeometry | null {
  if (feature.geometry.length === 0) return null

  if (feature.type === 1) {
    const points = decodePoints(feature.geometry)
    if (points.length === 0) return null
    const coords = points.map(([x, y]) => (tile ? projectPoint(x, y, extent, tile) : [x, y]))
    if (coords.length === 1) return { type: 'Point', coordinates: coords[0] }
    return { type: 'MultiPoint', coordinates: coords.map((pair) => pair as number[]) }
  }

  if (feature.type === 2) {
    const lines = decodeLines(feature.geometry).filter((line) => line.length >= 2)
    if (lines.length === 0) return null
    const coords = lines.map((line) =>
      line.map(([x, y]) => (tile ? projectPoint(x, y, extent, tile) : [x, y]))
    )
    if (coords.length === 1) return { type: 'LineString', coordinates: coords[0] as number[][] }
    return { type: 'MultiLineString', coordinates: coords.map((line) => line as number[][]) }
  }

  if (feature.type === 3) {
    const rings = decodeRings(feature.geometry, warnings)
    return assemblePolygons(rings, extent, tile)
  }

  return null
}