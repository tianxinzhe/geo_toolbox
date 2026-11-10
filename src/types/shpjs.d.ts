/**
 * shpjs 6 没有自带类型声明，这里只声明本项目用到的入口。
 * 返回值是 GeoJSON FeatureCollection；ZIP 内多个 .shp 时返回数组。
 */
declare module 'shpjs' {
  export interface ShpFeature {
    type: 'Feature'
    geometry: unknown
    properties: Record<string, unknown> | null
  }

  export interface ShpFeatureCollection {
    type: 'FeatureCollection'
    features: ShpFeature[]
    fileName?: string
  }

  export function getShapefile(
    input: ArrayBuffer | Uint8Array
  ): Promise<ShpFeatureCollection | ShpFeatureCollection[]>
}