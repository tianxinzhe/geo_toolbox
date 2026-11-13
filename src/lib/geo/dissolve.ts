/**
 * T20 按字段融合（Dissolve）
 *
 * 语义对齐 QGIS 的「按字段融合」：把某个字段取值相同的要素并成一条，
 * 几何按类型合并，属性只保留融合字段与该组的要素数。
 *
 * 几何规则：
 *   - 面：polygon-clipping 的 union，相邻/重叠的面会真正合并边界；
 *   - 线：全部拼成一个 MultiLineString；
 *   - 点：全部拼成一个 MultiPoint；
 *   - 同组内混合几何：输出 GeometryCollection；
 *   - 空几何要素计入 feature_count，但不产生几何。
 *
 * 分组顺序按字段值首次出现的位置固定，保证结果可重复。
 */

// polygon-clipping 的类型声明写的是命名导出，但 ESM 构建只导出 default 对象；
// 运行时按 default 取，方法签名用下面的局部类型约束。
// @ts-ignore -- 运行时以 default 导出为准
import polygonClipping from 'polygon-clipping'
import type { MultiPolygon } from 'polygon-clipping'

import type { VectorFeature, VectorFeatureCollection } from '../convert/types'
import type { GeoJsonGeometry } from '../convert/wkt'
import { geometryToMultiPolygon, multiPolygonToGeometry } from './overlay'

const booleanOps = polygonClipping as unknown as {
  union(subject: MultiPolygon, ...others: MultiPolygon[]): MultiPolygon
}

export interface DissolveGroup {
  /** 分组显示值；空组为 '' */
  value: string
  /** 该组要素数 */
  count: number
  /** 输出几何类型；没有可用几何时为 '' */
  geometryType: string
}

export interface DissolveOutcome {
  collection: VectorFeatureCollection
  groups: DissolveGroup[]
}

interface Bucket {
  /** 分组键（去首尾空格） */
  key: string
  /** 首个原始值，写回结果属性 */
  value: unknown
  count: number
  polygons: MultiPolygon
  lines: number[][][]
  points: number[][]
  others: GeoJsonGeometry[]
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'object') return false
  return String(value).trim() === ''
}

function blankValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).trim()
}

function collect(bucket: Bucket, geometry: GeoJsonGeometry): void {
  switch (geometry.type) {
    case 'Polygon':
    case 'MultiPolygon': {
      const multi = geometryToMultiPolygon(geometry)
      if (multi) bucket.polygons.push(...multi)
      else bucket.others.push(geometry)
      break
    }
    case 'LineString':
      bucket.lines.push(geometry.coordinates)
      break
    case 'MultiLineString':
      bucket.lines.push(...geometry.coordinates)
      break
    case 'Point':
      bucket.points.push(geometry.coordinates)
      break
    case 'MultiPoint':
      bucket.points.push(...geometry.coordinates)
      break
    case 'GeometryCollection':
      for (const child of geometry.geometries) collect(bucket, child)
      break
  }
}

function unionPolygons(polygons: MultiPolygon): GeoJsonGeometry | null {
  if (polygons.length === 0) return null
  try {
    let merged: MultiPolygon = [polygons[0]]
    for (const polygon of polygons.slice(1)) {
      merged = booleanOps.union(merged, [polygon])
    }
    return multiPolygonToGeometry(merged)
  } catch {
    // 自相交等非法面：退化为并排保留，至少不丢数据
    return multiPolygonToGeometry(polygons)
  }
}

/** 一个分组 → 一条结果要素的几何；没有可用几何时返回 null */
function buildGeometry(bucket: Bucket): GeoJsonGeometry | null {
  const parts: GeoJsonGeometry[] = []

  const polygons = unionPolygons(bucket.polygons)
  if (polygons) parts.push(polygons)
  if (bucket.lines.length > 0) {
    parts.push({ type: 'MultiLineString', coordinates: bucket.lines })
  }
  if (bucket.points.length > 0) {
    parts.push({ type: 'MultiPoint', coordinates: bucket.points })
  }
  parts.push(...bucket.others)

  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  return { type: 'GeometryCollection', geometries: parts }
}

/** 按字段值融合要素；不修改输入 */
export function dissolveByField(
  collection: VectorFeatureCollection,
  field: string
): DissolveOutcome {
  const buckets = new Map<string, Bucket>()

  for (const feature of collection.features) {
    const raw = feature.properties?.[field]
    const key = isBlank(raw) ? '' : blankValue(raw)

    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        key,
        value: isBlank(raw) ? '' : raw,
        count: 0,
        polygons: [],
        lines: [],
        points: [],
        others: []
      }
      buckets.set(key, bucket)
    }
    bucket.count++
    if (feature.geometry) collect(bucket, feature.geometry)
  }

  const features: VectorFeature[] = []
  const groups: DissolveGroup[] = []

  for (const bucket of buckets.values()) {
    const geometry = buildGeometry(bucket)
    features.push({
      type: 'Feature',
      geometry,
      properties: {
        [field]: bucket.value,
        feature_count: bucket.count
      }
    })
    groups.push({
      value: bucket.key,
      count: bucket.count,
      geometryType: geometry ? geometry.type : ''
    })
  }

  return {
    collection: { type: 'FeatureCollection', features },
    groups
  }
}