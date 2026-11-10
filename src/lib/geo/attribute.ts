/**
 * T17 按属性提取要素
 *
 * 语义对齐 QGIS 的「按属性提取」：读取要素的属性表，按一个字段 + 运算符
 * 过滤要素，保留几何与全部属性。
 *
 * 为什么把比较逻辑放在纯函数层：
 *   属性值在 GeoJSON 里可能是字符串、数字、布尔或 null，而 CSV / Excel
 *   导入后几乎全是字符串。数值比较必须先做类型归一，否则 "> 10" 会按
 *   字典序把 "9" 判成大于 "10"。这一层统一处理，组件只负责展示。
 */

import type { VectorFeatureCollection } from '../convert/types'

export type AttributeOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'empty'
  | 'notEmpty'

export interface AttributeField {
  name: string
  /** 最多 3 个非空示例值，用于下拉提示 */
  samples: string[]
  /** 所有非空值都能解析成数字时为 true */
  numeric: boolean
  /** 非空值个数 */
  filled: number
}

export interface AttributeExtractResult {
  collection: VectorFeatureCollection
  matched: number
  total: number
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || displayValue(value).trim() === ''
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** 扫描属性表，统计字段、示例值与数值特征 */
export function listFields(collection: VectorFeatureCollection): AttributeField[] {
  const fields = new Map<string, { samples: string[]; numeric: boolean; filled: number }>()

  for (const feature of collection.features) {
    for (const [name, value] of Object.entries(feature.properties ?? {})) {
      let entry = fields.get(name)
      if (!entry) {
        entry = { samples: [], numeric: true, filled: 0 }
        fields.set(name, entry)
      }
      if (isEmptyValue(value)) continue
      entry.filled++
      if (asNumber(value) === null) entry.numeric = false
      const text = displayValue(value)
      if (entry.samples.length < 3 && !entry.samples.includes(text)) entry.samples.push(text)
    }
  }

  return [...fields.entries()].map(([name, entry]) => ({
    name,
    samples: entry.samples,
    numeric: entry.numeric && entry.filled > 0,
    filled: entry.filled
  }))
}

function matches(
  raw: unknown,
  op: AttributeOperator,
  field: AttributeField,
  input: string
): boolean {
  if (op === 'empty') return isEmptyValue(raw)
  if (op === 'notEmpty') return !isEmptyValue(raw)

  if (isEmptyValue(raw)) return false

  if (op === 'contains') {
    return displayValue(raw).toLowerCase().includes(input.trim().toLowerCase())
  }

  const numericOp = op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte'
  if (numericOp || field.numeric) {
    const left = asNumber(raw)
    const right = asNumber(input)
    if (left !== null && right !== null) {
      switch (op) {
        case 'eq':
          return left === right
        case 'neq':
          return left !== right
        case 'gt':
          return left > right
        case 'gte':
          return left >= right
        case 'lt':
          return left < right
        case 'lte':
          return left <= right
      }
    }
    // 数值运算符遇到非数值：不匹配，而不是退化成字符串比较
    if (numericOp) return false
  }

  const left = displayValue(raw)
  const right = input
  return op === 'eq' ? left === right : left !== right
}

/**
 * 列出字段的现有取值，供「选择现有值」使用。
 * 去重后按数值或文本排序，默认最多 200 个。
 */
export function distinctValues(
  collection: VectorFeatureCollection,
  fieldName: string,
  limit = 200
): string[] {
  const values = new Set<string>()
  for (const feature of collection.features) {
    const raw = feature.properties?.[fieldName]
    if (isEmptyValue(raw)) continue
    values.add(displayValue(raw))
  }

  const list = [...values]
  const numeric = list.every((value) => asNumber(value) !== null)
  list.sort((a, b) =>
    numeric ? Number(a) - Number(b) : a.localeCompare(b, undefined, { numeric: true })
  )
  return list.slice(0, limit)
}

/**
 * 按单个条件提取要素。
 * 字段不存在时按「空值」处理：empty 会命中，其余运算符不命中。
 */
export function extractByAttribute(
  collection: VectorFeatureCollection,
  fieldName: string,
  op: AttributeOperator,
  input: string,
  field?: AttributeField
): AttributeExtractResult {
  const meta = field ?? listFields(collection).find((item) => item.name === fieldName)

  const features = collection.features.filter((feature) => {
    const raw = feature.properties?.[fieldName]
    if (!meta) {
      return op === 'empty' ? isEmptyValue(raw) : op === 'notEmpty' ? !isEmptyValue(raw) : false
    }
    return matches(raw, op, meta, input)
  })

  return {
    collection: { type: 'FeatureCollection', features },
    matched: features.length,
    total: collection.features.length
  }
}