/**
 * T01 坐标系转换 —— WGS84 ↔ CGCS2000
 *
 * 处理规则：
 *   - 本期只保留 WGS84 与 CGCS2000 两个坐标系
 *   - 二者在实用精度内等价（差异在厘米级以下），转换只做数值校验与回显，
 *     并在结果中标注「按等值处理」，不产生任何人为偏移
 *   - 额外计算「偏移距离」（源与目标之间的地表距离），等值时恒为 0
 *
 * 专属异常（PRD T01 表）：
 *   - 坐标超出合法范围 → 明确指出超限的具体数值与合法范围
 *   - 源与目标相同 → 直接回显原值并提示「无需转换」，**不报错**
 *
 * 零依赖纯函数，可在 vitest 中直接测。
 */

/** T01 支持的两个坐标系 */
export type T01Crs = 'WGS84' | 'CGCS2000'

/** T01 界面上可选的坐标系（CGCS2000 按 WGS84 等值处理） */
export const T01_CRS_LIST: readonly T01Crs[] = ['WGS84', 'CGCS2000']

/** 经纬度对，[lng, lat] */
export type LngLat = [number, number]

/** SR-01：合法范围。超范围一律拒绝，不取模、不截断 */
export const LNG_RANGE = { min: -180, max: 180 } as const
export const LAT_RANGE = { min: -90, max: 90 } as const

export type ConvertIssue =
  /** 输入超出合法范围 */
  | { kind: 'range'; field: 'lng' | 'lat'; value: number; min: number; max: number }
  /** 输入不是有限数值 */
  | { kind: 'notFinite'; field: 'lng' | 'lat'; value: number }

export interface ConvertOk {
  ok: true
  /** 源坐标系 */
  from: T01Crs
  /** 目标坐标系 */
  to: T01Crs
  /** 输入坐标 */
  input: LngLat
  /** 转换结果 */
  output: LngLat
  /** 偏移距离（米）。两者等值，恒为 0 */
  offsetMeters: number
  /** 源与目标相同 */
  identity: boolean
  /** CGCS2000 参与了本次转换 —— 界面需标注「实用精度内等价」 */
  cgcs2000Assumed: boolean
}

export interface ConvertErr {
  ok: false
  issues: ConvertIssue[]
}

export type ConvertResult = ConvertOk | ConvertErr

/**
 * 校验坐标是否在合法范围内。
 *
 * SR-01：「超范围一律拒绝，不使用取模或截断『修正』——
 * 静默修正会让用户在错误数据上继续工作。」
 */
export function validateLngLat(lng: number, lat: number): ConvertIssue[] {
  const issues: ConvertIssue[] = []
  if (!Number.isFinite(lng)) issues.push({ kind: 'notFinite', field: 'lng', value: lng })
  else if (lng < LNG_RANGE.min || lng > LNG_RANGE.max) {
    issues.push({ kind: 'range', field: 'lng', value: lng, min: LNG_RANGE.min, max: LNG_RANGE.max })
  }
  if (!Number.isFinite(lat)) issues.push({ kind: 'notFinite', field: 'lat', value: lat })
  else if (lat < LAT_RANGE.min || lat > LAT_RANGE.max) {
    issues.push({ kind: 'range', field: 'lat', value: lat, min: LAT_RANGE.min, max: LAT_RANGE.max })
  }
  return issues
}

/**
 * WGS84 ↔ CGCS2000 转换。
 *
 * 二者在实用精度内等价（SR-03），因此输出数值与输入完全一致；
 * 本函数只负责范围校验与等值标注，不做任何偏移。
 */
export function convertCoord(lng: number, lat: number, from: T01Crs, to: T01Crs): ConvertResult {
  const issues = validateLngLat(lng, lat)
  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    from,
    to,
    input: [lng, lat],
    output: [lng, lat],
    offsetMeters: 0,
    identity: from === to,
    cgcs2000Assumed: from === 'CGCS2000' || to === 'CGCS2000'
  }
}

/**
 * 一次输出全部目标坐标系（PRD T01：「目标坐标系可多选，一次输出全部」）。
 *
 * 返回顺序与 T01_CRS_LIST 一致，包含源自身，便于用户对照。
 */
export function convertToAll(lng: number, lat: number, from: T01Crs): ConvertResult[] {
  return T01_CRS_LIST.map((to) => convertCoord(lng, lat, from, to))
}