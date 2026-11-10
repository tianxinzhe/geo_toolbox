/**
 * 大地测量：距离、方位角、正算（PRD SR-03「距离算法」）
 *
 * ⚠️ 与技术方案的偏离：方案 1 章选用 `geodesy`（chrisveness）npm 包，
 * 理由是「自研算法易错」。实测后改为自研，原因有三：
 *   ① geodesy@1.1.3 是 CommonJS、无类型声明，在本项目的
 *      strict TS + ESM + Vite 环境下需要额外的 interop 与 .d.ts 补丁
 *   ② 本项目只用得到 Vincenty 反算/正算两个函数，整包引入不划算
 *   ③ PRD 6.1 已给出实算的参考值（北京 554.93 m），可直接做黄金测试
 *      —— 「算法易错」的风险由测试兜住，而不是由依赖兜住
 *
 * 参考：Thaddeus Vincenty, 1975, "Direct and Inverse Solutions of Geodesics
 * on the Ellipsoid with Application of Nested Equations", Survey Review 23(176).
 *
 * 本文件是**零依赖纯函数**，可在 Node（vitest）与浏览器中同样运行。
 */

/* ------------------------------------------------------------------ *
 * 椭球常量（SR-03）
 * ------------------------------------------------------------------ */

/** WGS84 长半轴 a = 6378137.0 m */
export const WGS84_A = 6378137.0
/** WGS84 扁率倒数 1/f = 298.257223563 */
export const WGS84_F_INV = 298.257223563
/** WGS84 扁率 f */
export const WGS84_F = 1 / WGS84_F_INV
/** WGS84 短半轴 b = (1 − f)·a */
export const WGS84_B = (1 - WGS84_F) * WGS84_A

/** SR-03：球面模型（Haversine）的球半径取 6371008.8 m */
export const SPHERE_R = 6371008.8

const PI = Math.PI
const DEG = PI / 180

/* ------------------------------------------------------------------ *
 * 结果类型
 * ------------------------------------------------------------------ */

export interface VincentyInverse {
  /** 地表距离（米） */
  distance: number
  /** 正向方位角（度，0~360，正北为 0，顺时针） */
  initialBearing: number
  /**
   * 反向方位角（度，0~360）：站在终点**回望起点**的方向。
   *
   * ⚠️ 不是 Vincenty 原论文的 α2（到达终点时的前进方向），而是 α2 + 180°。
   * 两个模型必须给出同一语义，否则近对跖点回退到球面时结果会突变 180°，
   * 让人朝完全相反的方向走。PRD T04 要的「反向方位角」就是这个回望方向。
   */
  finalBearing: number
  /** 迭代次数，用于诊断 */
  iterations: number
}

/* ------------------------------------------------------------------ *
 * Vincenty 反算：两点 → 距离与方位角
 * ------------------------------------------------------------------ */

/**
 * Vincenty 反算。
 *
 * **近对跖点可能不收敛** → 返回 `undefined`，调用方必须回退到球面模型
 * 并在结果中标注「已使用球面近似」（PRD T04 专属异常）。
 * 不抛异常，因为「两点几乎在地球两端」是合法输入而不是错误。
 */
export function vincentyInverse(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): VincentyInverse | undefined {
  const f = WGS84_F
  const a = WGS84_A
  const b = WGS84_B

  // 重合点：距离 0，方位角未定义（PRD T04：显示 0 与「未定义」，不报错）
  if (lat1 === lat2 && lon1 === lon2) {
    return { distance: 0, initialBearing: NaN, finalBearing: NaN, iterations: 0 }
  }

  const L = (lon2 - lon1) * DEG
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * DEG))
  const U2 = Math.atan((1 - f) * Math.tan(lat2 * DEG))
  const sinU1 = Math.sin(U1)
  const cosU1 = Math.cos(U1)
  const sinU2 = Math.sin(U2)
  const cosU2 = Math.cos(U2)

  let lambda = L
  let lambdaPrev: number
  let sinSigma = 0
  let cosSigma = 0
  let sigma = 0
  let sinAlpha = 0
  let cosSqAlpha = 0
  let cos2SigmaM = 0
  let C = 0
  let iterations = 0

  const MAX_ITER = 200
  // 收敛阈值 1e-12 弧度 ≈ 6.4e-6 m，远优于 SR-02 的显示精度
  const TOL = 1e-12

  do {
    const sinLambda = Math.sin(lambda)
    const cosLambda = Math.cos(lambda)

    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2
    )
    // sinSigma === 0 → 两点重合（已在上面处理）或共极，此时公式退化
    if (sinSigma === 0) return undefined

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda
    sigma = Math.atan2(sinSigma, cosSigma)

    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma
    cosSqAlpha = 1 - sinAlpha * sinAlpha

    // 赤道线上 cosSqAlpha === 0，此时 cos2SigmaM 按定义取 0
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0

    C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha))

    lambdaPrev = lambda
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)))
  } while (Math.abs(lambda - lambdaPrev) > TOL && ++iterations < MAX_ITER)

  if (iterations >= MAX_ITER) return undefined // 未收敛（近对跖点）

  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b)
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)))
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)))

  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)))

  const distance = b * A * (sigma - deltaSigma)

  const sinLambda = Math.sin(lambda)
  const cosLambda = Math.cos(lambda)
  const fwd = Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
  const rev = Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda)

  return {
    distance,
    initialBearing: normalize360(fwd / DEG),
    // rev 是 Vincenty 的 α2（到达时的前进方向），+180° 才是「回望起点」，
    // 与接口注释、与 distanceAndBearing 的球面回退分支保持一致
    finalBearing: normalize360(rev / DEG + 180),
    iterations
  }
}

/**
 * Vincenty 正算：起点 + 方位角 + 距离 → 终点。
 * T04 的「按方位角推算目标点」与 T10 的等距圈顶点计算都要用。
 * 不收敛（近对跖点）时返回 undefined。
 *
 * ⚠️ 返回的 `finalBearing` 是 Vincenty 的 α2，即**到达终点时的前进方向**，
 * 与 `VincentyInverse.finalBearing`（回望起点）语义不同 —— 正算的调用方
 * 关心的是「继续往前走该朝哪」，反算的调用方关心的是「回头看来路在哪」。
 * 两者不能互换，改名代价大于收益（正算的字段名沿用参照实现）。
 */
export function vincentyDirect(
  lat1: number,
  lon1: number,
  bearing: number,
  distance: number
): { lat: number; lng: number; finalBearing: number } | undefined {
  const f = WGS84_F
  const a = WGS84_A
  const b = WGS84_B

  if (distance === 0) return { lat: lat1, lng: lon1, finalBearing: normalize360(bearing) }

  const sinAlpha1 = Math.sin(bearing * DEG)
  const cosAlpha1 = Math.cos(bearing * DEG)

  const tanU1 = ((1 - f) * Math.sin(lat1 * DEG)) / Math.cos(lat1 * DEG)
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1)
  const sinU1 = tanU1 * cosU1

  const sigma1 = Math.atan2(tanU1, cosAlpha1)
  const sinAlpha = cosU1 * sinAlpha1
  const cosSqAlpha = 1 - sinAlpha * sinAlpha
  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b)
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)))
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)))

  let sigma = distance / (b * A)
  let sigmaPrev: number
  let sinSigma = 0
  let cosSigma = 0
  let cos2SigmaM = 0
  let iterations = 0

  do {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma)
    sinSigma = Math.sin(sigma)
    cosSigma = Math.cos(sigma)
    const deltaSigma =
      B *
      sinSigma *
      (cos2SigmaM +
        (B / 4) *
          (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
            (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)))
    sigmaPrev = sigma
    sigma = distance / (b * A) + deltaSigma
  } while (Math.abs(sigma - sigmaPrev) > 1e-12 && ++iterations < 200)

  if (iterations >= 200) return undefined

  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1
  const lat2 = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)
  )
  const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1)
  const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha))
  // ⚠️ 这里是**减号**（Vincenty 1975 正算原文 L = λ − (1−C)·f·sinα·{…}）。
  // 反算的迭代式才是 λ = L + (1−C)·f·sinα·{…}，两者符号相反。
  // 写成加号不会报错，只会让经度偏掉两倍修正量 —— 500 km 的东北向路径
  // 上约 1 km，正算→反算闭环立刻对不上。参照实现 chrisveness/geodesy 同为减号。
  const L =
    lambda -
    (1 - C) *
      f *
      sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)))

  const rev = Math.atan2(sinAlpha, -tmp)

  return {
    lat: lat2 / DEG,
    lng: lon1 + L / DEG,
    finalBearing: normalize360(rev / DEG)
  }
}

/* ------------------------------------------------------------------ *
 * 球面模型（Haversine）—— Vincenty 不收敛时的回退
 * ------------------------------------------------------------------ */

/**
 * Haversine 大圆距离（米）。
 *
 * SR-03：球半径取 6371008.8 m（IUGG 平均半径）。
 * 与椭球模型的差异约 0.3%（PRD T04 高级选项中需向用户说明这一点）。
 * 永远收敛，因此是近对跖点的可靠回退。
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = (lat2 - lat1) * DEG
  const dLon = (lon2 - lon1) * DEG
  const s1 = Math.sin(dLat / 2)
  const s2 = Math.sin(dLon / 2)
  const h = s1 * s1 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * s2 * s2
  // asin 的参数夹到 [0,1]，避免浮点误差产生 NaN
  return 2 * SPHERE_R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 球面初始方位角（度，0~360） */
export function sphericalBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = (lon2 - lon1) * DEG
  const y = Math.sin(dLon) * Math.cos(lat2 * DEG)
  const x =
    Math.cos(lat1 * DEG) * Math.sin(lat2 * DEG) -
    Math.sin(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.cos(dLon)
  return normalize360(Math.atan2(y, x) / DEG)
}

/* ------------------------------------------------------------------ *
 * 对外主入口
 * ------------------------------------------------------------------ */

export interface DistanceResult extends VincentyInverse {
  /** 实际使用的模型。'sphere' 表示 Vincenty 未收敛、已回退 */
  model: 'ellipsoid' | 'sphere'
}

/**
 * 距离与方位角 —— T04 的主入口，也是 T01「偏移距离」的来源。
 *
 * 默认椭球（Vincenty）；不收敛时自动回退球面并**在返回值里标注**，
 * 让 UI 能如实显示「已使用球面近似」（PRD T04 专属异常，
 * 也是 SR-12「涉及约/近似的结果必须标注为近似」的要求）。
 */
export function distanceAndBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): DistanceResult {
  const v = vincentyInverse(lat1, lon1, lat2, lon2)
  if (v) return { ...v, model: 'ellipsoid' }

  return {
    distance: haversineDistance(lat1, lon1, lat2, lon2),
    initialBearing: sphericalBearing(lat1, lon1, lat2, lon2),
    // 球面模型下反向方位角 = 正向 ± 180
    finalBearing: normalize360(sphericalBearing(lat2, lon2, lat1, lon1)),
    iterations: 0,
    model: 'sphere'
  }
}

/**
 * 罗盘 16 方位的**索引**（0~15，0 = 北，顺时针）。
 * 文字本地化由 i18n 层负责（SR-11：`NNW` → 日语 `北北西`），
 * 这里只算几何，不返回任何语言相关的字符串。
 */
export function compass16Index(bearing: number): number {
  return Math.round(normalize360(bearing) / 22.5) % 16
}

/** 归一化到 [0, 360) */
export function normalize360(deg: number): number {
  const r = deg % 360
  return r < 0 ? r + 360 : r
}

/** 归一化到 (−180, 180]，用于经度 */
export function normalizeLng(deg: number): number {
  let d = deg
  while (d > 180) d -= 360
  while (d <= -180) d += 360
  return d
}
