/**
 * 多图层容器的图层枚举。
 *
 * 只有 GeoPackage 与 Shapefile（ZIP）可能包含多个图层：
 *   - gpkg 通过 gpkg_contents 的要素表名列出；
 *   - Shapefile ZIP 列出所有 .shp。
 * 其余格式视为单图层，返回空数组，调用方按普通文件解析。
 */

import { detectFormat } from './format'
import type { VectorFeatureCollection, VectorFormat } from './types'

export interface LayerListResult {
  format: VectorFormat | ''
  /** 多图层容器返回图层名；单图层格式返回空数组 */
  layers: string[]
}

/** GeoJSON 没有原生图层，按几何类型拆成逻辑图层 */
export type GeometryGroupKey = 'point' | 'line' | 'polygon' | 'other'

export interface GeoLayerGroup {
  key: string
  /** 按属性分层时给出「字段=值」，按几何类型分层时为空，由界面翻译 */
  label: string
  collection: VectorFeatureCollection
}

const GROUP_OF: Record<string, GeometryGroupKey> = {
  Point: 'point',
  MultiPoint: 'point',
  LineString: 'line',
  MultiLineString: 'line',
  Polygon: 'polygon',
  MultiPolygon: 'polygon'
}

const GROUP_ORDER: GeometryGroupKey[] = ['point', 'line', 'polygon', 'other']

function splitByGeometryType(collection: VectorFeatureCollection): GeoLayerGroup[] {
  const buckets = new Map<GeometryGroupKey, VectorFeatureCollection['features']>()
  for (const feature of collection.features) {
    const key = feature.geometry ? (GROUP_OF[feature.geometry.type] ?? 'other') : 'other'
    const list = buckets.get(key)
    if (list) list.push(feature)
    else buckets.set(key, [feature])
  }

  return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    label: '',
    collection: { type: 'FeatureCollection', features: buckets.get(key)! }
  }))
}

/**
 * GeoJSON 的逻辑图层：按几何类型拆成点 / 线 / 面 / 其他。
 * 只返回实际存在的分组；界面用这些分组区分点、线、面。
 */
export function splitGeoJsonLayers(collection: VectorFeatureCollection): GeoLayerGroup[] {
  return splitByGeometryType(collection)
}

export async function listFileLayers(opts: {
  fileName?: string
  bytes?: Uint8Array
  source?: VectorFormat | 'auto'
}): Promise<LayerListResult> {
  const format =
    opts.source && opts.source !== 'auto' ? opts.source : detectFormat('', opts.fileName)

  if (!opts.bytes) return { format, layers: [] }

  if (format === 'gpkg') {
    const { gpkgLayerNames } = await import('./gpkg')
    return { format, layers: await gpkgLayerNames(opts.bytes) }
  }

  if (format === 'shapefile') {
    const { shapefileLayers } = await import('./shapefile')
    return { format, layers: shapefileLayers(opts.bytes) }
  }

  return { format, layers: [] }
}