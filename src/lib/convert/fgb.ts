/**
 * FlatGeobuf（.fgb）适配器。
 *
 * 输入输出都是二进制，因此本模块只被 `parseFileInput` / `serializeCollectionAsync`
 * 动态 import —— 首屏与文本格式的转换不会加载 flatbuffers 运行时。
 *
 * 已知限制（与 PRD 的 T06 处理规则一致，不静默丢数据）：
 *   ① FGB 是单图层容器，库里多图层会被拆平成一个集合；
 *   ② 列结构由 flatgeobuf 依据首条要素推断，因此这里先把所有要素的属性列对齐，
 *      类型不一致时统一降级为文本并给出警告。
 */

import { deserialize, serialize } from 'flatgeobuf/geojson'

import type {
  ParseOutcome,
  VectorFeature,
  VectorFeatureCollection
} from './types'
import type { GeoJsonGeometry } from './wkt'

/** 把属性列对齐到并集：缺列补 null，对象/数组转 JSON，混合类型降级为文本 */
function alignProperties(features: VectorFeature[]): {
  features: VectorFeature[]
  warnings: string[]
} {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const f of features) {
    for (const k of Object.keys(f.properties ?? {})) {
      if (!seen.has(k)) {
        seen.add(k)
        keys.push(k)
      }
    }
  }
  if (keys.length === 0) return { features, warnings: [] }

  // 逐列判断是否必须文本化：出现字符串/对象，或数字与布尔混用
  const textColumns = new Set<string>()
  for (const key of keys) {
    let numeric = false
    let boolean = false
    let textual = false
    for (const f of features) {
      const v = f.properties?.[key]
      if (v === null || v === undefined) continue
      if (typeof v === 'number') numeric = true
      else if (typeof v === 'boolean') boolean = true
      else if (typeof v === 'string') textual = true
      else textual = true
    }
    if (textual || (numeric && boolean)) textColumns.add(key)
  }

  let coerced = 0
  const aligned = features.map((f) => {
    const properties: Record<string, unknown> = {}
    for (const key of keys) {
      let v = f.properties?.[key]
      if (v === undefined) {
        properties[key] = null
        continue
      }
      if (typeof v === 'object' && v !== null) {
        v = JSON.stringify(v)
        coerced++
      }
      if (v !== null && textColumns.has(key) && typeof v !== 'string') {
        v = String(v)
        coerced++
      }
      properties[key] = v
    }
    return { ...f, properties }
  })

  return {
    features: aligned,
    warnings: coerced > 0 ? [`fgb-attrs-stringified:${coerced}`] : []
  }
}

/** 解析 .fgb 字节；多图层在 FGB 里不存在，这里统一成单集合 */
export async function parseFgb(bytes: Uint8Array): Promise<ParseOutcome> {
  if (bytes.length < 12) throw new Error('invalid-fgb')

  const features: VectorFeature[] = []
  try {
    for await (const item of deserialize(bytes)) {
      features.push({
        type: 'Feature',
        geometry: (item.geometry ?? null) as GeoJsonGeometry | null,
        properties: (item.properties ?? {}) as Record<string, unknown>
      })
    }
  } catch {
    throw new Error('invalid-fgb')
  }

  return {
    format: 'fgb',
    collection: { type: 'FeatureCollection', features },
    issues: [],
    warnings: [],
    // FGB 头部可带 CRS，但当前不做重投影，按下「未声明」处理
    crsDeclared: false
  }
}

/** 集合 → FGB 字节 */
export function collectionToFgb(fc: VectorFeatureCollection): {
  bytes: Uint8Array
  warnings: string[]
} {
  if (fc.features.length === 0) throw new Error('fgb-empty')
  const { features, warnings } = alignProperties(fc.features)
  const bytes = serialize({ type: 'FeatureCollection', features } as never)
  return { bytes, warnings }
}