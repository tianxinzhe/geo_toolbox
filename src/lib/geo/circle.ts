/**
 * T10 等距圈（geodesic circle）。
 *
 * 与「投影圆」的区别：等距圈定义在椭球面上——从圆心沿任意方位走相同
 * 大地线距离得到的点集。先把圆心投到某个平面再画圆，在高纬或大半径下
 * 会明显变形，因此这里逐方位调用 Vincenty 正算生成边界点。
 *
 * 面积/周长复用 SR-03 的等积球面积与椭球周长（SR-03）：
 *   - 面积用等积球，保证面积守恒；
 *   - 周长逐边用 Vincenty，避免等积球长度失真。
 */

import { vincentyDirect } from './geodesy'
import { polygonSummary } from './polygon'
import type { VectorFeature, VectorFeatureCollection } from '../convert/types'

export type RadiusUnit = 'm' | 'km' | 'mi' | 'nmi'

export const RADIUS_UNITS: readonly RadiusUnit[] = ['m', 'km', 'mi', 'nmi']

const UNIT_METERS: Record<RadiusUnit, number> = {
  m: 1,
  km: 1000,
  mi: 1609.344,
  nmi: 1852
}

/** PRD 6.3 T10：单个半径不超过 20,000 km */
export const MAX_RADIUS_M = 20_000_000

/** 球面正算的备用半径（只用于 Vincenty 近对跖点不收敛时） */
const SPHERE_R = 6_371_008.8

export function radiusToMeters(value: number, unit: RadiusUnit): number {
  return value * UNIT_METERS[unit]
}

export function metersToUnit(meters: number, unit: RadiusUnit): number {
  return meters / UNIT_METERS[unit]
}

interface Destination {
  lat: number
  lng: number
  fellBack: boolean
}

function sphericalDestination(
  lat: number,
  lng: number,
  bearing: number,
  distance: number
): Destination {
  const d = distance / SPHERE_R
  const phi1 = (lat * Math.PI) / 180
  const lambda1 = (lng * Math.PI) / 180
  const theta = (bearing * Math.PI) / 180
  const sinPhi2 = Math.sin(phi1) * Math.cos(d) + Math.cos(phi1) * Math.sin(d) * Math.cos(theta)
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)))
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(d) * Math.cos(phi1),
      Math.cos(d) - Math.sin(phi1) * Math.sin(phi2)
    )
  let lng2 = (lambda2 * 180) / Math.PI
  lng2 = ((((lng2 + 180) % 360) + 360) % 360) - 180
  return { lat: (phi2 * 180) / Math.PI, lng: lng2, fellBack: true }
}

function destination(lat: number, lng: number, bearing: number, distance: number): Destination {
  if (distance === 0) return { lat, lng, fellBack: false }
  const v = vincentyDirect(lat, lng, bearing, distance)
  if (v) return { lat: v.lat, lng: v.lng, fellBack: false }
  return sphericalDestination(lat, lng, bearing, distance)
}

export interface CircleRing {
  /** 闭合环，首尾相同，[lng, lat] */
  ring: number[][]
  /** 是否有点因 Vincenty 不收敛而回退到球面 */
  fellBack: boolean
  /** 生成的边界点数（不含闭合复制点） */
  points: number
}

/**
 * 生成等距圈边界。
 *
 * @param lat 圆心纬度
 * @param lng 圆心经度
 * @param radiusM 半径（米）
 * @param segments 边数，默认 128（PRD 6.3 T10）
 */
export function geodesicRing(
  lat: number,
  lng: number,
  radiusM: number,
  segments = 128
): CircleRing {
  if (!(radiusM > 0)) throw new RangeError('radius must be positive')
  if (radiusM > MAX_RADIUS_M) throw new RangeError('radius exceeds limit')
  if (!Number.isInteger(segments) || segments < 8 || segments > 1024) {
    throw new RangeError('segments out of range')
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new RangeError('center out of range')

  const ring: number[][] = []
  let fellBack = false
  for (let i = 0; i < segments; i++) {
    const bearing = (i * 360) / segments
    const p = destination(lat, lng, bearing, radiusM)
    if (p.fellBack) fellBack = true
    ring.push([p.lng, p.lat])
  }
  // 严格复制首点闭合，避免浮点累积误差
  ring.push([...ring[0]])
  return { ring, fellBack, points: segments }
}

export interface CircleMetrics {
  radiusM: number
  areaM2: number
  perimeterM: number
  points: number
  fellBack: boolean
}

/** 计算等距圈的面积、周长与边界点数 */
export function circleMetrics(
  lat: number,
  lng: number,
  radiusM: number,
  segments = 128
): CircleMetrics & { ring: number[][] } {
  const r = geodesicRing(lat, lng, radiusM, segments)
  const summary = polygonSummary(
    r.ring.map((p) => ({ lng: p[0], lat: p[1] })),
    true
  )
  return {
    radiusM,
    areaM2: summary.areaM2,
    perimeterM: summary.perimeterM,
    points: r.points,
    fellBack: r.fellBack,
    ring: r.ring
  }
}

/** 多重半径的配色（PRD 6.3 T10：不同颜色区分，图例标注） */
export const CIRCLE_COLORS = [
  '#1f6feb',
  '#d97706',
  '#059669',
  '#dc2626',
  '#7c3aed',
  '#0891b2'
]

export interface CircleSpec {
  value: number
  unit: RadiusUnit
}

/**
 * 生成多重等距圈的 FeatureCollection。
 *
 * 属性里保留原始半径与单位，导出后仍能读懂每个圈的含义。
 * 颜色只作为展示提示写入 `color`，不参与任何计算。
 */
export function buildCircleCollection(
  lat: number,
  lng: number,
  radii: readonly CircleSpec[],
  segments = 128
): VectorFeatureCollection {
  const features: VectorFeature[] = radii.map((r, i) => {
    const radiusM = radiusToMeters(r.value, r.unit)
    const m = circleMetrics(lat, lng, radiusM, segments)
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [m.ring] },
      properties: {
        radius: r.value,
        unit: r.unit,
        radius_m: Math.round(radiusM * 100) / 100,
        area_m2: Math.round(m.areaM2 * 100) / 100,
        perimeter_m: Math.round(m.perimeterM * 100) / 100,
        points: m.points,
        color: CIRCLE_COLORS[i % CIRCLE_COLORS.length]
      }
    }
  })
  return { type: 'FeatureCollection', features }
}

/** 解析半径输入：支持逗号/空格/斜杠分隔的多个数值 */
export function parseRadiusList(raw: string): number[] {
  const parts = raw
    .split(/[\s,;/，、；]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
  const out: number[] = []
  for (const p of parts) {
    const n = Number(p)
    if (!Number.isFinite(n)) return []
    out.push(n)
  }
  return out
}