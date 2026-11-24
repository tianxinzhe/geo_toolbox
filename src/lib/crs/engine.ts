/**
 * 投影引擎（PRD 6.4 / 技术方案 4.3）
 *
 * 职责边界：
 *   - 本文件只做「EPSG → proj4 → 坐标」的通用变换，不含任何 UI 文案；
 *   - 常用 CRS 随主包注册，完整 EPSG 表在真正需要时才异步加载。
 *
 * 转换路径：proj4 内部统一走「源 → 地心 → WGS84 → 目标」，
 * 与 PRD 要求的「源 → WGS84 → 目标」一致，不需要维护 N² 条规则。
 */

import type { Lang } from '../../config/i18n'
import {
  chinaGkCrs,
  chinaZoneForLongitude,
  chinaGeographicCrs,
  isChinaGkCode,
  utmEpsg,
  utmProj4,
  utmZoneForLongitude,
  CN_DATUMS,
  type BandWidth,
  type ChinaDatumId
} from './china'
import {
  AUTO_GK_CGCS2000_3,
  AUTO_GK_CGCS2000_6,
  AUTO_UTM_WGS84
} from './shortlist'
import {
  CrsError,
  type CrsInfo,
  type CrsTransform,
  type DatumShift,
  type TransformOptions
} from './model'

/* ------------------------------------------------------------------ *
 * 内置 CRS 表
 * ------------------------------------------------------------------ */

const BUILTIN = new Map<number, CrsInfo>()

function register(info: CrsInfo): CrsInfo {
  BUILTIN.set(info.code, info)
  return info
}

function globalCrs(
  code: number,
  name: string,
  proj4Str: string,
  datum: string
): CrsInfo {
  return {
    code,
    name,
    proj4: proj4Str,
    kind: proj4Str.includes('+proj=longlat') ? 'geographic' : 'projected',
    datum
  }
}

// 中国：3 个 datum 的地理坐标 + CGCS2000 的 3°/6° CM 条目
for (const d of CN_DATUMS) {
  register(chinaGeographicCrs(d.id as ChinaDatumId))
}
for (const band of [3, 6] as const) {
  for (let cm = 75; cm <= 135; cm += band) {
    register(chinaGkCrs('cgcs2000', band, cm))
  }
}

// 全球常用
register(globalCrs(4326, 'WGS 84', '+proj=longlat +datum=WGS84 +no_defs', 'WGS84'))
register(
  globalCrs(
    3857,
    'WGS 84 / Pseudo-Mercator',
    '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
    'WGS84'
  )
)
register(
  globalCrs(4258, 'ETRS89', '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs', 'ETRS89')
)
register(
  globalCrs(4269, 'NAD83', '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs', 'NAD83')
)
// NAD27 原定义依赖 NTv2 网格文件（数 MB，本期不打包）→ 用公开的三参数近似，
// 精度 1~5 米，与 SR-03 的七参数方案同级，并在结果区声明。
register(
  globalCrs(4267, 'NAD27', '+proj=longlat +ellps=clrk66 +towgs84=-8,160,176,0,0,0,0 +no_defs', 'NAD27')
)
const OSGB_TW = '446.448,-125.157,542.06,0.15,0.247,0.842,-20.489'
register(globalCrs(4277, 'OSGB36', `+proj=longlat +ellps=airy +towgs84=${OSGB_TW} +no_defs`, 'OSGB36'))
register(
  globalCrs(
    27700,
    'OSGB36 / British National Grid',
    `+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=${OSGB_TW} +units=m +no_defs`,
    'OSGB36'
  )
)

/** 已完成内置注册的代码（测试与 UI 用） */
export const BUILTIN_CODES: readonly number[] = [...BUILTIN.keys()].sort((a, b) => a - b)

/** 该代码是否随主包注册（UI 用来决定是否提示「正在加载完整表」） */
export function hasBuiltinCrs(code: number): boolean {
  return BUILTIN.has(code)
}

/** 同步读取内置定义；用于首屏 SSR 时立刻确定字段标签，避免闪一下 X/Y */
export function peekCrs(code: number): CrsInfo | undefined {
  return BUILTIN.get(code)
}

/* ------------------------------------------------------------------ *
 * 完整 EPSG 表（异步）
 * ------------------------------------------------------------------ */

interface FullData {
  defs: Record<string, string>
  names: Record<string, string>
}

let fullPromise: Promise<FullData> | null = null
let fullLoaded = false

/**
 * 加载完整 EPSG 定义表。
 *
 * 只有用户提交了常用列表之外的代码时才会触发 —— 对应 PRD 6.4
 * 「完整 EPSG 表尚未加载完成时用户提交：先按常用列表匹配，未命中则
 * 显示正在加载，加载完成后自动重试」。
 */
export function loadFullEpsg(): Promise<FullData> {
  if (!fullPromise) {
    fullPromise = (async () => {
      try {
        const [defsMod, namesMod] = await Promise.all([
          import('epsg'),
          import('./epsg-names.json')
        ])
        fullLoaded = true
        return {
          defs: (defsMod.default ?? defsMod) as Record<string, string>,
          names: (namesMod.default ?? namesMod) as Record<string, string>
        }
      } catch {
        fullPromise = null
        throw new CrsError('load-failed', 'failed to load the full EPSG table')
      }
    })()
  }
  return fullPromise
}

/** 完整表是否已就绪（用于 UI 的加载提示） */
export function isFullEpsgLoaded(): boolean {
  return fullLoaded
}

/* ------------------------------------------------------------------ *
 * datum 推断
 * ------------------------------------------------------------------ */

/** 与 WGS84 在实用精度内一致的 datum（SR-03） */
const WGS_ALIGNED = new Set(['WGS84', 'CGCS2000', 'ETRS89', 'NAD83'])

function datumFromName(name: string): string | undefined {
  if (/\bCGCS2000\b/.test(name)) return 'CGCS2000'
  if (/\bXian 1980\b/.test(name)) return 'XIAN1980'
  if (/\bBeijing 1954\b/.test(name)) return 'BEIJING1954'
  if (/\bNAD83\b/.test(name)) return 'NAD83'
  if (/\bNAD27\b/.test(name)) return 'NAD27'
  if (/\bOSGB/.test(name)) return 'OSGB36'
  if (/\bETRS89\b/.test(name)) return 'ETRS89'
  if (/\bWGS 84\b/.test(name)) return 'WGS84'
  return undefined
}

function datumFromProj4(proj4Str: string): string {
  const datum = /\+datum=([^\s]+)/.exec(proj4Str)?.[1]
  if (datum) return datum.toUpperCase()
  const ellps = /\+ellps=([^\s]+)/.exec(proj4Str)?.[1]
  return ellps ? `ELLPS:${ellps.toUpperCase()}` : 'UNKNOWN'
}

/** 判断基准变换的可用性与精度等级（SR-03 / PRD 6.4 异常表） */
export function datumShiftOf(from: CrsInfo, to: CrsInfo): DatumShift {
  if (from.datum === to.datum) return 'none'

  // 西安 1980 在 EPSG 注册表中没有官方 towgs84
  if (from.datum === 'XIAN1980' || to.datum === 'XIAN1980') return 'missing'

  if (WGS_ALIGNED.has(from.datum) && WGS_ALIGNED.has(to.datum)) return 'none'

  const hasTw = (s: string) => /\+towgs84=/.test(s)
  if (hasTw(from.proj4) && hasTw(to.proj4)) return '7param'
  if (hasTw(from.proj4) || hasTw(to.proj4)) return '7param'
  return 'missing'
}

/* ------------------------------------------------------------------ *
 * CRS 解析
 * ------------------------------------------------------------------ */

function autoCrs(id: string, anchor?: { lng: number; lat: number }): CrsInfo {
  if (!anchor) throw new CrsError('auto-needs-location', id)

  if (id === AUTO_UTM_WGS84) {
    const zone = utmZoneForLongitude(anchor.lng)
    const south = anchor.lat < 0
    return register({
      code: utmEpsg(zone, south),
      name: `WGS 84 / UTM zone ${zone}${south ? 'S' : 'N'}`,
      proj4: utmProj4(zone, south),
      kind: 'projected',
      datum: 'WGS84'
    })
  }

  if (id === AUTO_GK_CGCS2000_3 || id === AUTO_GK_CGCS2000_6) {
    const band: BandWidth = id === AUTO_GK_CGCS2000_3 ? 3 : 6
    const { cm } = chinaZoneForLongitude(anchor.lng, band)
    return register(chinaGkCrs('cgcs2000', band, cm))
  }

  throw new CrsError('not-found', id)
}

/** 解析完整表里的 EPSG 代码 */
async function fullCrs(code: number): Promise<CrsInfo> {
  const full = await loadFullEpsg()
  const key = `EPSG:${code}`
  const def = full.defs[key]
  if (!def) throw new CrsError('not-found', key)
  const name = full.names[String(code)] ?? key
  const kind = def.includes('+proj=longlat') ? 'geographic' : 'projected'
  const datum =
    datumFromName(name) ??
    (isChinaGkCode(code) ? chinaDatumOfCode(code) : undefined) ??
    datumFromProj4(def)
  return register({
    code,
    name,
    proj4: def,
    kind,
    datum
  })
}

function chinaDatumOfCode(code: number): string | undefined {
  if (code >= 2327 && code <= 2390) return 'XIAN1980'
  if (code >= 2401 && code <= 2442) return 'BEIJING1954'
  if ((code >= 21413 && code <= 21423) || (code >= 21453 && code <= 21463)) return 'BEIJING1954'
  if (code >= 4491 && code <= 4554) return 'CGCS2000'
  return undefined
}

/** `epsg:4548` → CrsInfo */
export async function resolveCrsId(
  id: string,
  opts: { anchor?: { lng: number; lat: number }; role?: 'from' | 'to' } = {}
): Promise<CrsInfo> {
  if (id.startsWith('auto:')) {
    if (opts.role === 'from') throw new CrsError('auto-source-unsupported', id)
    return autoCrs(id, opts.anchor)
  }
  const code = parseEpsgId(id)
  return resolveCrs(code)
}

/** 解析 EPSG 代码 / `EPSG:xxxx` / `epsg:xxxx` */
export function parseEpsgId(id: string): number {
  const m = /^(?:epsg:)?(\d+)$/i.exec(id.trim())
  if (!m) throw new CrsError('not-found', id)
  const code = Number(m[1])
  if (!Number.isInteger(code) || code <= 0) throw new CrsError('not-found', id)
  return code
}

/** 按 EPSG 代码解析；先查内置表，未命中再异步加载完整表 */
export async function resolveCrs(code: number): Promise<CrsInfo> {
  const builtin = BUILTIN.get(code)
  if (builtin) return builtin
  return fullCrs(code)
}

/* ------------------------------------------------------------------ *
 * 转换器
 * ------------------------------------------------------------------ */

/** 校验并规范化自定义七参数（3 或 7 个数值，第 7 个单位为 ppm） */
export function normalizeTowgs84(raw: string): string | undefined {
  const parts = raw
    .trim()
    .split(/[\s,;]+/)
    .filter((s) => s !== '')
  if (parts.length !== 3 && parts.length !== 7) return undefined
  const nums = parts.map(Number)
  if (!nums.every((n) => Number.isFinite(n))) return undefined
  return nums.join(',')
}

function applyTowgs84(proj4Str: string, towgs84: string): string {
  if (/\+towgs84=[^\s]+/.test(proj4Str)) return proj4Str.replace(/\+towgs84=[^\s]+/, `+towgs84=${towgs84}`)
  return `${proj4Str} +towgs84=${towgs84}`
}

/**
 * 创建转换器。
 *
 * `customTowgs84` 给出时覆盖源 CRS 的 towgs84，并把 datumShift 标为 'custom'；
 * 这是 PRD 6.4「没有可用基准变换参数时提供自定义七参数入口」的实现。
 */
export async function createTransform(
  fromId: string,
  toId: string,
  opts: TransformOptions = {}
): Promise<CrsTransform> {
  const fromInfo = await resolveCrsId(fromId, { anchor: opts.anchor, role: 'from' })
  const toInfo = await resolveCrsId(toId, { anchor: opts.anchor, role: 'to' })

  let from = fromInfo
  const custom = opts.customTowgs84 ? normalizeTowgs84(opts.customTowgs84) : undefined
  if (opts.customTowgs84 && !custom) {
    throw new CrsError('not-found', 'invalid towgs84')
  }
  if (custom) {
    from = {
      ...fromInfo,
      proj4: applyTowgs84(fromInfo.proj4, custom),
      datum: `${fromInfo.datum}:CUSTOM`
    }
  }

  // proj4 只在真正做投影时按需加载：首屏只加载内置 CRS 表与校验逻辑，
  // 不把 ~35KB 的投影引擎算进 T03 的初始 chunk（技术方案 2 章体积预算）。
  const proj4 = await getProj4()
  const converter = proj4(from.proj4, toInfo.proj4)
  const datumShift: DatumShift = custom ? 'custom' : datumShiftOf(fromInfo, toInfo)

  const forward = (x: number, y: number): [number, number] =>
    converter.forward([x, y]) as [number, number]
  const inverse = (x: number, y: number): [number, number] =>
    converter.inverse([x, y]) as [number, number]

  return {
    from,
    to: toInfo,
    forward,
    inverse,
    datumShift
  }
}

/* ------------------------------------------------------------------ *
 * proj4 延迟加载
 * ------------------------------------------------------------------ */

interface Proj4Converter {
  forward(coords: [number, number]): [number, number]
  inverse(coords: [number, number]): [number, number]
}

type Proj4 = (from: string, to: string) => Proj4Converter

let proj4Promise: Promise<Proj4> | null = null

/** 首次投影时才下载 proj4；之后复用同一个 Promise */
function getProj4(): Promise<Proj4> {
  if (!proj4Promise) {
    proj4Promise = import('proj4').then((m) => {
      const mod = m as unknown as { default?: Proj4 }
      return (mod.default ?? (m as unknown as Proj4)) as Proj4
    })
  }
  return proj4Promise
}

/* ------------------------------------------------------------------ *
 * 输入合法性 / 量级提示
 * ------------------------------------------------------------------ */

export type CoordIssue = 'nan' | 'geo-range' | 'looks-like-degrees' | 'axis-swap'

/** 地理坐标的分量：输入即 (经度, 纬度) */
export function geoComponents(_info: CrsInfo, x: number, y: number): { lng: number; lat: number } {
  return { lng: x, lat: y }
}

/**
 * 检查输入是否可用。
 *
 * - `geo-range` 是硬错误（SR-01：超范围一律拒绝，不取模「修正」）
 * - 其余是警告：PRD 6.4 异常表要求「给出警告并说明判断依据，仍允许强制执行」
 */
export function checkCoord(info: CrsInfo, x: number, y: number): CoordIssue[] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return ['nan']
  const out: CoordIssue[] = []

  if (info.kind === 'geographic') {
    const { lng, lat } = geoComponents(info, x, y)
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) out.push('geo-range')
    return out
  }

  // 投影坐标却只有经纬度量级
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) out.push('looks-like-degrees')

  // GIS 惯例下 X 应在百万级以下（东向），Y 为百万级（北向）。
  // 反过来就是典型的轴序颠倒（PRD 6.4 异常表第 3 条）。
  if (Math.abs(x) > 1_000_000 && Math.abs(y) < 1_000_000) out.push('axis-swap')

  return out
}

/** 该 CRS 的本地化显示名（内置条目用短名，完整表用官方英文名） */
export function crsDisplayName(info: CrsInfo, _lang: Lang): string {
  return info.name
}

/* ------------------------------------------------------------------ *
 * 便利函数
 * ------------------------------------------------------------------ */

/** 把任意坐标转成 WGS84 经纬度（用于自动带号解析） */
export async function toWgs84(info: CrsInfo, x: number, y: number): Promise<{ lng: number; lat: number }> {
  const tr = await createTransform(`epsg:${info.code}`, 'epsg:4326')
  const [lng, lat] = tr.forward(x, y)
  return { lng, lat }
}

/** 结果区要展示的带号 / 中央经线信息 */
export type ZoneInfo =
  | { kind: 'meridian'; value: number }
  | { kind: 'utm'; zone: number; south: boolean }

/**
 * 从 proj4 定义里读出带号或中央经线（PRD 6.4 要求结果中明示推算值）。
 * UTM 定义只有 +zone，高斯-克吕格则带 +lon_0。
 */
export function crsZoneInfo(info: CrsInfo): ZoneInfo | null {
  if (info.proj4.includes('+proj=utm')) {
    const zone = Number(/\+zone=(\d+)/.exec(info.proj4)?.[1])
    if (!Number.isFinite(zone)) return null
    return { kind: 'utm', zone, south: info.proj4.includes('+south') }
  }
  const lon = /\+lon_0=([^\s]+)/.exec(info.proj4)?.[1]
  if (!lon) return null
  const value = Number(lon)
  return Number.isFinite(value) ? { kind: 'meridian', value } : null
}

/** 校验自定义 EPSG 代码范围（EPSG 代码均为正整数，实际最大约 10 万级） */
export function isValidEpsgCode(code: number): boolean {
  return Number.isInteger(code) && code > 0 && code <= 999_999
}