/**
 * 度分秒 ↔ 十进制度（T02，PRD 6.1 规格表）
 *
 * 处理规则：
 *   - 自动识别输入属于哪种格式（十进制度 / 度分 / 度分秒）
 *   - **符号约定**：西经与南纬为负值；带 W/S 符号时输入值取绝对值后再置负
 *   - 秒值 ≥60 或分值 ≥60 时执行**进位归一化**，并在结果中提示「输入已归一化」
 *   - 度分秒输出提供两种写法：符号式（`39°54'31.7"`）与文本式（`39度54分31.7秒`，按语言本地化）
 *
 * 专属异常：
 *   - **格式歧义**（如 `39.54` 可能是十进制度也可能是度分）→ 按十进制度处理，
 *     同时给出另一种解读的结果让用户自行确认。**不擅自选择、不静默改写**
 *   - 只有经度没有纬度（或反之）→ 允许单向转换，缺失项由 UI 显示「未提供」
 *
 * 黄金值（PRD 6.1 算例一）：
 *   116.3974 → `116°23'50.64"E`    39.9088 → `39°54'31.68"N`
 *
 * 零依赖纯函数。
 */

import type { Lang } from '../../config/i18n'
import { std } from './format'

/** 输入被识别成哪种格式 */
export type DmsFormat = 'decimal' | 'dm' | 'dms'

/** 度分秒三元组。degrees 带符号，minutes / seconds 恒为非负 */
export interface Dms {
  degrees: number
  minutes: number
  seconds: number
  /** 半球符号。赤道与本初子午线上为 undefined（0 没有方向） */
  hemisphere?: 'N' | 'S' | 'E' | 'W'
}

/** 度分（无秒） */
export interface Dm {
  degrees: number
  minutes: number
  hemisphere?: 'N' | 'S' | 'E' | 'W'
}

/** 轴：决定半球符号用 N/S 还是 E/W */
export type Axis = 'lng' | 'lat'

/**
 * 归一化标记。
 *
 * PRD T02 要求「秒值 ≥60 或分值 ≥60 时执行进位归一化，**并在结果中提示**」——
 * 所以归一化不能悄悄发生，必须把事实带回给 UI。
 */
export type Normalized = 'none' | 'seconds' | 'minutes'

export interface DmsParseOk {
  ok: true
  format: DmsFormat
  /** 十进制度（带符号）。这是所有后续换算的基准 */
  decimal: number
  dms: Dms
  dm: Dm
  /**
   * **输入里实际出现的**半球符号；没写就是 undefined。
   *
   * ⚠️ 不要用 `dms.hemisphere` 代替它：那个字段是 decimalToDms 按符号
   * **合成**出来的（正纬度必然得到 'N'），拿去做轴序判定会让
   * `39.9088 116.3974` 被误判成「带明确半球符号、纬度在前」，
   * 从而把 SR-01 的「两个都 ≤90 才是歧义」这条规则整个绕过。
   */
  detectedHemisphere?: 'N' | 'S' | 'E' | 'W'
  /** 是否发生过进位归一化 */
  normalized: Normalized
  /**
   * 歧义的另一种解读（PRD T02 专属异常）。
   * `39.54` 默认按十进制度解释，这里给出「按度分解释」的结果供用户确认。
   * 无歧义时为 undefined。
   */
  alternative?: { interpretation: DmsFormat; decimal: number }
}

export interface DmsParseErr {
  ok: false
  reason: 'empty' | 'unparsable' | 'range'
  /** 出错的原始片段，用于 SR-06 的「指出具体位置」 */
  value: string
  /** 超范围时的合法区间 */
  limit?: { min: number; max: number }
}

export type DmsParseResult = DmsParseOk | DmsParseErr

/** parseDmsInput 的可选行为开关 */
export interface DmsParseOptions {
  /**
   * 是否要求半球符号与 axis 匹配。
   *
   * T02 的独立输入框应当为 true（纬度框里写 `E116` 是错误，要报出来）；
   * parseCoord 处理「经度 纬度」合并输入时为 false ——
   * 那时轴序本身还没判定，任何符号都要先收下。
   * 默认 true。
   */
  strictAxis?: boolean
  /**
   * 是否做范围校验。
   *
   * parseCoord 需要先解析出数值、判定轴序，**然后**才知道该用 ±180 还是 ±90，
   * 所以它传 false 自己做校验。默认 true。
   */
  validateRange?: boolean
}

/* ------------------------------------------------------------------ *
 * 十进制度 → 度分秒
 * ------------------------------------------------------------------ */

/**
 * 消除 −0。
 *
 * `-1 * 0` 得到 `-0`，它与 `0` 用 `===` 相等但 `Object.is` 不等，
 * 而且会污染下游：`Object.is(degrees, -0)` 的判断、`std(-0)` 的输出、
 * 单测的 `toBe(0)` 都会出问题。凡是「符号 × 度数」的地方都要过这一道。
 */
function signed(sign: number, magnitude: number): number {
  const v = sign * magnitude
  return v === 0 ? 0 : v
}

/**
 * 十进制度 → 度分秒。
 *
 * 符号只留在 degrees 上，minutes / seconds 恒为非负 ——
 * 否则 `-0°30'` 会被写成 `0°-30'`，这是常见的实现错误。
 */
export function decimalToDms(decimal: number, axis: Axis): Dms {
  const sign = decimal < 0 ? -1 : 1
  const abs = Math.abs(decimal)

  let degrees = Math.floor(abs)
  let rest = (abs - degrees) * 60
  let minutes = Math.floor(rest)
  // 秒的浮点误差可能让它等于 60.0（如 59.999999999 被 toFixed 后显示成 60.0），
  // 此时必须进位，否则会输出 `39°54'60.0"` 这种非法写法
  let seconds = (rest - minutes) * 60

  if (seconds >= 59.9999999995) {
    seconds = 0
    minutes += 1
  }
  if (minutes >= 60) {
    minutes = 0
    degrees += 1
  }

  return {
    degrees: signed(sign, degrees),
    minutes,
    seconds,
    hemisphere: hemisphereOf(sign, degrees, axis)
  }
}

/** 十进制度 → 度分（秒并入分的小数部分） */
export function decimalToDm(decimal: number, axis: Axis): Dm {
  const sign = decimal < 0 ? -1 : 1
  const abs = Math.abs(decimal)
  let degrees = Math.floor(abs)
  let minutes = (abs - degrees) * 60

  if (minutes >= 59.9999999995) {
    minutes = 0
    degrees += 1
  }

  return {
    degrees: signed(sign, degrees),
    minutes,
    hemisphere: hemisphereOf(sign, degrees, axis)
  }
}

/**
 * 半球符号。
 *
 * 0 度没有方向（赤道 / 本初子午线），此时返回 undefined，
 * 让 UI 不渲染多余的 `N` 或 `E`。
 */
function hemisphereOf(sign: number, degrees: number, axis: Axis): Dms['hemisphere'] {
  if (degrees === 0 && sign === 1) return undefined
  if (axis === 'lat') return sign < 0 ? 'S' : 'N'
  return sign < 0 ? 'W' : 'E'
}

/* ------------------------------------------------------------------ *
 * 度分秒 → 十进制度
 * ------------------------------------------------------------------ */

/**
 * 判定符号。
 *
 * 优先级：**半球符号 > degrees 的符号（含 −0）**。
 *
 * 半球符号优先是必需的，否则「小于 1 度的西经 / 南纬」会丢符号：
 * `0°7'39.36"W` 的 degrees 是 0，只看 degrees 会得到 +0.1276 而不是 −0.1276。
 * 这类坐标真实存在且不少 —— 格林尼治天文台（−0.0014）、
 * 基多、以及本初子午线以西 1 度内的所有点。
 *
 * 没有半球符号时才退回看 degrees，此时 −0 是有意义的（`-0°30'` = 西经 0.5 度），
 * 所以必须用 Object.is 判断，`-0 < 0` 是 false。
 */
function signOf(degrees: number, hemisphere: 'N' | 'S' | 'E' | 'W' | undefined): 1 | -1 {
  if (hemisphere === 'S' || hemisphere === 'W') return -1
  if (hemisphere === 'N' || hemisphere === 'E') return 1
  return degrees < 0 || Object.is(degrees, -0) ? -1 : 1
}

/**
 * 度分秒 → 十进制度。
 *
 * 分 / 秒先做进位归一化再换算，因此 `39°54'90"` 与 `39°55'30"` 得到同一个值。
 * 返回 normalized 标记，让 UI 能如实提示「输入已归一化」。
 */
export function dmsToDecimal(dms: Dms): { decimal: number; normalized: Normalized } {
  let { minutes, seconds } = dms
  let normalized: Normalized = 'none'

  if (seconds >= 60) {
    minutes += Math.floor(seconds / 60)
    seconds = seconds % 60
    normalized = 'seconds'
  }

  let degrees = dms.degrees
  if (minutes >= 60) {
    // 归一化后的分可能再次溢出到度
    degrees = signed(signOf(degrees, dms.hemisphere), Math.abs(degrees) + Math.floor(minutes / 60))
    minutes = minutes % 60
    normalized = normalized === 'none' ? 'minutes' : normalized
  }

  const magnitude = Math.abs(degrees) + minutes / 60 + seconds / 3600
  return { decimal: signed(signOf(degrees, dms.hemisphere), magnitude), normalized }
}

/** 度分 → 十进制度 */
export function dmToDecimal(dm: Dm): { decimal: number; normalized: Normalized } {
  let { degrees, minutes } = dm
  let normalized: Normalized = 'none'

  if (minutes >= 60) {
    degrees = signed(signOf(degrees, dm.hemisphere), Math.abs(degrees) + Math.floor(minutes / 60))
    minutes = minutes % 60
    normalized = 'minutes'
  }

  const magnitude = Math.abs(degrees) + minutes / 60
  return { decimal: signed(signOf(degrees, dm.hemisphere), magnitude), normalized }
}

/* ------------------------------------------------------------------ *
 * 输出格式
 * ------------------------------------------------------------------ */

/**
 * 符号式度分秒：`39°54'31.68"N`
 *
 * @param secDigits 秒的小数位。PRD 6.1 表格用 2 位（`50.64`），
 *                  默认给 3 位以覆盖 SR-02 的显示精度需求。
 */
export function formatDmsSymbolic(dms: Dms, secDigits = 3): string {
  const deg = Math.abs(dms.degrees)
  const sign = dms.degrees < 0 || Object.is(dms.degrees, -0) ? '-' : ''
  const sec = dms.seconds.toFixed(secDigits)
  // 秒四舍五入后可能变成 60.000，此时要显示成 0 并让分进位。
  // 这里只做显示层的兜底，不改动传入的对象。
  if (parseFloat(sec) >= 60) {
    const m = dms.minutes + 1
    return `${sign}${deg}°${m >= 60 ? 0 : m}'0.000"${dms.hemisphere ?? ''}`
  }
  return `${sign}${deg}°${dms.minutes}'${sec}"${dms.hemisphere ?? ''}`
}

/**
 * 文本式度分秒，按语言本地化（PRD T02：`39度54分31.7秒`）。
 *
 * 三种语言的写法：
 *   zh → `39度54分31.68秒`（西经/南纬前缀「西经」「南纬」）
 *   ja → `39度54分31.68秒`（同 zh，但方向词用「西経」「南緯」）
 *   en → `39° 54' 31.68" W`（英文习惯仍用符号，但加空格与方向词）
 */
export function formatDmsTextual(dms: Dms, lang: Lang, secDigits = 2): string {
  const deg = Math.abs(dms.degrees)
  const negative = dms.degrees < 0 || Object.is(dms.degrees, -0)
  const sec = dms.seconds.toFixed(secDigits)
  const isLat = dms.hemisphere === 'N' || dms.hemisphere === 'S' || dms.hemisphere === undefined

  if (lang === 'en') {
    return `${deg}° ${dms.minutes}' ${sec}" ${dms.hemisphere ?? ''}`.trim()
  }

  const dirWord = directionWord(dms.hemisphere, negative, isLat, lang)
  return `${dirWord}${deg}度${dms.minutes}分${sec}秒`
}

/** 方向词。zh / ja 用文字，且必须用对应语言的字形（SR-11：日文汉字字形不同） */
function directionWord(
  hemisphere: Dms['hemisphere'],
  negative: boolean,
  isLat: boolean,
  lang: Lang
): string {
  const south = hemisphere === 'S' || (hemisphere === undefined && negative && isLat)
  const west = hemisphere === 'W' || (hemisphere === undefined && negative && !isLat)

  if (lang === 'ja') {
    // ⚠️ 日文用「経」「緯」的日文字形，不能用中文的「经」「纬」
    if (south) return '南緯'
    if (west) return '西経'
    return isLat ? '北緯' : '東経'
  }
  if (south) return '南纬'
  if (west) return '西经'
  return isLat ? '北纬' : '东经'
}

/** 度分的符号式输出：`39°54.528'N` */
export function formatDmSymbolic(dm: Dm, minDigits = 4): string {
  const sign = dm.degrees < 0 || Object.is(dm.degrees, -0) ? '-' : ''
  return `${sign}${Math.abs(dm.degrees)}°${dm.minutes.toFixed(minDigits)}'${dm.hemisphere ?? ''}`
}

/* ------------------------------------------------------------------ *
 * 输入识别与解析
 * ------------------------------------------------------------------ */

/**
 * 可接受的度分秒分隔符（SR-01 表）：
 *   `° ' "`、`d m s`、中文「度分秒」、日文「度分秒」（字形相同）
 * 以及冒号式 `116:23:50.6`（常见于 GPS 设备导出）
 */
const DMS_SEPARATORS = /[°º^'"’‘″′:：dmsDMS度分秒]/

/**
 * 解析单个轴的坐标输入。
 *
 * 识别顺序严格按 SR-01：先看有没有显式的度分秒分隔符或半球符号
 * （规则 ①「显式格式优先」），再退化到十进制度（规则 ②）。
 *
 * @param axis 'lng' 用 ±180 校验，'lat' 用 ±90
 * @param opts strictAxis / validateRange 见 DmsParseOptions
 */
export function parseDmsInput(
  raw: string,
  axis: Axis,
  opts: DmsParseOptions = {}
): DmsParseResult {
  const { strictAxis = true, validateRange = true } = opts
  const value = raw.trim()
  if (value === '') return { ok: false, reason: 'empty', value: raw }

  const limit = axis === 'lng' ? { min: -180, max: 180 } : { min: -90, max: 90 }

  // 提取半球符号与整体正负号
  const { body, hemisphere, signFromSymbol } = extractHemisphere(value, axis, strictAxis)
  const negativeFromSign = /^\s*-/.test(body)
  const cleaned = body.replace(/^[+\-\s]+/, '').trim()

  if (cleaned === '') return { ok: false, reason: 'unparsable', value: raw }

  const hasExplicit = DMS_SEPARATORS.test(cleaned)
  const parts = hasExplicit
    ? cleaned
        .split(DMS_SEPARATORS)
        .map((s) => s.trim())
        .filter((s) => s !== '')
    : cleaned.split(/[\s,]+/).filter((s) => s !== '')

  // 逐段转数值。任何一段不是合法数字就整体判为不可解析
  const nums: number[] = []
  for (const p of parts) {
    const n = Number(p)
    if (!Number.isFinite(n)) return { ok: false, reason: 'unparsable', value: raw }
    nums.push(n)
  }
  if (nums.length === 0) return { ok: false, reason: 'unparsable', value: raw }

  // 符号优先级：显式半球符号 > 前置负号（SR-01：带 W/S 符号时取绝对值后再置负）
  const sign = hemisphere ? signFromSymbol : negativeFromSign ? -1 : 1

  let format: DmsFormat
  let decimal: number
  let normalized: Normalized = 'none'
  let alternative: DmsParseOk['alternative']

  if (nums.length >= 3) {
    format = 'dms'
    const r = dmsToDecimal({
      degrees: signed(sign, nums[0]),
      minutes: nums[1],
      seconds: nums[2],
      hemisphere
    })
    decimal = r.decimal
    normalized = r.normalized
  } else if (nums.length === 2) {
    format = 'dm'
    const r = dmToDecimal({ degrees: signed(sign, nums[0]), minutes: nums[1], hemisphere })
    decimal = r.decimal
    normalized = r.normalized
  } else {
    // 单个数值：默认按十进制度解释（SR-01 规则 ②）
    format = 'decimal'
    decimal = signed(sign, nums[0])

    // 歧义检测（PRD T02 专属异常）：`39.54` 也可能是「39 度 54 分」。
    // 只有当「按度分解释」也落在合法范围内时才提示 —— 否则提示反而制造困惑。
    const n0 = nums[0]
    if (!hasExplicit && n0 % 1 !== 0) {
      const intPart = Math.trunc(Math.abs(n0))
      const fracDigits = String(Math.abs(n0)).split('.')[1] ?? ''
      // 小数部分必须看起来像「分」（两位以内、且 <60）才构成歧义
      const asMinutes = Number(fracDigits)
      if (fracDigits.length <= 2 && asMinutes < 60) {
        const alt = signed(sign, intPart + asMinutes / 60)
        if (Math.abs(alt) <= limit.max) {
          alternative = { interpretation: 'dm', decimal: alt }
        }
      }
    }
  }

  // validateRange=false 时跳过：调用方（parseCoord）要先判定轴序，
  // 才知道该用 ±180 还是 ±90，所以由它自己做校验。
  if (validateRange && (!Number.isFinite(decimal) || decimal < limit.min || decimal > limit.max)) {
    return { ok: false, reason: 'range', value: raw, limit }
  }
  if (!Number.isFinite(decimal)) {
    return { ok: false, reason: 'unparsable', value: raw }
  }

  return {
    ok: true,
    format,
    decimal,
    dms: decimalToDms(decimal, axis),
    dm: decimalToDm(decimal, axis),
    // 输入里实际写了的符号，与 decimalToDms 合成的 dms.hemisphere 区分开
    detectedHemisphere: hemisphere,
    normalized,
    alternative
  }
}

/**
 * 抽出半球符号。
 *
 * 接受前置（`N39.9088`）、后置（`39.9088N`）与中日文方向词（`北纬39.9088`）。
 * SR-01：「带明确半球符号时按符号确定，忽略书写顺序」。
 *
 * @param strictAxis true（默认）时，与 axis 不匹配的符号（如纬度位置上写了 `E`）
 *   不被当作半球符号，留给后续数字解析判为不可解析 —— 比默默忽略更安全。
 *   false 时接受全部四个字母，用于 parseCoord 处理「经度 纬度」合并输入：
 *   那时轴序还没判定，必须先无条件收下符号，才能拿它去判定轴序。
 */
function extractHemisphere(
  value: string,
  axis: Axis,
  strictAxis: boolean
): { body: string; hemisphere?: 'N' | 'S' | 'E' | 'W'; signFromSymbol: 1 | -1 } {
  const expected = axis === 'lat' ? ['N', 'S'] : ['E', 'W']

  // 中文 / 日文方向词
  const words: Record<string, 'N' | 'S' | 'E' | 'W'> = {
    北纬: 'N', 南纬: 'S', 东经: 'E', 西经: 'W',
    北緯: 'N', 南緯: 'S', 東経: 'E', 西経: 'W'
  }
  for (const [word, h] of Object.entries(words)) {
    if (value.includes(word)) {
      // 方向词本身就带轴信息（纬 → N/S，经 → E/W），strictAxis 下也要校验
      if (strictAxis && !expected.includes(h)) break
      return {
        body: value.replace(word, ''),
        hemisphere: h,
        signFromSymbol: h === 'S' || h === 'W' ? -1 : 1
      }
    }
  }

  // 拉丁单字母，前置或后置
  const m = /^\s*([nsewNSEW])\s*(.+)$/.exec(value) ?? /^\s*(.+?)\s*([nsewNSEW])\s*$/.exec(value)
  if (m) {
    const letter = (m[1].length === 1 ? m[1] : m[2]).toUpperCase() as 'N' | 'S' | 'E' | 'W'
    const body = m[1].length === 1 ? m[2] : m[1]
    if (!strictAxis || expected.includes(letter)) {
      return { body, hemisphere: letter, signFromSymbol: letter === 'S' || letter === 'W' ? -1 : 1 }
    }
  }

  return { body: value, signFromSymbol: 1 }
}

/** 十进制度的标准回显（SR-01 规则 ④：强制回显确认，用标准格式） */
export function formatDecimal(decimal: number, digits = 8): string {
  return std(decimal, digits)
}
