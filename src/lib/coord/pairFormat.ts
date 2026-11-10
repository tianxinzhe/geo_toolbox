/**
 * 经纬度对解析与格式输出（T02 单点与批量共用）
 *
 * T02 的输入是一个「经度, 纬度」合并文本框，输出格式由用户显式选择。
 * 单点组件与批量配置必须共用同一套规则，否则同一串坐标在两处会得到
 * 不同结论 —— 这正是 SR-01「不静默改写」要避免的。
 *
 * 职责：
 *   ① 解析：复用 parseCoord（全角归一化、逗号含义、半球符号、度分秒）
 *   ② 原格式校验：显式选择原格式时，确认两段原文确实属于该格式
 *   ③ 目标格式输出：十进制度 / 度分 / 度分秒（符号式 / 文本式）
 *
 * 零依赖纯函数。
 */

import type { Lang } from '../../config/i18n'
import {
  decimalToDm,
  decimalToDms,
  formatDecimal,
  formatDmSymbolic,
  formatDmsSymbolic,
  formatDmsTextual,
  parseDmsInput,
  type Axis,
  type DmsFormat,
  type DmsParseOk
} from './dms'
import {
  DEFAULT_CTX,
  normalizeFullWidth,
  parseCoord,
  resolveCommaMeaning,
  splitAxes,
  type ParseCtx,
  type ParseError,
  type Parsed
} from './parse'

/** 原格式：'auto' 为自动识别 */
export type SourceFormat = 'auto' | DmsFormat

/** 目标格式。度分秒分符号式与文本式两种写法（PRD T02） */
export type TargetFormat = 'decimal' | 'dm' | 'dms-symbolic' | 'dms-textual'

/** 坐标对之间的分隔符：全站统一「经度, 纬度」 */
export const PAIR_SEPARATOR = ', '

export interface PairParseOptions {
  source?: SourceFormat
  commaAs?: ParseCtx['commaAs']
}

/** 原文与所选原格式不符。属于「用户选择错了格式」，不是坐标本身非法 */
export interface PairFormatError {
  ok: false
  kind: 'format'
  value: string
  expected: DmsFormat
  actual: { lng?: DmsFormat; lat?: DmsFormat }
}

export type PairParseResult =
  | {
      ok: true
      parsed: Parsed
      lng: number
      lat: number
      lngFormat: DmsFormat
      latFormat: DmsFormat
      /** 两段的完整解析结果，供 UI 取归一化与歧义信息 */
      lngParsed: DmsParseOk
      latParsed: DmsParseOk
    }
  | { ok: false; kind: 'parse'; error: ParseError }
  | PairFormatError

/**
 * 解析「经度, 纬度」合并输入。
 *
 * 轴序、范围、逗号含义都交给 parseCoord；本函数只补两件事：
 *   - 记录两段原文各自被识别成哪种格式
 *   - 用户显式选了原格式时校验是否一致
 */
export function parseCoordinatePair(
  raw: string,
  options: PairParseOptions = {}
): PairParseResult {
  const source = options.source ?? 'auto'
  const ctx = { ...DEFAULT_CTX, commaAs: options.commaAs ?? 'auto' }

  const parsed = parseCoord(raw, ctx)
  if (!parsed.ok) return { ok: false, kind: 'parse', error: parsed }

  // 重新按原文切段，拿到每条轴「原文实际是什么格式」。
  // parseCoord 内部也做了同样的切分与解析，只是没有把 format 暴露出来。
  const normalized = normalizeFullWidth(raw).text
  const segments = splitAxes(normalized, resolveCommaMeaning(normalized, ctx))
  const segments_ = segments.slice(0, 2).map((seg) =>
    parseDmsInput(seg, 'lng', { strictAxis: false, validateRange: false })
  )

  let lngParsed: DmsParseOk
  let latParsed: DmsParseOk

  if (segments_.length === 2 && segments_[0].ok && segments_[1].ok) {
    const first = segments_[0]
    const second = segments_[1]
    lngParsed = parsed.order === 'lngFirst' ? first : second
    latParsed = parsed.order === 'lngFirst' ? second : first
  } else {
    // 兜底：parseCoord 已经成功，这里理论上不会走到；
    // 用解析出的十进制度重建，保证返回结构完整。
    lngParsed = fallbackParsed(parsed.lng, 'lng')
    latParsed = fallbackParsed(parsed.lat, 'lat')
  }

  const lngFormat = lngParsed.format
  const latFormat = latParsed.format

  if (source !== 'auto' && (lngFormat !== source || latFormat !== source)) {
    return {
      ok: false,
      kind: 'format',
      value: raw.trim(),
      expected: source,
      actual: { lng: lngFormat, lat: latFormat }
    }
  }

  return {
    ok: true,
    parsed,
    lng: parsed.lng,
    lat: parsed.lat,
    lngFormat,
    latFormat,
    lngParsed,
    latParsed
  }
}

function fallbackParsed(value: number, axis: Axis): DmsParseOk {
  const r = parseDmsInput(formatDecimal(value, 12), axis)
  if (r.ok) return r
  // formatDecimal 的输出一定是合法十进制，这里只是为了满足类型
  return parseDmsInput(String(value), axis) as DmsParseOk
}

/**
 * 单轴按目标格式输出。
 *
 * 精度统一作用于小数部分：十进制度是度的小数位，度分是分的小数位，
 * 度分秒是秒的小数位 —— 与 T02 原有行为一致（PRD T02 precisionNote）。
 */
export function formatAxisValue(
  value: number,
  axis: Axis,
  target: TargetFormat,
  digits = 8,
  lang: Lang = 'en'
): string {
  if (target === 'decimal') return formatDecimal(value, digits)

  if (target === 'dm') {
    return formatDmSymbolic(decimalToDm(value, axis), digits)
  }

  const dms = decimalToDms(value, axis)
  if (target === 'dms-textual') {
    // 0 度时 hemisphere 为 undefined，按轴补方向词，避免经度被写成「北纬0度」
    const hemisphere = dms.hemisphere ?? (axis === 'lat' ? 'N' : 'E')
    return formatDmsTextual({ ...dms, hemisphere }, lang, digits)
  }

  return formatDmsSymbolic(dms, digits)
}

/** 经纬度对按目标格式输出：`经度, 纬度` */
export function formatPairValue(
  lng: number,
  lat: number,
  target: TargetFormat,
  digits = 8,
  lang: Lang = 'en'
): string {
  return `${formatAxisValue(lng, 'lng', target, digits, lang)}${PAIR_SEPARATOR}${formatAxisValue(
    lat,
    'lat',
    target,
    digits,
    lang
  )}`
}