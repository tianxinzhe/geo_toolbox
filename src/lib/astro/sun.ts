/**
 * 太阳位置与日出日落（PRD T11「日出日落与太阳位置」）
 *
 * 算法来源：NOAA Solar Calculator（基于 Meeus《Astronomical Algorithms》
 * 的低精度太阳位置公式）。选择它而不是引入 astronomy-engine / suncalc：
 *   ① 本站是纯静态站，任何依赖都要进产物；本工具只用到太阳，整包引入不划算
 *   ② NOAA 方案在 1900–2100 年的日出日落误差约 ±1 分钟，远优于 SR-02 的
 *      「时刻精确到分钟」要求；高纬度曙暮光的误差会放大，但仍有参考价值
 *   ③ 公式全部是闭式，没有迭代、随机与当前时间依赖，可在 Node 与浏览器
 *      得到逐位相同的结果（SR-03「结果一致性」）
 *
 * ------------------------------------------------------------------
 * 时间模型：固定 UTC 偏移，不做夏令时
 * ------------------------------------------------------------------
 *
 * PRD 6.1 / SR-03 明文规定 T11 **不做 DST**：中文、日文、英语区默认视角
 * 对应的三个地区都已废除夏令时，强行做 DST 反而会引入「当天不存在的时间」
 * 「当天出现两次的时间」两类边界问题。因此本文件的所有输入输出都是
 * 「当地标准时的分钟数」，不含任何 Date 对象、时区数据库或 DST 规则：
 *
 *   当地分钟数（0~1440）= 时:分 × 60 + 分，UI 负责格式化成 HH:MM
 *   用户可手动指定非整点偏移（如 +5:30 → 330 分钟）
 *
 * 不返回 Date 是刻意的：Date 在浏览器里只认宿主时区，在 UTC 与本地之间
 * 来回转换正是这类工具最常见的 off-by-one 小时 bug 来源。
 *
 * ------------------------------------------------------------------
 * 算法约定
 * ------------------------------------------------------------------
 *
 * 太阳正午 = 12:00 − 时差方程 − 4 × 经度 + 时区偏移（均为分钟/度）
 * 日出/日落时角 H = acos((cos z − sinφ·sinδ) / (cosφ·cosδ))
 *   cosH > 1 → 太阳终日不升（极夜）；cosH < −1 → 终日不落（极昼）
 * 昼长 = 2H / 15 小时（用官方天顶角 90.833°
 *    = 90° + 34′ 蒙气差 + 16′ 日面半径，即太阳中心在地平线下 0.833°）
 *
 * 太阳高度角**不做**蒙气差修正：除日出日落天顶角已含 0.833° 之外，
 * 其余时刻返回的是几何高度角。低空时真实视高度会高约 0.5°，
 * 对「太阳在哪」的展示无影响，也避免让 UI 误以为做过大气折射模型。
 *
 * 零依赖纯函数，可在 Node（vitest）与浏览器中同样运行。
 */

/* ------------------------------------------------------------------ *
 * 天顶角常量
 * ------------------------------------------------------------------ */

/** NOAA 标准日出/日落天顶角：太阳中心在地平线下 0.833°（蒙气差 + 日面半径） */
export const ZENITH_OFFICIAL = 90.833
/** 民用曙暮光：太阳中心在地平线下 6° */
export const ZENITH_CIVIL = 96
/** 航海曙暮光：太阳中心在地平线下 12° */
export const ZENITH_NAUTICAL = 102
/** 天文曙暮光：太阳中心在地平线下 18° */
export const ZENITH_ASTRONOMICAL = 108

/** PRD T11 的算法有效范围（NOAA / Meeus 公式在 1900–2100 内最可靠） */
const MIN_YEAR = 1900
const MAX_YEAR = 2100

const DEG = Math.PI / 180
const RAD = 180 / Math.PI
const MINUTES_PER_DAY = 1440

/* ------------------------------------------------------------------ *
 * 公开类型
 * ------------------------------------------------------------------ */

/** 日期。month 取 1~12（刻意不用 Date，避免宿主时区干扰） */
export interface CalendarDate {
  year: number
  month: number
  day: number
}

/** 极昼 / 极夜状态。'none' 表示当天有正常的日出与日落 */
export type PolarState = 'none' | 'polarDay' | 'polarNight'

export interface SunTimes {
  /**
   * 太阳正午（当地标准时，分钟）。正常时区下约 720；
   * 若用户指定的时区与经度差得远，可能 <0 或 >1440。
   * 时刻统一不取模，UI 显示时自行 mod 1440。
   */
  solarNoon: number
  /** 日出（当地分钟）。极昼/极夜时为 null */
  sunrise: number | null
  /** 日落（当地分钟）。极昼/极夜时为 null */
  sunset: number | null
  /** 昼长（分钟）。极夜 0、极昼 1440 */
  dayLength: number
  civilDawn: number | null
  civilDusk: number | null
  nauticalDawn: number | null
  nauticalDusk: number | null
  astroDawn: number | null
  astroDusk: number | null
  polar: PolarState
}

export interface SolarPosition {
  /** 太阳高度角（度），地平线以上为正。几何值，未做蒙气差修正 */
  altitude: number
  /** 方位角（度），正北 0，顺时针 [0, 360) */
  azimuth: number
  /** 太阳赤纬（度） */
  declination: number
  /** 时差方程（分钟）。正值表示日晷快于钟表，即太阳正午早于 12:00 */
  equationOfTime: number
}

/* ------------------------------------------------------------------ *
 * 内部：日期 → 儒略日、太阳参数
 * ------------------------------------------------------------------ */

function mod360(deg: number): number {
  const r = deg % 360
  return r < 0 ? r + 360 : r
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

/**
 * 公历日期 → 儒略日（0h UT）。
 *
 * 采用 Fliegel–Van Flandern 整数式而不是 `Date.UTC`：后者会受宿主时区与
 * 历史时区数据库影响，而本站要求「同一输入在任何时间点结果一致」。
 */
function julianDay0(date: CalendarDate): number {
  const a = Math.floor((14 - date.month) / 12)
  const y = date.year + 4800 - a
  const m = date.month + 12 * a - 3
  const jdn =
    date.day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  return jdn - 0.5
}

/** 当地标准时分钟 → 该瞬间的儒略日。跨日不截断，日期自然进位 */
function julianDayAt(date: CalendarDate, minutesLocal: number, tzMinutes: number): number {
  return julianDay0(date) + (minutesLocal - tzMinutes) / MINUTES_PER_DAY
}

interface SolarParams {
  declination: number
  equationOfTime: number
}

/**
 * 给定儒略日，返回太阳赤纬与时差方程（NOAA / Meeus 低精度式）。
 *
 * 与 NOAA 电子表格的差异：表格每天只按 0h UT 算一次，本文按**实际时刻**
 * 计算，跨日与高纬度场景更稳；调用方在求日出日落时先以正午附近时刻取值。
 */
function solarParams(jd: number): SolarParams {
  const T = (jd - 2451545.0) / 36525

  // 太阳几何平黄经（度）
  const L0 = mod360(280.46646 + T * (36000.76983 + T * 0.0003032))
  // 太阳平近点角（度）
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
  // 地球轨道偏心率
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)

  const Mrad = M * DEG
  // 中心差（度）
  const C =
    Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mrad) * 0.000289

  const trueLongitude = L0 + C
  // 黄经章动 + 光行差（低精度式）
  const omega = 125.04 - 1934.136 * T
  const lambda = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * DEG)

  // 平黄赤交角（度）与修正后的真黄赤交角
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * Math.cos(omega * DEG)

  const declination = Math.asin(Math.sin(eps * DEG) * Math.sin(lambda * DEG)) * RAD

  // 时差方程（NOAA 式）：先算弧度形式的无量纲量，×4 分钟/度 得到分钟
  const y = Math.tan((eps * DEG) / 2) ** 2
  const L0rad = L0 * DEG
  const eotRad =
    y * Math.sin(2 * L0rad) -
    2 * e * Math.sin(Mrad) +
    4 * e * y * Math.sin(Mrad) * Math.cos(2 * L0rad) -
    0.5 * y * y * Math.sin(4 * L0rad) -
    1.25 * e * e * Math.sin(2 * Mrad)

  return { declination, equationOfTime: 4 * eotRad * RAD }
}

/**
 * 某天顶角的半日弧时角（度）。
 * 返回 null 表示 cosH 越界：太阳在当天不会穿过该天顶角。
 */
function hourAngle(zenith: number, lat: number, declination: number): number | null {
  const cosH =
    (Math.cos(zenith * DEG) - Math.sin(lat * DEG) * Math.sin(declination * DEG)) /
    (Math.cos(lat * DEG) * Math.cos(declination * DEG))

  // 极点（cosφ = 0）或 δ = ±90° 时会出现 ±Infinity / NaN，一并按「无事件」处理
  if (!Number.isFinite(cosH) || cosH > 1 || cosH < -1) return null
  return Math.acos(cosH) * RAD
}

interface TwilightPair {
  dawn: number | null
  dusk: number | null
}

function twilight(noon: number, zenith: number, lat: number, declination: number): TwilightPair {
  const ha = hourAngle(zenith, lat, declination)
  if (ha === null) return { dawn: null, dusk: null }
  // 每度时角对应 4 分钟
  return { dawn: noon - 4 * ha, dusk: noon + 4 * ha }
}

/* ------------------------------------------------------------------ *
 * 日出日落
 * ------------------------------------------------------------------ */

/**
 * 计算指定日期的日出、日落、正午与三种曙暮光。
 *
 * @param date 当地日期（算法有效范围 1900–2100，见 isSupportedDate）
 * @param lat 纬度（度，北正）
 * @param lng 经度（度，东正）
 * @param tzMinutes 当地固定 UTC 偏移（分钟，东正；允许 330 这类非整点值）
 */
export function sunTimes(
  date: CalendarDate,
  lat: number,
  lng: number,
  tzMinutes: number
): SunTimes {
  // 先用「忽略时差方程」的正午粗估取一组太阳参数，再回代一次。
  // 时差方程日变化约 0.1 分钟、赤纬日变化约 0.4°，回代一次已足够
  const guessNoon = 720 - 4 * lng + tzMinutes
  const first = solarParams(julianDayAt(date, guessNoon, tzMinutes))
  const noon = 720 - 4 * lng - first.equationOfTime + tzMinutes
  const { declination } = solarParams(julianDayAt(date, noon, tzMinutes))

  const official = twilight(noon, ZENITH_OFFICIAL, lat, declination)
  const civil = twilight(noon, ZENITH_CIVIL, lat, declination)
  const nautical = twilight(noon, ZENITH_NAUTICAL, lat, declination)
  const astro = twilight(noon, ZENITH_ASTRONOMICAL, lat, declination)

  // 极昼/极夜：官方天顶角没有交点时，用正午太阳高度角的正负号区分。
  // 「正午高度 > 0」意味着太阳整圈都在地平线以上 → 极昼，反之极夜
  let polar: PolarState = 'none'
  if (official.dawn === null) {
    polar = 90 - Math.abs(lat - declination) > 0 ? 'polarDay' : 'polarNight'
  }

  const dayLength =
    polar === 'polarDay'
      ? MINUTES_PER_DAY
      : polar === 'polarNight'
        ? 0
        : official.dusk! - official.dawn!

  return {
    solarNoon: noon,
    sunrise: official.dawn,
    sunset: official.dusk,
    dayLength,
    civilDawn: civil.dawn,
    civilDusk: civil.dusk,
    nauticalDawn: nautical.dawn,
    nauticalDusk: nautical.dusk,
    astroDawn: astro.dawn,
    astroDusk: astro.dusk,
    polar
  }
}

/* ------------------------------------------------------------------ *
 * 任意时刻的太阳位置
 * ------------------------------------------------------------------ */

/**
 * 计算指定当地标准时刻的太阳位置。
 *
 * @param minutesLocal 当地标准时分钟（可含小数，不要求整点）
 */
export function solarPosition(
  date: CalendarDate,
  minutesLocal: number,
  lat: number,
  lng: number,
  tzMinutes: number
): SolarPosition {
  const { declination, equationOfTime } = solarParams(
    julianDayAt(date, minutesLocal, tzMinutes)
  )

  // 真太阳时（分钟）。取模到 [0, 1440)，跨日不影响时角
  const trueSolarMinutes =
    ((minutesLocal + equationOfTime + 4 * lng - tzMinutes) % MINUTES_PER_DAY +
      MINUTES_PER_DAY) %
    MINUTES_PER_DAY
  // 时角：正午 0，下午为正（向西），上午为负
  const H = trueSolarMinutes / 4 - 180

  const latRad = lat * DEG
  const declRad = declination * DEG
  const hRad = H * DEG

  const sinAlt =
    Math.sin(latRad) * Math.sin(declRad) +
    Math.cos(latRad) * Math.cos(declRad) * Math.cos(hRad)
  // 浮点误差可能让 sin 略超 ±1
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD

  // 方位角：atan2 形式先得到「从南向西为正」的角度，+180° 换成从北顺时针。
  // 用 atan2 而不是 NOAA 表格里的 acos，后者要按 H 的正负分支，边界易错
  const azimuth = normalize360(
    Math.atan2(
      Math.sin(hRad),
      Math.cos(hRad) * Math.sin(latRad) - Math.tan(declRad) * Math.cos(latRad)
    ) * RAD +
      180
  )

  return { altitude, azimuth, declination, equationOfTime }
}

/* ------------------------------------------------------------------ *
 * 辅助
 * ------------------------------------------------------------------ */

/**
 * 按经度推算**理论**时区，返回固定 UTC 偏移（分钟）。
 *
 * 经度 ÷ 15 取整（四舍五入）后夹到 [−12, +14]。这只是地理上的理论时区，
 * **不是官方时区**：现实中的时区边界由国界与行政决定（如中国全境 +8、
 * 西班牙用 +1），PRD T11 要求 UI 在展示时标注「按经度推算，非官方时区」。
 */
export function timezoneFromLongitude(lng: number): number {
  const hours = Math.round(lng / 15)
  return Math.max(-12, Math.min(14, hours)) * 60
}

/**
 * 最佳固定倾角参考值（度）。
 *
 * 采用常用的简化经验式 tilt ≈ |纬度|：让组件全年平均接收的直射分量最大。
 * 更精细的做法会结合当地辐照、散射比例与季节负载，并可能给出
 * |lat| × 0.87 + 修正项 —— 本工具不需要那个复杂度。
 *
 * ⚠️ 仅为**经验参考**：实际安装还需考虑辐照数据、遮挡、积雪、屋顶坡度与
 * 并网收益，不能据此直接施工（PRD T11 要求文档区同样说明）。
 */
export function bestFixedTilt(lat: number): number {
  return Math.min(90, Math.abs(lat))
}

/** 日期是否在算法有效范围 1900-01-01 ~ 2100-12-31 内（含首尾） */
export function isSupportedDate(date: CalendarDate): boolean {
  const { year, month, day } = date
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false
  }
  if (month < 1 || month > 12) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  if (year < MIN_YEAR || year > MAX_YEAR) return false
  // 1900-01-01 与 2100-12-31 都是合法日期，月份/日校验已覆盖边界
  return true
}

/** 归一化到 [0, 360) */
function normalize360(deg: number): number {
  const r = deg % 360
  return r < 0 ? r + 360 : r
}