/**
 * 日本法定坐标系：JGD2011 / JGD2000 / Tokyo + 平面直角坐标系 19 区带。
 *
 * ⚠️ OQ-15 核验结论（2026-11-09，来源：EPSG 注册表数据，经 npm `epsg-index`
 * v2.0.0 逐条比对；脚本 `scripts/verify-epsg.ts` 在构建前复跑）：
 *
 *   JGD2011 地理坐标            EPSG:6668
 *   JGD2011 平面直角 第 I~XIX 系 EPSG:6669~6687   ✅ 与 PRD 一致
 *   JGD2011 UTM 51N~55N         EPSG:6688~6692
 *   JGD2000 地理坐标            EPSG:4612
 *   JGD2000 平面直角 第 I~XIX 系 EPSG:2443~2461   ❌ PRD 写的 2451~2469 有误
 *   JGD2000 UTM 51N~55N         EPSG:3097~3101
 *   Tokyo 地理坐标              EPSG:4301
 *   Tokyo 平面直角 第 I~XIX 系   EPSG:30161~30179 ✅ 与 PRD 一致
 *   Tokyo UTM 51N~55N           EPSG:3092~3096
 *
 * 2451 实际是第 IX 系，2469 是 Pulkovo 1942 的投影 —— 若按 PRD 的原区间
 * 写代码，第 X~XIX 系会整体错位，属于「不报错但结果错」的静默失败。
 *
 * 另外，Tokyo 的 towgs84 采用 EPSG 注册表的现行值
 * `-146.414,507.337,680.507`，而不是旧 proj4js 表的 `-148,507,685`。
 *
 * 每个区带的投影参数（lat_0 / lon_0）三个 datum 完全相同，
 * 差异只在椭球与 towgs84 —— 这正是「加数据行而非加代码」的体现。
 */

import { std } from '../coord/format'
import { normalizeFullWidth } from '../coord/parse'
import type { CrsInfo, Localized } from './model'

export type JapanDatumId = 'jgd2011' | 'jgd2000' | 'tokyo'

export interface JapanDatum {
  id: JapanDatumId
  /** 地理坐标 EPSG */
  epsg: number
  /** 平面直角第 I 系的 EPSG；第 N 系 = zoneBase + N − 1 */
  zoneBase: number
  ellps: string
  towgs84: string
  label: Localized
}

export const JP_DATUMS: readonly JapanDatum[] = [
  {
    id: 'jgd2011',
    epsg: 6668,
    zoneBase: 6669,
    ellps: 'GRS80',
    towgs84: '0,0,0,0,0,0,0',
    label: {
      zh: 'JGD2011（日本大地基准 2011）',
      en: 'JGD2011 (Japanese Geodetic Datum 2011)',
      ja: '日本測地系2011（JGD2011）'
    }
  },
  {
    id: 'jgd2000',
    epsg: 4612,
    zoneBase: 2443,
    ellps: 'GRS80',
    towgs84: '0,0,0,0,0,0,0',
    label: {
      zh: 'JGD2000（日本大地基准 2000）',
      en: 'JGD2000 (Japanese Geodetic Datum 2000)',
      ja: '日本測地系2000（JGD2000）'
    }
  },
  {
    id: 'tokyo',
    epsg: 4301,
    zoneBase: 30161,
    ellps: 'bessel',
    towgs84: '-146.414,507.337,680.507,0,0,0,0',
    label: {
      zh: 'Tokyo（旧日本大地基准 / Bessel 椭球）',
      en: 'Tokyo (old Japanese datum / Bessel ellipsoid)',
      ja: '旧日本測地系（Tokyo / ベッセル楕円体）'
    }
  }
] as const

export function japanDatum(id: JapanDatumId): JapanDatum {
  const d = JP_DATUMS.find((x) => x.id === id)
  if (!d) throw new Error(`unknown Japan datum: ${id}`)
  return d
}

export interface JapanZone {
  /** 1~19 */
  zone: number
  lat0: number
  lon0: number
  /** 主要覆盖的都道府县（仅 ja 版展示，PRD 6.4 要求） */
  prefecturesJa: string
}

/**
 * 19 个区带的原点参数。
 * 数值来自 EPSG 注册表（6669~6687 的 proj4 定义），不是近似值。
 */
export const JP_ZONES: readonly JapanZone[] = [
  { zone: 1, lat0: 33, lon0: 129.5, prefecturesJa: '長崎・福岡・佐賀・熊本・大分・宮崎・鹿児島' },
  { zone: 2, lat0: 33, lon0: 131, prefecturesJa: '福岡・佐賀・熊本・大分・宮崎・鹿児島' },
  { zone: 3, lat0: 36, lon0: 132.1666666666667, prefecturesJa: '山口・島根・岡山・広島・鳥取' },
  { zone: 4, lat0: 33, lon0: 133.5, prefecturesJa: '香川・愛媛・徳島・高知' },
  { zone: 5, lat0: 36, lon0: 134.3333333333333, prefecturesJa: '兵庫・京都・大阪・和歌山・徳島' },
  { zone: 6, lat0: 36, lon0: 136, prefecturesJa: '大阪・京都・滋賀・三重・奈良・和歌山' },
  { zone: 7, lat0: 36, lon0: 137.1666666666667, prefecturesJa: '福井・石川・富山・岐阜・愛知' },
  { zone: 8, lat0: 36, lon0: 138.5, prefecturesJa: '新潟・長野・山梨・静岡' },
  {
    zone: 9,
    lat0: 36,
    lon0: 139.8333333333333,
    prefecturesJa: '東京・神奈川・埼玉・千葉・茨城・栃木・群馬・山梨・静岡'
  },
  { zone: 10, lat0: 40, lon0: 140.8333333333333, prefecturesJa: '青森・岩手・秋田・山形・宮城・福島' },
  { zone: 11, lat0: 44, lon0: 140.25, prefecturesJa: '北海道（西部）' },
  { zone: 12, lat0: 44, lon0: 142.25, prefecturesJa: '北海道（中央部）' },
  { zone: 13, lat0: 44, lon0: 144.25, prefecturesJa: '北海道（東部）' },
  { zone: 14, lat0: 26, lon0: 142, prefecturesJa: '東京都（小笠原諸島）' },
  { zone: 15, lat0: 26, lon0: 127.5, prefecturesJa: '沖縄県（本島周辺）' },
  { zone: 16, lat0: 26, lon0: 124, prefecturesJa: '沖縄県（先島諸島）' },
  { zone: 17, lat0: 26, lon0: 131, prefecturesJa: '沖縄県（大東諸島）' },
  { zone: 18, lat0: 20, lon0: 136, prefecturesJa: '東京都（沖ノ鳥島）' },
  { zone: 19, lat0: 26, lon0: 154, prefecturesJa: '東京都（南鳥島）' }
] as const

export function japanZone(zone: number): JapanZone | undefined {
  return JP_ZONES.find((z) => z.zone === zone)
}

/** 第 N 系的 EPSG 代码 */
export function japanPlaneEpsg(datumId: JapanDatumId, zone: number): number {
  const d = japanDatum(datumId)
  if (!Number.isInteger(zone) || zone < 1 || zone > 19) {
    throw new RangeError(`Japan plane zone out of range: ${zone}`)
  }
  return d.zoneBase + (zone - 1)
}

/** 平面直角坐标系第 N 系的 proj4 定义 */
export function japanPlaneProj4(datumId: JapanDatumId, zone: number): string {
  const d = japanDatum(datumId)
  const z = japanZone(zone)
  if (!z) throw new RangeError(`Japan plane zone out of range: ${zone}`)
  return (
    `+proj=tmerc +lat_0=${z.lat0} +lon_0=${z.lon0} +k=0.9999 +x_0=0 +y_0=0 ` +
    `+ellps=${d.ellps} +towgs84=${d.towgs84} +units=m +no_defs`
  )
}

/** 地理坐标 proj4 定义 */
export function japanGeographicProj4(datumId: JapanDatumId): string {
  const d = japanDatum(datumId)
  return `+proj=longlat +ellps=${d.ellps} +towgs84=${d.towgs84} +no_defs`
}

/** 平面直角坐标系的 CrsInfo（axisOrder = yx，X=北 / Y=東） */
export function japanPlaneCrs(datumId: JapanDatumId, zone: number): CrsInfo {
  const d = japanDatum(datumId)
  return {
    code: japanPlaneEpsg(datumId, zone),
    name: `${d.label.en.split(' (')[0]} / Japan Plane Rectangular CS ${toRoman(zone)}`,
    proj4: japanPlaneProj4(datumId, zone),
    kind: 'projected',
    axisOrder: 'yx',
    datum: d.id.toUpperCase()
  }
}

export function japanGeographicCrs(datumId: JapanDatumId): CrsInfo {
  const d = japanDatum(datumId)
  return {
    code: d.epsg,
    name: d.label.en.split(' (')[0],
    proj4: japanGeographicProj4(datumId),
    kind: 'geographic',
    axisOrder: 'xy',
    datum: d.id.toUpperCase()
  }
}

/** 是否是平面直角坐标系的 EPSG 代码（用于轴序判定，含任意 datum） */
export function isJapanPlaneCode(code: number): boolean {
  return JP_DATUMS.some((d) => code >= d.zoneBase && code <= d.zoneBase + 18)
}

/** 该 EPSG 代码对应的区带号；非平面直角返回 undefined */
export function japanZoneOfCode(code: number): number | undefined {
  for (const d of JP_DATUMS) {
    if (code >= d.zoneBase && code <= d.zoneBase + 18) return code - d.zoneBase + 1
  }
  return undefined
}

/** 该 EPSG 代码对应的日本 datum；非日本坐标系返回 undefined */
export function japanDatumOfCode(code: number): JapanDatumId | undefined {
  for (const d of JP_DATUMS) {
    if (code === d.epsg) return d.id
    if (code >= d.zoneBase && code <= d.zoneBase + 18) return d.id
  }
  // UTM 代码段
  if (code >= 6688 && code <= 6692) return 'jgd2011'
  if (code >= 3097 && code <= 3101) return 'jgd2000'
  if (code >= 3092 && code <= 3096) return 'tokyo'
  return undefined
}

/* ------------------------------------------------------------------ *
 * 罗马数字
 * ------------------------------------------------------------------ */

const ROMAN: readonly [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I']
]

/** 1~19 → 罗马数字 */
export function toRoman(n: number): string {
  let rest = n
  let out = ''
  for (const [v, s] of ROMAN) {
    while (rest >= v) {
      out += s
      rest -= v
    }
  }
  return out
}

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10 }

/** 罗马数字 → 整数；非法返回 undefined */
export function fromRoman(s: string): number | undefined {
  const t = s.toUpperCase()
  if (t === '' || !/^[IVX]+$/.test(t)) return undefined
  let total = 0
  for (let i = 0; i < t.length; i++) {
    const cur = ROMAN_VALUES[t[i]]
    const next = ROMAN_VALUES[t[i + 1]] ?? 0
    total += cur < next ? -cur : cur
  }
  // 只接受规范写法：toRoman 的逆
  return total >= 1 && total <= 19 && toRoman(total) === t ? total : undefined
}

/**
 * 解析用户输入的区带号。
 * 接受 `9` / `09` / `9系` / `第9系` / `IX` / `Ⅸ` / 全角数字（PRD 6.4 第 3 条）。
 */
export function parseZoneInput(input: string): number | undefined {
  let t = normalizeFullWidth(input).text.trim()
  t = t.replace(/^第/, '').replace(/系$/, '').replace(/[\s.．]/g, '')
  // Unicode 罗马数字（Ⅰ~Ⅻ 是单码位，ⅩⅢ 这类是组合序列）
  t = t.replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹⅺⅻ]/g, (ch) => {
    const map: Record<string, string> = {
      'Ⅰ': 'I', 'Ⅱ': 'II', 'Ⅲ': 'III', 'Ⅳ': 'IV', 'Ⅴ': 'V', 'Ⅵ': 'VI',
      'Ⅶ': 'VII', 'Ⅷ': 'VIII', 'Ⅸ': 'IX', 'Ⅹ': 'X', 'Ⅺ': 'XI', 'Ⅻ': 'XII',
      'ⅰ': 'I', 'ⅱ': 'II', 'ⅲ': 'III', 'ⅳ': 'IV', 'ⅴ': 'V', 'ⅵ': 'VI',
      'ⅶ': 'VII', 'ⅷ': 'VIII', 'ⅸ': 'IX', 'ⅹ': 'X', 'ⅺ': 'XI', 'ⅻ': 'XII'
    }
    return map[ch] ?? ch
  })
  if (/^\d+$/.test(t)) {
    const n = Number(t)
    return n >= 1 && n <= 19 ? n : undefined
  }
  return fromRoman(t)
}

/** 区带在界面上的本地化标签 */
export function zoneLabel(zone: number, lang: 'zh' | 'en' | 'ja'): string {
  const z = japanZone(zone)
  if (!z) return ''
  const roman = toRoman(zone)
  if (lang === 'ja') return `第${roman}系（${z.prefecturesJa}）`
  const cm = std(z.lon0, 4)
  if (lang === 'zh') return `第 ${roman} 系 · 中央经线 ${cm}°E`
  return `Zone ${roman} · central meridian ${cm}°E`
}