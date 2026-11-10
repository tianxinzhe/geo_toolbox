/**
 * 球面多边形面积与几何量（SR-03「面积算法」）
 *
 * 为什么单独一个文件而不是塞进 geodesy.ts：
 *   geodesy.ts 是**两点之间**的大地测量算法（距离、方位角、正算/反算），
 *   与「有几个点、怎么围起来」无关；本文件是**多边形领域逻辑**（面积、周长、
 *   质心、绕向、自相交、CSV 序列化），属于 SR-03。分开之后 geodesy.ts 保持
 *   零业务语义，T04 / T10 / T01 继续只用它，不会被多边形类型污染
 *   （与 route.ts 对 T04 的分工完全一致）。
 *
 * 🔑 组件层不做任何算术：面积、周长、质心、绕向、自相交、CSV 全部在这里
 *    完成并可单测；组件只负责把结果**格式化**成当前语言的显示串。
 *
 * ------------------------------------------------------------------
 * 面积算法：等积纬线（authalic latitude）+ 球面过剩（spherical excess）
 * ------------------------------------------------------------------
 *
 * SR-03 明文要求「按球面 excess 公式计算椭球/球面真实面积（**而非投影平面
 * 面积**）」。三种常见做法的取舍：
 *
 * ① **平面 shoelace（鞋带公式）直接吃经纬度** —— 这就是被禁止的那个。
 *    它算的是等距圆柱（equirectangular）投影平面上的面积，高纬度被横向拉伸，
 *    60°N 的地块会大出一倍（1/cos60° = 2）。**绝不使用。**
 *
 * ② **Chamberlain–Duquette 球面梯形式**（Turf.js / 多数轻量库的做法）：
 *      A = −(R²/2)·Σ (λᵢ₊₁ − λᵢ)(sinφᵢ + sinφᵢ₊₁)
 *    它把每条边当成 (λ,φ) 参数平面上的**直线**积分，只在边长远小于地球半径时
 *    才准确。用球面八分之一三角形（excess = π/2，真值 R²π/2）检验会得到
 *    R²π/4 —— **整整差一倍**。地块尺度上误差可接受，但它无法通过解析解校验，
 *    也不符合「按球面 excess 公式」的要求。**不采用。**
 *
 * ③ **本文件采用的做法**：先把大地纬度 φ 映射到 WGS84 的**等积纬线** β
 *    （authalic latitude，Snyder《Map Projections — A Working Manual》式 3-12），
 *    再以等积球半径 R_q = a·√(q_p/2) ≈ 6371007.18 m 的球面计算**精确**球面
 *    多边形面积。等积映射的定义就是「面积元严格不变」，因此椭球上任意图形的
 *    真实面积 = 它在等积球上像的面积，这一步是**恒等**而不是近似。
 *
 *    球面多边形面积用**球面过剩**（Girard 定理）的等价形式：把多边形按
 *    「固定顶点 + 逐边」扇形剖分成球面三角形，逐三角形用 Van Oosterom–
 *    Strackee（1983）的立体角公式求**带符号**立体角 Ω，求和后 A = R_q²·Ω。
 *      tan(Ω/2) = a·(b×c) / (1 + a·b + b·c + c·a)      （单位向量）
 *    实现上写成 2·atan2(分子, 分母)，值域 (−2π, 2π]，无需分支判断象限。
 *
 *    为什么扇形求和是对的：把每条边与顶点到扇心的弧看成一个 1-链，
 *      Σᵢ ∂(扇心, vᵢ, vᵢ₊₁) = ∂多边形
 *    （内部弧正负相消）。立体角是 2-链上的线性泛函，因此逐项相加恰好等于
 *    多边形的立体角。这也解释了为什么**非凸多边形不需要特殊处理**：
 *    跑到多边形外面的扇形三角形符号相反，自动抵消。
 *
 * ③ 剩下的唯一近似：**用大圆弧代替椭球测地线的像**作为边界。
 *    椭球上的测地线映射到等积球后并不严格是大圆，我们直接用两端点之间的大圆
 *    连接。由此产生的面积误差随边长增长（大致 ∝ 边长²），实测（以每边细分
 *    800 段的测地线环为参考）：
 *      约 1 km 地块      → 2e-8 相对（0.02 ppm）
 *      1°×1° ≈ 111 km   → 2e-7 相对（0.2 ppm）
 *      10°×10° ≈ 1000 km → 7e-6 相对（7 ppm）
 *    全部远小于民用 GPS 坐标本身的采集误差（2~5 m 的边界点，在 1 km 地块上
 *    就是 0.5% 量级的面积不确定度）。若需要严格椭球面积（Karney 2013 的
 *    多边形积分），那属于法定测量级需求，不在本站范围内 —— 但文档区必须
 *    如实声明这一近似（SR-12）。
 *
 * ------------------------------------------------------------------
 * 符号约定与跨 ±180° 经线
 * ------------------------------------------------------------------
 *
 *   **逆时针（CCW，行进方向的内侧在左手边）为正，顺时针为负。**
 *   SR-03 专属异常②要求「面积为负 → 取绝对值显示，并提示原始绕向」，
 *   即负号 = 顺时针，与本约定一致。
 *
 *   跨 ±180° 经线**天然正确**：面积在三维单位向量空间里算，全程不做任何
 *   经度相减，因此不存在「经度差被算成 358° 而不 2°」的经典陷阱 ——
 *   那个陷阱会让面积变成「整个球面减一小块」。
 *   ⚠️ 但**周长**要经度相减（走 geodesy 的 Vincenty），所以 perimeter 里
 *   必须先把经度差归一化到 (−180, 180]，见 polygonPerimeter 的注释。
 *   自相交判定在等距圆柱平面上做，同样需要先解绕，见 isSelfIntersecting。
 *
 * 已知边界（不抛异常，结果如实返回，由 UI 标注近似性）：
 *   - 面积大于半球（>2πR²）的多边形：扇形剖分仍成立，但个别三角形的立体角
 *     可能落到 atan2 的另一支，结果不可靠。地表地块不会遇到。
 *   - 包含南北极的多边形：等积映射把极点映到球极，公式仍成立；
 *     但自相交判定与周长在这种形状上没有实用意义。
 *
 * 零依赖纯函数（只依赖同目录 geodesy 与 coord/format），可在 vitest 中直接测。
 */

import { DEFAULT_AREA_DIGITS, MAX_DIGITS, stdFixed } from '../coord/format'
import { distanceAndBearing, normalizeLng, WGS84_A, WGS84_F } from './geodesy'

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

/** 一个多边形顶点。字段顺序刻意是 lng 在前 —— 与 route.ts 的 RoutePoint、
 *  与 SR-01 的默认轴序、与 GeoJSON 的 `[lng, lat]` 一致 */
export interface PolyPoint {
  lng: number
  lat: number
}

/**
 * 绕向。
 *
 * 刻意不用 'positive' | 'negative'：那要求用户自己记住符号约定。
 * 'degenerate' 表示面积为 0（点数不足、全部共线、或退化成一条线），
 * 此时「绕向」这个问题本身没有答案，与 T04 的 COMPASS_UNDEFINED 同理。
 */
export type Orientation = 'ccw' | 'cw' | 'degenerate'

export interface PolygonSummary {
  /** 参与计算的顶点数（已去掉与首点重复的闭合点，见 polygonSummary） */
  vertexCount: number
  /**
   * **带符号**面积（平方米）。正 = 逆时针，负 = 顺时针。
   * 顶点不足 3 个时为 0，**不抛异常**（SR-03：提示「无法构成面」，不是错误）
   */
  signedAreaM2: number
  /** 面积绝对值（平方米）。SR-03 专属异常②要求显示绝对值 */
  areaM2: number
  /** 周长（米）= 各边之和 + 回到起点那一边。默认椭球（SR-03） */
  perimeterM: number
  /**
   * 周长计算中是否有边因近对跖点不收敛而回退到球面。
   * true 时 UI 必须标注「已使用球面近似」（SR-12）
   */
  perimeterFellBack: boolean
  /** 质心（球面质心，见 polygonCentroid）。顶点数为 0 时返回 null */
  centroid: PolyPoint | null
  orientation: Orientation
  /**
   * 边界是否自相交（蝴蝶形 / 8 字形）。
   * SR-03 专属异常①：**照常计算并显示结果**，同时给出警告
   */
  selfIntersecting: boolean
}

/* ------------------------------------------------------------------ *
 * 等积球（authalic sphere）常量
 * ------------------------------------------------------------------ */

const PI = Math.PI
const DEG = PI / 180

/** WGS84 第一偏心率的平方 e² = 2f − f² */
const E2 = 2 * WGS84_F - WGS84_F * WGS84_F
/** 第一偏心率 e */
const E = Math.sqrt(E2)

/**
 * Snyder 式 3-12 的 q(φ)，输入是 **sinφ**（不是 φ）——
 * 表达式里只出现 sinφ，传 sin 省一次三角函数，也避免极点的 tan 退化。
 *
 * q(φ) = (1−e²)·[ sinφ/(1−e²sin²φ) − (1/(2e))·ln((1−e·sinφ)/(1+e·sinφ)) ]
 *
 * q 是「从赤道到 φ 的等积柱面面积」的无量纲度量，因此 q(90°) 正好是
 * 半球对应值，q_p = q(90°) 是归一化因子。
 */
function qOf(sinPhi: number): number {
  const s = sinPhi
  const d = 1 - E2 * s * s
  // e < 1 保证 (1±e·s) 恒正，ln 的参数不会越界；s=±1 时 d = 1−e² ≠ 0
  return (1 - E2) * (s / d - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)))
}

/** q(90°)：等积纬线归一化因子 */
const Q_P = qOf(1)

/**
 * WGS84 等积球半径 R_q = a·√(q_p/2) ≈ **6371007.18 m**。
 *
 * 与 SR-03 里 Haversine 用的 6371008.8 m（IUGG 平均半径）**不是同一个量**，
 * 两者差约 1.6 m（2.5e-7 相对）。刻意不共用：
 *   - 6371008.8 m 是「平均半径」，让**长度**误差最小 → 距离用它
 *   - 6371007.18 m 是「等积半径」，让**面积**严格守恒 → 面积用它
 * 用错哪一个，面积就会系统性偏差约 5e-7（一平方公里差 0.5 平方米）。
 * 从 a 与 e² 推导而不是硬编码字面量：换椭球（如 CGCS2000 的微小差异）时
 * 只改 geodesy.ts 的常量，这里自动跟随。
 */
export const AUTHALIC_RADIUS_M = WGS84_A * Math.sqrt(Q_P / 2)

/** 夹到 [−1, 1]。asin / sqrt(1−x²) 的入参在浮点上可能略微越界 */
function clamp1(x: number): number {
  return x > 1 ? 1 : x < -1 ? -1 : x
}

/**
 * sin(等积纬度 β) = q(φ)/q_p。
 *
 * 面积与质心共用的**唯一**核心量。刻意不经 asin 再 sin 地绕一圈：
 * asin 在 ±1 附近导数无穷大，q/q_p 上一个 ULP 的误差会被放大成
 * 1e-8 弧度的纬度误差。直接用 sinβ 与 cosβ = √(1−sin²β) 构造单位向量，
 * 整条面积路径上都不出现 asin。
 */
export function sinAuthalicLatitude(latDeg: number): number {
  // 极点是精确不动点（sinβ = ±1），必须显式返回：
  // qOf(−1) 与 −qOf(1) 在浮点上差一个 ULP（ln(1/x) 与 −ln(x) 的最后一位不同），
  // 这个 ULP 会被 √(1−s²) 放大成约 2e-8 的「cosβ」，
  // 使极点点偏离真正的极点约 13 cm —— 八分之一球面积的相对精度当场从
  // 1e-16 掉到 1e-9 量级（tests/unit/polygon.spec.ts 有这条断言）
  if (latDeg >= 90) return 1
  if (latDeg <= -90) return -1
  return clamp1(qOf(Math.sin(latDeg * DEG)) / Q_P)
}

/**
 * 大地纬度 → 等积纬度（authalic latitude，单位：度）。
 *
 * 定义：sin β = q(φ)/q_p。这是**等积**映射，即椭球上 φ₁~φ₂ 的纬带面积
 * 与球上 β₁~β₂ 的纬带面积严格相等 —— 这是本文件面积算法成立的唯一前提。
 *
 * β 与 φ 的差在 45° 附近最大，约 0.128°（≈14 km），比扁率本身
 * （f·a ≈ 21 km 的半径差）还要显眼，所以「直接把大地纬度当等积纬度用」
 * 是错的，会引入约 0.3% 的面积偏差 —— 正好是「用平均半径的球 + 大地纬度」
 * 相对真实椭球面积的那个系统偏差量级。
 */
export function authalicLatitude(latDeg: number): number {
  return Math.asin(sinAuthalicLatitude(latDeg)) / DEG
}

/**
 * 等积纬度 → 大地纬度（authalicLatitude 的逆变换）。
 *
 * 为什么必须显式逆变换：面积在等积球上算完之后，**质心**这个输出量
 * 是要给用户看的经纬度。直接把球面纬度的 asin 结果当成大地纬度报出去，
 * 会带来最大约 0.19°（≈21 km）的系统偏差 —— 而界面按 SR-02 显示 8 位小数，
 * 用户完全看不出这个值是错的。
 *
 * 用牛顿迭代解 q(φ) = q_p·sinβ，而不是 Snyder 式 3-18 的级数展开：
 *   - 导数 dq/dφ = 2(1−e²)cosφ/(1−e²sin²φ)² 是闭式的，一步就收敛到机器精度
 *   - 与 authalicLatitude 共用同一个 qOf，两条路径不会因为「级数截断项
 *     少写一项」而在高纬度悄悄分叉（这类 bug 只会出现在某一个纬度带上，
 *     极难发现）
 * 初值取 β 本身（两者最大只差 0.19°），4 次以内必然收敛。
 */
export function geodeticFromAuthalic(betaDeg: number): number {
  const b = betaDeg * DEG
  // 极点：cosβ = 0 使牛顿导数为 0，会除零。极点本来就是精确不动点，直接返回
  if (Math.abs(Math.abs(betaDeg) - 90) < 1e-12) return betaDeg

  const target = Q_P * Math.sin(b)
  let phi = b

  for (let i = 0; i < 20; i++) {
    const s = Math.sin(phi)
    const d = 1 - E2 * s * s
    const f = qOf(s) - target
    const df = (2 * (1 - E2) * Math.cos(phi)) / (d * d)
    // df 为 0 只可能出现在 φ = ±90°，而 target = ±q_p 时上面已经返回过了
    if (df === 0) break
    const step = f / df
    phi -= step
    if (Math.abs(step) < 1e-14) break
  }

  return phi / DEG
}

/* ------------------------------------------------------------------ *
 * 三维单位向量小工具
 * ------------------------------------------------------------------ */

type Vec3 = readonly [number, number, number]

/**
 * 顶点 → 等积球面上的单位向量。
 *
 * cosβ 用 √(1−sin²β) 取正根，不用 cos(asin(x))：β ∈ [−90°, 90°] 恒有
 * cosβ ≥ 0，直接开方省一次三角函数，也避开 asin 在极点附近的病态放大。
 */
function toVector(p: PolyPoint): Vec3 {
  const s = sinAuthalicLatitude(p.lat)
  const c = Math.sqrt(Math.max(0, 1 - s * s))
  const lambda = p.lng * DEG
  return [c * Math.cos(lambda), c * Math.sin(lambda), s]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k]
}

/** 归一化；模长过小时返回 undefined（调用方需要退化兜底） */
function normalize(a: Vec3): Vec3 | undefined {
  const n = Math.sqrt(dot(a, a))
  // 1e-12 而不是 0：两个近乎对跖的顶点相加会得到一个模长 ~1e-16 的向量，
  // 除以它会把浮点噪声放大成一个方向随机的「单位向量」
  if (!Number.isFinite(n) || n < 1e-12) return undefined
  return scale(a, 1 / n)
}

/**
 * 单位向量（等积球空间）→ 经纬度（度，大地纬度）。
 *
 * ⚠️ asin(z) 得到的是**等积纬度 β**，不是用户要的纬度。必须再过一次
 * geodeticFromAuthalic 逆变换 —— 两者最大差约 0.19°（≈21 km），
 * 而界面按 SR-02 显示 8 位小数，直接报 β 会是一个「看起来很精确的错值」。
 *
 * 与 toVector 构成精确互逆（tests/unit/polygon.spec.ts 有往返用例）。
 */
function fromVector(v: Vec3): PolyPoint {
  // asin 的参数要夹取，浮点误差可能让 |z| 略大于 1
  const beta = Math.asin(Math.min(1, Math.max(-1, v[2]))) / DEG
  return { lng: Math.atan2(v[1], v[0]) / DEG, lat: geodeticFromAuthalic(beta) }
}

/* ------------------------------------------------------------------ *
 * 球面过剩：带符号立体角
 * ------------------------------------------------------------------ */

/**
 * 球面三角形 (a,b,c) 的**带符号**立体角（球面度）。
 *
 * Van Oosterom & Strackee, "The Solid Angle of a Plane Triangle",
 * IEEE Trans. Biomed. Eng. 30(2), 1983：
 *   tan(Ω/2) = a·(b×c) / (|a||b||c| + (a·b)|c| + (b·c)|a| + (c·a)|b|)
 * 三个向量都是单位向量时分母退化成 1 + a·b + b·c + c·a。
 *
 * 用 2·atan2(num, den) 而不是 2·atan(num/den)：
 *   den 可能为负（三角形大于半球时），atan 会把结果折叠到错误的象限，
 *   atan2 直接给出 (−2π, 2π] 的正确值，不需要任何分支判断。
 *
 * 符号：a→b→c 逆时针（从球外看）为正。这正是 Girard 定理
 * 「球面三角形面积 = R²(三角和 − π)」的带符号形式 —— 三角和减 π 就是
 * **球面过剩**（spherical excess）。
 */
function solidAngle(a: Vec3, b: Vec3, c: Vec3): number {
  const num = dot(a, cross(b, c))
  const den = 1 + dot(a, b) + dot(b, c) + dot(c, a)
  return 2 * Math.atan2(num, den)
}

/**
 * 扇心（fan apex）：所有扇形三角形共用的那个顶点。
 *
 * 用「顶点向量的归一化均值」而不是第一个顶点：
 *   - 均值方向大致落在多边形内部，于是每个扇形三角形都很小，
 *     立体角远离 atan2 的 ±π 折叠边界，数值上最稳
 *   - 取第一个顶点时，跨半球的大多边形会产生几个接近半球的扇形三角形
 * 均值模长过小（顶点分布近乎对称，例如覆盖全球的网格）时退回 v₀ ——
 * 此时任何扇心都一样不可靠，退化的选择不会让结果更差。
 *
 * ⚠️ 扇心在不在多边形内部**都不影响结果**：外部的扇形三角形符号相反，
 * 求和时自动抵消（见文件头的 1-链论证）。所以这里不必做点在多边形内判定。
 */
function fanApex(vs: readonly Vec3[]): Vec3 {
  let acc: Vec3 = [0, 0, 0]
  for (const v of vs) acc = add(acc, v)
  return normalize(acc) ?? vs[0]
}

/**
 * 带符号球面面积（平方米）。正 = 逆时针，负 = 顺时针。
 *
 * 顶点不足 3 个时返回 0（SR-03：这是「无法构成面」的提示，不是错误，
 * 所以不抛异常）。
 *
 * 面积 = R_q² · Σᵢ Ω(扇心, vᵢ, vᵢ₊₁)
 */
export function signedAreaM2(points: readonly PolyPoint[]): number {
  if (points.length < 3) return 0

  // 等积映射：先把大地纬度换成 sinβ，再取单位向量。
  // 之后全部在三维空间里算，不再碰经纬度 —— 这就是跨 ±180° 经线
  // 天然正确的原因
  const vs = points.map(toVector)
  const apex = fanApex(vs)

  let omega = 0
  for (let i = 0; i < vs.length; i++) {
    omega += solidAngle(apex, vs[i], vs[(i + 1) % vs.length])
  }

  return omega * AUTHALIC_RADIUS_M * AUTHALIC_RADIUS_M
}

/** 由带符号面积得出绕向。0 归到 'degenerate'，不猜成逆时针 */
export function orientationOf(signedArea: number): Orientation {
  if (signedArea > 0) return 'ccw'
  if (signedArea < 0) return 'cw'
  return 'degenerate'
}

/* ------------------------------------------------------------------ *
 * 周长
 * ------------------------------------------------------------------ */

/**
 * 周长（米）：逐边累加，含「最后一个顶点回到第一个顶点」那条闭合边。
 *
 * 走 geodesy 的 distanceAndBearing（默认 WGS84 椭球 Vincenty 反算，
 * 与 SR-03 一致）。⚠️ 不在等积球上量长度：等积映射只保证**面积**守恒，
 * 它的长度是失真的（赤道方向偏长、极地方向偏短），拿它算周长会引入
 * 千分之几的系统误差。面积用等积球、长度用椭球，两者各司其职。
 *
 * ⚠️ 经度差必须先归一化到 (−180, 180]：Vincenty 的迭代初值取
 * L = (λ₂ − λ₁)，从 179°E 到 179°W 的 L 是 −358°，迭代会收敛到
 * 「绕地球另一圈」的长路径上，周长直接多出四万公里。
 * 做法是把终点经度改写成「起点经度 + 归一化后的经度差」，
 * 这不改变终点的位置，只改变喂给算法的数值。
 */
export function polygonPerimeter(points: readonly PolyPoint[]): {
  meters: number
  fellBack: boolean
} {
  if (points.length < 2) return { meters: 0, fellBack: false }

  let meters = 0
  let fellBack = false

  for (let i = 0; i < points.length; i++) {
    const from = points[i]
    const to = points[(i + 1) % points.length]
    const r = distanceAndBearing(from.lat, from.lng, to.lat, from.lng + normalizeLng(to.lng - from.lng))
    meters += r.distance
    if (r.model === 'sphere') fellBack = true
  }

  return { meters, fellBack }
}

/* ------------------------------------------------------------------ *
 * 质心
 * ------------------------------------------------------------------ */

/**
 * 质心（**面积质心**，不是顶点平均）。
 *
 * 定义：使 ∫(r − c)dA = 0 的那个点，即区域在真实面积权重下的重心。
 * 对地块来说这才是「中心」的正确含义 —— 顶点平均会被一个拉长的尖角
 * 拽到区域外面去。
 *
 * 算法分三步：
 *
 * ① **把每条大圆弧细分成足够短的子段**（densifyForCentroid）。
 *    原因见 ②：下一步要把边界当成 (λ, sinβ) 平面上的**直线**处理，
 *    而大圆弧的像在该平面上是弯的，矢高约 L²/(8R)。
 *    细分到每段 ≤5 km 后矢高 <0.5 m，质心误差因此**与多边形大小无关**
 *    （不细分的话，100 km 尺度的方块会偏出上百米，而界面按 SR-02
 *    显示 8 位小数 —— 那就是一个「看起来很精确的错值」）。
 *
 * ② **在 (λ, sinβ) 平面上用鞋带公式求质心**。关键洞察是这个平面上的
 *    面积元是**均匀**的：
 *      dA = R_q²·cosβ dβ dλ = R_q²·d(sinβ) dλ
 *    即椭球上任何区域的面积 = R_q² × 它在 (λ, sinβ) 平面像的面积，
 *    且密度处处相同。于是平面多边形质心的经典公式
 *      c_x = Σ(xᵢ+xᵢ₊₁)·crossᵢ / (3·Σcrossᵢ)
 *    直接就是精确的面积质心，不需要任何球面积分。
 *
 * ③ **sinβ 反解回大地纬度**（geodeticFromAuthalic），经度解绕回 (−180,180]。
 *
 * 🔑 为什么**不用**「扇形三角剖分 + 顶点向量均值加权」这个看起来更自然的做法：
 *    顶点向量均值不等于球面三角形的面积质心，两者相差 O((L/R)²)·L
 *    （实测 111 km 方块偏约 15 m）；而它至少还落在正确的区域模型上。
 *    鞋带公式本身精度更高，配合 ① 的细分才是这里的最优组合。
 *
 * 精度与适用范围：
 *   - **与「所报面积对应的那个区域」的严格质心相差 <1 cm，且与多边形大小无关**
 *     （由 ① 的自适应细分保证）。注意这与**面积**的误差来源不同：
 *     面积用精确立体角公式，不需要细分。
 *   - 本定义与另一种常见定义「面积加权的平均纬度」在大地块上并不相同：
 *     1°×1°（约 111 km）的方块两者相差约 65 m，1 km 地块上则一致到毫米。
 *     选等积平面质心的理由是它**恰好**是本工具所报面积那个区域的质心
 *     ——两者描述同一个图形，不会出现「面积是一个区域的、质心是另一个区域的」。
 *   - 经度按相邻点增量解绕，因此跨 ±180° 经线、甚至跨度超过 180° 的
 *     多边形都正确（细分后相邻点相距 ≤5 km，增量解绕不会走错方向）。
 *   - 面积退化为 0（点数不足 / 全共线）时鞋带分母为 0，
 *     退回「(λ, sinβ) 平面上的顶点平均」—— 退化了也要给个可解释的值，
 *     不抛异常、不返回 null（SR-03：不构成面是提示，不是错误）。
 *   - 含极点的多边形要小心：极点在 (λ, sinβ) 平面上被「拉成一条线」
 *     （所有经度都映到 sinβ = 1），鞋带公式会自动把这条退化边算进去，
 *     结果仍然正确 —— 八分之一球三角形（0,0)→(0,90)→(90,0) 的质心
 *     正是矩形像的质心 (45°, sinβ = 1/2)，tests 里有这条闭式解断言。
 *   - 跨半球的多边形，面积质心可能落在区域之外，这是数学事实而非 bug。
 *
 * 空数组返回 null（不是 (0,0) —— 那会被误读成几内亚湾的一个真实坐标）。
 */
export function polygonCentroid(points: readonly PolyPoint[]): PolyPoint | null {
  if (points.length === 0) return null
  if (points.length === 1) return { lng: points[0].lng, lat: points[0].lat }

  if (points.length === 2) {
    // 两个点没有面积，「面积质心」无定义。取大圆中点 ——
    // 这是唯一有几何意义的答案，也与用户「两点之间」的直觉一致
    const m = normalize(add(toVector(points[0]), toVector(points[1])))
    return m ? fromVector(m) : null
  }

  const vs = densifyForCentroid(points.map(toVector))

  // 增量解绕：相邻点相距 ≤5 km，经度差永远远小于 180°，
  // 因此「相对上一点归一化」不会把边劈到地球另一侧。
  // ⚠️ 必须用 wrapPi 而不是 `% 2π`：prev 是**累计**经度，走完一圈地球后
  // 会达到 ±2π 以上，`(x + 3π) % 2π - π` 这种写法在 x 很负时给出负余数，
  // 解绕当场失效
  const xs: number[] = []
  const ys: number[] = []
  let prev = Math.atan2(vs[0][1], vs[0][0])
  for (const v of vs) {
    const raw = Math.atan2(v[1], v[0])
    prev += wrapPi(raw - prev)
    xs.push(prev)
    ys.push(v[2]) // v[2] 就是 sinβ
  }

  let twiceArea = 0 // Σ crossᵢ，带符号
  let mx = 0
  let my = 0
  let sumX = 0
  let sumY = 0

  for (let i = 0; i < xs.length; i++) {
    const j = (i + 1) % xs.length
    const cross = xs[i] * ys[j] - xs[j] * ys[i]
    twiceArea += cross
    mx += (xs[i] + xs[j]) * cross
    my += (ys[i] + ys[j]) * cross
    sumX += xs[i]
    sumY += ys[i]
  }

  // 1e-14 而不是 0：退化环的 twiceArea 是若干个几乎相消的量之和，
  // 浮点残差通常在 1e-17 量级，用它当分母会把噪声放大成一个随机方向
  const degenerate = Math.abs(twiceArea) < 1e-14
  const cx = degenerate ? sumX / xs.length : mx / (3 * twiceArea)
  const cy = degenerate ? sumY / ys.length : my / (3 * twiceArea)

  // cy 是 sinβ，可能因浮点残差略微越界，asin 前必须夹取
  return { lng: normalizeLng(cx / DEG), lat: geodeticFromAuthalic(Math.asin(clamp1(cy)) / DEG) }
}

/** 质心细分的目标子段圆心角：5 km 对应的角度，矢高 <0.5 m */
const CENTROID_SUBTEND = 5000 / AUTHALIC_RADIUS_M

/**
 * 细分后的点数上限。
 *
 * 正常输入用不到：1000 个顶点、周长约 1000 km 的多边形细分后是 200 点。
 * 上限只为兜住病态输入（上万个顶点两两横跨半个地球，周长上千万公里）——
 * 那时按总周长等比放宽子段长度，质心精度随之下降，但页面不会卡死
 * （SR-12：INP < 200ms）。
 */
const MAX_CENTROID_POINTS = 200_000

/**
 * 沿大圆把每条边细分到 ≤CENTROID_SUBTEND 的圆心角。
 *
 * 用 slerp（球面线性插值）而不是在经纬度上线性插值：后者得到的点
 * 不在大圆上，会把边界从「球面 excess 模型」偷偷换成另一种模型，
 * 质心与面积就不再描述同一个区域了。
 */
function densifyForCentroid(vs: readonly Vec3[]): Vec3[] {
  let total = 0
  const angles: number[] = []
  for (let i = 0; i < vs.length; i++) {
    // acos 的入参夹取：两个几乎重合的点会得到 1.0000000000000002 → NaN
    const a = Math.acos(clamp1(dot(vs[i], vs[(i + 1) % vs.length])))
    angles.push(a)
    total += a
  }

  // 病态输入时按总长等比放宽，保证点数不超过上限
  const target = Math.max(CENTROID_SUBTEND, total / MAX_CENTROID_POINTS)

  const out: Vec3[] = []
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i]
    const b = vs[(i + 1) % vs.length]
    out.push(a)
    const k = Math.min(MAX_CENTROID_POINTS, Math.max(1, Math.ceil(angles[i] / target)))
    for (let j = 1; j < k; j++) out.push(slerp(a, b, j / k, angles[i]))
  }
  return out
}

/** 归一化到 (−π, π]。与 geodesy.normalizeLng 同一件事，只是弧度制 */
function wrapPi(rad: number): number {
  return rad - 2 * PI * Math.round(rad / (2 * PI))
}

/**
 * 球面线性插值：单位向量 a→b 之间大圆弧上 t 处（t ∈ [0,1]）的点。
 *
 * θ 极小时 slerp 的 sinθ 分母会放大浮点误差（0/0），
 * 此时退化为直线插值 + 归一化 —— 两者在 θ→0 时一致到 O(θ²)。
 *
 * 返回值不再归一化：sin((1−t)θ)a + sin(tθ)b 的模长与 1 相差 <1e-16，
 * 而调用方只用它的 atan2（比值，与模长无关）与 z 分量（即 sinβ），
 * 多一次 sqrt 只是白费。
 */
function slerp(a: Vec3, b: Vec3, t: number, theta: number): Vec3 {
  if (theta < 1e-9) return normalize(add(scale(a, 1 - t), scale(b, t))) ?? a
  const s = Math.sin(theta)
  const wa = Math.sin((1 - t) * theta) / s
  const wb = Math.sin(t * theta) / s
  return add(scale(a, wa), scale(b, wb))
}

/* ------------------------------------------------------------------ *
 * 自相交判定
 * ------------------------------------------------------------------ */

/**
 * 平面叉积 (b−a)×(c−a)，单位是「度²」。
 * 只在等距圆柱投影平面上用，因此不涉及任何球面量。
 */
function cross2(a: PolyPoint, b: PolyPoint, c: PolyPoint): number {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng)
}

/** 共线前提下，p 是否落在线段 ab 的包围盒内 */
function onSegment(a: PolyPoint, b: PolyPoint, p: PolyPoint): boolean {
  return (
    p.lng >= Math.min(a.lng, b.lng) - EPS &&
    p.lng <= Math.max(a.lng, b.lng) + EPS &&
    p.lat >= Math.min(a.lat, b.lat) - EPS &&
    p.lat <= Math.max(a.lat, b.lat) + EPS
  )
}

/**
 * 共线判定的容差（度²）。
 *
 * 叉积是「度²」量纲：两条各长 1° 的垂直边叉积约为 1。1e-12 度² 对应的
 * 空间尺度远小于任何真实坐标的有效位数，既不会把正常的相交漏掉，
 * 也不会因为浮点噪声把「几乎共线」误判成「正好共线」。
 */
const EPS = 1e-12

/**
 * 两条线段是否相交（含端点接触）。
 *
 * 标准的双叉积符号法：两条边「跨立」彼此才算正常相交；
 * 叉积为 0 时是共线或端点落在另一条边上，用包围盒判定是否真的接触。
 *
 * ⚠️ 端点接触也算自相交：调用方已经排除了「相邻边共享顶点」这一种
 * 合法接触，剩下的端点接触都意味着边界回到了自己身上
 * （例如一个「8」字的交叉点、或重复粘贴了同一个顶点），
 * 正是 SR-03 专属异常①要警告的情况。
 */
function segmentsIntersect(a: PolyPoint, b: PolyPoint, c: PolyPoint, d: PolyPoint): boolean {
  const d1 = cross2(c, d, a)
  const d2 = cross2(c, d, b)
  const d3 = cross2(a, b, c)
  const d4 = cross2(a, b, d)

  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
      ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true
  }

  // 共线 / 端点接触分支
  if (Math.abs(d1) <= EPS && onSegment(c, d, a)) return true
  if (Math.abs(d2) <= EPS && onSegment(c, d, b)) return true
  if (Math.abs(d3) <= EPS && onSegment(a, b, c)) return true
  if (Math.abs(d4) <= EPS && onSegment(a, b, d)) return true

  return false
}

/**
 * 自相交判定：O(n²) 逐对检查所有**非相邻**边。
 *
 * 为什么在**等距圆柱（equirectangular）投影平面**上判定，而不是在球面上：
 *   球面线段相交判定要处理大圆弧、极点、对跖点，代码量与出错面都大得多；
 *   而「两条边是否交叉」是**拓扑**性质，只要投影不把不相交的边变相交，
 *   平面判定的结论就与球面一致。等距圆柱在经度方向按 cosφ 拉伸，
 *   拉伸是**逐纬度单调**的连续变形，不会让两条本来分开的边交叉。
 *
 * 这个近似的适用边界（必须在文档区如实声明，SR-12）：
 *   ① 经度方向的拉伸使高纬度地块「看起来更宽」。若两条边在球面上
 *      以极小的间距擦过（间距与投影畸变同量级，即 <1e-6 度），
 *      平面判定可能与球面结论不同。这种输入本身就是数据错误。
 *   ② 跨度超过 180° 经度的多边形无法用「相对首顶点解绕」展开成一个
 *      连续平面图形，判定结果无意义。地表地块不会遇到。
 *   ③ 含极点的多边形同理。
 *
 * 复杂度：n 个顶点 → n(n−3)/2 对边。粘贴几千个顶点时这是几十万次
 * 叉积，仍是毫秒级；组件层的 300ms 防抖足以吸收（SR-12 INP < 200ms）。
 * 不做 Bentley–Ottmann 扫描线：那是 O(n log n)，但要多维护一个事件队列，
 * 对本工具的输入规模是过度设计。
 */
export function isSelfIntersecting(points: readonly PolyPoint[]): boolean {
  const n = points.length
  if (n < 4) return false // 三角形在球面/平面上都不可能自相交（边数 <4）

  // 经度解绕：以首顶点为基准把每一点的经度差归一化到 (−180, 180]，
  // 这样跨 ±180° 经线的多边形在平面上是连续的，
  // 不会出现「从 179° 画一条横穿全球的边到 −179°」的假相交
  const base = points[0].lng
  const flat = points.map((p) => ({ lng: base + normalizeLng(p.lng - base), lat: p.lat }))

  for (let i = 0; i < n; i++) {
    const a = flat[i]
    const b = flat[(i + 1) % n]
    for (let j = i + 2; j < n; j++) {
      // 第一条边与最后一条边共享顶点 0，属于相邻边，跳过
      if (i === 0 && j === n - 1) continue
      const c = flat[j]
      const d = flat[(j + 1) % n]
      if (segmentsIntersect(a, b, c, d)) return true
    }
  }

  return false
}

/* ------------------------------------------------------------------ *
 * 主入口
 * ------------------------------------------------------------------ */

/**
 * 一串顶点 → 面积 / 周长 / 质心 / 绕向 / 自相交。
 *
 * 与 route.ts 的 routeSegments 同样的两条纪律：
 *   - **不排序、不去重**：用户给的顺序就是边界顺序，擅自按经度排序会把
 *     一个凹地块改成自相交的蝴蝶形（SR-01 不静默改写用户输入）
 *   - **点数不足不抛异常**：返回 areaM2 = 0 与 vertexCount，
 *     由组件显示「顶点不足 3 个，无法构成面」（SR-03）
 *
 * 唯一的例外是**首尾重复的闭合点**：GeoJSON / KML / WKT 的环一律显式重复
 * 第一个顶点。不处理的话顶点数会多报一个、闭合边长度算成 0
 * （无害但难看），而且用户看不出为什么「我粘了 5 个点它说有 5 个顶点，
 * 可地图上只有 4 个角」。组件会把这件事显示成一条提示，不是静默丢弃。
 */
export function polygonSummary(points: readonly PolyPoint[], closeRing = true): PolygonSummary {
  const ring = closeRing ? dropClosingPoint(points) : [...points]

  const signed = signedAreaM2(ring)
  const peri = polygonPerimeter(ring)

  return {
    vertexCount: ring.length,
    signedAreaM2: signed,
    // SR-03 专属异常②：面积为负（顺时针）→ 取绝对值显示，并提示原始绕向。
    // 绕向本身由 orientation 字段如实保留，不丢信息
    areaM2: Math.abs(signed),
    perimeterM: peri.meters,
    perimeterFellBack: peri.fellBack,
    centroid: polygonCentroid(ring),
    orientation: orientationOf(signed),
    selfIntersecting: isSelfIntersecting(ring)
  }
}

/**
 * 去掉「与首点完全相同的末点」。
 *
 * 用**严格相等**而不是「距离小于某个阈值」：相距几厘米的两个点是用户
 * 有意给出的两个顶点，替他合并等于改写输入（SR-01）。GeoJSON 的闭合点
 * 是逐位复制的，严格相等足够识别。
 */
export function dropClosingPoint(points: readonly PolyPoint[]): PolyPoint[] {
  if (points.length < 2) return [...points]
  const first = points[0]
  const last = points[points.length - 1]
  if (first.lng === last.lng && first.lat === last.lat) return points.slice(0, -1)
  return [...points]
}

/* ------------------------------------------------------------------ *
 * 显示精度
 * ------------------------------------------------------------------ */

/**
 * 面积的小数位数。
 *
 * SR-02 规定面积 2 位小数，那是按「平方米 / 公顷」的量级定的。
 * 换算到平方千米、平方英里之后同一个面积的数值可能远小于 1
 * （1234 ㎡ = 0.001234 km²），仍用 2 位就只剩 `0.00` —— 用户会以为
 * 这个单位没有值。因此数值 <1 时按「至少三位有效数字」补位，
 * 上限是 SR-02 允许的 12 位。
 *
 * 与 T04 的 digitsFor 同一思路，只是这里跨度更大：面积单位的最大最小
 * 相差 1e10（cm² ↔ km²），长度单位只差 1e5。
 */
export function areaDisplayDigits(v: number): number {
  const a = Math.abs(v)
  if (!Number.isFinite(v) || a === 0) return DEFAULT_AREA_DIGITS
  if (a >= 1) return DEFAULT_AREA_DIGITS
  // ceil(−log10(a)) = 小数点后需要跨过多少个零才到第一位有效数字，
  // 再 +2 位保证共三位有效数字（例如 a=1.234e-6 → 6+2 = 8 位）
  return Math.min(MAX_DIGITS, DEFAULT_AREA_DIGITS + Math.ceil(-Math.log10(a)) + 1)
}

/* ------------------------------------------------------------------ *
 * CSV 序列化（FR-04 结果导出 / SR-11 标准数值形态）
 * ------------------------------------------------------------------ */

/**
 * CSV 表头。
 *
 * ⚠️ 固定 ASCII 英文，**不随语言变化**（与 ROUTE_CSV_HEADER 同一条理由）：
 * SR-11 规定「界面预览可本地化，文件内容不可」。表头一旦本地化，
 * 同一份面积在中文版与英文版导出的列名就不同，下游脚本无法通用。
 *
 * 导出的是「单位 → 面积」而不是顶点表：
 *   - SR-03 的输出定义就是「全部单位的等值面积」，这才是用户要粘进
 *     Excel 的东西
 *   - 顶点是**输入**，本来就在文本框里，也已经由分享链接承载，
 *     再导出一份只是复制粘贴的负担
 *   - 单位代号（m2 / ha / mu / tsubo…）是 ASCII 标识符，与 SR-03_PARAMS
 *     里的 `u` 取值同源，跨语言、跨版本都稳定（SR-10）
 */
export const AREA_CSV_HEADER = ['unit', 'area'] as const

/** 导出与复制用的默认小数位。与 SR-02 的面积精度一致 */
export const AREA_CSV_DIGITS = DEFAULT_AREA_DIGITS

/**
 * 「单位 → 面积」表 → CSV 文本（不含 BOM）。
 *
 * 与 routeCsv 相同的三个刻意设计：
 *
 * ① **行尾 CRLF**。RFC 4180 要求；更实际的原因是 Excel for Windows
 *    粘贴只含 LF 的文本时会把整段塞进一个单元格。
 *
 * ② **不做字段转义**。第一列是 ASCII 单位代号，第二列是 stdFixed 产出的
 *    纯数字，既不含逗号也不含引号，转义逻辑只会是死代码。
 *    这也是 SR-11「坐标/数值不得再含逗号」在实现上的保证：
 *    stdFixed 永远输出句点小数点、永不分组。
 *
 * ③ **不追加 total / summary 行**。周长、质心、顶点数与「单位 → 面积」
 *    不是同一种形状，硬塞进同一张表会破坏矩形结构，
 *    pandas / Excel 读取时得多写一步过滤（与 routeCsv 不加 total 行同理）。
 *    这些量由各自的复制按钮单独提供。
 *
 * @param values  单位 → 面积（数值，未格式化），通常来自 units.allAreas
 * @param units   要导出的单位与**行顺序**，由调用方决定（默认单位在前）
 * @param digitsOf 每个数值的小数位数，默认 areaDisplayDigits（见其说明）
 */
export function areaCsv(
  values: Record<string, number>,
  units: readonly string[],
  digitsOf: (v: number) => number = areaDisplayDigits
): string {
  const rows = units.map((u) => `${u},${stdFixed(values[u], digitsOf(values[u]))}`)
  return [AREA_CSV_HEADER.join(','), ...rows].join('\r\n')
}
