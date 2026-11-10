/**
 * T06 矢量格式转换的核心管线（FR-07）。
 *
 * 设计取舍：
 *   ① 解析与序列化都在这里完成，组件只做文件读取、选择与预览；
 *   ② 不在这里做坐标系变换 —— T06 只换格式，坐标系问题由校验清单提示，
 *      并引导到 T01 / T03；
 *   ③ 解析失败抛异常，几何问题只记入 issues 不中断（FR-07 处理规则）；
 *   ④ 目标格式不支持某几何时，默认抛 UnsupportedGeometryError，
 *      由 UI 让用户明确选择「跳过」后才继续（不静默丢弃）。
 *
 * ⚠️ KML / GPX 解析依赖 DOMParser，只能在浏览器主线程运行。
 * 大文件的 Worker 化留待 FR-13 的共享基础设施。
 */

import { gpx, kml } from '@tmcw/togeojson'
import { toKML } from '@placemarkio/tokml'
import { feature } from 'topojson-client'
import { topology } from 'topojson-server'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

import { collectionToCsv, parseCsv, type CsvParseOutcome } from './csv'
import { collectionToDxf, parseDxf } from './dxf'
import { collectionToGml, parseGml } from './gml'
import { collectionToGmt, parseGmt } from './gmt'
import { collectionToMif, parseMifTextInput, parseMifZip } from './mif'
import { parseShapefileZIP } from './shapefile'
import { buildShapefile } from './shapefile-export'
import { collectionToXlsx, parseXlsxInput } from './xlsx'
import {
  UnsupportedGeometryError,
  type CsvParseOptions,
  type FeatureIssue,
  type ParseOutcome,
  type SerializeOptions,
  type SerializeOutcome,
  type VectorFeature,
  type VectorFeatureCollection,
  type VectorFormat
} from './types'
import { convertWktText, geometryToWkt, type GeoJsonGeometry } from './wkt'

/* ------------------------------------------------------------------ *
 * 限额（SR-05）
 * ------------------------------------------------------------------ */

export const FILE_LIMIT_BYTES = 20 * 1024 * 1024
export const FEATURE_LIMIT = 50_000
export const PASTE_LIMIT = 200_000
/** 预览只渲染前 20 条要素 / 200 行文本（PRD T06） */
export const PREVIEW_FEATURES = 20
export const PREVIEW_LINES = 200

/* ------------------------------------------------------------------ *
 * 格式识别
 * ------------------------------------------------------------------ */

const EXT_MAP: Record<string, VectorFormat> = {
  geojson: 'geojson',
  json: 'geojson',
  topojson: 'topojson',
  kml: 'kml',
  kmz: 'kmz',
  gpx: 'gpx',
  csv: 'csv',
  tsv: 'tsv',
  txt: 'csv',
  xlsx: 'xlsx',
  xls: 'xlsx',
  gml: 'gml',
  dxf: 'dxf',
  gmt: 'gmt',
  mif: 'mif',
  mid: 'mif',
  wkt: 'wkt',
  zip: 'shapefile',
  shp: 'shapefile',
  fgb: 'fgb',
  gpkg: 'gpkg'
}

/** 从文本 + 文件名识别格式；识别不出返回 '' */
export function detectFormat(text: string, fileName?: string): VectorFormat | '' {
  const t = text.trim()

  // JSON 系优先看内容：.json 可能是 GeoJSON 也可能是 TopoJSON
  if (t.startsWith('{')) {
    try {
      const data = JSON.parse(t) as { type?: string }
      return data.type === 'Topology' ? 'topojson' : 'geojson'
    } catch {
      return 'geojson'
    }
  }

  if (t.startsWith('<')) {
    const head = t.slice(0, 4000)
    if (/<gml:featurecollection[\s>]/i.test(head) || /<(\w+:)?featurecollection[\s>]/i.test(head)) {
      return 'gml'
    }
    if (/<kml[\s>]/i.test(head)) return 'kml'
    if (/<gpx[\s>]/i.test(head)) return 'gpx'
  }

  // ASCII DXF：第一组码固定是 0 / SECTION
  if (/^0\s*\r?\nSECTION\b/im.test(t)) return 'dxf'

  if (/^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\b/i.test(t)) {
    return 'wkt'
  }

  // GMT 段头：`>` 开头且至少两行（单行 > 更可能是别的文本）
  if (/^>/.test(t) && /[\r\n]/.test(t)) return 'gmt'

  // MapInfo MIF 的固定文件头
  if (/^Version\s+\d+/i.test(t)) return 'mif'

  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    const mapped = EXT_MAP[ext]
    if (mapped) return mapped
  }

  if (t.includes('\t') && !t.includes(',')) return 'tsv'
  if (t.includes(',')) return 'csv'
  return ''
}

/** 用 TextDecoder 解码；GBK 等编码不支持时回退 UTF-8 */
export function decodeBytes(bytes: Uint8Array, encoding = 'utf-8'): string {
  try {
    return new TextDecoder(encoding).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/* ------------------------------------------------------------------ *
 * GeoJSON 规范化
 * ------------------------------------------------------------------ */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const GEOM_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection'
])

/** 把任意 GeoJSON 几何收敛成我们内部使用的形状；未知类型返回 null */
export function normalizeGeometry(value: unknown): GeoJsonGeometry | null {
  if (!isObj(value) || typeof value.type !== 'string' || !GEOM_TYPES.has(value.type)) {
    return null
  }
  const type = value.type as GeoJsonGeometry['type']
  if (type === 'GeometryCollection') {
    if (!Array.isArray(value.geometries)) return null
    const children = value.geometries
      .map((g) => normalizeGeometry(g))
      .filter((g): g is GeoJsonGeometry => g !== null)
    return { type, geometries: children }
  }
  if (!Array.isArray(value.coordinates)) return null
  return { type, coordinates: value.coordinates } as GeoJsonGeometry
}

function normalizeFeature(value: unknown, index: number): VectorFeature {
  if (!isObj(value) || value.type !== 'Feature') {
    return { type: 'Feature', geometry: null, properties: { _invalid: index } }
  }
  const properties = isObj(value.properties) ? (value.properties as Record<string, unknown>) : {}
  return {
    type: 'Feature',
    geometry: normalizeGeometry(value.geometry),
    properties
  }
}

/** 解析 GeoJSON 文本；也接受单个 Geometry 或 Feature */
export function parseGeoJson(text: string): ParseOutcome {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('invalid-json')
  }
  if (!isObj(data)) throw new Error('invalid-json')

  if (data.type === 'Topology') {
    return parseTopoJsonObject(data)
  }

  if (data.type === 'FeatureCollection') {
    const list = Array.isArray(data.features) ? data.features : []
    const features = list.map((f, i) => normalizeFeature(f, i))
    return {
      format: 'geojson',
      collection: { type: 'FeatureCollection', features },
      issues: [],
      warnings: []
    }
  }

  if (data.type === 'Feature') {
    return {
      format: 'geojson',
      collection: { type: 'FeatureCollection', features: [normalizeFeature(data, 0)] },
      issues: [],
      warnings: []
    }
  }

  const geometry = normalizeGeometry(data)
  if (!geometry) throw new Error('invalid-geojson')
  return {
    format: 'geojson',
    collection: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry, properties: {} }]
    },
    issues: [],
    warnings: []
  }
}

/* ------------------------------------------------------------------ *
 * TopoJSON
 * ------------------------------------------------------------------ */

function parseTopoJsonObject(topo: Record<string, unknown>): ParseOutcome {
  const objects = topo.objects
  if (!isObj(objects)) throw new Error('invalid-topojson')
  const features: VectorFeature[] = []
  for (const key of Object.keys(objects)) {
    const result = feature(topo as never, (objects[key] ?? null) as never) as unknown
    if (!isObj(result)) continue
    const type = result.type
    if (type === 'FeatureCollection' && Array.isArray(result.features)) {
      result.features.forEach((f, i) => features.push(normalizeFeature(f, features.length + i)))
    } else if (type === 'Feature') {
      features.push(normalizeFeature(result, features.length))
    } else {
      const geometry = normalizeGeometry(result)
      if (geometry) {
        features.push({ type: 'Feature', geometry, properties: {} })
      }
    }
  }
  return {
    format: 'topojson',
    collection: { type: 'FeatureCollection', features },
    issues: [],
    warnings: []
  }
}

export function parseTopoJson(text: string): ParseOutcome {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('invalid-json')
  }
  if (!isObj(data) || data.type !== 'Topology') throw new Error('invalid-topojson')
  return parseTopoJsonObject(data)
}

/* ------------------------------------------------------------------ *
 * KML / GPX
 * ------------------------------------------------------------------ */

function parseXml(text: string, kind: 'kml' | 'gpx'): ParseOutcome {
  if (typeof DOMParser === 'undefined') throw new Error('dom-unavailable')
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(text, 'text/xml')
  } catch {
    // 某些解析器（如 xmldom）对损坏的 XML 直接抛错，而不是返回 parsererror
    throw new Error('invalid-xml')
  }
  if (!doc || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('invalid-xml')
  }
  const fc = kind === 'kml' ? kml(doc) : gpx(doc)
  const features = (fc.features ?? []).map((f, i) => normalizeFeature(f, i))
  return {
    format: kind,
    collection: { type: 'FeatureCollection', features },
    issues: [],
    warnings: []
  }
}

export function parseKml(text: string): ParseOutcome {
  return parseXml(text, 'kml')
}

export function parseGpx(text: string): ParseOutcome {
  return parseXml(text, 'gpx')
}

/** KMZ：解压后取首个 .kml（FR-07 文件数量规则） */
export function parseKmz(bytes: Uint8Array): ParseOutcome {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('invalid-kmz')
  }
  const name = Object.keys(files).find((n) => /\.kml$/i.test(n))
  if (!name) throw new Error('kmz-no-kml')
  return parseKml(strFromU8(files[name]))
}

/**
 * Shapefile：ZIP 内取首个 .shp 图层（P1）。
 * 这是异步入口，因为 shpjs / proj4 只在用户真的上传 Shapefile 时才加载。
 */
export async function parseShapefile(
  bytes: Uint8Array,
  layer?: string
): Promise<ParseOutcome> {
  const r = await parseShapefileZIP(bytes, layer)
  const features = r.features.map((f, i) => normalizeFeature(f, i))
  const warnings: string[] = [
    r.hasPrj ? 'shapefile-prj' : 'shapefile-no-prj'
  ]
  if (!layer && r.layerCount > 1) warnings.push(`shapefile-multi-layer:${r.layerCount}`)
  return {
    format: 'shapefile',
    collection: { type: 'FeatureCollection', features },
    issues: [],
    warnings,
    crsDeclared: r.hasPrj
  }
}

/* ------------------------------------------------------------------ *
 * WKT 输入
 * ------------------------------------------------------------------ */

export function parseWktInput(text: string): ParseOutcome {
  const lines = convertWktText(text)
  const features: VectorFeature[] = []
  const issues: FeatureIssue[] = []
  for (const line of lines) {
    if (line.ok) {
      features.push({ type: 'Feature', geometry: line.geometry, properties: {} })
    } else {
      issues.push({
        feature: line.line - 1,
        code: 'invalid-geometry',
        detail: `${line.error.code}@${line.error.column}`
      })
    }
  }
  return {
    format: 'wkt',
    collection: { type: 'FeatureCollection', features },
    issues,
    warnings: []
  }
}

/* ------------------------------------------------------------------ *
 * 统一入口
 * ------------------------------------------------------------------ */

export interface ParseInputOptions {
  fileName?: string
  bytes?: Uint8Array
  encoding?: string
  /** 用户显式指定的源格式；'auto' 或不传时按内容/文件名识别 */
  source?: VectorFormat | 'auto'
  csv?: CsvParseOptions
  /** 多图层容器（GPKG / Shapefile ZIP）中选择的图层名 */
  layer?: string
}

/** 解析源格式：显式选择优先，否则按内容识别 */
function resolveSourceFormat(
  text: string,
  opts: ParseInputOptions
): VectorFormat | '' {
  return opts.source && opts.source !== 'auto' ? opts.source : detectFormat(text, opts.fileName)
}

export function parseInput(text: string, opts: ParseInputOptions = {}): ParseOutcome {
  const format = resolveSourceFormat(text, opts)
  switch (format) {
    case 'geojson':
      return parseGeoJson(text)
    case 'topojson':
      return parseTopoJson(text)
    case 'kml':
      return parseKml(text)
    case 'gpx':
      return parseGpx(text)
    case 'kmz': {
      if (!opts.bytes) throw new Error('kmz-needs-file')
      return parseKmz(opts.bytes)
    }
    case 'csv':
    case 'tsv': {
      const csv = parseCsv(text, { delimiter: format === 'tsv' ? '\t' : undefined, ...opts.csv })
      return {
        format,
        collection: csv.collection,
        issues: csv.issues,
        warnings: csv.warnings
      }
    }
    case 'wkt':
      return parseWktInput(text)
    case 'gml':
      return parseGml(text)
    case 'dxf':
      return parseDxf(text)
    case 'gmt':
      return parseGmt(text)
    case 'mif':
      return parseMifTextInput(text)
    case 'xlsx':
      throw new Error('xlsx-needs-file')
    case 'shapefile':
      throw new Error('shapefile-needs-file')
    default:
      throw new Error('unknown-format')
  }
}

/**
 * 带二进制分支的统一入口：Shapefile 需要异步加载解析器。
 * 文本类格式仍走同步的 parseInput，行为与之前完全一致。
 */
export async function parseFileInput(
  text: string,
  opts: ParseInputOptions = {}
): Promise<ParseOutcome> {
  const forced = opts.source && opts.source !== 'auto' ? opts.source : null

  // 显式指定为二进制容器时，必须拿到原始字节；粘贴文本无法还原
  if (forced === 'shapefile') {
    if (!opts.bytes) throw new Error('shapefile-needs-file')
    return parseShapefile(opts.bytes, opts.layer)
  }
  if (forced === 'fgb' || (!forced && opts.bytes && /\.fgb$/i.test(opts.fileName ?? ''))) {
    if (!opts.bytes) throw new Error('fgb-needs-file')
    const { parseFgb } = await import('./fgb')
    return parseFgb(opts.bytes)
  }
  if (forced === 'gpkg' || (!forced && opts.bytes && /\.gpkg$/i.test(opts.fileName ?? ''))) {
    if (!opts.bytes) throw new Error('gpkg-needs-file')
    const { parseGpkg } = await import('./gpkg')
    return parseGpkg(opts.bytes, opts.layer)
  }
  if (forced === 'kmz') {
    if (!opts.bytes) throw new Error('kmz-needs-file')
    return parseKmz(opts.bytes)
  }
  if (forced === 'xlsx' || (!forced && /\.xlsx?$/i.test(opts.fileName ?? ''))) {
    if (!opts.bytes) throw new Error('xlsx-needs-file')
    const csv = await parseXlsxInput(opts.bytes, opts.csv)
    return {
      format: 'xlsx',
      collection: csv.collection,
      issues: csv.issues,
      warnings: csv.warnings
    }
  }
  if (forced === 'mif') {
    return opts.bytes ? parseMifZip(opts.bytes) : parseMifTextInput(text)
  }

  if (!forced && opts.bytes && /\.(zip|shp)$/i.test(opts.fileName ?? '')) {
    return parseShapefile(opts.bytes, opts.layer)
  }
  return parseInput(text, opts)
}

/** 只做 CSV 的表头扫描，用于 UI 在列识别失败时展示选择器 */
export function inspectCsv(text: string, delimiter?: string): CsvParseOutcome {
  return parseCsv(text, { delimiter })
}

/* ------------------------------------------------------------------ *
 * 坐标取整 / 属性清理
 * ------------------------------------------------------------------ */

function roundPosition(p: number[], digits: number): number[] {
  return p.map((v) => Number(v.toFixed(digits)))
}

function mapGeometry(
  g: GeoJsonGeometry,
  fn: (p: number[]) => number[]
): GeoJsonGeometry {
  switch (g.type) {
    case 'Point':
      return { type: 'Point', coordinates: g.coordinates.length >= 2 ? fn(g.coordinates) : g.coordinates }
    case 'MultiPoint':
    case 'LineString':
      return { type: g.type, coordinates: g.coordinates.map(fn) }
    case 'Polygon':
    case 'MultiLineString':
      return { type: g.type, coordinates: g.coordinates.map((ring) => ring.map(fn)) }
    case 'MultiPolygon':
      return {
        type: 'MultiPolygon',
        coordinates: g.coordinates.map((poly) => poly.map((ring) => ring.map(fn)))
      }
    case 'GeometryCollection':
      return {
        type: 'GeometryCollection',
        geometries: g.geometries.map((child) => mapGeometry(child, fn))
      }
  }
}

export function roundCollection(fc: VectorFeatureCollection, digits: number): VectorFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      ...f,
      geometry: f.geometry ? mapGeometry(f.geometry, (p) => roundPosition(p, digits)) : null
    }))
  }
}

export function cleanProperties(fc: VectorFeatureCollection): VectorFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      const properties: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(f.properties ?? {})) {
        if (v === '' || v === null || v === undefined) continue
        properties[k] = v
      }
      return { ...f, properties }
    })
  }
}

/* ------------------------------------------------------------------ *
 * 校验（不阻断）
 * ------------------------------------------------------------------ */

function walkPositions(
  g: GeoJsonGeometry,
  onPosition: (p: number[], path: string) => void,
  path = 'coordinates'
): void {
  switch (g.type) {
    case 'Point':
      if (g.coordinates.length >= 2) onPosition(g.coordinates, path)
      return
    case 'MultiPoint':
    case 'LineString':
      g.coordinates.forEach((p, i) => onPosition(p, `${path}[${i}]`))
      return
    case 'Polygon':
    case 'MultiLineString':
      g.coordinates.forEach((ring, i) =>
        ring.forEach((p, j) => onPosition(p, `${path}[${i}][${j}]`))
      )
      return
    case 'MultiPolygon':
      g.coordinates.forEach((poly, i) =>
        poly.forEach((ring, j) =>
          ring.forEach((p, k) => onPosition(p, `${path}[${i}][${j}][${k}]`))
        )
      )
      return
    case 'GeometryCollection':
      g.geometries.forEach((child, i) => walkPositions(child, onPosition, `${path}[${i}]`))
      return
  }
}

function geometryIssues(
  geometry: GeoJsonGeometry | null,
  featureIndex: number,
  out: FeatureIssue[]
): void {
  if (!geometry) {
    out.push({ feature: featureIndex, code: 'empty-geometry' })
    return
  }
  if (geometry.type === 'Point' && geometry.coordinates.length === 0) {
    out.push({ feature: featureIndex, code: 'empty-geometry' })
    return
  }

  const rings: number[][][] = []
  if (geometry.type === 'Polygon') rings.push(...geometry.coordinates)
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) rings.push(...poly)
  }
  for (const ring of rings) {
    if (ring.length < 4) {
      out.push({ feature: featureIndex, code: 'unclosed-ring', detail: 'too-few-points' })
      continue
    }
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) {
      out.push({ feature: featureIndex, code: 'unclosed-ring' })
    }
  }

  walkPositions(geometry, (p) => {
    if (Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) {
      out.push({ feature: featureIndex, code: 'out-of-range' })
    }
  })
}

/** 校验要素集合；只报告前 200 条，避免大文件把 DOM 撑爆 */
export function validateCollection(fc: VectorFeatureCollection): FeatureIssue[] {
  const out: FeatureIssue[] = []
  fc.features.forEach((f, i) => {
    if (out.length >= 200) return
    geometryIssues(f.geometry, i, out)
  })
  return out.slice(0, 200)
}

/* ------------------------------------------------------------------ *
 * 摘要
 * ------------------------------------------------------------------ */

export interface CollectionSummary {
  count: number
  vertices: number
  types: Record<string, number>
  properties: string[]
}

function countVertices(g: GeoJsonGeometry): number {
  switch (g.type) {
    case 'Point':
      return g.coordinates.length >= 2 ? 1 : 0
    case 'MultiPoint':
    case 'LineString':
      return g.coordinates.length
    case 'Polygon':
      return g.coordinates.reduce((n, r) => n + r.length, 0)
    case 'MultiLineString':
      return g.coordinates.reduce((n, l) => n + l.length, 0)
    case 'MultiPolygon':
      return g.coordinates.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0)
    case 'GeometryCollection':
      return g.geometries.reduce((n, c) => n + countVertices(c), 0)
  }
}

export function summarize(fc: VectorFeatureCollection): CollectionSummary {
  const types: Record<string, number> = {}
  const props: string[] = []
  const seen = new Set<string>()
  let vertices = 0
  for (const f of fc.features) {
    const t = f.geometry?.type ?? 'null'
    types[t] = (types[t] ?? 0) + 1
    if (f.geometry) vertices += countVertices(f.geometry)
    for (const k of Object.keys(f.properties ?? {})) {
      if (!seen.has(k)) {
        seen.add(k)
        props.push(k)
      }
    }
  }
  return { count: fc.features.length, vertices, types, properties: props }
}

/* ------------------------------------------------------------------ *
 * 序列化
 * ------------------------------------------------------------------ */

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function propString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function featureName(f: VectorFeature): string {
  return propString(f.properties.name ?? f.properties.Name ?? '')
}

function featureDesc(f: VectorFeature): string {
  return propString(f.properties.description ?? f.properties.desc ?? f.properties.Description ?? '')
}

/** 合并除 name / desc 之外的属性，供 GPX 降级使用 */
function mergedAttributes(f: VectorFeature): string {
  const skip = new Set(['name', 'Name', 'description', 'Description', 'desc'])
  return Object.entries(f.properties ?? {})
    .filter(([k, v]) => !skip.has(k) && v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${propString(v)}`)
    .join('; ')
}

interface GpxParts {
  points: { f: VectorFeature; coords: number[] }[]
  lines: { f: VectorFeature; segments: number[][][] }[]
  unsupported: string[]
}

function collectGpxParts(f: VectorFeature): GpxParts {
  const parts: GpxParts = { points: [], lines: [], unsupported: [] }
  const walk = (g: GeoJsonGeometry | null): void => {
    if (!g) {
      parts.unsupported.push('null')
      return
    }
    switch (g.type) {
      case 'Point':
        if (g.coordinates.length >= 2) parts.points.push({ f, coords: g.coordinates })
        else parts.unsupported.push('Point')
        return
      case 'MultiPoint':
        for (const c of g.coordinates) {
          if (c.length >= 2) parts.points.push({ f, coords: c })
          else parts.unsupported.push('Point')
        }
        return
      case 'LineString':
        if (g.coordinates.length >= 2) parts.lines.push({ f, segments: [g.coordinates] })
        else parts.unsupported.push('LineString')
        return
      case 'MultiLineString': {
        const segments = g.coordinates.filter((s) => s.length >= 2)
        if (segments.length > 0) parts.lines.push({ f, segments })
        else parts.unsupported.push('LineString')
        return
      }
      case 'GeometryCollection':
        g.geometries.forEach(walk)
        return
      default:
        parts.unsupported.push(g.type)
    }
  }
  walk(f.geometry)
  return parts
}

function gpxProperties(f: VectorFeature, mode: 'name-desc' | 'name'): string {
  const name = featureName(f)
  const desc = featureDesc(f)
  const merged = mergedAttributes(f)
  let out = ''
  if (name) out += `<name>${xmlEscape(name)}</name>`
  if (mode === 'name-desc') {
    const text = [desc, merged].filter((s) => s !== '').join('\n')
    if (text) out += `<desc>${xmlEscape(text)}</desc>`
  }
  return out
}

function buildGpx(fc: VectorFeatureCollection, opts: SerializeOptions): { text: string; unsupported: { count: number; types: string[] } } {
  const all: GpxParts = { points: [], lines: [], unsupported: [] }
  for (const f of fc.features) {
    const p = collectGpxParts(f)
    all.points.push(...p.points)
    all.lines.push(...p.lines)
    all.unsupported.push(...p.unsupported)
  }

  const uniqueTypes = [...new Set(all.unsupported)]
  const unsupportedCount = all.unsupported.length
  if (unsupportedCount > 0 && !opts.skipUnsupported) {
    throw new UnsupportedGeometryError(unsupportedCount, uniqueTypes)
  }

  const body: string[] = []
  for (const p of all.points) {
    const props = gpxProperties(p.f, opts.gpxAttrs)
    body.push(`  <wpt lat="${p.coords[1]}" lon="${p.coords[0]}">${props}</wpt>`)
  }
  for (const line of all.lines) {
    const props = gpxProperties(line.f, opts.gpxAttrs)
    const segs = line.segments
      .map(
        (seg) =>
          `      <trkseg>${seg
            .map((c) => `<trkpt lat="${c[1]}" lon="${c[0]}"/>`)
            .join('')}</trkseg>`
      )
      .join('\n')
    body.push(`  <trk>${props}\n${segs}\n  </trk>`)
  }

  const text = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Geo Toolbox" xmlns="http://www.topografix.com/GPX/1/1">
${body.join('\n')}
</gpx>`
  return { text, unsupported: { count: unsupportedCount, types: uniqueTypes } }
}

const MIME: Record<VectorFormat, string> = {
  geojson: 'application/geo+json;charset=utf-8',
  kml: 'application/vnd.google-earth.kml+xml;charset=utf-8',
  kmz: 'application/vnd.google-earth.kmz',
  gpx: 'application/gpx+xml;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  topojson: 'application/json;charset=utf-8',
  wkt: 'text/plain;charset=utf-8',
  gml: 'application/gml+xml;charset=utf-8',
  dxf: 'application/dxf',
  gmt: 'text/plain;charset=utf-8',
  mif: 'application/zip',
  shapefile: 'application/zip',
  fgb: 'application/flatgeobuf',
  gpkg: 'application/geopackage+sqlite3'
}

const EXT: Record<VectorFormat, string> = {
  geojson: 'geojson',
  kml: 'kml',
  kmz: 'kmz',
  gpx: 'gpx',
  csv: 'csv',
  tsv: 'tsv',
  xlsx: 'xlsx',
  topojson: 'topojson',
  wkt: 'wkt',
  gml: 'gml',
  dxf: 'dxf',
  gmt: 'gmt',
  mif: 'zip',
  shapefile: 'zip',
  fgb: 'fgb',
  gpkg: 'gpkg'
}

/**
 * 序列化的公共前置：坐标取整、空属性清理、剔除空几何。
 * 同步与异步出口共用，保证两条路径的警告与结果一致。
 */
function prepareSerializable(
  input: VectorFeatureCollection,
  opts: SerializeOptions
): { fc: VectorFeatureCollection; warnings: string[] } {
  let rounded = roundCollection(input, opts.digits)
  if (opts.removeEmpty) rounded = cleanProperties(rounded)

  const warnings: string[] = []
  const fc: VectorFeatureCollection = {
    type: 'FeatureCollection',
    features: rounded.features.filter((f) => {
      if (f.geometry === null) {
        warnings.push('skipped-null-geometry')
        return false
      }
      return true
    })
  }
  return { fc, warnings }
}

/** 已准备好的集合 → 目标格式（FGB / GPKG 走异步出口，这里只处理同步格式） */
function serializePrepared(
  usable: VectorFeatureCollection,
  opts: SerializeOptions,
  warnings: string[]
): SerializeOutcome {
  let text = ''
  let bytes: Uint8Array | undefined
  let unsupported = { count: 0, types: [] as string[] }

  switch (opts.target) {
    case 'geojson':
      text = JSON.stringify(usable, null, opts.indent ? 2 : 0)
      break
    case 'kml':
      text = toKML(usable as never)
      break
    case 'gpx': {
      const r = buildGpx(usable, opts)
      text = r.text
      unsupported = r.unsupported
      break
    }
    case 'csv':
      text = collectionToCsv(usable, opts.digits)
      break
    case 'tsv':
      text = collectionToCsv(usable, opts.digits, '\t')
      break
    case 'topojson': {
      const topo = topology({ features: usable } as never)
      text = JSON.stringify(topo, null, opts.indent ? 2 : 0)
      break
    }
    case 'wkt':
      text = usable.features
        .map((f) => (f.geometry ? geometryToWkt(f.geometry, true) : ''))
        .filter((s) => s !== '')
        .join('\n')
      break
    case 'gml':
      text = collectionToGml(usable)
      break
    case 'dxf': {
      const r = collectionToDxf(usable)
      text = r.text
      warnings.push(...r.warnings)
      break
    }
    case 'gmt': {
      const r = collectionToGmt(usable, opts)
      text = r.text
      warnings.push(...r.warnings)
      break
    }
    case 'xlsx':
      bytes = collectionToXlsx(usable, opts.digits)
      break
    case 'mif': {
      const r = collectionToMif(usable)
      bytes = r.bytes
      warnings.push(...r.warnings)
      break
    }
    case 'kmz':
      bytes = zipSync({ 'doc.kml': strToU8(toKML(usable as never)) }, { level: 6 })
      break
    case 'shapefile': {
      const r = buildShapefile(usable)
      bytes = r.bytes
      warnings.push(...r.warnings)
      break
    }
    case 'fgb':
    case 'gpkg':
      throw new Error('binary-needs-async')
  }

  const extension = opts.target === 'tsv' ? 'tsv' : EXT[opts.target]
  return { text, bytes, mime: MIME[opts.target], extension, unsupported, warnings }
}

/**
 * 同步序列化。坐标取整与空属性清理在这里统一完成，
 * 保证「预览看到的」与「下载得到的」完全一致。
 * FGB / GPKG 需要加载较大的二进制依赖，请用 serializeCollectionAsync。
 */
export function serializeCollection(
  input: VectorFeatureCollection,
  opts: SerializeOptions
): SerializeOutcome {
  const { fc, warnings } = prepareSerializable(input, opts)
  return serializePrepared(fc, opts, warnings)
}

/**
 * 异步序列化：仅 FGB / GPKG 需要动态加载适配器（flatbuffers / sql.js wasm）。
 * 其余格式复用同步实现，行为不变。
 */
export async function serializeCollectionAsync(
  input: VectorFeatureCollection,
  opts: SerializeOptions
): Promise<SerializeOutcome> {
  const { fc, warnings } = prepareSerializable(input, opts)

  if (opts.target === 'fgb') {
    const { collectionToFgb } = await import('./fgb')
    const r = collectionToFgb(fc)
    warnings.push(...r.warnings)
    return {
      text: '',
      bytes: r.bytes,
      mime: MIME.fgb,
      extension: EXT.fgb,
      unsupported: { count: 0, types: [] },
      warnings
    }
  }

  if (opts.target === 'gpkg') {
    const { collectionToGpkg } = await import('./gpkg')
    const r = await collectionToGpkg(fc)
    warnings.push(...r.warnings)
    return {
      text: '',
      bytes: r.bytes,
      mime: MIME.gpkg,
      extension: EXT.gpkg,
      unsupported: { count: 0, types: [] },
      warnings
    }
  }

  return serializePrepared(fc, opts, warnings)
}