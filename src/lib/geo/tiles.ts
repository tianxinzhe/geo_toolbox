/**
 * Web Mercator / Google XYZ 瓦片数学（T14）。
 *
 * 约定与 Google Maps、OpenStreetMap 的 XYZ 方案一致：
 *   - 原点在左上角，x 向东增大，y 向南增大；
 *   - z 级共有 2^z × 2^z 张瓦片；
 *   - 纬度在投影上只能表示到 ±85.05112878°，超出部分夹取到边界。
 *
 * 这些函数是纯函数，不依赖 DOM 与 Leaflet，方便单测与批量复用。
 */

import type { GeoJsonGeometry } from '../convert/wkt'

/** Web Mercator 能表示的纬度极限 */
export const MAX_MERCATOR_LAT = 85.05112878

/** 缩放级别允许范围 */
export const MIN_ZOOM = 0
export const MAX_ZOOM = 22

export interface BBox {
  /** 西边界经度，−180~180 */
  west: number
  /** 南边界纬度，−90~90 */
  south: number
  /** 东边界经度，−180~180。west > east 表示跨越 180° 经线 */
  east: number
  /** 北边界纬度，−90~90 */
  north: number
}

export interface Tile {
  x: number
  y: number
  z: number
}

export type TileErrorCode =
  | 'zoom-range'
  | 'zoom-order'
  | 'bbox-lng'
  | 'bbox-lat'
  | 'bbox-order'
  | 'tile-range'

export class TileError extends Error {
  readonly code: TileErrorCode

  constructor(code: TileErrorCode, message: string) {
    super(message)
    this.name = 'TileError'
    this.code = code
  }
}

/** 纬度夹取到 Web Mercator 可表示范围 */
export function clampLat(lat: number): number {
  return Math.min(MAX_MERCATOR_LAT, Math.max(-MAX_MERCATOR_LAT, lat))
}

function zoomTiles(z: number): number {
  return 2 ** z
}

function assertZoom(z: number): void {
  if (!Number.isInteger(z) || z < MIN_ZOOM || z > MAX_ZOOM) {
    throw new TileError('zoom-range', `zoom must be an integer in ${MIN_ZOOM}..${MAX_ZOOM}`)
  }
}

/** 经度 → 瓦片 x（按 180° 周期归一，避免 190° 被错误夹到最右列） */
export function lngToTileX(lng: number, z: number): number {
  assertZoom(z)
  const n = zoomTiles(z)
  // ±180 本身是合法边界，保持原值；只有超出范围才按 360° 周期回绕
  const normalized =
    lng >= -180 && lng <= 180 ? lng : ((((lng + 180) % 360) + 360) % 360) - 180
  const x = Math.floor(((normalized + 180) / 360) * n)
  return Math.min(n - 1, Math.max(0, x))
}

/** 纬度 → 瓦片 y（原点在上，向南增大） */
export function latToTileY(lat: number, z: number): number {
  assertZoom(z)
  const n = zoomTiles(z)
  const rad = (clampLat(lat) * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)
  return Math.min(n - 1, Math.max(0, y))
}

/** 经纬度 → 指定缩放级别的瓦片 */
export function tileOf(lng: number, lat: number, z: number): Tile {
  return { x: lngToTileX(lng, z), y: latToTileY(lat, z), z }
}

/** 瓦片 → 经纬度包围盒（北/西边界取自瓦片左上角） */
export function tileBounds(z: number, x: number, y: number): BBox {
  assertZoom(z)
  const n = zoomTiles(z)
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    throw new TileError('tile-range', `tile ${z}/${x}/${y} is outside the grid`)
  }
  const west = (x / n) * 360 - 180
  const east = ((x + 1) / n) * 360 - 180
  const latOf = (row: number): number =>
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI
  return { west, south: latOf(y + 1), east, north: latOf(y) }
}

/**
 * 由坐标点计算最小包围盒。
 *
 * 经度跨度超过 180° 时取跨 180° 经线的那一侧（更短的区间），
 * 结果用 west > east 表示跨线，避免把「东西各 170°」当成绕地球一圈。
 * 没有任何点时返回 null。
 */
export function bboxOfPoints(points: readonly (readonly [number, number])[]): BBox | null {
  if (points.length === 0) return null
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  let west = minLng
  let east = maxLng
  if (maxLng - minLng > 180) {
    // 把负经度整体搬到 0~360 区间，再与正数一起比较
    let shiftedMin = Infinity
    let shiftedMax = -Infinity
    for (const [lng] of points) {
      const shifted = lng < 0 ? lng + 360 : lng
      if (shifted < shiftedMin) shiftedMin = shifted
      if (shifted > shiftedMax) shiftedMax = shifted
    }
    if (shiftedMax - shiftedMin < maxLng - minLng) {
      west = shiftedMin > 180 ? shiftedMin - 360 : shiftedMin
      east = shiftedMax > 180 ? shiftedMax - 360 : shiftedMax
    }
  }

  return { west, south: minLat, east, north: maxLat }
}

interface ZoomPlan {
  z: number
  xs: number[]
  xStart: number
  xEnd: number
  yStart: number
  yEnd: number
}

/** 校验 bbox + 缩放范围，并按层计算 x/y 区间（不检查数量上限） */
function planRanges(
  bbox: BBox,
  zMin: number,
  zMax: number
): { plans: ZoomPlan[]; total: number } {
  assertZoom(zMin)
  assertZoom(zMax)
  if (zMin > zMax) {
    throw new TileError('zoom-order', 'minimum zoom must not be greater than maximum zoom')
  }
  const { west, south, east, north } = bbox
  if (![west, east].every((v) => Number.isFinite(v) && v >= -180 && v <= 180)) {
    throw new TileError('bbox-lng', 'longitude must be within -180..180')
  }
  if (![south, north].every((v) => Number.isFinite(v) && v >= -90 && v <= 90)) {
    throw new TileError('bbox-lat', 'latitude must be within -90..90')
  }
  if (south > north) {
    throw new TileError('bbox-order', 'south must not be greater than north')
  }

  // west > east 表示跨 180° 经线；把东边界搬到 0~360 再枚举
  const crossing = east < west
  const eastUnwrapped = crossing ? east + 360 : east

  const plans: ZoomPlan[] = []
  let total = 0

  for (let z = zMin; z <= zMax; z++) {
    const n = zoomTiles(z)
    if (z === 0) {
      // 0 级全球只有一张瓦片，避免跨线时出现重复列
      plans.push({ z, xs: [0], xStart: 0, xEnd: 0, yStart: 0, yEnd: 0 })
      total += 1
      continue
    }

    let xStart = Math.floor(((west + 180) / 360) * n)
    let xEnd = Math.floor(((eastUnwrapped + 180) / 360) * n)
    if (!crossing) {
      xStart = Math.min(n - 1, Math.max(0, xStart))
      xEnd = Math.min(n - 1, Math.max(0, xEnd))
    }

    const yStart = latToTileY(north, z)
    const yEnd = latToTileY(south, z)
    const width = Math.max(0, xEnd - xStart + 1)
    total += width * (yEnd - yStart + 1)
    plans.push({ z, xs: [], xStart, xEnd, yStart, yEnd })
  }

  // 只算区间与数量，x 列表在确认未超限后再展开
  return { plans, total }
}

/** 展开每一层的 x 列表（跨线时按 x 升序排列并去重） */
function expandXs(plans: ZoomPlan[]): void {
  for (const p of plans) {
    const n = zoomTiles(p.z)
    if (p.z === 0) continue
    const xs: number[] = []
    for (let i = p.xStart; i <= p.xEnd; i++) {
      xs.push(((i % n) + n) % n)
    }
    p.xs = [...new Set(xs)].sort((a, b) => a - b)
  }
}

/** 校验 bbox + 缩放范围，并按层计算 x/y 区间 */
function plan(bbox: BBox, zMin: number, zMax: number): { plans: ZoomPlan[]; total: number } {
  const result = planRanges(bbox, zMin, zMax)
  expandXs(result.plans)
  return result
}

/**
 * 统计 bbox 在 zMin~zMax 各层需要多少张瓦片。
 * 只做区间乘法，不展开也不构造瓦片数组，可以安全用于超大范围。
 */
export function countTilesForBbox(bbox: BBox, zMin: number, zMax: number): number {
  return planRanges(bbox, zMin, zMax).total
}

/**
 * 逐张产出 bbox 覆盖的瓦片，按 z、y、x 升序。
 * 调用方可以按批消费并让出主线程，从而显示进度。
 */
export function* iterateTilesForBbox(bbox: BBox, zMin: number, zMax: number): Generator<Tile> {
  const { plans } = plan(bbox, zMin, zMax)
  for (const p of plans) {
    for (let y = p.yStart; y <= p.yEnd; y++) {
      for (const x of p.xs) yield { x, y, z: p.z }
    }
  }
}

/** 枚举 bbox 覆盖的瓦片。输出按 z、y、x 升序排列。 */
export function tilesForBbox(bbox: BBox, zMin: number, zMax: number): Tile[] {
  return [...iterateTilesForBbox(bbox, zMin, zMax)]
}

/* ------------------------------------------------------------------ *
 * 导入边界过滤
 *
 * 导入数据时只按包围盒枚举会带进大量边界外的瓦片；
 * 这里对每个候选瓦片做一次几何相交判断，只保留与真实边界相交的瓦片。
 * ------------------------------------------------------------------ */

type Point = readonly [number, number]

function pointInRect(lng: number, lat: number, rect: BBox): boolean {
  return lng >= rect.west && lng <= rect.east && lat >= rect.south && lat <= rect.north
}

/** 射线法：点是否在单个环内（环可闭合也可不闭合） */
function pointInRing(lng: number, lat: number, ring: readonly number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Liang–Barsky：线段是否与矩形相交（含完全包含在矩形内的情形） */
function segmentIntersectsRect(a: Point, b: Point, rect: BBox): boolean {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let t0 = 0
  let t1 = 1
  const p = [-dx, dx, -dy, dy]
  const q = [a[0] - rect.west, rect.east - a[0], a[1] - rect.south, rect.north - a[1]]

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false
      continue
    }
    const t = q[i] / p[i]
    if (p[i] < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return true
}

function lineIntersectsRect(line: readonly number[][], rect: BBox): boolean {
  if (line.length === 0) return false
  if (line.length === 1) return pointInRect(line[0][0], line[0][1], rect)
  for (let i = 1; i < line.length; i++) {
    const a: Point = [line[i - 1][0], line[i - 1][1]]
    const b: Point = [line[i][0], line[i][1]]
    if (segmentIntersectsRect(a, b, rect)) return true
  }
  return false
}

/** 环是否与矩形相交：顶点落在矩形内，或任一条边与矩形相交 */
function ringIntersectsRect(ring: readonly number[][], rect: BBox): boolean {
  for (const [lng, lat] of ring) {
    if (pointInRect(lng, lat, rect)) return true
  }
  for (let i = 1; i < ring.length; i++) {
    const a: Point = [ring[i - 1][0], ring[i - 1][1]]
    const b: Point = [ring[i][0], ring[i][1]]
    if (segmentIntersectsRect(a, b, rect)) return true
  }
  return false
}

/** 多边形（含洞）是否与矩形相交 */
function polygonIntersectsRect(rings: readonly number[][][], rect: BBox): boolean {
  if (rings.length === 0) return false
  const outer = rings[0]
  const centerLng = (rect.west + rect.east) / 2
  const centerLat = (rect.south + rect.north) / 2

  // 边界相交，或矩形完全落在多边形内部
  if (!ringIntersectsRect(outer, rect) && !pointInRing(centerLng, centerLat, outer)) {
    return false
  }

  // 完全落在洞里（且没有碰到洞的边界）的瓦片不算在多边形内
  for (let i = 1; i < rings.length; i++) {
    const hole = rings[i]
    if (!ringIntersectsRect(hole, rect) && pointInRing(centerLng, centerLat, hole)) {
      return false
    }
  }
  return true
}

function geometryIntersectsRect(geometry: GeoJsonGeometry, rect: BBox): boolean {
  switch (geometry.type) {
    case 'Point':
      return pointInRect(geometry.coordinates[0], geometry.coordinates[1], rect)
    case 'MultiPoint':
      return geometry.coordinates.some(([lng, lat]) => pointInRect(lng, lat, rect))
    case 'LineString':
      return lineIntersectsRect(geometry.coordinates, rect)
    case 'MultiLineString':
      return geometry.coordinates.some((line) => lineIntersectsRect(line, rect))
    case 'Polygon':
      return polygonIntersectsRect(geometry.coordinates, rect)
    case 'MultiPolygon':
      return geometry.coordinates.some((polygon) => polygonIntersectsRect(polygon, rect))
    case 'GeometryCollection':
      return geometry.geometries.some((child) => geometryIntersectsRect(child, rect))
  }
}

function collectGeometryPoints(geometry: GeoJsonGeometry, out: [number, number][]): void {
  switch (geometry.type) {
    case 'Point':
      out.push([geometry.coordinates[0], geometry.coordinates[1]])
      break
    case 'MultiPoint':
    case 'LineString':
      for (const p of geometry.coordinates) out.push([p[0], p[1]])
      break
    case 'Polygon':
    case 'MultiLineString':
      for (const line of geometry.coordinates) {
        for (const p of line) out.push([p[0], p[1]])
      }
      break
    case 'MultiPolygon':
      for (const polygon of geometry.coordinates) {
        for (const ring of polygon) {
          for (const p of ring) out.push([p[0], p[1]])
        }
      }
      break
    case 'GeometryCollection':
      for (const child of geometry.geometries) collectGeometryPoints(child, out)
      break
  }
}

function isPointOnly(geometry: GeoJsonGeometry): boolean {
  if (geometry.type === 'Point' || geometry.type === 'MultiPoint') return true
  if (geometry.type === 'GeometryCollection') return geometry.geometries.every(isPointOnly)
  return false
}

/**
 * 逐张产出与导入几何相交的瓦片。
 *
 * 点数据直接按坐标取瓦片并去重；线/面先按包围盒生成候选，
 * 再用相交判断剔除边界外的瓦片。结果按 z、y、x 升序。
 */
export function* iterateTilesForGeometries(
  geometries: readonly GeoJsonGeometry[],
  zMin: number,
  zMax: number
): Generator<Tile> {
  const points: [number, number][] = []
  for (const geometry of geometries) collectGeometryPoints(geometry, points)
  if (points.length === 0) return

  const bbox = bboxOfPoints(points)
  if (!bbox) return

  // 纯点数据：不做包围盒枚举，避免稀疏点集被整片矩形放大
  if (geometries.every(isPointOnly)) {
    const out: Tile[] = []
    for (let z = zMin; z <= zMax; z++) {
      const n = zoomTiles(z)
      const seen = new Set<number>()
      for (const [lng, lat] of points) {
        const x = lngToTileX(lng, z)
        const y = latToTileY(lat, z)
        const key = x * n + y
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ x, y, z })
      }
    }
    out.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
    yield* out
    return
  }

  const { plans } = planRanges(bbox, zMin, zMax)
  expandXs(plans)

  for (const p of plans) {
    for (let y = p.yStart; y <= p.yEnd; y++) {
      for (const x of p.xs) {
        const rect = tileBounds(p.z, x, y)
        if (geometries.some((geometry) => geometryIntersectsRect(geometry, rect))) {
          yield { x, y, z: p.z }
        }
      }
    }
  }
}

/** 枚举与导入几何相交的瓦片。结果按 z、y、x 升序。 */
export function tilesForGeometries(
  geometries: readonly GeoJsonGeometry[],
  zMin: number,
  zMax: number
): Tile[] {
  return [...iterateTilesForGeometries(geometries, zMin, zMax)]
}