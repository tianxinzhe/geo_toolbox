/**
 * CRS 层的公共类型。
 *
 * 单独成文件是为了避免循环依赖：japan.ts / china.ts 只产数据，
 * shortlist.ts 组合数据，engine.ts 依赖以上全部 —— 类型放在这里，
 * 谁都可以 import，而不会出现 japan ↔ shortlist 的环。
 */

import type { Lang } from '../../config/i18n'

/**
 * 轴序。
 *
 * - `xy`：GIS 惯例，输入/输出为 (easting, northing) 或 (lng, lat)
 * - `yx`：日本平面直角坐标系，测量法规定 X = 北方向、Y = 東方向，
 *   因此第一分量是 northing、第二分量是 easting
 *
 * ⚠️ 这个字段是**数据的一部分**，不是调用方需要背下来的知识
 * （技术方案 4.3 的关键设计 ①）。UI 必须据此渲染
 * 「北方向 (X) / 東方向 (Y)」，不得只写 X / Y。
 */
export type AxisOrder = 'xy' | 'yx'

/** 坐标类别：地理坐标（度）或投影坐标（米） */
export type CrsKind = 'geographic' | 'projected'

/** 一个可用的坐标系定义 */
export interface CrsInfo {
  /** EPSG 代码。自定义参数时为 -1 */
  code: number
  /** 坐标系全称（英文官方名；内置条目另有本地化标签） */
  name: string
  /** proj4 定义串 */
  proj4: string
  kind: CrsKind
  axisOrder: AxisOrder
  /** datum 标识，用于判断基准变换是否可用（SR-03） */
  datum: string
}

/** 常用列表中的一个选项 */
export interface CrsOption {
  /** 稳定 id，进分享链接；如 `epsg:6669`、`auto:utm:WGS84` */
  id: string
  /** 具体 EPSG 代码；自动带号类为 null */
  code: number | null
  label: string
  /** 补充说明：日本区带的都道府县 / 中央经线 */
  detail?: string
}

/** 常用列表分组 */
export interface CrsGroup {
  id: string
  label: string
  options: CrsOption[]
}

/** 基准变换精度模型（PRD 6.4 / OQ-14） */
export type DatumShift = 'none' | '7param' | 'missing' | 'custom'

/** 转换器。forward / inverse 的输入输出都遵循各自 CRS 的轴序 */
export interface CrsTransform {
  from: CrsInfo
  to: CrsInfo
  forward(x: number, y: number): [number, number]
  inverse(x: number, y: number): [number, number]
  /** 目标 CRS 的轴序（技术方案 4.3 要求作为返回值的一部分） */
  axisOrder: AxisOrder
  datumShift: DatumShift
}

/** 创建转换器时的可选项 */
export interface TransformOptions {
  /**
   * 自定义七参数（Bursa-Wolf），形如
   * `dx,dy,dz,rx,ry,rz,scale`。给出时覆盖源 CRS 的 towgs84。
   * 用于「源与目标 datum 之间没有可用变换参数」的场景（PRD 6.4）。
   */
  customTowgs84?: string
  /** 自动带号解析所需的参考经纬度 */
  anchor?: { lng: number; lat: number }
}

/** 解析失败的原因，供 UI 映射成三段式文案（SR-06） */
export type CrsErrorCode =
  | 'not-found'
  | 'auto-source-unsupported'
  | 'auto-needs-location'
  | 'japan-utm-zone'
  | 'load-failed'

export class CrsError extends Error {
  readonly code: CrsErrorCode

  constructor(code: CrsErrorCode, message: string) {
    super(message)
    this.name = 'CrsError'
    this.code = code
  }
}

/** 三语言文本的小工具类型 */
export type Localized = Record<Lang, string>