/**
 * GeoHash 编解码（T08，PRD 6.1 规格表）
 *
 * 处理规则：
 *   - 编码：标准 Base32 GeoHash，精度默认 7 位（约 150m × 150m）
 *   - 解码：中心点坐标、bounding box（西南 / 东北角）、该精度对应的近似地面尺寸（米）
 *   - **邻居计算**：输出 8 个方向相邻 GeoHash，便于用户理解网格关系
 *
 * 专属异常：
 *   - 含非法字符（`a` `i` `l` `o` 不在 Base32 字母表中）→ **指出具体非法字符位置**
 *     与合法字符集，而不是笼统报「格式错误」
 *   - 精度超出 1~12 → 夹到范围内并提示（由 UI 层负责提示，这里返回夹后的值）
 *
 * 为什么自研而不用 `ngeohash`（技术方案 1 章）：
 * 算法本身就是位交错 + Base32 查表，约 150 行；而 PRD 要求「指出出错的字符位置」，
 * 现成库的错误信息做不到这一点。
 *
 * 零依赖纯函数。
 */

/**
 * GeoHash 的 Base32 字母表。
 *
 * ⚠️ 刻意排除了 `a` `i` `l` `o` —— 这是 GeoHash 标准的规定，
 * 目的是避免与数字 `1` `0` 以及字母 `I` 混淆。
 * 用户从别的系统粘来的字符串里若出现这四个字符，一定是错的。
 */
export const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

/** 反查表：字符 → 5 bit 值 */
const BASE32_INDEX: ReadonlyMap<string, number> = new Map(
  BASE32.split('').map((c, i) => [c, i])
)

/** SR-02 / T08：精度范围 1~12 */
export const MIN_PRECISION = 1
export const MAX_PRECISION = 12
/** T08：编码方向的默认精度 */
export const DEFAULT_PRECISION = 7

/** 八个方向。顺序固定，UI 可按此渲染 3×3 九宫格 */
export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
export type Direction = (typeof DIRECTIONS)[number]

/** 每个精度对应的经纬度误差（度）与近似地面尺寸（米） */
export interface PrecisionInfo {
  precision: number
  /** 纬度误差 ±（度） */
  latError: number
  /** 经度误差 ±（度） */
  lngError: number
  /** 格子的纬度方向尺寸（米） */
  latSize: number
  /** 格子的经度方向尺寸（米），按赤道计 —— 实际随纬度收缩 */
  lngSize: number
}

/**
 * 精度对照表（T08：常驻文档区，这是该工具最高频的查询意图）。
 *
 * 地面尺寸按赤道计算（1 度 ≈ 111320 m）。实际经度方向的尺寸要乘 cos(纬度)，
 * 所以表里给的是**上界**；UI 与文档区必须说明这一点，不能让用户以为
 * 在北京也是同样的经度宽度。
 */
export const PRECISION_TABLE: readonly PrecisionInfo[] = (() => {
  const M_PER_DEG = 111320
  const table: PrecisionInfo[] = []
  for (let p = MIN_PRECISION; p <= MAX_PRECISION; p++) {
    // GeoHash 每字符 5 bit，经纬度交替分配：奇数位精度给经度多一 bit
    const totalBits = p * 5
    const lngBits = Math.ceil(totalBits / 2)
    const latBits = Math.floor(totalBits / 2)
    const lngError = 180 / 2 ** lngBits
    const latError = 90 / 2 ** latBits
    table.push({
      precision: p,
      lngError,
      latError,
      lngSize: lngError * 2 * M_PER_DEG,
      latSize: latError * 2 * M_PER_DEG
    })
  }
  return table
})()

/** 取某个精度的对照信息 */
export function precisionInfo(precision: number): PrecisionInfo {
  const p = clampPrecision(precision)
  return PRECISION_TABLE[p - MIN_PRECISION]
}

/** 精度夹到 1~12。T08 要求「超限时夹到范围内并提示」，提示由 UI 负责 */
export function clampPrecision(precision: number): number {
  if (!Number.isInteger(precision)) return DEFAULT_PRECISION
  return Math.min(MAX_PRECISION, Math.max(MIN_PRECISION, precision))
}

/* ------------------------------------------------------------------ *
 * 编码
 * ------------------------------------------------------------------ */

/**
 * 坐标 → GeoHash。
 *
 * 算法：把经度、纬度各自二分逼近编码成 bit 串，然后**经度 bit 在前**交替交错，
 * 每 5 bit 查一次 Base32 表。
 *
 * 经度先于纬度是 GeoHash 的标准约定，搞反会得到完全不同的字符串
 * （而且看起来同样「合法」，属于静默错误）。
 */
export function encode(lng: number, lat: number, precision: number = DEFAULT_PRECISION): string {
  const p = clampPrecision(precision)

  let lngLo = -180
  let lngHi = 180
  let latLo = -90
  let latHi = 90

  let out = ''
  let bit = 0
  let ch = 0
  let even = true // true = 当前 bit 属于经度

  while (out.length < p) {
    if (even) {
      const mid = (lngLo + lngHi) / 2
      if (lng >= mid) {
        ch |= 1 << (4 - bit)
        lngLo = mid
      } else {
        lngHi = mid
      }
    } else {
      const mid = (latLo + latHi) / 2
      if (lat >= mid) {
        ch |= 1 << (4 - bit)
        latLo = mid
      } else {
        latHi = mid
      }
    }
    even = !even

    if (bit < 4) {
      bit++
    } else {
      out += BASE32[ch]
      bit = 0
      ch = 0
    }
  }

  return out
}

/* ------------------------------------------------------------------ *
 * 解码
 * ------------------------------------------------------------------ */

export interface GeoHashBox {
  /** 西南角 */
  sw: { lng: number; lat: number }
  /** 东北角 */
  ne: { lng: number; lat: number }
}

export interface DecodeOk {
  ok: true
  /** 输入（已转小写、去空白） */
  hash: string
  /** 中心点 */
  center: { lng: number; lat: number }
  /** 边界框 */
  box: GeoHashBox
  /** 误差 ±（度） */
  error: { lng: number; lat: number }
  /** 近似地面尺寸（米）。lngSize 按赤道计，实际随纬度收缩 */
  size: { lng: number; lat: number }
  precision: number
  /** 八个方向的邻居 */
  neighbors: Record<Direction, string>
}

export interface DecodeErr {
  ok: false
  reason: 'empty' | 'illegalChar'
  /** 非法字符所在的**位置**（0 起），PRD T08 要求指出具体位置 */
  position?: number
  /** 那个非法字符本身 */
  char?: string
  /** 合法字符集，用于 SR-06 的「正确写法示例」 */
  alphabet?: string
}

export type DecodeResult = DecodeOk | DecodeErr

/**
 * GeoHash → 坐标与边界框。
 *
 * 非法字符会**精确定位**：返回出错位置与该字符，
 * 而不是笼统的「格式错误」。这是 PRD T08 的明确要求，
 * 也是 SR-06「三段式错误提示」能提供有用信息的前提。
 */
export function decode(input: string): DecodeResult {
  const core = decodeCore(input)
  if (!core.ok) return core
  return { ...core, neighbors: neighbors(core.hash) }
}

/**
 * 解码的核心部分，**不算邻居**。
 *
 * 必须与公开的 decode() 分开：`neighbor()` 要用它，而 `decode()` 又会
 * 调 `neighbors()` → `neighbor()`。若 neighbor 直接调 decode，
 * 就是 decode → neighbors → neighbor → decode 的**无限递归**（栈溢出）。
 */
function decodeCore(input: string): Omit<DecodeOk, 'neighbors'> | DecodeErr {
  const hash = input.trim().toLowerCase()
  if (hash === '') return { ok: false, reason: 'empty' }

  for (let i = 0; i < hash.length; i++) {
    if (!BASE32_INDEX.has(hash[i])) {
      return {
        ok: false,
        reason: 'illegalChar',
        position: i,
        char: hash[i],
        alphabet: BASE32
      }
    }
  }

  let lngLo = -180
  let lngHi = 180
  let latLo = -90
  let latHi = 90
  let even = true

  for (const c of hash) {
    const cd = BASE32_INDEX.get(c)!
    for (let bit = 4; bit >= 0; bit--) {
      const b = (cd >> bit) & 1
      if (even) {
        const mid = (lngLo + lngHi) / 2
        if (b === 1) lngLo = mid
        else lngHi = mid
      } else {
        const mid = (latLo + latHi) / 2
        if (b === 1) latLo = mid
        else latHi = mid
      }
      even = !even
    }
  }

  const lng = (lngLo + lngHi) / 2
  const lat = (latLo + latHi) / 2
  const lngErr = (lngHi - lngLo) / 2
  const latErr = (latHi - latLo) / 2
  const M_PER_DEG = 111320

  return {
    ok: true,
    hash,
    center: { lng, lat },
    box: { sw: { lng: lngLo, lat: latLo }, ne: { lng: lngHi, lat: latHi } },
    error: { lng: lngErr, lat: latErr },
    size: { lng: lngErr * 2 * M_PER_DEG, lat: latErr * 2 * M_PER_DEG },
    precision: hash.length
  }
}

/* ------------------------------------------------------------------ *
 * 邻居
 * ------------------------------------------------------------------ */

/**
 * 计算某个方向的相邻 GeoHash。
 *
 * 常见的实现是一张 32 字符的「邻居查表」+ 边界字符表（key 为奇偶性 × 方向）。
 * 这里**不用**那种写法，改为「解码 → 平移中心点 → 重新编码」：
 *
 *   ① 实现只有十几行，逻辑一眼可验证；查表法的表一旦抄错就是静默错误
 *   ② 与 encode / decode 共用同一套位运算，不会出现两套实现互相矛盾
 *   ③ 精度由输入字符串长度决定，天然一致
 *
 * 代价是每算一个邻居要跑一次完整的解码 + 编码（约 60 次位运算），
 * 8 个邻居共约 500 次 —— 在浏览器里是微秒级，完全可接受。
 *
 * 边界处理：
 *   跨 ±180 经线 → 归一化（GeoHash 在经度方向是环面的）
 *   跨 ±90 纬度 → 极点之外没有格子，返回原 hash，由 UI 决定显示成「—」
 */
export function neighbor(hash: string, dir: Direction): string {
  // 用 decodeCore 而不是 decode —— 后者会算邻居，形成无限递归
  const d = decodeCore(hash)
  if (!d.ok) return hash

  const { lng, lat } = d.center
  const stepLng = d.error.lng * 2
  const stepLat = d.error.lat * 2

  let nLng = lng
  let nLat = lat

  if (dir.includes('n')) nLat += stepLat
  if (dir.includes('s')) nLat -= stepLat
  if (dir.includes('e')) nLng += stepLng
  if (dir.includes('w')) nLng -= stepLng

  // 越过极点：没有邻居，返回原 hash（UI 可据此显示「—」）
  if (nLat > 90 || nLat < -90) return hash

  // 经度是环面的，跨 ±180 需要归一化
  nLng = ((nLng + 180) % 360 + 360) % 360 - 180

  return encode(nLng, nLat, hash.length)
}

/** 八个方向的邻居 */
export function neighbors(hash: string): Record<Direction, string> {
  return {
    n: neighbor(hash, 'n'),
    ne: neighbor(hash, 'ne'),
    e: neighbor(hash, 'e'),
    se: neighbor(hash, 'se'),
    s: neighbor(hash, 's'),
    sw: neighbor(hash, 'sw'),
    w: neighbor(hash, 'w'),
    nw: neighbor(hash, 'nw')
  }
}

/**
 * 判断字符串是否**看起来**像 GeoHash。
 *
 * 用途（SR-01 表）：其他工具在识别到疑似 GeoHash 时提示用户前往 T08，
 * 而不是自己尝试解析。
 *
 * 判据是「全部字符都在 Base32 字母表内**且长度 ≥6**」。
 *
 * ⚠️ 长度下限为什么是 6 而不是 4：Base32 字母表包含了
 * `b c d e f g h j k m n p q r s t u v w x y z` 共 22 个字母，
 * 大量常见英文词完全由它们组成 —— `news`、`west`、`send`、`deep`、
 * `edge`、`hedge` 都是语法上合法的 GeoHash。长度取 4 会把这些词
 * 全部误判，用户在坐标框里输入 `news` 却被告知「这是 GeoHash，
 * 请去 T08」，是彻底的误导。
 *
 * 取 6 位（约 1.2 km × 0.6 km）是「能表示一个有意义的地点」的实际下限，
 * 也把绝大多数英文词排除在外。含 `a i l o` 的词（code / london / beijing）
 * 则由字母表校验直接排除。
 */
export const MIN_GEOHASH_LIKE_LENGTH = 6

export function looksLikeGeoHash(s: string): boolean {
  const t = s.trim().toLowerCase()
  if (t.length < MIN_GEOHASH_LIKE_LENGTH || t.length > MAX_PRECISION) return false
  for (const c of t) if (!BASE32_INDEX.has(c)) return false
  return true
}
