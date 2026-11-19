/**
 * T09 绘制器的状态与逻辑层（PRD 6.3：状态层完全共享，交互层分设备）。
 *
 * 这里不含任何 DOM / Leaflet 引用，因此可以被单测完整覆盖。
 * 组件只负责把 Leaflet 事件翻译成这些纯函数调用。
 */

import { distanceAndBearing } from '../geo/geodesy'
import { polygonSummary } from '../geo/polygon'
import { circleMetrics } from '../geo/circle'
import type { SerializeOutcome, VectorFeature, VectorFormat } from '../convert/types'
import { serializeCollection } from '../convert/format'
import type { GeoJsonGeometry } from '../convert/wkt'

export interface DrawFeature extends VectorFeature {
  id: string
  /** 要素名称，便于列表与导出识别 */
  properties: Record<string, unknown> & { name?: string; description?: string }
}

export interface DrawState {
  features: DrawFeature[]
}

export interface ImportIssue {
  code: string
  detail?: string
}

let idSeq = 0

export function newFeatureId(): string {
  idSeq += 1
  return `f${Date.now().toString(36)}-${idSeq.toString(36)}`
}

export function cloneState(state: DrawState): DrawState {
  return JSON.parse(JSON.stringify(state)) as DrawState
}

/**
 * 撤销 / 重做栈。
 *
 * `MAX_UNDO = 50` 表示最多回退 50 步，因此内部保留 51 个快照。
 * 任何会改变要素的操作都必须先 commit 新状态；选中态不入栈。
 */
export class DrawHistory {
  static readonly MAX_UNDO = 50
  private entries: DrawState[]
  private index = 0

  constructor(initial: DrawState) {
    this.entries = [cloneState(initial)]
  }

  get current(): DrawState {
    return this.entries[this.index]
  }

  get canUndo(): boolean {
    return this.index > 0
  }

  get canRedo(): boolean {
    return this.index < this.entries.length - 1
  }

  commit(next: DrawState): void {
    const copy = cloneState(next)
    this.entries = this.entries.slice(0, this.index + 1)
    this.entries.push(copy)
    if (this.entries.length > DrawHistory.MAX_UNDO + 1) this.entries.shift()
    this.index = this.entries.length - 1
  }

  undo(): DrawState {
    if (this.canUndo) this.index -= 1
    return this.current
  }

  redo(): DrawState {
    if (this.canRedo) this.index += 1
    return this.current
  }

  reset(state: DrawState): void {
    this.entries = [cloneState(state)]
    this.index = 0
  }
}

/* ------------------------------------------------------------------ *
 * 几何生成
 * ------------------------------------------------------------------ */

/** 两点（对角）生成矩形，闭合环，[lng,lat] */
export function rectanglePolygon(
  a: [number, number],
  b: [number, number]
): GeoJsonGeometry {
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng1, lat1],
        [lng2, lat1],
        [lng2, lat2],
        [lng1, lat2],
        [lng1, lat1]
      ]
    ]
  }
}

/** 圆心 + 边界点 → 等距圆多边形；半径由两点大地线距离决定 */
export function circlePolygon(
  center: [number, number],
  edge: [number, number],
  segments = 64
): { geometry: GeoJsonGeometry; radiusM: number } {
  const d = distanceAndBearing(center[1], center[0], edge[1], edge[0])
  const radiusM = d.distance
  const m = circleMetrics(center[1], center[0], Math.max(1, radiusM), segments)
  return {
    geometry: { type: 'Polygon', coordinates: [m.ring] },
    radiusM
  }
}

/* ------------------------------------------------------------------ *
 * 度量
 * ------------------------------------------------------------------ */

export interface FeatureMeasure {
  kind: 'point' | 'line' | 'polygon' | 'other'
  lengthM?: number
  areaM2?: number
  perimeterM?: number
 /** 点坐标 [lng, lat] */
  point?: [number, number]
  /** 线/面顶点数 */
  vertices?: number
}

function lineLength(coords: number[][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]
    const b = coords[i]
    total += distanceAndBearing(a[1], a[0], b[1], b[0]).distance
  }
  return total
}

export function measureFeature(feature: VectorFeature): FeatureMeasure {
  const g = feature.geometry
  if (!g) return { kind: 'other' }
  if (g.type === 'Point') {
    return {
      kind: 'point',
      point: [g.coordinates[0], g.coordinates[1]],
      vertices: 1
    }
  }
  if (g.type === 'LineString') {
    return { kind: 'line', lengthM: lineLength(g.coordinates), vertices: g.coordinates.length }
  }
  if (g.type === 'Polygon') {
    const s = polygonSummary(
      g.coordinates[0].map((p) => ({ lng: p[0], lat: p[1] })),
      true
    )
    return {
      kind: 'polygon',
      areaM2: s.areaM2,
      perimeterM: s.perimeterM,
      lengthM: s.perimeterM,
      vertices: g.coordinates[0].length
    }
  }
  return { kind: 'other' }
}

export interface DrawStats {
  count: number
  counts: Record<string, number>
  totalLengthM: number
  totalAreaM2: number
}

export function statsOf(features: readonly VectorFeature[]): DrawStats {
  const counts: Record<string, number> = {}
  let totalLengthM = 0
  let totalAreaM2 = 0
  for (const f of features) {
    const type = f.geometry?.type ?? 'null'
    counts[type] = (counts[type] ?? 0) + 1
    const m = measureFeature(f)
    if (m.lengthM) totalLengthM += m.lengthM
    if (m.areaM2) totalAreaM2 += m.areaM2
  }
  return { count: features.length, counts, totalLengthM, totalAreaM2 }
}

/* ------------------------------------------------------------------ *
 * 导入 / 导出
 * ------------------------------------------------------------------ */

/**
 * 把 T06/T07 的解析结果转成带 id 的绘制要素。
 *
 * 属性原样保留，不额外合成 name 字段：GeoJSON 里 Name / 标题 等键名各不相同，
 * 合并成一个键会让导出结果凭空多出一列。展示层需要名称时按 name → Name 回退。
 */
export function adoptFeatures(features: readonly VectorFeature[]): DrawFeature[] {
  return features.map((f) => ({
    type: 'Feature',
    id: newFeatureId(),
    geometry: f.geometry,
    properties: { ...f.properties }
  }))
}

export function toVectorCollection(features: readonly DrawFeature[]): {
  type: 'FeatureCollection'
  features: VectorFeature[]
} {
  return {
    type: 'FeatureCollection',
    features: features.map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: f.properties
    }))
  }
}

/**
 * 导出。所有坐标按 WGS84 原样写出（Shapefile 的 .prj 同样声明 WGS84）。
 */
export function exportFeatures(
  features: readonly DrawFeature[],
  target: VectorFormat
): SerializeOutcome {
  const collection = toVectorCollection(features)
  return serializeCollection(collection, {
    target,
    indent: true,
    digits: 8,
    removeEmpty: true,
    gpxAttrs: 'name-desc',
    skipUnsupported: true
  })
}

/* ------------------------------------------------------------------ *
 * 本地保存
 * ------------------------------------------------------------------ */

export const STORAGE_KEY = 'geo-toolbox:map-draw:v1'

export interface StoredDraw {
  version: 1
  savedAt: number
  features: DrawFeature[]
}

export function serializeForStorage(features: readonly DrawFeature[]): string {
  const data: StoredDraw = {
    version: 1,
    savedAt: Date.now(),
    features: features as DrawFeature[]
  }
  return JSON.stringify(data)
}

export function parseStored(raw: string): StoredDraw | null {
  try {
    const data = JSON.parse(raw) as StoredDraw
    if (data.version !== 1 || !Array.isArray(data.features)) return null
    return data
  } catch {
    return null
  }
}