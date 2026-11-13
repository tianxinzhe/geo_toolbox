/**
 * T19 合并图层
 *
 * 语义对齐 QGIS 的「合并矢量图层」：把多个文件的要素按顺序拼进一个
 * FeatureCollection，几何与各自属性原样保留，不做坐标变换、不去重、
 * 不做几何融合（需要按字段融合请用 T20）。
 *
 * 来源记录：
 *   每个要素在 properties 没有 source 字段时写入来源文件名，
 *   让合并后的数据仍能追溯来源；已有 source 的要素保持原值，
 *   不覆盖用户数据。
 */

import type { VectorFeature, VectorFeatureCollection } from '../convert/types'

export interface MergeEntry {
  name: string
  collection: VectorFeatureCollection
}

export interface MergeSource {
  name: string
  /** 该文件贡献的要素数 */
  count: number
}

export interface MergeOutcome {
  collection: VectorFeatureCollection
  sources: MergeSource[]
  /** 合并后的要素总数 */
  total: number
  /** 几何类型 → 要素数（null 几何记为 none） */
  geometryCounts: Record<string, number>
}

const SOURCE_FIELD = 'source'

/** 合并多个集合；不修改输入，也不去重 */
export function mergeCollections(entries: MergeEntry[]): MergeOutcome {
  const features: VectorFeature[] = []
  const sources: MergeSource[] = []
  const geometryCounts: Record<string, number> = {}

  for (const entry of entries) {
    let count = 0
    for (const feature of entry.collection.features) {
      const properties = { ...(feature.properties ?? {}) }
      if (!Object.prototype.hasOwnProperty.call(properties, SOURCE_FIELD)) {
        properties[SOURCE_FIELD] = entry.name
      }

      features.push({
        type: 'Feature',
        geometry: feature.geometry,
        properties
      })
      count++

      const type = feature.geometry ? feature.geometry.type : 'none'
      geometryCounts[type] = (geometryCounts[type] ?? 0) + 1
    }
    sources.push({ name: entry.name, count })
  }

  return {
    collection: { type: 'FeatureCollection', features },
    sources,
    total: features.length,
    geometryCounts
  }
}