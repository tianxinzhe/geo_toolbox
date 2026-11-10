/**
 * 多点里程（PRD T04「支持多点输入（≥3 个点），额外输出分段距离、累计里程、各段方位角」）
 *
 * 为什么单独一个文件而不是塞进 geodesy.ts：
 *   geodesy.ts 是**大地测量算法**（椭球/球面的距离与方位角），与「有几个点」无关；
 *   本文件是**多点编排 + 导出序列化**，属于 T04 的领域逻辑。
 *   分开之后 geodesy.ts 保持零业务语义，T10（等距圈）、T01（偏移距离）
 *   继续只用它，不会被多点相关的类型污染。
 *
 * 🔑 组件层不做任何算术：分段、累计、CSV 全部在这里完成并可单测。
 *    组件只负责把结果**格式化**成当前语言的显示串。
 *
 * 零依赖纯函数（只依赖同目录的 geodesy 与 coord/format），可在 vitest 中直接测。
 */

import { stdFixed } from '../coord/format'
import { compass16Index, distanceAndBearing, haversineDistance, sphericalBearing } from './geodesy'

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

/** 一个路径点。字段顺序刻意是 lng 在前 —— 与 SR-01 的默认轴序、
 *  与 GeoJSON 的 `[lng, lat]` 一致，避免调用方在两种约定间反复颠倒 */
export interface RoutePoint {
  lng: number
  lat: number
}

/** 计算模型（PRD T04 高级选项 / SR-03 距离算法） */
export type RouteModel = 'ellipsoid' | 'sphere'

/** 罗盘 16 方位的索引在「两点重合」时无法定义，用 -1 表示。
 *  不用 `number | undefined`：模板与 CSV 都要判空，-1 更省事且不会被
 *  误当成 0（北） */
export const COMPASS_UNDEFINED = -1

export interface RouteLeg {
  /** 段序号，从 1 开始（对用户显示用 1 基，不用 0 基） */
  index: number
  from: RoutePoint
  to: RoutePoint
  /** 该段地表距离（米） */
  meters: number
  /**
   * 正向方位角（度，0~360，正北为 0、顺时针）。**NaN 表示未定义（两点重合）**
   */
  initialBearing: number
  /**
   * 反向方位角（度，0~360）：站在终点**回望起点**的方向。
   * NaN 表示未定义（两点重合）。
   *
   * ⚠️ 字段名刻意不叫 `finalBearing`，见 reverseBearingOf() 的说明。
   */
  reverseBearing: number
  /** 罗盘 16 方位索引（0~15，0 = 北）；两点重合时为 COMPASS_UNDEFINED */
  compass: number
  /** 反向方位角对应的罗盘 16 方位索引。判据同上 */
  compassRev: number
  /** 两点重合（PRD T04 专属异常①：距离 0、方位角未定义，**不报错**） */
  coincident: boolean
  /** 该段**实际**使用的模型。用户选了椭球但 Vincenty 不收敛时这里是 'sphere' */
  model: RouteModel
  /** 从第一个点起算的累计里程（米） */
  cumulativeMeters: number
}

export interface RouteSummary {
  legs: RouteLeg[]
  /** 全程累计里程（米）= 各段之和。legs 为空时为 0 */
  totalMeters: number
  /**
   * 用户选了椭球模型，但至少有一段因近对跖点不收敛而回退到球面。
   * PRD T04 要求此时**在结果中标注「已使用球面近似」**（也是 SR-12
   * 「涉及约/近似的结果必须标注为近似」）。
   * 用户主动选了球面模型时为 false —— 那是他要的，不是回退。
   */
  fellBack: boolean
}

/* ------------------------------------------------------------------ *
 * 单段
 * ------------------------------------------------------------------ */

/**
 * 单段的几何结果。
 *
 * 刻意**不含** from / to / index / compass / cumulativeMeters ——
 * 那些由 routeSegments 在编排时补上（累计里程只有走完前一段才知道，
 * 罗盘索引则是纯展示派生量）。分成两个类型是为了让「算一段」与
 * 「串成一条路线」的职责在类型上就分开，而不是靠 Omit 硬凑。
 */
export type LegGeometry = Pick<
  RouteLeg,
  'meters' | 'initialBearing' | 'reverseBearing' | 'coincident' | 'model'
>

/**
 * 两点之间的一段。
 *
 * ⚠️ 重合判定用**严格相等**而不是「距离为 0」：
 * 相距几毫米的两点距离四舍五入后也可能显示 0，但它们的方位角是良定义的，
 * 报「未定义」反而是错的。geodesy.vincentyInverse 内部同样用严格相等，
 * 两处判据必须一致，否则椭球路径与球面路径会对同一段给出不同结论。
 *
 * 反向方位角一律取「回望起点」语义：椭球路径读 `distanceAndBearing` 的
 * `finalBearing`（geodesy.ts 已统一为 α2 + 180°），球面路径交换两点重算 ——
 * 两条路径的语义必须一致，否则近对跖点回退到球面时结果会突变 180°，
 * 让人朝完全相反的方向走。
 */
export function legBetween(from: RoutePoint, to: RoutePoint, model: RouteModel): LegGeometry {
  const coincident = from.lat === to.lat && from.lng === to.lng

  if (model === 'sphere') {
    return {
      meters: haversineDistance(from.lat, from.lng, to.lat, to.lng),
      // 球面方位角公式在重合点上会得到 atan2(0, 0) = 0，
      // 那是公式退化的产物而不是「正北」，必须显式置为未定义
      initialBearing: coincident ? NaN : sphericalBearing(from.lat, from.lng, to.lat, to.lng),
      reverseBearing: coincident ? NaN : sphericalBearing(to.lat, to.lng, from.lat, from.lng),
      coincident,
      model: 'sphere'
    }
  }

  // distanceAndBearing 内部已经处理了「Vincenty 不收敛 → 回退球面」，
  // 这里只如实转述它用的模型，不重复判断
  const r = distanceAndBearing(from.lat, from.lng, to.lat, to.lng)
  return {
    meters: r.distance,
    initialBearing: r.initialBearing,
    reverseBearing: coincident ? NaN : r.finalBearing,
    coincident,
    model: r.model
  }
}

/* ------------------------------------------------------------------ *
 * 多点
 * ------------------------------------------------------------------ */

/**
 * 一串点 → 分段结果 + 累计里程。
 *
 * 点数 <2 时返回空 legs（不是错误）：调用方按「只有一个点」的
 * 专属异常②处理，而不是让这里抛异常。
 *
 * 点的顺序即行进顺序，**不排序、不去重**：用户给的顺序就是他要的路线，
 * 擅自按经度排序会把一条折返路线改成一条直线（SR-01 不静默改写用户输入）。
 */
export function routeSegments(points: readonly RoutePoint[], model: RouteModel): RouteSummary {
  const legs: RouteLeg[] = []
  let cumulative = 0

  for (let i = 1; i < points.length; i++) {
    const seg = legBetween(points[i - 1], points[i], model)
    cumulative += seg.meters
    legs.push({
      index: i,
      from: points[i - 1],
      to: points[i],
      ...seg,
      compass: seg.coincident ? COMPASS_UNDEFINED : compass16Index(seg.initialBearing),
      compassRev: seg.coincident ? COMPASS_UNDEFINED : compass16Index(seg.reverseBearing),
      cumulativeMeters: cumulative
    })
  }

  return {
    legs,
    totalMeters: cumulative,
    // 只有「用户要椭球、却拿到了球面」才算回退
    fellBack: model === 'ellipsoid' && legs.some((l) => l.model === 'sphere')
  }
}

/* ------------------------------------------------------------------ *
 * CSV 序列化（FR-04 结果导出 / SR-11 标准数值形态）
 * ------------------------------------------------------------------ */

/**
 * CSV 表头。
 *
 * ⚠️ 固定 ASCII 英文，**不随语言变化**：SR-11 规定「界面预览可本地化，
 * 文件内容不可」。表头一旦本地化，同一份数据在中文版与英文版导出的
 * 列名就不同，下游脚本无法通用。
 *
 * 罗盘方位**不入表** —— 它的文字随语言变化（SR-11：`NNW` → `北北西`），
 * 而文件内容不得本地化；需要时由 bearing_deg 自行推导（每 22.5° 一格）。
 */
export const ROUTE_CSV_HEADER = [
  'leg',
  'from_lng',
  'from_lat',
  'to_lng',
  'to_lat',
  'distance_m',
  'bearing_deg',
  'cumulative_m'
] as const

export interface RouteCsvOptions {
  /** 坐标小数位（SR-02：经纬度默认 8 位） */
  coordDigits: number
  /** 距离小数位（SR-02：距离 2 位小数，即厘米级） */
  distanceDigits: number
  /** 方位角小数位（SR-02：方位角 2 位小数） */
  bearingDigits: number
}

/** 导出与复制用的默认小数位。与 SR-02 的显示精度表一致 */
export const ROUTE_CSV_DIGITS: RouteCsvOptions = {
  coordDigits: 8,
  distanceDigits: 2,
  bearingDigits: 2
}

/**
 * 分段结果 → CSV 文本（不含 BOM）。
 *
 * 三个刻意的设计：
 *
 * ① **行尾用 CRLF**。RFC 4180 要求 CRLF；更实际的原因是 Excel for Windows
 *    在粘贴只含 LF 的文本时会把整段塞进一个单元格，用户会以为导出坏了。
 *
 * ② **不做字段转义**。全部字段都是 stdFixed 产出的纯数字或表头里的
 *    ASCII 标识符，既不含逗号也不含引号，转义逻辑只会是死代码。
 *    这也是「坐标值不得再含逗号」（SR-11）在实现上的保证：
 *    stdFixed 永远输出句点小数点、永不分组。
 *
 * ③ **不追加 total 行**。累计里程已经是最后一列，最后一行的
 *    cumulative_m 就是全程里程；再塞一行 label 会让 leg 列混入非数字，
 *    破坏表格的矩形结构，pandas / Excel 读取时得多写一步过滤。
 */
export function routeCsv(summary: RouteSummary, opts: RouteCsvOptions = ROUTE_CSV_DIGITS): string {
  const rows = summary.legs.map((l) =>
    [
      String(l.index),
      stdFixed(l.from.lng, opts.coordDigits),
      stdFixed(l.from.lat, opts.coordDigits),
      stdFixed(l.to.lng, opts.coordDigits),
      stdFixed(l.to.lat, opts.coordDigits),
      stdFixed(l.meters, opts.distanceDigits),
      // 两点重合时 initialBearing 是 NaN，stdFixed 返回空串 → 空单元格。
      // 写 0 会被误读成「正北」，写 "N/A" 会破坏数值列的类型
      stdFixed(l.initialBearing, opts.bearingDigits),
      stdFixed(l.cumulativeMeters, opts.distanceDigits)
    ].join(',')
  )

  return [ROUTE_CSV_HEADER.join(','), ...rows].join('\r\n')
}
