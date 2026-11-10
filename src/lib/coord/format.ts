/**
 * 数字格式化 —— **双出口**（技术方案 4.1，PRD SR-02 / SR-11）
 *
 * 🔑 SR-11 原文：「坐标值一律不加千分位分组……面积、距离等**量测值**才加千分位。
 * 两者必须在实现上显式区分，**不能共用一个格式化函数**。」
 *
 * 所以这里有两个出口，而不是一个带开关的函数：
 *
 *   fmt(v, lang, kind, digits)  界面显示用。kind='coord' 永不分组，
 *                               kind='measure' 按语言分组
 *   std(v, digits)              导出 / 复制 / URL 用。永远句点小数点、永不分组、
 *                               不带单位后缀、不随语言变化
 *
 * ⛔ 组件层禁止直接调用 Number.toFixed() 或字符串拼接数字。
 * 靠约定不行，靠 API 收口 —— 这是防止「复制出带逗号的坐标」这类事故的
 * 唯一可靠手段（ESLint no-restricted-syntax 拦截，见 M13）。
 */

import type { Lang } from '../../config/i18n'

/** 数值语义类别：坐标 or 量测值。SR-11 要求两者显式区分 */
export type Kind = 'coord' | 'measure'

/** SR-02 默认精度：经纬度小数点后 8 位（约毫米级） */
export const DEFAULT_COORD_DIGITS = 8
/** SR-02：距离 <1000m 显示 2 位小数 */
export const DEFAULT_DISTANCE_DIGITS = 2
/** SR-02：面积 2 位小数 */
export const DEFAULT_AREA_DIGITS = 2
/** SR-02：方位角 2 位小数（度） */
export const DEFAULT_BEARING_DIGITS = 2
/** SR-02：文件导出的坐标截断选项默认 7 位（约损失 1 厘米精度） */
export const EXPORT_COORD_DIGITS = 7

/** 精度可配置范围（SR-02：用户可在高级选项中调整为 0~12 位） */
export const MIN_DIGITS = 0
export const MAX_DIGITS = 12

/**
 * 四舍五入 —— **round half away from zero**（SR-02 明确要求）
 *
 * 不能用 `Number.toFixed()`：它遵循 IEEE 754 的二进制表示，
 * `(1.005).toFixed(2)` 得到 `"1.00"` 而不是 `"1.01"`，
 * 且负数的 half 情况是「向零舍入」而非「远离零舍入」。
 *
 * 这里用「先放大到整数域再判断」的方式规避，并处理浮点放大本身的误差：
 * 通过 toPrecision(15) 把 1.005 * 100 = 100.49999999999999 这类
 * 二进制表示误差拉回十进制真值。
 */
export function roundHalfAwayFromZero(v: number, digits: number): number {
  if (!Number.isFinite(v)) return v
  const d = clampDigits(digits)
  const sign = v < 0 ? -1 : 1
  const abs = Math.abs(v)
  const scale = 10 ** d

  // ⚠️ 用乘法而不是 `${abs}e${d}` 字符串拼接来放大：
  // 极小值的 String() 已经是科学计数法（1e-9），拼出来会得到
  // "1e-9e12" 这种非法字面量，Number() 解析成 NaN。
  const scaled = abs * scale
  // toPrecision(15) 消除二进制浮点的表示误差：
  // 1.005 * 100 = 100.49999999999999，拉回十进制真值得 100.5
  const corrected = Number(scaled.toPrecision(15))
  const rounded = Math.floor(corrected + 0.5)

  // 同样用除法而不是 `e-${d}` 拼接还原（整数过大时拼接也会失效）
  return (sign * rounded) / scale
}

/** 把精度限制在 SR-02 允许的 0~12 之间 */
export function clampDigits(digits: number): number {
  if (!Number.isInteger(digits)) return DEFAULT_COORD_DIGITS
  return Math.min(MAX_DIGITS, Math.max(MIN_DIGITS, digits))
}

/**
 * 标准数值形态（SR-11「标准数值形态」表）—— 导出、复制、URL 一律走这里。
 *
 * 特征：句点小数点、坐标不加千分位、无单位后缀、**不随语言变化**。
 * 三种目标语言的小数点符号都是句点，所以界面显示与导出格式恰好一致；
 * 但两者仍必须是不同的函数 —— 一旦将来加入德语等逗号小数点语言，
 * 只有 fmt() 需要改，std() 保持不变。
 *
 * 尾部零处理：`std(116.4, 8)` → `"116.4"` 而不是 `"116.40000000"`。
 * 理由是导出体积与可读性；需要固定位数时用 stdFixed()。
 */
export function std(v: number, digits: number = DEFAULT_COORD_DIGITS): string {
  if (!Number.isFinite(v)) return ''
  const r = roundHalfAwayFromZero(v, clampDigits(digits))
  // 用 toFixed 再剥掉尾部零：直接 String(r) 在极小值上会输出 1e-9 这类科学计数法
  const s = r.toFixed(clampDigits(digits))
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** 标准数值形态，**保留固定小数位**（CSV 列对齐、文件导出时用） */
export function stdFixed(v: number, digits: number = DEFAULT_COORD_DIGITS): string {
  if (!Number.isFinite(v)) return ''
  return roundHalfAwayFromZero(v, clampDigits(digits)).toFixed(clampDigits(digits))
}

/**
 * 界面显示用。
 *
 * - `kind='coord'`：**永不分组**。UTM 北坐标常达 `4412345.67` 这类七位数值，
 *   一旦被加上千分位就与 CSV 的字段分隔符混淆，复制出去直接不可用。
 * - `kind='measure'`：按语言加千分位。三种语言的千分位符号都是 `,`（SR-11 表），
 *   但仍走 Intl 而不是硬编码 —— 这样将来加语言时不需要改这里。
 *
 * 小数点符号：三种语言均为句点，因此用 `latn` 数字系统强制句点，
 * 避免某些 locale 下 Intl 输出本地化数字字形（如阿拉伯-印度数字）。
 */
export function fmt(
  v: number,
  lang: Lang,
  kind: Kind,
  digits: number = kind === 'coord' ? DEFAULT_COORD_DIGITS : DEFAULT_DISTANCE_DIGITS
): string {
  if (!Number.isFinite(v)) return '—'
  const d = clampDigits(digits)
  const r = roundHalfAwayFromZero(v, d)

  if (kind === 'coord') {
    // 坐标：不分组，句点小数点，剥掉尾部零
    return std(r, d)
  }

  // 量测值：分组 + 固定小数位
  return new Intl.NumberFormat(localeOf(lang), {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
    useGrouping: true,
    numberingSystem: 'latn'
  }).format(r)
}

/**
 * 量测值 + 单位（SR-11「数字与单位间距」）：
 * en 在数字与单位之间留一个**不换行**空格（`1 234.56 km`），
 * zh / ja 不留（`1234.56km`）。
 *
 * 空格用 U+00A0 不换行空格，防止在窄屏被拆到两行。
 */
export function fmtUnit(v: number, lang: Lang, kind: Kind, unit: string, digits?: number): string {
  const num = fmt(v, lang, kind, digits)
  return lang === 'en' ? `${num}\u00A0${unit}` : `${num}${unit}`
}

/** Lang → BCP 47 完整标签，与 config/i18n.ts 的 LOCALE 保持一致 */
function localeOf(lang: Lang): string {
  return lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja-JP' : 'en-US'
}

/**
 * 距离显示（SR-02）：<1000m 显示 2 位小数；≥1000m 显示 3 位小数并附千米值。
 *
 * 同时提供米与千米两个数值，避免用户自行换算出错 —— 这是 SR-02 的明确要求，
 * 不是可选的锦上添花。
 */
export interface DistanceDisplay {
  /** 主显示值，已按规则决定单位 */
  primary: { value: number; unit: 'm' | 'km'; digits: number }
  /** 另一个单位的等值，始终提供 */
  secondary: { value: number; unit: 'm' | 'km'; digits: number }
}

export function distanceParts(meters: number): DistanceDisplay {
  const km = meters / 1000
  return Math.abs(meters) < 1000
    ? {
        primary: { value: meters, unit: 'm', digits: 2 },
        secondary: { value: km, unit: 'km', digits: 5 }
      }
    : {
        primary: { value: km, unit: 'km', digits: 3 },
        secondary: { value: meters, unit: 'm', digits: 1 }
      }
}
