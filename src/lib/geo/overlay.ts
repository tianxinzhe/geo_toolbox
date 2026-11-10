/**
 * T16 图层裁切与叠加的几何内核
 *
 * 语义对齐 QGIS 的矢量叠加工具：
 *   - 裁切 Clip      = 输入图层 ∩ 叠加图层（保留输入属性）
 *   - 相交 Intersect = 与裁切同义，仅面要素的公共部分
 *   - 擦除 Difference= 输入图层 − 叠加图层
 *   - 简化 Simplify  = Douglas–Peucker 抽稀（线与面）
 *
 * 为什么把布尔运算交给 polygon-clipping：
 *   多边形布尔运算要处理自相交、共线、洞、多部件等边界情况，
 *   自己实现容易在真实数据上产生拓扑错误。polygon-clipping 体积小、
 *   无 DOM 依赖，输出 MultiPolygon，正好可以合并成一个要素。
 *
 * 刻意只处理面要素：点与线在裁切/擦除中的语义（点按包含关系过滤、
 * 线按边界截断）与面完全不同，混在一起会让「为什么这条线没了」
 * 难以解释。非面要素按 skip 计数返回，由界面明确提示，不静默丢弃。
 *
 * 属性策略：结果只保留**输入图层 A** 的属性。叠加图层 B 可能由多个
 * 要素组成，若把命中的 B 属性合并进来，同一块结果可能对应多个 B 要素，
 * 合并规则无法自洽；QGIS 默认也是保留被裁切图层的属性。
 */

// polygon-clipping 的类型声明写的是命名导出，但 ESM 构建只导出 default 对象；
// 运行时按 default 取，方法签名用下面的局部类型约束。
// @ts-ignore -- 运行时以 default 导出为准
import polygonClipping from 'polygon-clipping'
import type { MultiPolygon } from 'polygon-clipping'

import type { VectorFeature, VectorFeatureCollection } from '../convert/types'
import type { GeoJsonGeometry } from '../convert/wkt'
import { signedAreaM2 } from './polygon'

const booleanOps = polygonClipping as unknown as {
  difference(subject: MultiPolygon, mask: MultiPolygon): MultiPolygon
  intersection(subject: MultiPolygon, mask: MultiPolygon): MultiPolygon
}

export type OverlayOperation = 'clip' | 'intersect' | 'difference' | 'simplify'

export interface OverlayOutcome {
  collection: VectorFeatureCollection
  /** 输入图层参与运算的要素数 */
  inputCount: number
  /** 结果要素数 */
  outputCount: number
  /** 被忽略的非面要素或无效几何数 */
  skipped: number
  /** 结果总面积（平方米，球面计算） */
  areaM2: number
}

type Pair = [number, number]

/* ------------------------------------------------------------------ *
 * 几何 ↔ polygon-clipping
 * ------------------------------------------------------------------ */

function isPolygonal(geometry: GeoJsonGeometry | null): boolean {
  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon'
}

/** 去掉重复的收尾点，过滤非法数值；不足 3 个点的环直接丢弃 */
function normalizeRing(ring: number[][]): Pair[] | null {
  const points: Pair[] = []
  for (const coord of ring) {
    const lng = Number(coord[0])
    const lat = Number(coord[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    points.push([lng, lat])
  }
  // 闭合环首尾相同；先去掉尾点，统一由调用方决定是否闭合
  if (points.length > 1) {
    const first = points[0]
    const last = points[points.length - 1]
    if (first[0] === last[0] && first[1] === last[1]) points.pop()
  }
  return points.length >= 3 ? points : null
}

function closeRing(ring: Pair[]): Pair[] {
  return [...ring, [ring[0][0], ring[0][1]]]
}

function polygonToRings(rings: number[][][]): Pair[][] | null {
  const result: Pair[][] = []
  for (const ring of rings) {
    const normalized = normalizeRing(ring)
    if (!normalized) return null
    result.push(closeRing(normalized))
  }
  return result.length > 0 ? result : null
}

/** GeoJSON 面 → polygon-clipping 的 MultiPolygon；非面返回 null */
export function geometryToMultiPolygon(geometry: GeoJsonGeometry): MultiPolygon | null {
  if (geometry.type === 'Polygon') {
    const polygon = polygonToRings(geometry.coordinates)
    return polygon ? [polygon] : null
  }
  if (geometry.type === 'MultiPolygon') {
    const polygons: Pair[][][] = []
    for (const rings of geometry.coordinates) {
      const polygon = polygonToRings(rings)
      if (polygon) polygons.push(polygon)
    }
    return polygons.length > 0 ? polygons : null
  }
  return null
}

/** polygon-clipping 结果 → GeoJSON MultiPolygon；空结果返回 null */
export function multiPolygonToGeometry(multi: MultiPolygon): GeoJsonGeometry | null {
  const polygons = multi.filter((polygon) => polygon.length > 0 && polygon[0].length >= 4)
  if (polygons.length === 0) return null
  return {
    type: 'MultiPolygon',
    coordinates: polygons.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [x, y])))
  }
}

/* ------------------------------------------------------------------ *
 * 面要素的球面面积
 * ------------------------------------------------------------------ */

function ringArea(ring: number[][]): number {
  const points = ring.map(([lng, lat]) => ({ lng, lat }))
  return Math.abs(signedAreaM2(points))
}

function geometryArea(geometry: GeoJsonGeometry | null): number {
  if (!geometry) return 0
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.reduce(
      (sum, ring, index) => sum + (index === 0 ? ringArea(ring) : -ringArea(ring)),
      0
    )
  }
  if (geometry.type === 'MultiPolygon') {
    let total = 0
    for (const polygon of geometry.coordinates) {
      polygon.forEach((ring, index) => {
        total += index === 0 ? ringArea(ring) : -ringArea(ring)
      })
    }
    return total
  }
  return 0
}

function emptyOutcome(inputCount = 0): OverlayOutcome {
  return {
    collection: { type: 'FeatureCollection', features: [] },
    inputCount,
    outputCount: 0,
    skipped: 0,
    areaM2: 0
  }
}

/* ------------------------------------------------------------------ *
 * 裁切 / 相交 / 擦除
 * ------------------------------------------------------------------ */

function collectMask(collection: VectorFeatureCollection): {
  mask: MultiPolygon
  skipped: number
} {
  const mask: MultiPolygon = []
  let skipped = 0
  for (const feature of collection.features) {
    if (!isPolygonal(feature.geometry)) {
      skipped++
      continue
    }
    const polygons = geometryToMultiPolygon(feature.geometry as GeoJsonGeometry)
    if (!polygons) {
      skipped++
      continue
    }
    mask.push(...polygons)
  }
  return { mask, skipped }
}

/**
 * 对 A、B 两个图层做面布尔运算。
 * op 为 'clip' / 'intersect' 时取交集，'difference' 时从 A 中减去 B。
 */
export function overlayCollections(
  input: VectorFeatureCollection,
  overlay: VectorFeatureCollection,
  op: Exclude<OverlayOperation, 'simplify'>
): OverlayOutcome {
  const { mask, skipped: maskSkipped } = collectMask(overlay)
  if (mask.length === 0) {
    return { ...emptyOutcome(input.features.length), skipped: maskSkipped }
  }

  const features: VectorFeature[] = []
  let skipped = maskSkipped
  let areaM2 = 0

  for (const feature of input.features) {
    if (!isPolygonal(feature.geometry)) {
      skipped++
      continue
    }
    const subject = geometryToMultiPolygon(feature.geometry as GeoJsonGeometry)
    if (!subject) {
      skipped++
      continue
    }

    let result: MultiPolygon
    try {
      result =
        op === 'difference'
          ? booleanOps.difference(subject, mask)
          : booleanOps.intersection(subject, mask)
    } catch {
      // 自相交等非法几何：polygon-clipping 会抛错，这里按「跳过」计数，
      // 让界面告诉用户有要素未参与运算，而不是整批失败
      skipped++
      continue
    }

    const geometry = multiPolygonToGeometry(result)
    if (!geometry) continue

    features.push({
      type: 'Feature',
      geometry,
      properties: { ...feature.properties }
    })
    areaM2 += geometryArea(geometry)
  }

  return {
    collection: { type: 'FeatureCollection', features },
    inputCount: input.features.length,
    outputCount: features.length,
    skipped,
    areaM2
  }
}

/* ------------------------------------------------------------------ *
 * 简化（Douglas–Peucker）
 * ------------------------------------------------------------------ */

/** 赤道上 1° 纬度的米数；经度方向再乘 cos(lat) 换算成等距平面 */
const METERS_PER_DEGREE = 111_319.49

function perpendicularDistance(point: Pair, start: Pair, end: Pair): number {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1])
  }
  const t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)
  const clamped = Math.max(0, Math.min(1, t))
  return Math.hypot(point[0] - (start[0] + clamped * dx), point[1] - (start[1] + clamped * dy))
}

function douglasPeucker(points: Pair[], tolerance: number): Pair[] {
  if (points.length <= 2) return points

  let maxDistance = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], points[0], points[points.length - 1])
    if (distance > maxDistance) {
      maxDistance = distance
      index = i
    }
  }

  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]]

  const left = douglasPeucker(points.slice(0, index + 1), tolerance)
  const right = douglasPeucker(points.slice(index), tolerance)
  return [...left.slice(0, -1), ...right]
}

/** 经纬度按平均纬度投影成等距平面，避免高纬度处容差被横向拉伸 */
function latitudeScale(geometry: GeoJsonGeometry): number {
  let sum = 0
  let count = 0
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (typeof value[0] === 'number' && typeof value[1] === 'number') {
        sum += value[1] as number
        count++
      } else {
        for (const item of value) visit(item)
      }
    }
  }
  visit((geometry as { coordinates?: unknown }).coordinates)
  if (count === 0) return Math.cos((0 * Math.PI) / 180)
  return Math.cos(((sum / count) * Math.PI) / 180) || 1
}

function simplifyLine(coords: number[][], tolerance: number, scale: number): number[][] {
  const points: Pair[] = coords
    .filter(
      (coord) =>
        Number.isFinite(Number(coord[0])) && Number.isFinite(Number(coord[1]))
    )
    .map((coord) => [Number(coord[0]) * scale, Number(coord[1])])

  const simplified = douglasPeucker(points, tolerance)
  return simplified.map(([x, y]) => [x / scale, y])
}

function simplifyRing(
  ring: number[][],
  tolerance: number,
  scale: number
): number[][] | null {
  const normalized = normalizeRing(ring)
  if (!normalized) return null

  const points: Pair[] = normalized.map(([lng, lat]) => [lng * scale, lat])
  const simplified = douglasPeucker([...points, points[0]], tolerance)
  // DP 处理闭合环时首尾是同一个点；去掉尾点后至少还要有 3 个顶点
  const open = simplified.slice(0, -1)
  if (open.length < 3) return null

  const result = open.map(([x, y]) => [x / scale, y])
  result.push([result[0][0], result[0][1]])
  return result
}

export function simplifyGeometry(
  geometry: GeoJsonGeometry,
  toleranceMeters: number
): GeoJsonGeometry | null {
  if (!(toleranceMeters > 0)) return geometry

  const tolerance = toleranceMeters / METERS_PER_DEGREE
  const scale = latitudeScale(geometry)

  switch (geometry.type) {
    case 'LineString': {
      const coords = simplifyLine(geometry.coordinates, tolerance, scale)
      return coords.length >= 2 ? { type: 'LineString', coordinates: coords } : null
    }
    case 'MultiLineString': {
      const lines = geometry.coordinates
        .map((line) => simplifyLine(line, tolerance, scale))
        .filter((line) => line.length >= 2)
      return lines.length > 0 ? { type: 'MultiLineString', coordinates: lines } : null
    }
    case 'Polygon': {
      const rings = geometry.coordinates
        .map((ring) => simplifyRing(ring, tolerance, scale))
        .filter((ring): ring is number[][] => ring !== null)
      if (rings.length === 0 || rings[0].length < 4) return null
      return { type: 'Polygon', coordinates: rings }
    }
    case 'MultiPolygon': {
      const polygons = geometry.coordinates
        .map((polygon) =>
          polygon
            .map((ring) => simplifyRing(ring, tolerance, scale))
            .filter((ring): ring is number[][] => ring !== null)
        )
        .filter((polygon) => polygon.length > 0 && polygon[0].length >= 4)
      return polygons.length > 0 ? { type: 'MultiPolygon', coordinates: polygons } : null
    }
    default:
      // 点要素没有可简化的顶点，原样返回
      return geometry
  }
}

/** 对 A 图层逐要素简化；属性与要素顺序保持不变 */
export function simplifyCollection(
  input: VectorFeatureCollection,
  toleranceMeters: number
): OverlayOutcome {
  const features: VectorFeature[] = []
  let skipped = 0
  let areaM2 = 0

  for (const feature of input.features) {
    if (!feature.geometry) {
      skipped++
      continue
    }
    const geometry = simplifyGeometry(feature.geometry, toleranceMeters)
    if (!geometry) {
      skipped++
      continue
    }
    features.push({ type: 'Feature', geometry, properties: { ...feature.properties } })
    areaM2 += geometryArea(geometry)
  }

  return {
    collection: { type: 'FeatureCollection', features },
    inputCount: input.features.length,
    outputCount: features.length,
    skipped,
    areaM2
  }
}