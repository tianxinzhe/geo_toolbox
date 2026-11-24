/**
 * 单位换算（PRD SR-04）
 *
 * 🔑 SR-04 的两条硬规则：
 *
 *   ① **所有换算以平方米 / 米为唯一中间基准，不做单位间直接换算** ——
 *      避免累积误差与规则分散。所以本文件只有「单位 → 基准」的一张表，
 *      没有 N×N 的换算矩阵。
 *
 *   ② **循环小数值（亩、丈）在计算中保留完整精度，仅在显示时截断** ——
 *      因此表里用**精确分数**（2000/3、10/3）而不是
 *      `666.6666666666666` 这类十进制近似。写成十进制字面量会引入
 *      约 1e-13 的相对误差，在 100 万平方米的量级上是 1e-7 ㎡，
 *      虽然肉眼不可见，但「保留完整精度」是 SR-04 的明文要求。
 *
 * SR-11：单位清单的**呈现**随语言变化（默认展示哪几个单位），
 * 但换算关系本身与语言无关。
 *
 * 不纳入的单位及理由（SR-04）：
 *   韩国「마지기 / 두락」—— 地区差异极大且无标准值
 *
 * 零依赖纯函数。
 */

import type { Lang } from '../../config/i18n'

/* ------------------------------------------------------------------ *
 * 长度
 * ------------------------------------------------------------------ */

export type LengthUnit = 'm' | 'km' | 'cm' | 'mi' | 'nmi' | 'yd' | 'ft' | 'ch' | 'li' | 'zhang'

/** 1 单位 = 多少**米**（唯一中间基准） */
export const LENGTH_TO_M: Record<LengthUnit, number> = {
  m: 1,
  km: 1000,
  cm: 0.01,
  mi: 1609.344, // 国际英里，精确定义
  nmi: 1852, // 国际海里，精确定义
  yd: 0.9144, // 国际码，精确定义
  ft: 0.3048, // 国际英尺，精确定义
  ch: 20.1168, // 链 = 22 码
  li: 500, // 市里
  zhang: 10 / 3 // 丈 ≈ 3.3333…，用分数保留完整精度
}

/* ------------------------------------------------------------------ *
 * 面积
 * ------------------------------------------------------------------ */

export type AreaUnit =
  | 'm2'
  | 'km2'
  | 'cm2'
  | 'ha'
  | 'are'
  | 'mu'
  | 'acre'
  | 'mi2'
  | 'yd2'
  | 'ft2'

/** 1 单位 = 多少**平方米**（唯一中间基准） */
export const AREA_TO_M2: Record<AreaUnit, number> = {
  m2: 1,
  km2: 1_000_000,
  cm2: 0.0001,
  ha: 10_000, // 公顷
  are: 100, // 公亩
  mu: 2000 / 3, // 市亩 ≈ 666.6666…，用分数保留完整精度
  acre: 4046.8564224, // 国际英亩，精确定义
  mi2: 2589988.110336, // 平方英里 = acre × 640
  yd2: 0.83612736, // 平方码 = 0.9144²
  ft2: 0.09290304 // 平方英尺 = 0.3048²
}

/* ------------------------------------------------------------------ *
 * 换算：一律经过基准，不做单位间直接换算
 * ------------------------------------------------------------------ */

/** 长度 → 米 */
export function lengthToBase(value: number, unit: LengthUnit): number {
  return value * LENGTH_TO_M[unit]
}

/** 米 → 长度 */
export function lengthFromBase(meters: number, unit: LengthUnit): number {
  return meters / LENGTH_TO_M[unit]
}

/** 面积 → 平方米 */
export function areaToBase(value: number, unit: AreaUnit): number {
  return value * AREA_TO_M2[unit]
}

/** 平方米 → 面积 */
export function areaFromBase(m2: number, unit: AreaUnit): number {
  return m2 / AREA_TO_M2[unit]
}

/**
 * 长度换算。**实现上强制两步走**（先转基准再转目标），
 * 不提供任何「直接乘一个系数」的捷径。
 */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  return lengthFromBase(lengthToBase(value, from), to)
}

/** 面积换算。同上 */
export function convertArea(value: number, from: AreaUnit, to: AreaUnit): number {
  return areaFromBase(areaToBase(value, from), to)
}

/** 一个值在所有长度单位下的等值，键顺序即展示顺序 */
export function allLengths(value: number, unit: LengthUnit): Record<LengthUnit, number> {
  const base = lengthToBase(value, unit)
  return Object.fromEntries(
    (Object.keys(LENGTH_TO_M) as LengthUnit[]).map((u) => [u, lengthFromBase(base, u)])
  ) as Record<LengthUnit, number>
}

/** 一个值在所有面积单位下的等值（面积换算的主输出） */
export function allAreas(value: number, unit: AreaUnit): Record<AreaUnit, number> {
  const base = areaToBase(value, unit)
  return Object.fromEntries(
    (Object.keys(AREA_TO_M2) as AreaUnit[]).map((u) => [u, areaFromBase(base, u)])
  ) as Record<AreaUnit, number>
}

/* ------------------------------------------------------------------ *
 * 呈现：默认展示的单位随语言变化（SR-11 / SR-04「单位清单的呈现随语言变化」）
 * ------------------------------------------------------------------ */

/**
 * 各语言**默认展示**的面积单位。
 *
 * SR-04 表格：
 *   zh → 平方米、**亩**、公顷、平方千米（亩是国内农业与国土场景的核心单位，置于前列）
 *   en → 平方米、公顷、**英亩**、平方英尺（兼顾公制与英制受众）
 *
 * 用户手动调整后以用户选择为准并记忆（存 localStorage）。
 */
export const DEFAULT_AREA_UNITS: Record<Lang, AreaUnit[]> = {
  zh: ['m2', 'mu', 'ha', 'km2'],
  en: ['m2', 'ha', 'acre', 'ft2']
}

/** 各语言默认展示的长度单位。SR-04 未列表，按与面积一致的原则推导 */
export const DEFAULT_LENGTH_UNITS: Record<Lang, LengthUnit[]> = {
  zh: ['m', 'km', 'li'],
  en: ['m', 'km', 'mi', 'ft']
}

/** 全部单位（含非常用），供「显示全部」开关使用 */
export const ALL_AREA_UNITS: readonly AreaUnit[] = Object.keys(AREA_TO_M2) as AreaUnit[]
export const ALL_LENGTH_UNITS: readonly LengthUnit[] = Object.keys(LENGTH_TO_M) as LengthUnit[]

/**
 * 适用于**地表距离**的长度单位子集（T04 距离方位、T10 等距圈用）。
 * 顺序即并列显示的顺序，从常用到少见。
 *
 * 刻意排除三个，理由与 SR-04 排除韩国「마지기」完全一致 ——
 * **给不出唯一值或没有使用场景的单位不纳入清单**：
 *
 *   cm     地理距离用厘米表示没有意义（两点相距 1.07e8 厘米），只会撑长结果串
 *   ch     链是英美土地测量单位，在 zh 语境下无人使用
 *   zhang  丈与中国市里一样属于市制，但日常地理距离用不到，留在「显示全部」里
 *
 * `li` 保留但**标签必须写明是中国市里**，与公制单位并列时避免误读。
 */
export const DISTANCE_UNITS = ['m', 'km', 'mi', 'nmi', 'yd', 'ft', 'li'] as const satisfies readonly LengthUnit[]
