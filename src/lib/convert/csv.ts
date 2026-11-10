/**
 * CSV / TSV 读写（T06 + 后续 FR-13 批量共用）。
 *
 * 列识别遵循 PRD FR-07：只认明确列名，识别不到就抛出 CsvColumnsError，
 * 把表头交给 UI 让用户手动选择 —— 不擅自猜「第一列是经度」。
 */

import Papa from 'papaparse'

import { std } from '../coord/format'
import {
  CsvColumnsError,
  type CsvColumnInfo,
  type CsvParseOptions,
  type FeatureIssue,
  type VectorFeature,
  type VectorFeatureCollection
} from './types'
import { geometryToWkt } from './wkt'

/** 去掉空格、下划线、连字符并转小写，用于列名比较 */
function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_\-()[\]]/g, '')
}

const LAT_NAMES = [
  'lat',
  'latitude',
  '纬度',
  '緯度',
  'wgs84lat',
  'latdeg',
  'gpslat',
  'y'
]

const LNG_NAMES = [
  'lng',
  'lon',
  'long',
  'longitude',
  '经度',
  '經度',
  'wgs84lng',
  'lngdeg',
  'gpslng',
  'x'
]

function pick(headers: string[], names: string[]): string | undefined {
  const normalized = headers.map((h) => ({ raw: h, key: normalizeHeader(h) }))
  for (const name of names) {
    const found = normalized.find((h) => h.key === name)
    if (found) return found.raw
  }
  return undefined
}

/** 自动识别经纬度列；识别不到返回空字段，由 UI 让用户手选 */
export function detectCsvColumns(headers: string[]): CsvColumnInfo {
  return {
    headers,
    latColumn: pick(headers, LAT_NAMES),
    lngColumn: pick(headers, LNG_NAMES)
  }
}

function parseNum(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export interface CsvParseOutcome {
  collection: VectorFeatureCollection
  issues: FeatureIssue[]
  warnings: string[]
  columns: CsvColumnInfo
}

/**
 * CSV/TSV → 点要素集合。
 * 经纬度列缺失时抛 CsvColumnsError（携带表头），由调用方展示列选择器。
 */
export function parseCsv(text: string, opts: CsvParseOptions = {}): CsvParseOutcome {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter: opts.delimiter
  })

  const headers = (parsed.meta.fields ?? []).filter((h) => h.trim() !== '')
  if (headers.length === 0) {
    throw new CsvColumnsError([])
  }

  const auto = detectCsvColumns(headers)
  const latColumn = opts.latColumn ?? auto.latColumn
  const lngColumn = opts.lngColumn ?? auto.lngColumn
  if (!latColumn || !lngColumn) {
    throw new CsvColumnsError(headers)
  }

  const issues: FeatureIssue[] = []
  const warnings: string[] = []
  const features: VectorFeature[] = []

  parsed.data.forEach((row, i) => {
    const lat = parseNum(row[latColumn] ?? '')
    const lng = parseNum(row[lngColumn] ?? '')
    if (lat === null || lng === null) {
      issues.push({ feature: i, code: 'csv-row-skipped', detail: 'lat/lng' })
      return
    }
    const properties: Record<string, unknown> = {}
    for (const h of headers) {
      if (h === latColumn || h === lngColumn) continue
      properties[h] = row[h] ?? ''
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties
    })
  })

  if (parsed.errors.length > 0) {
    warnings.push(`csv-parse-errors:${parsed.errors.length}`)
  }

  return {
    collection: { type: 'FeatureCollection', features },
    issues,
    warnings,
    columns: { headers, latColumn, lngColumn }
  }
}

/** 收集所有要素的属性列名（保持首次出现顺序） */
function propertyColumns(fc: VectorFeatureCollection): string[] {
  const cols: string[] = []
  const seen = new Set<string>()
  for (const f of fc.features) {
    for (const k of Object.keys(f.properties ?? {})) {
      if (!seen.has(k)) {
        seen.add(k)
        cols.push(k)
      }
    }
  }
  return cols
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * 要素集合 → CSV。
 *
 * 纯点数据输出 lng,lat + 属性列；只要含非点几何，就改用 WKT 列
 * （PRD T06 明确要求在下载前告知这一行为）。
 */
export function collectionToCsv(fc: VectorFeatureCollection, digits = 7, delimiter = ','): string {
  const allPoints =
    fc.features.length > 0 &&
    fc.features.every((f) => f.geometry !== null && f.geometry.type === 'Point')
  const propCols = propertyColumns(fc)

  if (allPoints) {
    const fields = ['lng', 'lat', ...propCols]
    const data = fc.features.map((f) => {
      const coords = (f.geometry as { coordinates: number[] }).coordinates
      return [std(coords[0], digits), std(coords[1], digits), ...propCols.map((c) => cell(f.properties[c]))]
    })
    return Papa.unparse({ fields, data }, { delimiter })
  }

  const fields = ['wkt', ...propCols]
  const data = fc.features.map((f) => [
    f.geometry ? geometryToWkt(f.geometry) : '',
    ...propCols.map((c) => cell(f.properties[c]))
  ])
  return Papa.unparse({ fields, data }, { delimiter })
}