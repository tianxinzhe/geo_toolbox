/**
 * URL 状态分享编解码（FR-05 / SR-10）
 *
 * 无后台约束下，「把当前状态发给同事」只能通过 URL 实现 ——
 * 这是本站替代云端保存的**唯一**方案，属于核心能力而非附加功能。
 *
 * FR-05 规则：
 *   - 编码内容：全部输入值与已选选项，**不含计算结果**
 *     （结果由打开方本地重算，保证一致性）
 *   - 编码位置：URL 查询参数；序列化后超过 1800 字符时改用片段（hash）承载并压缩
 *   - 触发时机：用户点击「分享」时才生成，**不在每次输入时自动改写 URL**
 *     （避免污染浏览历史）
 *   - 打开带参链接：自动回填并立即计算；解析失败则忽略参数、以默认状态加载，
 *     并提示「链接中的参数无法识别，已重置」
 *   - 体积上限：超过 1800 字符且无法压缩到限内 → 不写入 URL，
 *     改为提示「内容过大无法通过链接分享，请下载文件后发送」
 *
 * SR-10 规则：
 *   - 参数名简短稳定（lng / lat / from / to / p），**一经发布不再变更**，
 *     保证已分享出去的旧链接长期有效 → 因此集中在 PARAMS 常量里声明
 *   - 坐标按 SR-02 显示精度编码，句点小数点（走 lib/coord/format 的 std）
 *   - 多值参数逗号分隔；嵌套结构压缩后 Base64URL 放 hash
 *   - **未知参数一律忽略，不报错** —— 保证向前兼容
 *   - 分享链接包含语言前缀（由调用方传入的 path 决定）
 *
 * 零 UI 依赖：本文件不碰 DOM，可在 vitest 中直接测。
 * 只有 fflate 的压缩路径是异步的（动态 import，不阻塞首屏）。
 */

import { std } from './coord/format'

/** FR-05：序列化后超过此长度改用 hash + 压缩 */
export const MAX_QUERY_LENGTH = 1800

/* ------------------------------------------------------------------ *
 * 参数声明（SR-10：一经发布不再变更）
 * ------------------------------------------------------------------ */

export type ParamSpec =
  | { key: string; type: 'number'; min?: number; max?: number; digits?: number }
  | { key: string; type: 'int'; min?: number; max?: number }
  | { key: string; type: 'string'; oneOf?: readonly string[] }
  | { key: string; type: 'bool' }
  | { key: string; type: 'numbers' }
  /** 多值字符串，逗号分隔。每个元素都要通过 oneOf 校验 */
  | { key: string; type: 'strings'; oneOf?: readonly string[] }

/** 参数表：每个工具声明自己用到的参数 */
export type ParamTable = readonly ParamSpec[]

/**
 * T01 的参数表。
 *
 * 键名一旦发布就不能改 —— 已经分享出去的链接必须长期有效（SR-10）。
 * 新增参数可以，重命名或删除不行。
 *
 * `to` 是 **strings**（多值）：PRD T01 要求「目标坐标系可多选，一次输出全部」，
 * 所以分享链接必须能带上多个目标。
 */
export const T01_PARAMS: ParamTable = [
  { key: 'lng', type: 'number', min: -180, max: 180, digits: 8 },
  { key: 'lat', type: 'number', min: -90, max: 90, digits: 8 },
  { key: 'from', type: 'string', oneOf: ['WGS84', 'CGCS2000'] },
  { key: 'to', type: 'strings', oneOf: ['WGS84', 'CGCS2000'] },
  { key: 'p', type: 'int', min: 0, max: 12 },
  { key: 'comma', type: 'string', oneOf: ['auto', 'decimal', 'separator'] }
]

/**
 * T02 经纬度格式转换的参数表。
 *
 * 🔑 为什么编码**十进制度数值**而不是用户输入的原文：
 *   原文可能是 `39°54'31.68"N`、`北纬39.9088`、`39 54 31.68 N` 等十几种写法，
 *   直接进 URL 要么被百分号转义撑长（`%C2%B0` `%27` `%22`），要么需要 string
 *   类型从而丢掉范围校验。十进制度是所有格式的公共基准值，8 位小数约 1 毫米
 *   （SR-02 默认精度），对任何用途都是无损的；接收方打开链接后由本地重新
 *   识别与换算 —— 这正好符合 FR-05「只编码输入与选项，不编码计算结果」。
 *
 * 🔑 为什么用 number 而不是 string：number 带 min/max 校验，
 *   经度 ±180 / 纬度 ±90 之外的值会被 encodeState 直接丢弃，
 *   decodeState 也会拒绝，省掉一层手写校验。
 *
 * `lng` / `lat` 各自**可选**：PRD T02 专属异常②允许单向转换
 * （只填经度或只填纬度），所以两个键都可能缺席，encodeState 会跳过 undefined。
 *
 * `p` / `comma` 与 T01 同名同义 —— 跨工具保持一致的键名，
 * 用户与脚本都不用为每个工具记一套参数（SR-10）。
 */
export const T02_PARAMS: ParamTable = [
  { key: 'lng', type: 'number', min: -180, max: 180, digits: 8 },
  { key: 'lat', type: 'number', min: -90, max: 90, digits: 8 },
  { key: 'p', type: 'int', min: 0, max: 12 },
  { key: 'comma', type: 'string', oneOf: ['auto', 'decimal', 'separator'] }
]

/**
 * T08 GeoHash 编解码的参数表。
 *
 * 键名选型（SR-10：一经发布不再变更）：
 *
 *   `mode` 转换方向（encode / decode）。显式声明当前方向，
 *          避免「同时有 lng 与 q 时该信哪个」的隐式判定。
 *
 *   `lng` / `lat` 编码方向的坐标。与 T01 / T02 同名同义，范围校验直接复用
 *          参数表：±180 / ±90 之外的值在 encodeState 就被丢弃、在 decodeState
 *          也会被拒绝，组件不必再写一层。
 *
 *   `p` 精度。T08 只支持 1~12 位，但这里把范围放宽到 0~99 —— 分享链接
 *          可能被手工改成 p=0 或 p=20。参数表放行后由组件用 clampPrecision
 *          夹取到 1~12 并提示「已夹取」，而不是把整条链接判为非法重置掉
 *          （PRD T08 专属异常②要求夹取并提示）。本工具写出的 p 永远是 1~12。
 *
 *   `q` 解码方向的 GeoHash 输入。用 query 的首字母 `q`，而不是 `hash`：
 *          `hash` 在本文件里专指 URL 片段（readShareState 的 hash 参数），
 *          同名会让维护者误以为这个参数走的是压缩片段路径。
 *          类型是普通 string 而不是 oneOf：GeoHash 是 32 字符字母表的任意
 *          1~12 位组合，枚举无法表达；非法字符由组件就地报错（SR-01），
 *          不在分享解码层静默丢弃。
 *
 *   `comma` 与 T01 / T02 / T04 同名同义（逗号作小数点 / 分隔符）。
 *
 * 刻意**不**编码：解码得到的中心点、边界框、地面尺寸、邻居与精度对照表 ——
 * FR-05 规定只编码输入与选项，接收方本地重算，保证同一链接在任何时间、
 * 任何语言版本下得到相同结果。
 */
export const T08_PARAMS: ParamTable = [
  { key: 'mode', type: 'string', oneOf: ['encode', 'decode'] },
  { key: 'lng', type: 'number', min: -180, max: 180, digits: 8 },
  { key: 'lat', type: 'number', min: -90, max: 90, digits: 8 },
  { key: 'p', type: 'int', min: 0, max: 99 },
  { key: 'q', type: 'string' },
  { key: 'comma', type: 'string', oneOf: ['auto', 'decimal', 'separator'] }
]

/**
 * T03 投影坐标转换的参数表。
 *
 * 键名选型（SR-10：一经发布不再变更）：
 *
 *   `from` / `to`  坐标系 id，形如 `epsg:6669`、`auto:utm:WGS84`。
 *                  用 string 而不是 int：自动带号类选项没有固定的 EPSG 代码，
 *                  要等接收方拿到经度后才能确定。组件解析失败时按默认值加载。
 *
 *   `x` / `y`      源坐标系下的坐标值，轴序与所选 CRS 一致（日本为
 *                  X=北、Y=東）。用 number 是为了让 std() 统一成句点小数点；
 *                  投影坐标可达七位数，但 number 不做分组、不会出现千分位。
 *
 *   `rev`          「无可用基准变换时仍继续」的显式确认。bool 的 false
 *                  不写入 URL（默认姿态是不执行无基准转换，PRD 6.4）。
 *
 *   `f7`           自定义七参数（Bursa-Wolf），逗号分隔的 7 个数值。
 *                  只在用户主动展开高级选项时写入；接收方重新校验格式。
 *
 * 刻意**不**编码结果坐标、坐标系全称与精度声明 —— FR-05 规定只编码
 * 输入与选项，接收方本地重算，保证同一链接在任何时间、任何语言版本下
 * 得到相同结果。
 */
export const T03_PARAMS: ParamTable = [
  { key: 'from', type: 'string' },
  { key: 'to', type: 'string' },
  { key: 'x', type: 'number' },
  { key: 'y', type: 'number' },
  { key: 'rev', type: 'bool' },
  { key: 'f7', type: 'string' }
]

/**
 * T06 矢量格式转换的参数表。
 *
 * 只对「粘贴文本」生效：文件模式无法把整个文件塞进 URL（20MB 上限），
 * 因此 T06 的分享按钮只在粘贴模式出现。`text` 走 query → hash + 压缩
 * → tooLarge 的三档编码（FR-05）。
 *
 * `target` 存目标格式（geojson/kml/gpx/csv/topojson/wkt）；组件会校验，
 * 非法值回落到默认。`gpx` 存属性降级策略 name-desc / name。
 */
export const T06_PARAMS: ParamTable = [
  { key: 'text', type: 'string' },
  { key: 'src', type: 'string' },
  { key: 'target', type: 'string' },
  { key: 'indent', type: 'bool' },
  { key: 'digits', type: 'number', min: 0, max: 12, digits: 0 },
  { key: 'empty', type: 'bool' },
  { key: 'gpx', type: 'string' }
]

/**
 * T10 等距圈 / 缓冲区的参数表。
 *
 * `r` 保留用户原始写法（如 `1, 3, 5`），这样接收方能继续编辑；
 * `buf` 只在缓冲区模式出现，可能是 GeoJSON 等多行文本，走 hash 压缩。
 */
export const T10_PARAMS: ParamTable = [
  { key: 'lat', type: 'number', min: -90, max: 90, digits: 8 },
  { key: 'lng', type: 'number', min: -180, max: 180, digits: 8 },
  { key: 'r', type: 'string' },
  { key: 'unit', type: 'string' },
  { key: 'seg', type: 'number', min: 8, max: 1024, digits: 0 },
  { key: 'mode', type: 'string' },
  { key: 'buf', type: 'string' }
]

/**
 * T09 绘制器的参数表。
 *
 * `data` 是完整 GeoJSON（FeatureCollection）字符串，可能较大，
 * 按 share.ts 的三档策略自动走 query / hash+压缩 / 拒绝。
 * 绘制器只传要素本身，不传撤销栈、选中态与本地保存标记。
 */
export const T09_PARAMS: ParamTable = [
  { key: 'data', type: 'string' },
  { key: 'target', type: 'string' }
]

/* ------------------------------------------------------------------ *
 * 值类型
 * ------------------------------------------------------------------ */

export type ShareValue = string | number | boolean | number[] | string[]
export type ShareState = Record<string, ShareValue>

export type DecodeIssue =
  /** 参数存在但值非法（超范围 / 不在枚举内 / 不是数字）→ 该参数被丢弃 */
  | { kind: 'invalid'; key: string; raw: string }
  /** 整体解析失败（hash 解压失败、Base64 非法等）→ 全部参数被丢弃 */
  | { kind: 'unparsable'; detail: string }

export interface DecodeResult<T extends ShareState = ShareState> {
  /** 成功解析出的参数。未知参数与非法参数都不会出现在这里 */
  state: T
  issues: DecodeIssue[]
  /** 有 issues 时 UI 需提示「链接中的参数无法识别，已重置」（FR-05） */
  hadProblems: boolean
}

/* ------------------------------------------------------------------ *
 * 编码
 * ------------------------------------------------------------------ */

/**
 * 状态 → 查询串（不含前导 `?`）。
 *
 * 只写入参数表中声明过的键 —— 未声明的键即使传进来也不会出现在 URL 里，
 * 避免调试字段意外泄露到分享链接中（FR-05「敏感数据」的同源考虑）。
 *
 * 数值走 std()：句点小数点、无千分位、按 SR-02 精度截断（SR-10）。
 * 省略等于默认值的参数，让链接尽量短。
 */
export function encodeState(state: ShareState, table: ParamTable, defaults?: ShareState): string {
  const parts: string[] = []

  for (const spec of table) {
    const v = state[spec.key]
    if (v === undefined || v === null || v === '') continue

    // 与默认值相同就不写，缩短链接。
    // 数组要逐元素比 —— `===` 对数组是引用比较，永远不相等，
    // 那样多值参数会被无条件写入，链接白白变长。
    if (defaults && sameValue(defaults[spec.key], v)) continue

    let encoded: string | undefined

    switch (spec.type) {
      case 'number': {
        if (typeof v !== 'number' || !Number.isFinite(v)) break
        if (spec.min !== undefined && v < spec.min) break
        if (spec.max !== undefined && v > spec.max) break
        encoded = std(v, spec.digits ?? 8)
        break
      }
      case 'int': {
        if (typeof v !== 'number' || !Number.isInteger(v)) break
        if (spec.min !== undefined && v < spec.min) break
        if (spec.max !== undefined && v > spec.max) break
        encoded = String(v)
        break
      }
      case 'string': {
        if (typeof v !== 'string') break
        if (spec.oneOf && !spec.oneOf.includes(v)) break
        encoded = v
        break
      }
      case 'bool': {
        if (typeof v !== 'boolean') break
        // false 是常态，不写入 URL
        if (!v) break
        encoded = '1'
        break
      }
      case 'numbers': {
        // Array.isArray + every 的运行时检查无法让 TS 把 v 收窄成 number[]
        // （number[] | string[] 的元素类型会被并成 string | number），
        // 因此在检查通过后显式取一个窄类型局部量。
        if (!Array.isArray(v) || v.length === 0) break
        if (!v.every((n) => typeof n === 'number' && Number.isFinite(n))) break
        const nums = v as number[]
        // SR-10：多值参数使用逗号分隔
        encoded = nums.map((n) => std(n, 8)).join(',')
        break
      }
      case 'strings': {
        if (!Array.isArray(v) || v.length === 0) break
        const strs = v as unknown[]
        if (!strs.every((s) => typeof s === 'string')) break
        // 每个元素都要通过 oneOf 校验，非法元素整个参数丢弃 ——
        // 部分写入会让接收方拿到一个不完整的坐标系集合，比不写更糟
        if (spec.oneOf && !strs.every((s) => spec.oneOf!.includes(s as string))) break
        encoded = (strs as string[]).join(',')
        break
      }
    }

    if (encoded !== undefined) {
      parts.push(`${encParam(spec.key)}=${encParam(encoded)}`)
    }
  }

  return parts.join('&')
}

/**
 * 查询串转义。
 *
 * 用 encodeURIComponent 之后把逗号还原成字面量：SR-10 规定「多值参数使用
 * 逗号分隔」，而 `%2C` 虽然语义等价，却会让链接变长且难以肉眼阅读。
 * 逗号是 RFC 3986 的 sub-delim，在 query 中可以直接出现。
 */
function encParam(s: string): string {
  return encodeURIComponent(s).replace(/%2C/g, ',')
}

/**
 * 值相等比较，数组按顺序逐元素比。
 *
 * 只用于「与默认值相同则省略」这一处判断，因此不追求通用性：
 * 顺序不同的多值参数视为不同（`to=WGS84,CGCS2000` 与 `to=CGCS2000,WGS84`
 * 在 UI 上是不同的选择顺序，写进链接也无妨）。
 */
function sameValue(a: ShareValue | undefined, b: ShareValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i])
  }
  return a === b
}

/* ------------------------------------------------------------------ *
 * 解码
 * ------------------------------------------------------------------ */

/**
 * 查询串 → 状态。
 *
 * **未知参数一律忽略，不报错**（SR-10 向前兼容）：
 * 老链接可能带着已废弃的参数，新版本也可能收到未来版本生成的链接，
 * 两种情况都不该让用户看到错误。
 *
 * 已声明但值非法的参数会被丢弃并记入 issues —— 这不同于「未知参数」：
 * 未知是「我不认识」，非法是「我认识但这个值不对」，后者需要告诉用户。
 */
export function decodeState(search: string, table: ParamTable): DecodeResult {
  const state: ShareState = {}
  const issues: DecodeIssue[] = []

  const cleaned = search.replace(/^[?#]/, '')
  if (cleaned === '') return { state, issues, hadProblems: false }

  let params: URLSearchParams
  try {
    params = new URLSearchParams(cleaned)
  } catch {
    return { state, issues: [{ kind: 'unparsable', detail: 'query' }], hadProblems: true }
  }

  const known = new Map(table.map((s) => [s.key, s]))

  for (const [rawKey, rawValue] of params.entries()) {
    const spec = known.get(rawKey)
    if (!spec) continue // 未知参数：静默忽略

    const parsed = parseParam(spec, rawValue)
    if (parsed === undefined) {
      issues.push({ kind: 'invalid', key: rawKey, raw: rawValue })
      continue
    }
    state[spec.key] = parsed
  }

  return { state, issues, hadProblems: issues.length > 0 }
}

/** 按声明解析单个参数；非法返回 undefined */
function parseParam(spec: ParamSpec, raw: string): ShareValue | undefined {
  switch (spec.type) {
    case 'number': {
      const n = Number(raw)
      if (!Number.isFinite(n)) return undefined
      if (spec.min !== undefined && n < spec.min) return undefined
      if (spec.max !== undefined && n > spec.max) return undefined
      return n
    }
    case 'int': {
      const n = Number(raw)
      if (!Number.isInteger(n)) return undefined
      if (spec.min !== undefined && n < spec.min) return undefined
      if (spec.max !== undefined && n > spec.max) return undefined
      return n
    }
    case 'string': {
      if (spec.oneOf && !spec.oneOf.includes(raw)) return undefined
      return raw
    }
    case 'bool': {
      if (raw === '1' || raw === 'true') return true
      if (raw === '0' || raw === 'false' || raw === '') return false
      return undefined
    }
    case 'numbers': {
      const parts = raw.split(',').filter((s) => s !== '')
      if (parts.length === 0) return undefined
      const nums = parts.map(Number)
      if (!nums.every(Number.isFinite)) return undefined
      return nums
    }
    case 'strings': {
      const parts = raw.split(',').filter((s) => s !== '')
      if (parts.length === 0) return undefined
      // 任一元素非法则整个参数丢弃，不做部分接受
      if (spec.oneOf && !parts.every((s) => spec.oneOf!.includes(s))) return undefined
      return parts
    }
  }
}

/* ------------------------------------------------------------------ *
 * Base64URL（hash 承载压缩数据用）
 * ------------------------------------------------------------------ */

/** 标准 Base64 → Base64URL（SR-10：置于 hash 中，需 URL 安全） */
export function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Base64URL → 字节。非法输入抛异常，由调用方转成 DecodeIssue */
export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/* ------------------------------------------------------------------ *
 * 分享链接生成
 * ------------------------------------------------------------------ */

export type ShareMode = 'query' | 'hash' | 'tooLarge'

export interface ShareLink {
  /** 可直接复制的完整 URL（相对路径，含语言前缀） */
  url: string
  mode: ShareMode
  /** 序列化后的字符数，用于诊断与「内容过大」提示 */
  length: number
}

/**
 * 生成分享链接。
 *
 * 三档降级（FR-05）：
 *   ① 查询串 ≤1800 字符 → 直接放 query（可读、可被搜索引擎忽略）
 *   ② 超长 → JSON 序列化 + deflate 压缩 + Base64URL 放 hash
 *   ③ 压缩后仍超长 → mode='tooLarge'，调用方提示
 *      「内容过大无法通过链接分享，请下载文件后发送」并提供下载入口
 *
 * fflate 是**动态 import** 的：只有走到 ② 才需要它，
 * 不给普通工具页的首屏增加体积（技术方案 2 章体积预算）。
 *
 * @param path 当前页面路径（含语言前缀），如 `/zh/tools/coord-convert/`
 */
export async function buildShareUrl(
  path: string,
  state: ShareState,
  table: ParamTable,
  defaults?: ShareState
): Promise<ShareLink> {
  const query = encodeState(state, table, defaults)

  if (query.length <= MAX_QUERY_LENGTH) {
    return { url: query ? `${path}?${query}` : path, mode: 'query', length: query.length }
  }

  // ② 压缩后放 hash。用 JSON 而不是查询串作为压缩输入 ——
  // 查询串里的百分号转义会显著降低压缩率
  const json = JSON.stringify(state)
  const { deflateSync } = await import('fflate')
  const compressed = deflateSync(new TextEncoder().encode(json), { level: 9 })
  const hash = toBase64Url(compressed)

  if (hash.length <= MAX_QUERY_LENGTH) {
    return { url: `${path}#s=${hash}`, mode: 'hash', length: hash.length }
  }

  // ③ 压不下来 → 不写入 URL
  return { url: path, mode: 'tooLarge', length: hash.length }
}

/**
 * 从当前 URL 读取分享状态。
 *
 * 同时支持 query 与 hash 两种承载方式，hash 优先
 * （一个链接不会同时用两种，但万一有则 hash 是更新的那个）。
 *
 * 解析失败**不抛异常**：FR-05 要求「忽略参数、以默认状态加载，
 * 并在结果区提示」，所以失败也要返回一个可用的空 state。
 */
export async function readShareState(
  url: { search: string; hash: string },
  table: ParamTable
): Promise<DecodeResult> {
  // hash 形式：`#s=<base64url>`
  const hashMatch = /[#&]s=([^&]+)/.exec(url.hash)
  if (hashMatch) {
    try {
      const { inflateSync } = await import('fflate')
      const bytes = fromBase64Url(decodeURIComponent(hashMatch[1]))
      const json = new TextDecoder().decode(inflateSync(bytes))
      const parsed = JSON.parse(json) as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { state: {}, issues: [{ kind: 'unparsable', detail: 'shape' }], hadProblems: true }
      }
      // 压缩路径绕过了 encodeState 的类型校验，解码后必须再过一遍参数表
      return decodeState(
        new URLSearchParams(
          Object.entries(parsed as Record<string, unknown>)
            .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)])
        ).toString(),
        table
      )
    } catch {
      return { state: {}, issues: [{ kind: 'unparsable', detail: 'hash' }], hadProblems: true }
    }
  }

  return decodeState(url.search, table)
}
