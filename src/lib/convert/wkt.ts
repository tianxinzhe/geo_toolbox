/**
 * WKT ↔ GeoJSON 纯函数层（PRD 6.1 T07）
 *
 * 自研解析器而不是用现成库的唯一理由：PRD 要求「括号不配对时指出出错的
 * 字符位置」。现成库（terraformer-wkt-parser 等）只抛一句 generic error，
 * 拿不到偏移量。这里的分词器保留每个 token 的起始下标，错误对象带
 * `index`（0 基）与 `column`（1 基），UI 可以精确标到第几列。
 *
 * 不做的三件事（避免过度设计）：
 *   ① 不解析 SRID 前缀 —— T07 只做几何格式，坐标系由 T03 负责；
 *   ② 不保留 M 值 —— GeoJSON 没有 M 的合法位置，解析时丢弃并给出警告；
 *   ③ 不猜投影坐标 —— GeoJSON（RFC 7946）是 WGS84 经纬度，因此校验
 *      经度 ∈ [−180, 180]、纬度 ∈ [−90, 90]；投影坐标请先经 T03 转换。
 *
 * 坐标顺序：WKT 与 GeoJSON 都是「经度在前」，全程不交换（PRD 6.1 T07）。
 */

import { std } from '../coord/format'

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

export type WktDimension = 'XY' | 'XYZ' | 'XYM' | 'XYZM'

export type GeoJsonGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'MultiPoint'; coordinates: number[][] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { type: 'GeometryCollection'; geometries: GeoJsonGeometry[] }

export type WktErrorCode =
  | 'unexpected-char'
  | 'unexpected-eof'
  | 'unknown-type'
  | 'expected'
  | 'bad-number'
  | 'too-few-ordinates'
  | 'too-many-ordinates'
  | 'out-of-range'
  | 'dimension-mismatch'
  | 'too-few-points'
  | 'invalid-json'
  | 'invalid-geojson'

export type WktWarningCode = 'dropped-m' | 'auto-closed-ring'

export class WktError extends Error {
  readonly code: WktErrorCode
  /** 0 基字符下标；解析 JSON 语义错误时为 -1 */
  readonly index: number
  /** 1 基列号；解析 JSON 语义错误时为 -1 */
  readonly column: number
  /** 具体 token 或字段路径，供 UI 拼进错误文案 */
  readonly detail: string

  constructor(code: WktErrorCode, index: number, column: number, detail = '') {
    super(`${code} at ${index}`)
    this.name = 'WktError'
    this.code = code
    this.index = index
    this.column = column
    this.detail = detail
  }
}

export interface GeometryStats {
  /** 成功解析的几何数量 */
  total: number
  /** 全部几何的顶点数（含多边形闭合点） */
  vertices: number
  /** 各几何类型出现次数 */
  types: Record<string, number>
}

export interface WktLineSuccess {
  ok: true
  /** 输入中的行号（1 基） */
  line: number
  source: string
  geometry: GeoJsonGeometry
  dimension: WktDimension
  vertices: number
  warnings: WktWarningCode[]
}

export interface WktLineFailure {
  ok: false
  line: number
  source: string
  error: WktError
}

export type WktLineResult = WktLineSuccess | WktLineFailure

export interface WktParseSuccess {
  geometry: GeoJsonGeometry
  dimension: WktDimension
  vertices: number
  warnings: WktWarningCode[]
}

/* ------------------------------------------------------------------ *
 * 分词 / 递归下降
 * ------------------------------------------------------------------ */

const GEOMETRY_TYPES = [
  'POINT',
  'LINESTRING',
  'POLYGON',
  'MULTIPOINT',
  'MULTILINESTRING',
  'MULTIPOLYGON',
  'GEOMETRYCOLLECTION'
] as const

type GeometryTypeName = (typeof GEOMETRY_TYPES)[number]

const WORD = /[A-Za-z]+/y
const NUMBER = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y

class Cursor {
  readonly src: string
  i = 0

  constructor(src: string) {
    this.src = src
  }

  private fail(code: WktErrorCode, detail = ''): never {
    throw new WktError(code, this.i, this.i + 1, detail)
  }

  skipWs(): void {
    while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i++
  }

  atEnd(): boolean {
    this.skipWs()
    return this.i >= this.src.length
  }

  peek(): string | undefined {
    this.skipWs()
    return this.src[this.i]
  }

  expect(char: string): void {
    this.skipWs()
    if (this.src[this.i] !== char) {
      this.fail('expected', char)
    }
    this.i++
  }

  word(): string {
    this.skipWs()
    WORD.lastIndex = this.i
    const m = WORD.exec(this.src)
    if (!m) {
      if (this.i >= this.src.length) this.fail('unexpected-eof')
      this.fail('unknown-type')
    }
    this.i = WORD.lastIndex
    return m[0]
  }

  /** 读一个字母词并前移游标；没有则返回 undefined */
  tryWord(): string | undefined {
    this.skipWs()
    WORD.lastIndex = this.i
    const m = WORD.exec(this.src)
    if (!m) return undefined
    this.i = WORD.lastIndex
    return m[0]
  }

  number(): number {
    this.skipWs()
    NUMBER.lastIndex = this.i
    const m = NUMBER.exec(this.src)
    if (!m) {
      if (this.i >= this.src.length) this.fail('unexpected-eof')
      this.fail('bad-number', this.src[this.i] ?? '')
    }
    this.i = NUMBER.lastIndex
    const v = Number(m[0])
    if (!Number.isFinite(v)) this.fail('bad-number', m[0])
    return v
  }

  /** 再往后看下一个非空白字符是不是指定字符 */
  peekChar(char: string): boolean {
    return this.peek() === char
  }
}

function typeName(raw: string, index: number): GeometryTypeName {
  const up = raw.toUpperCase() as GeometryTypeName
  if (!GEOMETRY_TYPES.includes(up)) {
    throw new WktError('unknown-type', index, index + 1, raw)
  }
  return up
}

function dimensionOf(count: number, start: number): WktDimension {
  if (count === 2) return 'XY'
  if (count === 3) return 'XYZ'
  if (count === 4) return 'XYZM'
  throw new WktError(
    count < 2 ? 'too-few-ordinates' : 'too-many-ordinates',
    start,
    start + 1,
    String(count)
  )
}

function declaredCount(dim: WktDimension): number {
  return dim === 'XY' ? 2 : dim === 'XYZM' ? 4 : 3
}

interface ParseContext {
  warnings: Set<WktWarningCode>
}

/** 校验经纬度范围，并丢弃 M 分量 */
function position(
  cursor: Cursor,
  ctx: ParseContext,
  declared: WktDimension | undefined,
  expected: WktDimension | undefined
): { values: number[]; dimension: WktDimension } {
  cursor.skipWs()
  const start = cursor.i
  const raw: number[] = []
  while (!cursor.atEnd() && !cursor.peekChar(')') && !cursor.peekChar(',')) {
    raw.push(cursor.number())
    if (raw.length > 4) {
      cursor.skipWs()
      throw new WktError('too-many-ordinates', cursor.i, cursor.i + 1, '>4')
    }
  }
  if (raw.length < 2) {
    throw new WktError('too-few-ordinates', start, start + 1, String(raw.length))
  }

  const dim = declared ?? expected ?? dimensionOf(raw.length, start)
  if (raw.length !== declaredCount(dim)) {
    throw new WktError('dimension-mismatch', start, start + 1, `${dim} / ${raw.length}`)
  }
  if (expected && dim !== expected) {
    throw new WktError('dimension-mismatch', start, start + 1, `${expected} / ${dim}`)
  }

  // GeoJSON 是 WGS84 经纬度：经度在前、纬度在后
  if (Math.abs(raw[0]) > 180) {
    throw new WktError('out-of-range', start, start + 1, 'longitude')
  }
  if (Math.abs(raw[1]) > 90) {
    throw new WktError('out-of-range', start, start + 1, 'latitude')
  }

  if (dim === 'XYM' || dim === 'XYZM') ctx.warnings.add('dropped-m')
  const values = dim === 'XY' ? raw.slice(0, 2) : dim === 'XYZ' ? raw.slice(0, 3) : dim === 'XYZM' ? raw.slice(0, 3) : raw.slice(0, 2)
  return { values, dimension: dim }
}

function positionList(
  cursor: Cursor,
  ctx: ParseContext,
  declared: WktDimension | undefined
): { points: number[][]; dimension: WktDimension } {
  const points: number[][] = []
  let dimension: WktDimension | undefined
  cursor.expect('(')
  for (;;) {
    const p = position(cursor, ctx, declared, dimension)
    dimension = p.dimension
    points.push(p.values)
    if (cursor.peekChar(',')) {
      cursor.expect(',')
      continue
    }
    cursor.expect(')')
    break
  }
  return { points, dimension: dimension ?? declared ?? 'XY' }
}

function ring(
  cursor: Cursor,
  ctx: ParseContext,
  declared: WktDimension | undefined,
  expected: WktDimension | undefined
): { ring: number[][]; dimension: WktDimension } {
  cursor.expect('(')
  const points: number[][] = []
  let dimension = expected
  for (;;) {
    const p = position(cursor, ctx, declared, dimension)
    dimension = p.dimension
    points.push(p.values)
    if (cursor.peekChar(',')) {
      cursor.expect(',')
      continue
    }
    cursor.expect(')')
    break
  }
  if (points.length < 3) {
    throw new WktError('too-few-points', cursor.i, cursor.i + 1, String(points.length))
  }
  // GeoJSON 要求环首尾闭合；WKT 常见写法也是闭合的。未闭合时自动补首点，
  // 并给出警告 —— 不静默改数据。
  const first = points[0]
  const last = points[points.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    points.push([...first])
    ctx.warnings.add('auto-closed-ring')
  }
  return { ring: points, dimension: dimension ?? 'XY' }
}

function polygonBody(
  cursor: Cursor,
  ctx: ParseContext,
  declared: WktDimension | undefined
): { rings: number[][][]; dimension: WktDimension } {
  const rings: number[][][] = []
  let dimension: WktDimension | undefined
  cursor.expect('(')
  for (;;) {
    const r = ring(cursor, ctx, declared, dimension)
    dimension = r.dimension
    rings.push(r.ring)
    if (cursor.peekChar(',')) {
      cursor.expect(',')
      continue
    }
    cursor.expect(')')
    break
  }
  return { rings, dimension: dimension ?? 'XY' }
}

const GEOJSON_TYPE: Record<GeometryTypeName, GeoJsonGeometry['type']> = {
  POINT: 'Point',
  LINESTRING: 'LineString',
  POLYGON: 'Polygon',
  MULTIPOINT: 'MultiPoint',
  MULTILINESTRING: 'MultiLineString',
  MULTIPOLYGON: 'MultiPolygon',
  GEOMETRYCOLLECTION: 'GeometryCollection'
}

/** EMPTY 几何的 GeoJSON 形态 */
function emptyGeometry(type: GeometryTypeName): GeoJsonGeometry {
  if (type === 'GEOMETRYCOLLECTION') return { type: 'GeometryCollection', geometries: [] }
  return { type: GEOJSON_TYPE[type], coordinates: [] } as GeoJsonGeometry
}

function parseGeometry(cursor: Cursor, ctx: ParseContext): { geometry: GeoJsonGeometry; dimension: WktDimension } {
  const typeStart = cursor.i
  const rawType = cursor.word()
  const type = typeName(rawType, typeStart)
  cursor.skipWs()

  let declared: WktDimension | undefined
  const maybeDim = cursor.tryWord()
  if (maybeDim && /^(Z|M|ZM)$/i.test(maybeDim)) {
    const up = maybeDim.toUpperCase()
    declared = up === 'Z' ? 'XYZ' : up === 'M' ? 'XYM' : 'XYZM'
  }

  // EMPTY 是唯一不带括号的形态；必须在 EOF 判断之前处理
  if (maybeDim && maybeDim.toUpperCase() === 'EMPTY') {
    return { geometry: emptyGeometry(type), dimension: declared ?? 'XY' }
  }

  if (cursor.atEnd()) throw new WktError('unexpected-eof', cursor.i, cursor.i + 1, type)
  const next = cursor.peek()
  if (next !== '(') {
    const w = cursor.tryWord()
    if (w && w.toUpperCase() === 'EMPTY') {
      return { geometry: emptyGeometry(type), dimension: declared ?? 'XY' }
    }
    throw new WktError('expected', cursor.i, cursor.i + 1, '(')
  }

  if (type === 'GEOMETRYCOLLECTION') {
    cursor.expect('(')
    const geometries: GeoJsonGeometry[] = []
    let dimension: WktDimension = declared ?? 'XY'
    if (cursor.peekChar(')')) {
      cursor.expect(')')
    } else {
      for (;;) {
        const child = parseGeometry(cursor, ctx)
        geometries.push(child.geometry)
        dimension = dimension === 'XY' ? child.dimension : dimension
        if (cursor.peekChar(',')) {
          cursor.expect(',')
          continue
        }
        cursor.expect(')')
        break
      }
    }

    return { geometry: { type: 'GeometryCollection', geometries }, dimension }
  }

  let geometry: GeoJsonGeometry
  let dimension: WktDimension = declared ?? 'XY'

  switch (type) {
    case 'POINT': {
      cursor.expect('(')
      const p = position(cursor, ctx, declared, undefined)
      cursor.expect(')')
      geometry = { type: 'Point', coordinates: p.values }
      dimension = p.dimension
      break
    }
    case 'LINESTRING': {
      const list = positionList(cursor, ctx, declared)
      if (list.points.length < 2) {
        throw new WktError('too-few-points', cursor.i, cursor.i + 1, String(list.points.length))
      }
      geometry = { type: 'LineString', coordinates: list.points }
      dimension = list.dimension
      break
    }
    case 'POLYGON': {
      const body = polygonBody(cursor, ctx, declared)
      geometry = { type: 'Polygon', coordinates: body.rings }
      dimension = body.dimension
      break
    }
    case 'MULTIPOINT': {
      cursor.expect('(')
      const points: number[][] = []
      let dim = declared
      if (cursor.peekChar(')')) {
        cursor.expect(')')
      } else {
        for (;;) {
          if (cursor.peekChar('(')) {
            cursor.expect('(')
            const p = position(cursor, ctx, declared, dim)
            cursor.expect(')')
            dim = p.dimension
            points.push(p.values)
          } else {
            const p = position(cursor, ctx, declared, dim)
            dim = p.dimension
            points.push(p.values)
          }
          if (cursor.peekChar(',')) {
            cursor.expect(',')
            continue
          }
          cursor.expect(')')
          break
        }
      }
      geometry = { type: 'MultiPoint', coordinates: points }
      dimension = dim ?? 'XY'
      break
    }
    case 'MULTILINESTRING': {
      cursor.expect('(')
      const lines: number[][][] = []
      let dim: WktDimension | undefined = declared
      if (cursor.peekChar(')')) {
        cursor.expect(')')
      } else {
        for (;;) {
          const list = positionList(cursor, ctx, declared)
          if (list.points.length < 2) {
            throw new WktError('too-few-points', cursor.i, cursor.i + 1, String(list.points.length))
          }
          lines.push(list.points)
          dim = list.dimension
          if (cursor.peekChar(',')) {
            cursor.expect(',')
            continue
          }
          cursor.expect(')')
          break
        }
      }
      geometry = { type: 'MultiLineString', coordinates: lines }
      dimension = dim ?? 'XY'
      break
    }
    case 'MULTIPOLYGON': {
      cursor.expect('(')
      const polygons: number[][][][] = []
      let dim: WktDimension | undefined = declared
      if (cursor.peekChar(')')) {
        cursor.expect(')')
      } else {
        for (;;) {
          const body = polygonBody(cursor, ctx, declared)
          polygons.push(body.rings)
          dim = body.dimension
          if (cursor.peekChar(',')) {
            cursor.expect(',')
            continue
          }
          cursor.expect(')')
          break
        }
      }
      geometry = { type: 'MultiPolygon', coordinates: polygons }
      dimension = dim ?? 'XY'
      break
    }
  }

  return { geometry, dimension }
}

/* ------------------------------------------------------------------ *
 * 公开 API：WKT
 * ------------------------------------------------------------------ */

/** 解析单条 WKT。失败抛 WktError（带 index / column） */
export function parseWkt(source: string): WktParseSuccess {
  const cursor = new Cursor(source)
  if (cursor.atEnd()) throw new WktError('unexpected-eof', 0, 1)
  const ctx: ParseContext = { warnings: new Set() }
  const { geometry, dimension } = parseGeometry(cursor, ctx)
  // 顶层不允许有尾随字符；嵌套几何由外层负责分隔符，不能在这里检查
  if (!cursor.atEnd()) {
    throw new WktError('unexpected-char', cursor.i, cursor.i + 1, cursor.src[cursor.i])
  }
  return {
    geometry,
    dimension,
    vertices: countVertices(geometry),
    warnings: [...ctx.warnings]
  }
}

/** 逐行解析；空行跳过，单行失败不影响其他行（PRD 6.1 T07） */
export function convertWktText(text: string): WktLineResult[] {
  const results: WktLineResult[] = []
  const lines = text.split(/\r?\n/)
  lines.forEach((raw, i) => {
    const source = raw.trim()
    if (source === '') return
    try {
      const parsed = parseWkt(source)
      results.push({
        ok: true,
        line: i + 1,
        source,
        geometry: parsed.geometry,
        dimension: parsed.dimension,
        vertices: parsed.vertices,
        warnings: parsed.warnings
      })
    } catch (e) {
      const err = e instanceof WktError ? e : new WktError('invalid-geojson', -1, -1, String(e))
      results.push({ ok: false, line: i + 1, source, error: err })
    }
  })
  return results
}

/* ------------------------------------------------------------------ *
 * 统计 / 序列化
 * ------------------------------------------------------------------ */

export function countVertices(g: GeoJsonGeometry): number {
  switch (g.type) {
    case 'Point':
      return g.coordinates.length === 0 ? 0 : 1
    case 'MultiPoint':
    case 'LineString':
      return g.coordinates.length
    case 'Polygon':
      return g.coordinates.reduce((n, ring) => n + ring.length, 0)
    case 'MultiLineString':
      return g.coordinates.reduce((n, line) => n + line.length, 0)
    case 'MultiPolygon':
      return g.coordinates.reduce(
        (n, poly) => n + poly.reduce((m, ring) => m + ring.length, 0),
        0
      )
    case 'GeometryCollection':
      return g.geometries.reduce((n, child) => n + countVertices(child), 0)
  }
}

export function geometryStats(geometries: GeoJsonGeometry[]): GeometryStats {
  const types: Record<string, number> = {}
  let vertices = 0
  for (const g of geometries) {
    types[g.type] = (types[g.type] ?? 0) + 1
    vertices += countVertices(g)
  }
  return { total: geometries.length, vertices, types }
}

function num(v: number): string {
  return std(v, 12)
}

function posText(p: number[]): string {
  return p.map(num).join(' ')
}

function pointText(g: GeoJsonGeometry): string {
  switch (g.type) {
    case 'Point':
      return g.coordinates.length === 0 ? 'EMPTY' : posText(g.coordinates)
    default:
      return ''
  }
}

/** 单个几何 → WKT。`pretty=false` 时去掉逗号后的空格 */
export function geometryToWkt(g: GeoJsonGeometry, pretty = true): string {
  const sep = pretty ? ', ' : ','
  const wrap = (type: string, body: string): string =>
    body === '' ? `${type} EMPTY` : pretty ? `${type} (${body})` : `${type}(${body})`

  switch (g.type) {
    case 'Point':
      return wrap('POINT', pointText(g))
    case 'MultiPoint':
      return wrap('MULTIPOINT', g.coordinates.map((p) => `(${posText(p)})`).join(sep))
    case 'LineString':
      return wrap('LINESTRING', g.coordinates.map(posText).join(sep))
    case 'Polygon':
      return wrap(
        'POLYGON',
        g.coordinates.map((ring) => `(${ring.map(posText).join(sep)})`).join(sep)
      )
    case 'MultiLineString':
      return wrap(
        'MULTILINESTRING',
        g.coordinates.map((line) => `(${line.map(posText).join(sep)})`).join(sep)
      )
    case 'MultiPolygon':
      return wrap(
        'MULTIPOLYGON',
        g.coordinates
          .map((poly) => `(${poly.map((ring) => `(${ring.map(posText).join(sep)})`).join(sep)})`)
          .join(sep)
      )
    case 'GeometryCollection':
      return g.geometries.length === 0
        ? 'GEOMETRYCOLLECTION EMPTY'
        : `GEOMETRYCOLLECTION (${g.geometries.map((c) => geometryToWkt(c, pretty)).join(sep)})`
  }
}

/* ------------------------------------------------------------------ *
 * GeoJSON 解析
 * ------------------------------------------------------------------ */

type Json = unknown

function isObject(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function invalid(path: string, detail: string): never {
  throw new WktError('invalid-geojson', -1, -1, `${path}: ${detail}`)
}

function checkPosition(v: Json, path: string): number[] {
  if (!Array.isArray(v) || v.length < 2 || v.length > 3) invalid(path, 'position must have 2 or 3 numbers')
  const nums = v.map((n, i) => {
    if (typeof n !== 'number' || !Number.isFinite(n)) invalid(`${path}[${i}]`, 'not a finite number')
    return n
  })
  if (Math.abs(nums[0]) > 180) invalid(`${path}[0]`, 'longitude out of range')
  if (Math.abs(nums[1]) > 90) invalid(`${path}[1]`, 'latitude out of range')
  return nums
}

function checkArray(v: Json, path: string): Json[] {
  if (!Array.isArray(v)) invalid(path, 'expected an array')
  return v
}

function parseGeoJsonGeometry(v: Json, path: string): GeoJsonGeometry {
  if (!isObject(v)) invalid(path, 'geometry must be an object')
  const type = v.type
  if (typeof type !== 'string') invalid(`${path}.type`, 'missing type')

  switch (type) {
    case 'Point': {
      const c = v.coordinates
      if (Array.isArray(c) && c.length === 0) return { type: 'Point', coordinates: [] }
      return { type: 'Point', coordinates: checkPosition(c, `${path}.coordinates`) }
    }
    case 'MultiPoint':
    case 'LineString': {
      const c = checkArray(v.coordinates, `${path}.coordinates`)
      const coords = c.map((p, i) => checkPosition(p, `${path}.coordinates[${i}]`))
      return { type, coordinates: coords } as GeoJsonGeometry
    }
    case 'Polygon':
    case 'MultiLineString': {
      const c = checkArray(v.coordinates, `${path}.coordinates`)
      const coords = c.map((ring, i) => {
        const arr = checkArray(ring, `${path}.coordinates[${i}]`)
        return arr.map((p, j) => checkPosition(p, `${path}.coordinates[${i}][${j}]`))
      })
      return { type, coordinates: coords } as GeoJsonGeometry
    }
    case 'MultiPolygon': {
      const c = checkArray(v.coordinates, `${path}.coordinates`)
      const coords = c.map((poly, i) => {
        const arr = checkArray(poly, `${path}.coordinates[${i}]`)
        return arr.map((ring, j) => {
          const r = checkArray(ring, `${path}.coordinates[${i}][${j}]`)
          return r.map((p, k) => checkPosition(p, `${path}.coordinates[${i}][${j}][${k}]`))
        })
      })
      return { type: 'MultiPolygon', coordinates: coords }
    }
    case 'GeometryCollection': {
      const gs = checkArray(v.geometries, `${path}.geometries`)
      return {
        type: 'GeometryCollection',
        geometries: gs.map((g, i) => parseGeoJsonGeometry(g, `${path}.geometries[${i}]`))
      }
    }
    default:
      invalid(`${path}.type`, `unsupported geometry type ${type}`)
  }
}

export interface GeoJsonItem {
  label: string
  geometry: GeoJsonGeometry
  vertices: number
}

export interface GeoJsonParseResult {
  items: GeoJsonItem[]
  stats: GeometryStats
}

/**
 * 解析 GeoJSON 文本，返回若干「可转成一条 WKT 的几何」。
 * FeatureCollection 展开为多条；GeometryCollection 保持为一条（WKT 支持）。
 */
export function parseGeoJsonText(text: string): GeoJsonParseResult {
  let data: Json
  try {
    data = JSON.parse(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const m = /position (\d+)/.exec(msg)
    const index = m ? Number(m[1]) : -1
    throw new WktError('invalid-json', index, index >= 0 ? index + 1 : -1, msg)
  }

  if (!isObject(data)) invalid('$', 'root must be an object')
  const type = data.type

  if (type === 'FeatureCollection') {
    const features = checkArray(data.features, '$.features')
    const items: GeoJsonItem[] = []
    features.forEach((f, i) => {
      if (!isObject(f) || f.type !== 'Feature') invalid(`$.features[${i}]`, 'expected a Feature')
      const g = f.geometry
      if (g === null) invalid(`$.features[${i}].geometry`, 'geometry is null')
      const geometry = parseGeoJsonGeometry(g, `$.features[${i}].geometry`)
      items.push({ label: `Feature ${i + 1}`, geometry, vertices: countVertices(geometry) })
    })
    return { items, stats: geometryStats(items.map((x) => x.geometry)) }
  }

  if (type === 'Feature') {
    const g = data.geometry
    if (g === null) invalid('$.geometry', 'geometry is null')
    const geometry = parseGeoJsonGeometry(g, '$.geometry')
    return {
      items: [{ label: 'Feature', geometry, vertices: countVertices(geometry) }],
      stats: geometryStats([geometry])
    }
  }

  const geometry = parseGeoJsonGeometry(data, '$')
  return {
    items: [{ label: geometry.type, geometry, vertices: countVertices(geometry) }],
    stats: geometryStats([geometry])
  }
}

/* ------------------------------------------------------------------ *
 * 两个方向的组合结果
 * ------------------------------------------------------------------ */

export interface WktToGeoJsonResult {
  lines: WktLineResult[]
  /** 成功行的 GeoJSON 文本；没有成功行时为 '' */
  json: string
  stats: GeometryStats
}

/** WKT 文本 → GeoJSON 文本 */
export function wktToGeoJson(text: string, compact = false): WktToGeoJsonResult {
  const lines = convertWktText(text)
  const successes = lines.filter((l): l is WktLineSuccess => l.ok)
  const geometries = successes.map((l) => l.geometry)
  const stats = geometryStats(geometries)

  let json = ''
  if (successes.length === 1 && lines.length === 1) {
    json = JSON.stringify(successes[0].geometry, null, compact ? 0 : 2)
  } else if (successes.length > 0) {
    const collection = {
      type: 'FeatureCollection',
      features: successes.map((l) => ({
        type: 'Feature',
        properties: {},
        geometry: l.geometry
      }))
    }
    json = JSON.stringify(collection, null, compact ? 0 : 2)
  }

  return { lines, json, stats }
}

export interface GeoJsonToWktResult {
  ok: boolean
  wkt: string
  items: GeoJsonItem[]
  stats: GeometryStats
  error?: WktError
}

/** GeoJSON 文本 → WKT 文本（每个几何一行） */
export function geoJsonToWkt(text: string, pretty = true): GeoJsonToWktResult {
  try {
    const parsed = parseGeoJsonText(text)
    const wkt = parsed.items.map((i) => geometryToWkt(i.geometry, pretty)).join('\n')
    return { ok: true, wkt, items: parsed.items, stats: parsed.stats }
  } catch (e) {
    const error =
      e instanceof WktError ? e : new WktError('invalid-geojson', -1, -1, String(e))
    return {
      ok: false,
      wkt: '',
      items: [],
      stats: { total: 0, vertices: 0, types: {} },
      error
    }
  }
}

/** 方向自动检测：先看首字符，再实际试解析（PRD 6.1 T07） */
export function detectDirection(text: string): 'geojson' | 'wkt' | 'empty' {
  const t = text.trim()
  if (t === '') return 'empty'
  if (t.startsWith('{')) return 'geojson'
  return 'wkt'
}