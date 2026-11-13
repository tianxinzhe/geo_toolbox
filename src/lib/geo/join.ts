/**
 * T18 属性连接
 *
 * 语义对齐 QGIS / ArcGIS 的「按字段连接属性表」：
 *   主矢量图层的某个字段 与 属性表的某个列 按值相等匹配，
 *   匹配成功的要素把属性表的列并入自身属性，几何保持不变。
 *
 * 为什么放在纯函数层：
 *   匹配规则（数值 1 与字符串 "1" 是否相等、字段名冲突谁覆盖、
 *   未匹配要素是否保留、重复键取哪一条）全是业务语义，
 *   放进组件就无法单测，也容易在三种界面语言下出现不一致。
 *
 * 属性表本身没有几何，所以不走 parseCsv（它要求经纬度列）；
 * 这里单独把 CSV / TSV / Excel 解析成 { headers, rows }。
 */

import Papa from 'papaparse'

import type { VectorFeature, VectorFeatureCollection } from '../convert/types'

export interface AttributeRow {
  [key: string]: unknown
}

export interface AttributeTable {
  headers: string[]
  rows: Record<string, string>[]
}

export interface JoinOptions {
  /** 矢量要素上用于匹配的字段名 */
  vectorField: string
  /** 属性表上用于匹配的列名 */
  tableField: string
  /** 未匹配的要素是否保留（默认 true） */
  keepUnmatched?: boolean
}

export interface JoinOutcome {
  collection: VectorFeatureCollection
  /** 匹配成功的要素数 */
  matched: number
  /** 未匹配的要素数 */
  unmatched: number
  /** 被属性表同名字段（连接字段除外）覆盖的要素数 */
  conflicts: number
  /** 属性表中键值重复、只采用首次出现的行数 */
  duplicates: number
}

/** 属性值 → 匹配键：去首尾空格，数值与字符串写法归一 */
function normalizeKey(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).trim()
}

/**
 * 按字段值连接属性表。
 *
 * - 空键（缺失 / null / 空串）一律不参与匹配，避免所有空值被连在一起；
 * - 属性表重复键以首次出现为准，其余行计入 duplicates；
 * - 表字段与矢量字段同名时属性表值覆盖，但连接字段本身不计入冲突；
 * - 不修改输入集合。
 */
export function joinAttributes(
  collection: VectorFeatureCollection,
  rows: AttributeRow[],
  options: JoinOptions
): JoinOutcome {
  const keepUnmatched = options.keepUnmatched !== false

  const index = new Map<string, AttributeRow>()
  let duplicates = 0
  for (const row of rows) {
    const key = normalizeKey(row[options.tableField])
    if (key === '') continue
    if (index.has(key)) {
      duplicates++
      continue
    }
    index.set(key, row)
  }

  let matched = 0
  let unmatched = 0
  let conflicts = 0
  const features: VectorFeature[] = []

  for (const feature of collection.features) {
    const properties = feature.properties ?? {}
    const key = normalizeKey(properties[options.vectorField])
    const row = key === '' ? undefined : index.get(key)

    if (!row) {
      unmatched++
      if (keepUnmatched) {
        features.push({
          type: 'Feature',
          geometry: feature.geometry,
          properties: { ...properties }
        })
      }
      continue
    }

    matched++

    const merged: Record<string, unknown> = { ...properties }
    let conflicted = false
    for (const [name, value] of Object.entries(row)) {
      if (name === '') continue
      if (
        name !== options.vectorField &&
        name !== options.tableField &&
        Object.prototype.hasOwnProperty.call(merged, name)
      ) {
        conflicted = true
      }
      merged[name] = value
    }
    if (conflicted) conflicts++

    features.push({ type: 'Feature', geometry: feature.geometry, properties: merged })
  }

  return {
    collection: { type: 'FeatureCollection', features },
    matched,
    unmatched,
    conflicts,
    duplicates
  }
}

/* ------------------------------------------------------------------ *
 * 属性表解析（CSV / TSV / Excel）
 * ------------------------------------------------------------------ */

/** 文本表格 → 表头 + 行；空表头列与全空行被丢弃 */
export function parseTableText(text: string, delimiter?: string): AttributeTable {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter
  })

  const headers = (parsed.meta.fields ?? []).filter((header) => header.trim() !== '')
  const rows: Record<string, string>[] = []

  for (const source of parsed.data) {
    const row: Record<string, string> = {}
    let filled = false
    for (const header of headers) {
      const value = source[header]
      const text = value === null || value === undefined ? '' : String(value)
      row[header] = text
      if (text.trim() !== '') filled = true
    }
    if (filled) rows.push(row)
  }

  return { headers, rows }
}

/** Excel 首个工作表 → 表头 + 行。复用批量的 SheetJS 入口，避免重复加载器 */
export async function parseXlsxTable(bytes: Uint8Array): Promise<AttributeTable> {
  const { readXlsxMatrix } = await import('../batch/xlsx')
  const { matrix } = await readXlsxMatrix(bytes)
  if (matrix.length === 0) throw new Error('xlsx-empty')

  const headers = (matrix[0] ?? []).map((header) => String(header).trim())
  const rows: Record<string, string>[] = []

  for (const line of matrix.slice(1)) {
    const row: Record<string, string> = {}
    let filled = false
    headers.forEach((header, index) => {
      if (header === '') return
      const value = line[index] === undefined ? '' : String(line[index])
      row[header] = value
      if (value.trim() !== '') filled = true
    })
    if (filled) rows.push(row)
  }

  return { headers: headers.filter((header) => header !== ''), rows }
}