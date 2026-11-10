/**
 * T06 矢量格式转换的公共类型。
 *
 * 与 T07 的 `GeoJsonGeometry` 共用几何定义，避免两套坐标结构。
 * 这里只放数据形状，不放任何 DOM / 解析库引用 —— 纯函数层必须能单测。
 */

import type { GeoJsonGeometry } from './wkt'

export type VectorFormat =
  | 'geojson'
  | 'kml'
  | 'kmz'
  | 'gpx'
  | 'csv'
  | 'tsv'
  | 'xlsx'
  | 'topojson'
  | 'wkt'
  | 'gml'
  | 'dxf'
  | 'gmt'
  | 'mif'
  | 'shapefile'
  | 'fgb'
  | 'gpkg'

export const FORMAT_LABEL: Record<VectorFormat, string> = {
  geojson: 'GeoJSON',
  kml: 'KML',
  kmz: 'KMZ',
  gpx: 'GPX',
  csv: 'CSV',
  tsv: 'TSV',
  xlsx: 'Excel (XLSX)',
  topojson: 'TopoJSON',
  wkt: 'WKT',
  gml: 'GML',
  dxf: 'DXF',
  gmt: 'GMT',
  mif: 'MIF/MID',
  shapefile: 'Shapefile',
  fgb: 'FlatGeobuf',
  gpkg: 'GeoPackage'
}

/** 可输出格式 */
export const OUTPUT_FORMATS: readonly VectorFormat[] = [
  'geojson',
  'kml',
  'kmz',
  'gpx',
  'csv',
  'xlsx',
  'topojson',
  'wkt',
  'gml',
  'dxf',
  'gmt',
  'mif',
  'shapefile',
  'fgb',
  'gpkg'
]

export interface VectorFeature {
  type: 'Feature'
  geometry: GeoJsonGeometry | null
  properties: Record<string, unknown>
}

export interface VectorFeatureCollection {
  type: 'FeatureCollection'
  features: VectorFeature[]
}

export type IssueCode =
  | 'empty-geometry'
  | 'out-of-range'
  | 'unclosed-ring'
  | 'invalid-geometry'
  | 'csv-row-skipped'

export interface FeatureIssue {
  /** 0 基要素序号；CSV 行号也用它 */
  feature: number
  code: IssueCode
  detail?: string
}

export interface ParseOutcome {
  format: VectorFormat
  collection: VectorFeatureCollection
  issues: FeatureIssue[]
  /** 解析过程中值得提示但不阻断的事实（如 M 丢弃、编码回退） */
  warnings: string[]
  /** 输入是否自带坐标系声明（目前仅 Shapefile 的 .prj 会置为 true） */
  crsDeclared?: boolean
}

export interface SerializeOptions {
  target: VectorFormat
  /** 缩进美化；false = 压缩单行 */
  indent: boolean
  /** 坐标小数位，0~12 */
  digits: number
  /** 移除空属性（'' / null / undefined） */
  removeEmpty: boolean
  /** GPX 属性降级策略：保留 name+desc（其余合并进 desc）或仅保留 name */
  gpxAttrs: 'name-desc' | 'name'
  /** 目标格式不支持某几何时是否跳过；false 时抛 UnsupportedGeometryError */
  skipUnsupported: boolean
}

export interface SerializeOutcome {
  text: string
  /** 二进制输出（目前仅 Shapefile ZIP）；存在时优先于 text 下载 */
  bytes?: Uint8Array
  mime: string
  extension: string
  /** GPX 等格式无法承载的几何统计 */
  unsupported: { count: number; types: string[] }
  warnings: string[]
}

export class UnsupportedGeometryError extends Error {
  readonly count: number
  readonly types: string[]

  constructor(count: number, types: string[]) {
    super('unsupported geometry')
    this.name = 'UnsupportedGeometryError'
    this.count = count
    this.types = types
  }
}

export class CsvColumnsError extends Error {
  readonly headers: string[]

  constructor(headers: string[]) {
    super('csv columns could not be detected')
    this.name = 'CsvColumnsError'
    this.headers = headers
  }
}

export interface CsvColumnInfo {
  headers: string[]
  latColumn?: string
  lngColumn?: string
}

export interface CsvParseOptions {
  /** 手动指定列；缺省时自动识别 */
  latColumn?: string
  lngColumn?: string
  delimiter?: string
}