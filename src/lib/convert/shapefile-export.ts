/**
 * Shapefile 导出（P1 / FR-07）。
 *
 * 输出一个 ZIP，内含 .shp/.shx/.dbf/.prj/.cpg：
 *   - 坐标统一为 WGS84，.prj 写 WGS84 WKT；
 *   - Shapefile 一个图层只能容纳一种几何类型，混合几何会拆成多个图层；
 *   - 属性写 DBF（UTF-8 + .cpg= UTF-8），字段名受 DBF 的 10 字符限制。
 *
 * 全部为纯字节操作，不依赖 DOM，可单测。
 */

import { zipSync } from 'fflate'

import type { VectorFeature, VectorFeatureCollection } from './types'

const SHP_POINT = 1
const SHP_POLYLINE = 3
const SHP_POLYGON = 5
const SHP_MULTIPOINT = 8

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

type Prepared =
  | { kind: 'point'; points: number[][]; props: Record<string, unknown> }
  | { kind: 'multipoint'; points: number[][]; props: Record<string, unknown> }
  | { kind: 'polyline'; parts: number[][][]; props: Record<string, unknown> }
  | { kind: 'polygon'; parts: number[][][]; props: Record<string, unknown> }

export interface ShapefileExportResult {
  bytes: Uint8Array
  warnings: string[]
  /** 输出图层数；>1 表示输入含多种几何类型 */
  layerCount: number
}

/* ------------------------------------------------------------------ *
 * 几何准备
 * ------------------------------------------------------------------ */

function isFinitePoint(p: number[] | undefined): p is number[] {
  return Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
}

/** 有符号面积，>0 为逆时针（GeoJSON 外环惯例） */
function signedArea(ring: number[][]): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return sum / 2
}

function closedRing(input: number[][]): number[][] {
  const ring = input.filter((p) => isFinitePoint(p)).map((p) => [p[0], p[1]])
  if (ring.length === 0) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
  return ring
}

/** Shapefile 要求外环顺时针、内环逆时针 */
function orientRing(ring: number[][], clockwise: boolean): number[][] {
  const area = signedArea(ring)
  if (clockwise && area > 0) return [...ring].reverse()
  if (!clockwise && area < 0) return [...ring].reverse()
  return ring
}

function preparePolygon(polygon: number[][][]): number[][][] {
  const parts: number[][][] = []
  for (let i = 0; i < polygon.length; i++) {
    const raw = closedRing(polygon[i] ?? [])
    if (raw.length < 4) continue
    const oriented = orientRing(raw, i === 0)
    // 外环无效时跳过整个多边形；内环无效只跳过该洞
    if (i === 0) {
      parts.length = 0
      parts.push(oriented)
    } else if (parts.length > 0) {
      parts.push(oriented)
    }
  }
  return parts
}

function prepare(feature: VectorFeature): Prepared | { skipped: string } | null {
  const geometry = feature.geometry
  if (!geometry) return null
  const props = { ...feature.properties }

  switch (geometry.type) {
    case 'Point': {
      if (!isFinitePoint(geometry.coordinates)) return null
      return { kind: 'point', points: [geometry.coordinates], props }
    }
    case 'MultiPoint': {
      const points = geometry.coordinates.filter((p) => isFinitePoint(p))
      return points.length > 0 ? { kind: 'multipoint', points, props } : null
    }
    case 'LineString': {
      const line = geometry.coordinates.filter((p) => isFinitePoint(p))
      return line.length >= 2 ? { kind: 'polyline', parts: [line], props } : null
    }
    case 'MultiLineString': {
      const parts = geometry.coordinates
        .map((line) => line.filter((p) => isFinitePoint(p)))
        .filter((line) => line.length >= 2)
      return parts.length > 0 ? { kind: 'polyline', parts, props } : null
    }
    case 'Polygon': {
      const parts = preparePolygon(geometry.coordinates)
      return parts.length > 0 ? { kind: 'polygon', parts, props } : null
    }
    case 'MultiPolygon': {
      const parts: number[][][] = []
      for (const polygon of geometry.coordinates) parts.push(...preparePolygon(polygon))
      return parts.length > 0 ? { kind: 'polygon', parts, props } : null
    }
    case 'GeometryCollection':
      return { skipped: 'GeometryCollection' }
    default:
      return null
  }
}

/* ------------------------------------------------------------------ *
 * DBF
 * ------------------------------------------------------------------ */

interface DbfField {
  key: string
  name: string
  type: 'C' | 'N'
  length: number
  decimal: number
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length
}

function truncateUtf8(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= maxBytes) return text
  let end = maxBytes
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--
  return new TextDecoder().decode(bytes.subarray(0, end))
}

function sanitizeFieldName(key: string, index: number, used: Set<string>): string {
  const ascii = key
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^_+/, '')
  let base = ascii === '' ? `field_${index + 1}` : ascii
  if (!/^[A-Za-z_]/.test(base)) base = `f_${base}`
  base = base.slice(0, 10)
  if (base === '') base = `f${index + 1}`
  let name = base
  let n = 2
  while (used.has(name.toUpperCase())) {
    const suffix = `_${n++}`
    name = `${base.slice(0, 10 - suffix.length)}${suffix}`
  }
  used.add(name.toUpperCase())
  return name
}

function buildFields(records: Prepared[]): {
  fields: DbfField[]
  renamed: boolean
  dropped: number
} {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const rec of records) {
    for (const k of Object.keys(rec.props)) {
      if (!seen.has(k)) {
        seen.add(k)
        keys.push(k)
      }
    }
  }

  const used = new Set<string>()
  let renamed = false
  const fields: DbfField[] = []
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const name = sanitizeFieldName(key, i, used)
    if (name !== key) renamed = true
    const values = records.map((r) => valueText(r.props[key])).filter((v) => v !== '')
    const numeric =
      values.length > 0 &&
      values.every((v) => /^-?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v)) && v.length <= 18)
    if (numeric) {
      const decimals = Math.min(
        10,
        values.reduce((max, v) => Math.max(max, v.includes('.') ? v.split('.')[1].length : 0), 0)
      )
      fields.push({ key, name, type: 'N', length: 18, decimal: decimals })
    } else {
      const width = Math.max(1, ...values.map(utf8Length))
      fields.push({ key, name, type: 'C', length: Math.min(254, width), decimal: 0 })
    }
  }

  // DBF 最多 255 个字段
  const dropped = Math.max(0, fields.length - 255)
  return { fields: fields.slice(0, 255), renamed, dropped }
}

function buildDbf(records: Prepared[]): { bytes: Uint8Array; renamed: boolean; dropped: number } {
  const { fields, renamed, dropped } = buildFields(records)
  const headerLen = 32 + fields.length * 32 + 1
  const recordLen = 1 + fields.reduce((sum, f) => sum + f.length, 0)
  const out = new Uint8Array(headerLen + recordLen * records.length + 1)
  const view = new DataView(out.buffer)
  const now = new Date()

  out[0] = 0x03
  out[1] = now.getFullYear() - 1900
  out[2] = now.getMonth() + 1
  out[3] = now.getDate()
  view.setUint32(4, records.length, true)
  view.setUint16(8, headerLen, true)
  view.setUint16(10, recordLen, true)

  let pos = 32
  for (const field of fields) {
    for (let i = 0; i < 11; i++) out[pos + i] = 0
    const nameBytes = new TextEncoder().encode(field.name)
    out.set(nameBytes.subarray(0, 10), pos)
    out[pos + 11] = field.type.charCodeAt(0)
    out[pos + 16] = field.length
    out[pos + 17] = field.decimal
    pos += 32
  }
  out[pos++] = 0x0d

  const encoder = new TextEncoder()
  for (const rec of records) {
    out[pos++] = 0x20
    for (const field of fields) {
      const value = valueText(rec.props[field.key])
      if (field.type === 'N') {
        const num = value === '' ? '' : Number(value).toFixed(field.decimal)
        const text = num === '' ? '' : num
        const cell = new Uint8Array(field.length).fill(0x20)
        const bytes = encoder.encode(text)
        cell.set(bytes.subarray(0, Math.min(bytes.length, field.length)), field.length - Math.min(bytes.length, field.length))
        out.set(cell, pos)
      } else {
        const text = truncateUtf8(value, field.length)
        const cell = new Uint8Array(field.length).fill(0x20)
        cell.set(encoder.encode(text), 0)
        out.set(cell, pos)
      }
      pos += field.length
    }
  }
  out[pos] = 0x1a
  return { bytes: out, renamed, dropped }
}

/* ------------------------------------------------------------------ *
 * SHP / SHX
 * ------------------------------------------------------------------ */

function bboxOf(points: number[][]): [number, number, number, number] {
  if (points.length === 0) return [0, 0, 0, 0]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p[0] < minX) minX = p[0]
    if (p[1] < minY) minY = p[1]
    if (p[0] > maxX) maxX = p[0]
    if (p[1] > maxY) maxY = p[1]
  }
  return [minX, minY, maxX, maxY]
}

function layerPoints(records: Prepared[]): number[][] {
  const points: number[][] = []
  for (const rec of records) {
    if (rec.kind === 'point' || rec.kind === 'multipoint') points.push(...rec.points)
    else for (const part of rec.parts) points.push(...part)
  }
  return points
}

function shpTypeOf(records: Prepared[]): number {
  const kind = records[0]?.kind
  if (kind === 'point') return SHP_POINT
  if (kind === 'multipoint') return SHP_MULTIPOINT
  if (kind === 'polyline') return SHP_POLYLINE
  return SHP_POLYGON
}

function writeHeader(target: Uint8Array, fileLengthBytes: number, shpType: number, bbox: number[]): void {
  const view = new DataView(target.buffer)
  view.setInt32(0, 9994, false)
  view.setInt32(24, fileLengthBytes / 2, false)
  view.setInt32(28, 1000, true)
  view.setInt32(32, shpType, true)
  view.setFloat64(36, bbox[0], true)
  view.setFloat64(44, bbox[1], true)
  view.setFloat64(52, bbox[2], true)
  view.setFloat64(60, bbox[3], true)
}

function recordContent(rec: Prepared): Uint8Array {
  const type = rec.kind === 'point' ? SHP_POINT : rec.kind === 'multipoint' ? SHP_MULTIPOINT : rec.kind === 'polyline' ? SHP_POLYLINE : SHP_POLYGON

  if (rec.kind === 'point') {
    const out = new Uint8Array(20)
    const view = new DataView(out.buffer)
    view.setInt32(0, type, true)
    view.setFloat64(4, rec.points[0][0], true)
    view.setFloat64(12, rec.points[0][1], true)
    return out
  }

  if (rec.kind === 'multipoint') {
    const out = new Uint8Array(4 + 32 + 4 + rec.points.length * 16)
    const view = new DataView(out.buffer)
    view.setInt32(0, type, true)
    const box = bboxOf(rec.points)
    view.setFloat64(4, box[0], true)
    view.setFloat64(12, box[1], true)
    view.setFloat64(20, box[2], true)
    view.setFloat64(28, box[3], true)
    view.setInt32(36, rec.points.length, true)
    rec.points.forEach((p, i) => {
      view.setFloat64(40 + i * 16, p[0], true)
      view.setFloat64(48 + i * 16, p[1], true)
    })
    return out
  }

  const points = rec.parts.flat()
  const out = new Uint8Array(4 + 32 + 4 + 4 + rec.parts.length * 4 + points.length * 16)
  const view = new DataView(out.buffer)
  view.setInt32(0, type, true)
  const box = bboxOf(points)
  view.setFloat64(4, box[0], true)
  view.setFloat64(12, box[1], true)
  view.setFloat64(20, box[2], true)
  view.setFloat64(28, box[3], true)
  view.setInt32(36, rec.parts.length, true)
  view.setInt32(40, points.length, true)
  let cursor = 0
  rec.parts.forEach((part, i) => {
    view.setInt32(44 + i * 4, cursor, true)
    cursor += part.length
  })
  let offset = 44 + rec.parts.length * 4
  for (const p of points) {
    view.setFloat64(offset, p[0], true)
    view.setFloat64(offset + 8, p[1], true)
    offset += 16
  }
  return out
}

function buildShpShx(records: Prepared[]): { shp: Uint8Array; shx: Uint8Array } {
  const contents = records.map(recordContent)
  const shpLength = 100 + contents.reduce((sum, c) => sum + 8 + c.length, 0)
  const shxLength = 100 + records.length * 8
  const shp = new Uint8Array(shpLength)
  const shx = new Uint8Array(shxLength)
  const type = shpTypeOf(records)
  const box = bboxOf(layerPoints(records))
  writeHeader(shp, shpLength, type, box)
  writeHeader(shx, shxLength, type, box)

  const shpView = new DataView(shp.buffer)
  const shxView = new DataView(shx.buffer)
  let offset = 100
  let shxPos = 100
  contents.forEach((content, i) => {
    shpView.setInt32(offset, i + 1, false)
    shpView.setInt32(offset + 4, content.length / 2, false)
    shp.set(content, offset + 8)

    shxView.setInt32(shxPos, offset / 2, false)
    shxView.setInt32(shxPos + 4, content.length / 2, false)

    offset += 8 + content.length
    shxPos += 8
  })
  return { shp, shx }
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

const LAYER_NAMES: Record<string, string> = {
  point: 'points',
  multipoint: 'multipoints',
  polyline: 'lines',
  polygon: 'polygons'
}

export function buildShapefile(collection: VectorFeatureCollection): ShapefileExportResult {
  const groups = new Map<string, Prepared[]>()
  const warnings: string[] = []
  let skipped = 0

  for (const feature of collection.features) {
    const prepared = prepare(feature)
    if (prepared === null) {
      skipped++
      continue
    }
    if ('skipped' in prepared) {
      skipped++
      continue
    }
    const list = groups.get(prepared.kind) ?? []
    list.push(prepared)
    groups.set(prepared.kind, list)
  }

  if (groups.size === 0) throw new Error('shapefile-empty')
  if (skipped > 0) warnings.push(`shapefile-skipped-geometry:${skipped}`)

  const kinds = [...groups.keys()]
  if (kinds.length > 1) warnings.push(`shapefile-multi-layer:${kinds.length}`)

  const entries: Record<string, Uint8Array> = {}
  let renamedFields = false
  let droppedFields = 0

  for (const kind of kinds) {
    const records = groups.get(kind)!
    const base = kinds.length === 1 ? 'features' : LAYER_NAMES[kind]
    const { shp, shx } = buildShpShx(records)
    const dbf = buildDbf(records)
    if (dbf.renamed) renamedFields = true
    droppedFields += dbf.dropped

    entries[`${base}.shp`] = shp
    entries[`${base}.shx`] = shx
    entries[`${base}.dbf`] = dbf.bytes
    entries[`${base}.prj`] = new TextEncoder().encode(WGS84_PRJ)
    entries[`${base}.cpg`] = new TextEncoder().encode('UTF-8')
  }

  if (renamedFields) warnings.push('shapefile-field-renamed')
  if (droppedFields > 0) warnings.push(`shapefile-fields-dropped:${droppedFields}`)

  return { bytes: zipSync(entries), warnings, layerCount: kinds.length }
}