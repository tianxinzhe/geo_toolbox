/**
 * 坐标输入解析器（SR-01）—— 所有接受坐标输入的工具共用
 *
 * 目标：**宽容接受、明确反馈**。尽量理解用户的各种写法，
 * 但必须让用户知道系统是怎么理解的（规则 ④ 强制回显）。
 *
 * 🔑 核心原则：**不静默改写用户输入。**
 * 宁可提示疑似歧义让用户确认，也不猜测后直接算 ——
 * 静默修正比报错更危险，因为用户会拿着错误的坐标继续工作。
 *
 * 实现顺序严格按 SR-01：
 *   全角归一化 → 显式符号 → 逗号计数 → 千分位模式 →
 *   疑似逗号小数点启发式 → 范围校验 → 回显串生成
 *
 * 返回类型是**判别联合**而不是抛异常：SR-06 要求「单个输入项的错误
 * 不阻断页面上其他可独立完成的操作」，异常会让调用方到处 try/catch。
 *
 * 零依赖纯函数。
 */

import { looksLikeGeoHash } from './geohash'
import { parseDmsInput, formatDecimal, type Axis } from './dms'

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

export interface ParseCtx {
  /**
   * 逗号含义（SR-01 规则 ⑤ 手动覆盖）。
   *   'auto'      按规则 ②③ 自动判定
   *   'decimal'   强制当作小数点（德语/俄语来源的数据）
   *   'separator' 强制当作分隔符（默认解释）
   */
  commaAs: 'auto' | 'decimal' | 'separator'
  /**
   * 是否先做全角归一化。
   * SR-01：日文输入法可能产出全角数字与全角标点，
   * 必须在识别格式**之前**归一化，否则会静默解析失败。
   * ja 页面必开；zh / en 也建议开（用户可能从任何来源粘贴）。
   */
  fullWidth: boolean
  /** 默认轴序。SR-01：两个数值都 ≤90 时的歧义默认按「经度在前」（GeoJSON 约定） */
  defaultOrder?: 'lngFirst' | 'latFirst'
}

export type ParseWarning =
  /** 规则 ③：检测到疑似逗号小数点，已按分隔符解析 */
  | { kind: 'commaAmbiguous'; token: string; asDecimal: number }
  /** 两个数值都 ≤90，轴序是假定的 */
  | { kind: 'orderAssumed'; assumed: 'lngFirst' | 'latFirst' }
  /** 输入含全角字符，已归一化（SR-01 要求在回显区如实显示） */
  | { kind: 'fullWidthNormalized'; original: string }
  /** 疑似 GeoHash，本工具不解析，应引导前往 T08（SR-01 表） */
  | { kind: 'looksLikeGeoHash'; token: string }
  /** 输入被进位归一化过（如 `39°54'90"`） */
  | { kind: 'dmsNormalized'; token: string }
  /** 检测到千分位分组并已忽略（如 `1,234.5` 在单值场景） */
  | { kind: 'thousandSeparatorIgnored'; token: string }

export interface Parsed {
  ok: true
  lng: number
  lat: number
  /** 判定出的轴序。带明确半球符号时以符号为准，忽略书写顺序 */
  order: 'lngFirst' | 'latFirst'
  /**
   * 置信度（PRD 8.1 坐标对象字段）。
   *   high — 带半球符号，或有一个数值绝对值 >90（轴序无歧义）
   *   mid  — 轴序靠默认约定假定
   *   low  — 存在逗号歧义等多重不确定
   */
  confidence: 'high' | 'mid' | 'low'
  /** SR-01 规则 ③：是否检测到疑似逗号小数点 */
  ambiguous: boolean
  /** 规则 ④：标准格式回显串，使任何误判对用户可见 */
  normalized: string
  warnings: ParseWarning[]
}

export interface ParseError {
  ok: false
  kind: 'range' | 'unparsable' | 'empty' | 'singleValue' | 'geohash'
  /** 出错的字段或原始片段 */
  field: string
  /** 出错的原始值 */
  value: string
  /** SR-06 三段式中的「正确写法示例」 */
  hint: string
  /** 超范围时的合法区间 */
  limit?: { min: number; max: number }
  /** 疑似 GeoHash 时给出该 token，UI 用于生成「前往 T08」入口 */
  token?: string
  /**
   * 解析失败前已经发现的问题（如逗号歧义）。
   *
   * 失败路径也要带上它，因为 SR-01 规则 ③ 的典型样本 `116,3974`
   * 在「逗号=分隔符」解释下**必然**会因为 3974 超范围而失败 ——
   * 若错误信息里不带歧义提示，用户只会看到「纬度超范围」，
   * 完全想不到真正的原因是小数点写成了逗号。
   */
  warnings?: ParseWarning[]
}

export type ParseResult = Parsed | ParseError

/** 默认解析上下文 */
export const DEFAULT_CTX: ParseCtx = { commaAs: 'auto', fullWidth: true, defaultOrder: 'lngFirst' }

/* ------------------------------------------------------------------ *
 * 步骤 1：全角归一化
 * ------------------------------------------------------------------ */

/**
 * 全角 → 半角（SR-01：必须在识别格式**之前**做）。
 *
 * 覆盖三类：全角数字与拉丁字母（U+FF10~FF5E → U+0010~U+007E，偏移 0xFEE0）、
 * 全角标点（逗号、句点、冒号、引号等在上述区间内）、全角空格（U+3000 → U+0020）。
 *
 * 另外把常见的「看起来像但不是」的字符也归一化：
 *   U+2212 减号、U+2012~U+2015 各种破折号 → ASCII '-'
 *   U+00B7 中点、U+2022 项目符号 → 不当作小数点（保留，交由后续判为不可解析）
 */
export function normalizeFullWidth(input: string): { text: string; changed: boolean } {
  let changed = false
  let out = ''

  for (const ch of input) {
    const cp = ch.codePointAt(0)!
    let mapped = ch

    if (cp >= 0xff01 && cp <= 0xff5e) {
      // 全角 ASCII 变体 → 半角
      mapped = String.fromCodePoint(cp - 0xfee0)
    } else if (cp === 0x3000) {
      // 全角空格
      mapped = ' '
    } else if (cp === 0x2212 || (cp >= 0x2012 && cp <= 0x2015)) {
      // 各种减号 / 破折号 → ASCII 连字符
      mapped = '-'
    } else if (cp === 0x00ba || cp === 0x00b0) {
      // 序数指示符 º 与度符号 ° 统一为 °
      mapped = '°'
    } else if (cp === 0x2018 || cp === 0x2019) {
      mapped = "'" // 弯单引号 → 直单引号（分）
    } else if (cp === 0x201c || cp === 0x201d) {
      mapped = '"' // 弯双引号 → 直双引号（秒）
    } else if (cp === 0x2032) {
      mapped = "'" // 素数符号 ′ → 分
    } else if (cp === 0x2033) {
      mapped = '"' // 双素数符号 ″ → 秒
    }

    if (mapped !== ch) changed = true
    out += mapped
  }

  return { text: out, changed }
}

/* ------------------------------------------------------------------ *
 * 步骤 2~3：切分与逗号判定
 * ------------------------------------------------------------------ */

/** 显式度分秒标记：出现即适用 SR-01 规则 ①「逗号一律视为分隔符」 */
const EXPLICIT_DMS_RE = /[°º'"’′″]|[:：]|\d\s*[dmsDMS]\s*\d|度|分|秒/

/** 半球符号（含中日文方向词） */
const HEMISPHERE_TOKEN_RE = /[nsewNSEW]|北纬|南纬|东经|西经|北緯|南緯|東経|西経/

/**
 * 规则 ③ 的启发式：「数字 + 逗号 + 4~8 位数字」且后面不再跟数字或逗号。
 *
 * 典型例子 `116,3974`：按小数点解释是 116.3974（合法经度），
 * 按分隔符解释是两个数 116 和 3974（3974 超范围）。
 *
 * 4~8 位这个数字区间不是随便定的：经纬度的小数部分通常写 4~7 位
 * （SR-02 默认 8 位，文件导出默认截断到 7 位），
 * 而千分位分组恰好是 3 位 —— 两者不重叠，因此不会误判。
 *
 * ⚠️ 检测到歧义时**不自动改写**，仍按规则 ② 的分隔符解释继续，
 * 同时把另一种解读放进 warnings 让用户自行确认。
 */
const COMMA_DECIMAL_RE = /-?\d{1,3},\d{4,8}(?![\d,])/g

/**
 * 千分位分组模式：`1,234.5` / `1,234,567.89`
 *
 * ⚠️ 末尾的 `(?!\d)` 是必需的。少了它，`116,3974` 会被匹配成
 * 「116,397」+ 落单的「4」—— 而 `116,3974` 恰恰是 SR-01 规则 ③
 * 要检测的「疑似逗号小数点」典型样本，被千分位规则吃掉就再也检测不到了。
 * 加上否定预查后，分组必须正好 3 位且后面不再跟数字，才算千分位。
 */
const THOUSANDS_RE = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d)/g

/**
 * 决定逗号的含义（SR-01 规则 ①②③⑤ 的合成）。
 *
 * 优先级：
 *   ⑤ 手动覆盖 > ① 显式格式 > ② 默认解释
 * ③ 只负责「标记歧义」，不改变判定结果 —— 因为 SR-01 的核心原则是
 * **不静默改写用户输入**：检测到疑似逗号小数点时仍按分隔符解析，
 * 同时把另一种解读放进 warnings 让用户确认。
 *
 * 实际上 ①② 的结论相同（都是分隔符），保留这个函数是为了把
 * 「规则 ⑤ 覆盖一切」这件事显式化，也为了将来若重新纳入德语 / 俄语
 * 版本时，规则 ② 需要改成「按页面语言判定」有一个明确的落点。
 */
export function resolveCommaMeaning(input: string, ctx: ParseCtx): 'decimal' | 'separator' {
  // 规则 ⑤：手动覆盖优先
  if (ctx.commaAs === 'decimal') return 'decimal'
  if (ctx.commaAs === 'separator') return 'separator'

  // 规则 ①：带 ° ' " 或 N/S/E/W 时，逗号一律视为分隔符
  if (EXPLICIT_DMS_RE.test(input) || HEMISPHERE_TOKEN_RE.test(input)) return 'separator'

  // 规则 ②：默认逗号是分隔符（zh / en / ja 用户的习惯均符合此解释）
  return 'separator'
}

/**
 * 把输入切成「每个坐标轴一段」。
 *
 * 两级切分，顺序很重要：
 *
 *   ① **有顶层逗号 / 分号时，先按它切**。这是 SR-01 规则 ②（逗号=分隔符）
 *      的直接落地。切完每段内部可能还有空格分隔的度/分/秒
 *      （如 `116 23.844, 39 54.528`），留给 parseAxisSegment 处理。
 *
 *   ② **没有顶层逗号时，按空白切**，再按 token 数量推断结构：
 *        2 个 → 十进制度「经度 纬度」（最常见的写法）
 *        4 个 → 两组「度 分」
 *        6 个 → 两组「度 分 秒」
 *      这三种之外的数量交给调用方判为不可解析。
 *
 * 千分位分组在切分前先被替换成占位符保护起来，
 * 否则 `1,234.5 39.9` 会被切成 1 / 234.5 / 39.9 三段。
 *
 * @returns 每个坐标轴对应的一段原文（可能内含空格）
 */
export function splitAxes(input: string, commaAs: 'decimal' | 'separator'): string[] {
  // 剥掉数组 / JSON 片段的括号。
  // ⚠️ 只在输入确实像 JSON（以 [ 或 { 开头）时才剥双引号 ——
  // 双引号同时是度分秒的「秒」标记（`116°23'50.64"`），无条件剥掉会毁掉 DMS。
  const looksLikeJson = /^\s*[[{]/.test(input)
  let s = looksLikeJson ? input.replace(/[[\]{}"]/g, ' ') : input.replace(/[[\]{}]/g, ' ')
  s = s.trim()

  // 保护千分位分组
  const saved: string[] = []
  s = s.replace(THOUSANDS_RE, (m) => {
    saved.push(m.replace(/,/g, ''))
    return `\u0000${saved.length - 1}\u0000`
  })

  const unprotect = (t: string) => t.replace(/\u0000(\d+)\u0000/g, (_, i) => saved[Number(i)])

  if (commaAs === 'decimal') {
    // 逗号是小数点 → 只有空白与分号能作轴分隔符
    return s
      .split(/[\s;]+/)
      .filter((t) => t !== '')
      .map(unprotect)
  }

  // ① 有顶层逗号 / 分号：先按它切
  if (/[;,]/.test(s)) {
    return s
      .split(/[;,]+/)
      .map((t) => t.trim())
      .filter((t) => t !== '')
      .map(unprotect)
  }

  // ② 没有顶层逗号：按空白切，再按数量重组
  const toks = s.split(/\s+/).filter((t) => t !== '').map(unprotect)
  if (toks.length === 4 || toks.length === 6) {
    const per = toks.length / 2
    return [toks.slice(0, per).join(' '), toks.slice(per).join(' ')]
  }
  return toks
}

/** 旧名字保留为别名：单测与调用方按语义使用 */
export const tokenize = splitAxes

/* ------------------------------------------------------------------ *
 * 步骤 4~6：单值解析、轴序判定、范围校验
 * ------------------------------------------------------------------ */

/** 千分位的**非全局**版本，用于 `.test()`（带 g 的正则 test 是有状态的，会漏判） */
const THOUSANDS_RE_ONCE = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/

/**
 * 解析「一个坐标轴」那一段原文为一个数值。
 *
 * 与 parseDmsInput 的分工：
 *   - strictAxis=false —— 轴序此时还没判定，任何半球符号都要先收下，
 *     由 resolveOrder 拿它去判定轴序
 *   - validateRange=false —— 同理，还不知道该用 ±180 还是 ±90，
 *     由 parseCoord 在轴序判定后统一校验
 *
 * @returns undefined 表示这一段根本读不出数值（不是「超范围」）
 */
function parseAxisSegment(
  segment: string,
  commaAs: 'decimal' | 'separator',
  warnings: ParseWarning[]
): { value: number; hemisphere: 'N' | 'S' | 'E' | 'W' | undefined } | undefined {
  let token = segment.trim()

  // commaAs='decimal'：把逗号当小数点。先剥掉首尾多余的逗号
  // （如 `116,3974,` 是「逗号分隔的两段」切完后留下的尾逗号）
  if (commaAs === 'decimal') {
    token = token.replace(/^,+|,+$/g, '').replace(/,/g, '.')
  } else if (THOUSANDS_RE_ONCE.test(token)) {
    // 千分位在单值场景下应当被忽略（`1,234.5` 是 1234.5，不是两个数）
    warnings.push({ kind: 'thousandSeparatorIgnored', token })
    token = token.replace(/,/g, '')
  }

  if (token === '') return undefined

  // 轴传 'lng'（较宽的 ±180），因为此处还不知道这一段是哪个轴；
  // validateRange=false 使它其实不做范围判断，传哪个都一样。
  const r = parseDmsInput(token, 'lng', { strictAxis: false, validateRange: false })
  if (!r.ok) return undefined

  if (r.normalized !== 'none') warnings.push({ kind: 'dmsNormalized', token })

  return { value: r.decimal, hemisphere: r.detectedHemisphere }
}

/** SR-01 合法范围。含端点 */
const LIMITS: Record<Axis, { min: number; max: number }> = {
  lng: { min: -180, max: 180 },
  lat: { min: -90, max: 90 }
}

function rangeHint(axis: Axis): string {
  return axis === 'lng'
    ? '经度合法范围是 −180 到 +180。请检查是否把经度和纬度填反了。'
    : '纬度合法范围是 −90 到 +90。请检查是否把经度和纬度填反了。'
}

export type OrderResolution =
  | { ok: true; order: 'lngFirst' | 'latFirst'; confidence: 'high' | 'mid'; byHemisphere: boolean }
  | {
      ok: false
      /** 哪个字段越界。用于 SR-06「指出具体数值与合法范围」 */
      field: 'lng' | 'lat'
      value: number
      limit: { min: number; max: number }
    }

/**
 * 轴序判定（SR-01「经纬度顺序」表）。
 *
 * | 情形 | 判定 |
 * |---|---|
 * | 带明确半球符号 | 按符号确定，忽略书写顺序 |
 * | 第一个绝对值 >90 且第二个 ≤90 | 经度在前，置信度高 |
 * | 第二个绝对值 >90 且第一个 ≤90 | 纬度在前，置信度高 |
 * | 两个都 ≤90 | **歧义**，默认经度在前（GeoJSON 约定），标注假定 + 提供一键交换 |
 * | 两个都 >90 | 非法，报错并说明合法范围 |
 *
 * 实现方式：**可行性判定**而不是「谁 >90」的直接比较。
 * 分别检查「经度在前」与「纬度在前」两种解释能否同时满足各自的合法范围
 * （经度 ±180、纬度 ±90）：
 *   - 只有一种可行 → 用它，置信度 high
 *   - 两种都可行   → 即「两个都 ≤90」，歧义，用默认约定，置信度 mid
 *   - 两种都不可行 → 报错，并指出**在默认解释下**越界的那个字段
 *
 * 这样能正确处理 `116.3974, 95` 这类「一个是合法经度、另一个超出纬度范围」的
 * 输入 —— 直接比大小会把它归入「两个都 >90」，报出一个笼统的错误，
 * 而用户真正需要知道的是「95 不是合法纬度」。
 */
export function resolveOrder(
  a: number,
  b: number,
  hemisphereA: 'N' | 'S' | 'E' | 'W' | undefined,
  hemisphereB: 'N' | 'S' | 'E' | 'W' | undefined,
  defaultOrder: 'lngFirst' | 'latFirst'
): OrderResolution {
  // ① 带明确半球符号 → 按符号确定，忽略书写顺序
  const isLat = (h?: string) => h === 'N' || h === 'S'
  const isLng = (h?: string) => h === 'E' || h === 'W'

  if (isLat(hemisphereA) && isLng(hemisphereB)) {
    return { ok: true, order: 'latFirst', confidence: 'high', byHemisphere: true }
  }
  if (isLng(hemisphereA) && isLat(hemisphereB)) {
    return { ok: true, order: 'lngFirst', confidence: 'high', byHemisphere: true }
  }
  // 只有一侧有符号，且该符号能确定它自己的轴 → 另一侧就是剩下的那个轴
  if (isLat(hemisphereA)) return { ok: true, order: 'latFirst', confidence: 'high', byHemisphere: true }
  if (isLng(hemisphereA)) return { ok: true, order: 'lngFirst', confidence: 'high', byHemisphere: true }
  if (isLat(hemisphereB)) return { ok: true, order: 'latFirst', confidence: 'high', byHemisphere: true }
  if (isLng(hemisphereB)) return { ok: true, order: 'lngFirst', confidence: 'high', byHemisphere: true }

  // ②③④⑤ 无符号：按可行性判定
  const absA = Math.abs(a)
  const absB = Math.abs(b)
  const lngFirstOk = absA <= 180 && absB <= 90
  const latFirstOk = absA <= 90 && absB <= 180

  if (lngFirstOk && !latFirstOk) return { ok: true, order: 'lngFirst', confidence: 'high', byHemisphere: false }
  if (latFirstOk && !lngFirstOk) return { ok: true, order: 'latFirst', confidence: 'high', byHemisphere: false }
  if (lngFirstOk && latFirstOk) {
    // 两个都 ≤90 → 歧义，按默认约定，置信度 mid
    return { ok: true, order: defaultOrder, confidence: 'mid', byHemisphere: false }
  }

  // 两种解释都不可行。按默认解释定位越界的字段，给出精确的错误信息。
  const lng = defaultOrder === 'lngFirst' ? a : b
  const lat = defaultOrder === 'lngFirst' ? b : a
  if (Math.abs(lat) > 90) {
    return { ok: false, field: 'lat', value: lat, limit: LIMITS.lat }
  }
  return { ok: false, field: 'lng', value: lng, limit: LIMITS.lng }
}

/* ------------------------------------------------------------------ *
 * 主入口
 * ------------------------------------------------------------------ */

/**
 * 解析一个坐标输入。
 *
 * @param input 原始输入，可能是 `116.3974, 39.9088`、`N39.9088 E116.3974`、
 *              `116°23'50.6"E 39°54'31.7"N`、`[116.3974, 39.9088]`、`wx4g0bk` …
 */
export function parseCoord(input: string, ctx: ParseCtx = DEFAULT_CTX): ParseResult {
  const warnings: ParseWarning[] = []

  // 步骤 1：全角归一化。必须在识别格式之前（SR-01）
  let text = input
  if (ctx.fullWidth) {
    const n = normalizeFullWidth(input)
    text = n.text
    if (n.changed) warnings.push({ kind: 'fullWidthNormalized', original: input })
  }

  const trimmed = text.trim()
  if (trimmed === '') {
    return {
      ok: false,
      kind: 'empty',
      field: 'coord',
      value: input,
      hint: '请输入坐标，例如 116.3974, 39.9088'
    }
  }

  // 疑似 GeoHash：本工具不解析，引导前往 T08（SR-01 表）
  if (/^[A-Za-z0-9]+$/.test(trimmed) && looksLikeGeoHash(trimmed)) {
    return {
      ok: false,
      kind: 'geohash',
      field: 'coord',
      value: input,
      token: trimmed,
      hint: '这看起来是 GeoHash 字符串。请用 GeoHash 编解码工具（T08）转换。'
    }
  }

  // 步骤 2~3：逗号含义判定与切分
  const commaAs = resolveCommaMeaning(trimmed, ctx)
  const segments = splitAxes(trimmed, commaAs)

  if (segments.length === 0) {
    return { ok: false, kind: 'unparsable', field: 'coord', value: input, hint: '无法从中读出数值。' }
  }

  // 规则 ③：疑似逗号小数点的启发式检测。
  // 检测对象是**原始输入里的逗号片段**，不是切分后的段 ——
  // 切分已经把逗号消费掉了，那时再检测就晚了。
  let ambiguous = false
  if (commaAs === 'separator') {
    // 带 g 的正则在 matchAll 里每次都从头扫描，不受 lastIndex 影响
    for (const m of trimmed.matchAll(COMMA_DECIMAL_RE)) {
      const asDecimal = Number(m[0].replace(',', '.'))
      if (Number.isFinite(asDecimal) && Math.abs(asDecimal) <= 180) {
        ambiguous = true
        warnings.push({ kind: 'commaAmbiguous', token: m[0], asDecimal })
      }
    }
  }

  // 步骤 4：逐段解析。
  // **先解析再判数量** —— 否则 `北京市朝阳区` 这种完全读不出数值的内容
  // 会被误报成「只读到一个数值」，而用户真正需要知道的是「这不是坐标」。
  const parsed: Array<{ value: number; hemisphere: 'N' | 'S' | 'E' | 'W' | undefined }> = []
  for (const seg of segments) {
    const p = parseAxisSegment(seg, commaAs, warnings)
    if (!p) {
      return {
        ok: false,
        kind: 'unparsable',
        field: 'coord',
        value: input,
        hint: `无法解析「${seg.trim()}」。支持的写法：116.3974, 39.9088 / 116°23'50.6"E, 39°54'31.7"N / N39.9088 E116.3974`
      }
    }
    parsed.push(p)
  }

  // 只有 1 个数值 → 无法构成一个坐标（SR-01：仅一个数值给明确提示）
  if (parsed.length === 1) {
    return {
      ok: false,
      kind: 'singleValue',
      field: 'coord',
      value: input,
      hint: '只读到一个数值，坐标需要经度和纬度两个值。例如 116.3974, 39.9088'
    }
  }
  // 多于 3 段 → 判为不可解析，避免把一整行 CSV 当成一个坐标。
  // 3 段是合法的：`116.3974, 39.9088, 50`（含高程），取前两个。
  if (parsed.length > 3) {
    return {
      ok: false,
      kind: 'unparsable',
      field: 'coord',
      value: input,
      hint: '读到超过三个数值。单个坐标只需经度与纬度（可选高程）。多行数据请用批量模式。'
    }
  }

  const first = parsed[0]
  const second = parsed[1]

  // 步骤 5：轴序判定
  const order = resolveOrder(
    first.value,
    second.value,
    first.hemisphere,
    second.hemisphere,
    ctx.defaultOrder ?? 'lngFirst'
  )
  if (!order.ok) {
    // 两种轴序解释都不可行。把逗号歧义的提示一并带上 ——
    // `116,3974` 这类输入走到这里，真正的原因往往是小数点写成了逗号，
    // 只报「超范围」用户想不到那一层。
    const ambiguousHint = ambiguous
      ? ' 另外检测到疑似「逗号作小数点」的写法，可在高级选项中把逗号含义改为小数点后重试。'
      : ''
    return {
      ok: false,
      kind: 'range',
      field: order.field,
      value: String(order.value),
      limit: order.limit,
      hint: rangeHint(order.field) + ambiguousHint,
      warnings
    }
  }

  const lng = order.order === 'lngFirst' ? first.value : second.value
  const lat = order.order === 'lngFirst' ? second.value : first.value

  // 步骤 6：范围校验。**不取模、不截断** —— 静默修正会让用户在错误数据上继续工作
  if (lng < LIMITS.lng.min || lng > LIMITS.lng.max) {
    return {
      ok: false,
      kind: 'range',
      field: 'lng',
      value: String(lng),
      limit: LIMITS.lng,
      hint: rangeHint('lng'),
      warnings
    }
  }
  if (lat < LIMITS.lat.min || lat > LIMITS.lat.max) {
    return {
      ok: false,
      kind: 'range',
      field: 'lat',
      value: String(lat),
      limit: LIMITS.lat,
      hint: rangeHint('lat'),
      warnings
    }
  }

  // 规则 ④：强制回显。用标准格式（句点小数点），使任何误判对用户可见
  const normalized = `${formatDecimal(lng)}, ${formatDecimal(lat)}`

  // 置信度：半球符号或 >90 判定为 high；轴序假定为 mid；叠加逗号歧义降为 low
  let confidence: Parsed['confidence'] = order.confidence
  if (!order.byHemisphere && order.confidence === 'mid') {
    warnings.push({ kind: 'orderAssumed', assumed: order.order })
  }
  if (ambiguous) confidence = 'low'

  return { ok: true, lng, lat, order: order.order, confidence, ambiguous, normalized, warnings }
}
