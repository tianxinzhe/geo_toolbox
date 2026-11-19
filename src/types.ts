/**
 * 全站共享的领域类型（PRD 8.1 核心对象）
 *
 * 🔑 「跨工具传递时坐标系标识必须一并传递，**禁止裸传数值**」——
 * 这是避免偏移事故的产品级防线，落到类型上就是：
 * 需要带坐标系的场合一律用 `Coordinate`，而不是 `[number, number]`。
 */

/** 坐标系标识。EPSG 代码 */
export type CrsId = 'WGS84' | 'CGCS2000' | `EPSG:${number}` | (string & {})

/** 坐标来源（PRD 8.1）。GPS 来源需保留精度半径 */
export type CoordSource = 'manual' | 'map-pick' | 'gps' | 'file' | 'text' | 'url'

/** 置信度。中/低时接收方界面需保留该标记 */
export type Confidence = 'high' | 'mid' | 'low'

/** 经纬度对。顺序固定为 **[lng, lat]**（GeoJSON 约定） */
export type LngLat = readonly [lng: number, lat: number]

/** PRD 8.1 的「坐标 Coordinate」对象 */
export interface Coordinate {
  lng: number
  lat: number
  /** 高程（米），可选 */
  h?: number
  /** 坐标系标识，必填 —— 禁止裸传数值 */
  crs: CrsId
  /** 来源 */
  source: CoordSource
  /** 置信度 */
  confidence: Confidence
  /** GPS 来源时的精度半径（米） */
  accuracy?: number
}

/** 构造一个 WGS84 坐标（最常见的默认情形） */
export function wgs84(lng: number, lat: number, source: CoordSource = 'manual'): Coordinate {
  return { lng, lat, crs: 'WGS84', source, confidence: 'high' }
}

/**
 * PRD 8.1 的「要素集合 Feature Set」
 * T06 / T07 / T09 / T10 的读写单元。
 * 问题清单随集合一起传递，不因转换而丢失。
 */
export interface FeatureSet {
  /** GeoJSON FeatureCollection */
  features: GeoJSON.FeatureCollection
  crs: CrsId
  /** 来源文件名或来源工具 id */
  origin: string
  summary: {
    count: number
    /** 几何类型 → 数量 */
    geometryTypes: Record<string, number>
    /** 属性字段清单 */
    fields: string[]
  }
  /** 校验发现的异常。转换过程中不得丢弃 */
  issues: Array<{ level: 'warn' | 'error'; message: string; featureIndex?: number }>
}

/**
 * 最小 GeoJSON 类型声明。
 *
 * 不引入 @types/geojson 依赖：本项目只需要 FeatureCollection / Feature / Geometry
 * 三个层级，自己声明 20 行比多一个 devDependency 更可控，
 * 且能精确限定本站支持的几何类型子集。
 */
export namespace GeoJSON {
  export type Position = [number, number] | [number, number, number]

  export interface Geometry {
    type:
      | 'Point'
      | 'MultiPoint'
      | 'LineString'
      | 'MultiLineString'
      | 'Polygon'
      | 'MultiPolygon'
      | 'GeometryCollection'
    coordinates?: Position[] | Position[][] | Position[][][] | Position[][][][]
    geometries?: Geometry[]
  }

  export interface Feature {
    type: 'Feature'
    id?: string | number
    geometry: Geometry | null
    properties: Record<string, unknown> | null
  }

  export interface FeatureCollection {
    type: 'FeatureCollection'
    features: Feature[]
  }
}
