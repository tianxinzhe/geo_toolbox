/**
 * WKB（Well-Known Binary）与 GeoPackage 几何 blob 的读写。
 *
 * 只依赖字节数组，不引用 sql.js —— 这样几何编解码可以单独单测，
 * 也让 GPKG 适配器只关心数据库结构。
 *
 * GPKG 几何 blob 结构（OGC GeoPackage 1.3 §2.1.3）：
 *   magic 'GP'(0x47 0x50) | version(1) | flags(1) | srs_id(int32) | envelope(...) | WKB
 * flags 位：bit0 字节序（1=小端），bit1-3 包围盒类型，bit4 空几何，bit5 扩展类型。
 */

import type { GeoJsonGeometry } from './wkt'

/* ------------------------------------------------------------------ *
 * 基础字节读写
 * ------------------------------------------------------------------ */

class WkbReader {
  private view: DataView
  position: number

  constructor(bytes: Uint8Array, start: number) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.position = start
  }

  private u8(): number {
    return this.view.getUint8(this.position++)
  }

  private u32(little: boolean): number {
    const v = this.view.getUint32(this.position, little)
    this.position += 4
    return v
  }

  private f64(little: boolean): number {
    const v = this.view.getFloat64(this.position, little)
    this.position += 8
    return v
  }

  readGeometry(): GeoJsonGeometry {
    if (this.position + 5 > this.view.byteLength) throw new Error('invalid-wkb')
    const little = this.u8() === 1
    const raw = this.u32(little)
    const { type, hasZ, hasM } = splitTypeCode(raw)
    const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0)

    const point = (): number[] => {
      if (this.position + dims * 8 > this.view.byteLength) throw new Error('invalid-wkb')
      const out: number[] = []
      for (let i = 0; i < dims; i++) out.push(this.f64(little))
      // M 值不进入 GeoJSON；Z 保留
      return hasZ ? [out[0], out[1], out[2]] : [out[0], out[1]]
    }

    const pointList = (): number[][] => {
      const count = this.u32(little)
      const out: number[][] = []
      for (let i = 0; i < count; i++) out.push(point())
      return out
    }

    const ringList = (): number[][][] => {
      const rings = this.u32(little)
      const out: number[][][] = []
      for (let i = 0; i < rings; i++) out.push(pointList())
      return out
    }

    const children = (): GeoJsonGeometry[] => {
      const count = this.u32(little)
      const out: GeoJsonGeometry[] = []
      for (let i = 0; i < count; i++) out.push(this.readGeometry())
      return out
    }

    switch (type) {
      case 1:
        return { type: 'Point', coordinates: point() }
      case 2:
        return { type: 'LineString', coordinates: pointList() }
      case 3:
        return { type: 'Polygon', coordinates: ringList() }
      case 4:
        return {
          type: 'MultiPoint',
          coordinates: children().map((g) =>
            g.type === 'Point' ? g.coordinates : [0, 0]
          )
        }
      case 5:
        return {
          type: 'MultiLineString',
          coordinates: children().map((g) =>
            g.type === 'LineString' ? g.coordinates : []
          )
        }
      case 6:
        return {
          type: 'MultiPolygon',
          coordinates: children().map((g) =>
            g.type === 'Polygon' ? g.coordinates : []
          )
        }
      case 7:
        return { type: 'GeometryCollection', geometries: children() }
      default:
        throw new Error('unsupported-wkb-type')
    }
  }
}

/** ISO WKB 的 Z/M 用 +1000/+2000/+3000；EWKB 用高两位标记 */
function splitTypeCode(raw: number): { type: number; hasZ: boolean; hasM: boolean } {
  let code = raw
  let hasZ = false
  let hasM = false
  if (code & 0x80000000) {
    hasZ = true
    code &= 0x7fffffff
  }
  if (code & 0x40000000) {
    hasM = true
    code &= 0x3fffffff
  }
  if (code >= 3000) {
    hasZ = true
    hasM = true
    code -= 3000
  } else if (code >= 2000) {
    hasM = true
    code -= 2000
  } else if (code >= 1000) {
    hasZ = true
    code -= 1000
  }
  return { type: code, hasZ, hasM }
}

class WkbWriter {
  private buf = new ArrayBuffer(256)
  private view = new DataView(this.buf)
  length = 0

  private ensure(n: number): void {
    if (this.length + n <= this.buf.byteLength) return
    let cap = this.buf.byteLength
    while (cap < this.length + n) cap *= 2
    const next = new ArrayBuffer(cap)
    new Uint8Array(next).set(new Uint8Array(this.buf, 0, this.length))
    this.buf = next
    this.view = new DataView(next)
  }

  u8(v: number): void {
    this.ensure(1)
    this.view.setUint8(this.length++, v)
  }

  u32(v: number): void {
    this.ensure(4)
    this.view.setUint32(this.length, v, true)
    this.length += 4
  }

  f64(v: number): void {
    this.ensure(8)
    this.view.setFloat64(this.length, v, true)
    this.length += 8
  }

  finish(): Uint8Array {
    return new Uint8Array(this.buf, 0, this.length)
  }
}

/* ------------------------------------------------------------------ *
 * WKB
 * ------------------------------------------------------------------ */

function writePoint(w: WkbWriter, coordinates: number[]): void {
  w.f64(coordinates[0] ?? 0)
  w.f64(coordinates[1] ?? 0)
}

function writeGeometry(w: WkbWriter, g: GeoJsonGeometry): void {
  w.u8(1) // little endian
  switch (g.type) {
    case 'Point':
      w.u32(1)
      writePoint(w, g.coordinates)
      return
    case 'LineString':
      w.u32(2)
      w.u32(g.coordinates.length)
      for (const p of g.coordinates) writePoint(w, p)
      return
    case 'Polygon':
      w.u32(3)
      w.u32(g.coordinates.length)
      for (const ring of g.coordinates) {
        w.u32(ring.length)
        for (const p of ring) writePoint(w, p)
      }
      return
    case 'MultiPoint':
      w.u32(4)
      w.u32(g.coordinates.length)
      for (const p of g.coordinates) {
        w.u8(1)
        w.u32(1)
        writePoint(w, p)
      }
      return
    case 'MultiLineString':
      w.u32(5)
      w.u32(g.coordinates.length)
      for (const line of g.coordinates) {
        w.u8(1)
        w.u32(2)
        w.u32(line.length)
        for (const p of line) writePoint(w, p)
      }
      return
    case 'MultiPolygon':
      w.u32(6)
      w.u32(g.coordinates.length)
      for (const poly of g.coordinates) {
        w.u8(1)
        w.u32(3)
        w.u32(poly.length)
        for (const ring of poly) {
          w.u32(ring.length)
          for (const p of ring) writePoint(w, p)
        }
      }
      return
    case 'GeometryCollection':
      w.u32(7)
      w.u32(g.geometries.length)
      for (const child of g.geometries) writeGeometry(w, child)
      return
  }
}

/** GeoJSON 几何 → 2D WKB（Z/M 丢弃） */
export function writeWkb(geometry: GeoJsonGeometry): Uint8Array {
  const w = new WkbWriter()
  writeGeometry(w, geometry)
  return w.finish()
}

export interface WkbReadResult {
  geometry: GeoJsonGeometry
  /** 读取结束后的绝对字节偏移 */
  offset: number
}

/** 从 offset 开始读一个 WKB 几何 */
export function readWkb(bytes: Uint8Array, offset = 0): WkbReadResult {
  const reader = new WkbReader(bytes, offset)
  const geometry = reader.readGeometry()
  return { geometry, offset: reader.position }
}

/* ------------------------------------------------------------------ *
 * GeoPackage 几何 blob
 * ------------------------------------------------------------------ */

const GPKG_MAGIC_0 = 0x47 // 'G'
const GPKG_MAGIC_1 = 0x50 // 'P'
/** 每种包围盒标记对应的 double 个数 */
const ENVELOPE_DOUBLES = [0, 4, 6, 6, 8]

/**
 * 写 GPKG 几何 blob：无包围盒、小端、EPSG:4326。
 * 不写入 envelope 是合法的（flags 指示 0），也避免了包围盒与几何不一致的风险。
 */
export function writeGpkgGeometry(geometry: GeoJsonGeometry, srsId = 4326): Uint8Array {
  const wkb = writeWkb(geometry)
  const out = new Uint8Array(8 + wkb.length)
  out[0] = GPKG_MAGIC_0
  out[1] = GPKG_MAGIC_1
  out[2] = 0 // version
  out[3] = 0x01 // little endian / 无包围盒 / 非空 / 非扩展类型
  new DataView(out.buffer).setInt32(4, srsId, true)
  out.set(wkb, 8)
  return out
}

/** 读 GPKG 几何 blob；空几何返回 null */
export function readGpkgGeometry(blob: Uint8Array): GeoJsonGeometry | null {
  if (blob.length < 8 || blob[0] !== GPKG_MAGIC_0 || blob[1] !== GPKG_MAGIC_1) {
    throw new Error('invalid-gpkg-geometry')
  }
  const flags = blob[3]
  const envelope = (flags >> 1) & 0x07
  const empty = (flags & 0x10) !== 0
  const offset = 8 + (ENVELOPE_DOUBLES[envelope] ?? 0) * 8
  if (empty) return null
  if (offset >= blob.length) return null
  return readWkb(blob, offset).geometry
}