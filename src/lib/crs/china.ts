/**
 * 中国常用坐标系：CGCS2000 / 西安 1980 / 北京 1954 + 高斯-克吕格 3°、6° 带。
 *
 * 与日本部分一样，这里只放**数据与代码映射**，投影公式交给 proj4。
 * 新增一个国家的支持应当是加几行参数，而不是加一套公式（PRD 6.4）。
 *
 * EPSG 代码已按注册表核验（scripts/verify-epsg.ts）：
 *   3° 带 CM 75E~135E（每 3° 一带，共 21 带）
 *     CGCS2000 4534~4554 / 西安80 2370~2390 / 北京54 2422~2442
 *   6° 带 CM 75E~135E（每 6° 一带，共 11 带）
 *     CGCS2000 4502~4512 / 西安80 2338~2348 / 北京54 21453~21463
 */

import { std } from '../coord/format'
import type { CrsInfo, Localized } from './model'

export type ChinaDatumId = 'cgcs2000' | 'xian1980' | 'beijing1954'

export interface ChinaDatum {
  id: ChinaDatumId
  /** 地理坐标 EPSG */
  epsg: number
  ellps: string
  /** 无可用七参数时省略；SR-03 禁止静默的无基准转换 */
  towgs84?: string
  /** CM 基准的投影代码起点（CM=75E 时） */
  cmBase: Record<3 | 6, number>
  label: Localized
}

export const CN_DATUMS: readonly ChinaDatum[] = [
  {
    id: 'cgcs2000',
    epsg: 4490,
    ellps: 'GRS80',
    // SR-03：本期按与 WGS84 等值处理（实用精度内差厘米级）
    towgs84: '0,0,0,0,0,0,0',
    cmBase: { 3: 4534, 6: 4502 },
    label: {
      zh: 'CGCS2000（国家大地坐标系 2000）',
      en: 'CGCS2000 (China Geodetic Coordinate System 2000)',
      ja: 'CGCS2000（中国国家測地座標系2000）'
    }
  },
  {
    id: 'xian1980',
    epsg: 4610,
    ellps: 'IAU76',
    // EPSG 注册表没有给出西安80的官方七参数；不静默假定为 WGS84
    cmBase: { 3: 2370, 6: 2338 },
    label: {
      zh: '西安 1980（IAU76 椭球）',
      en: 'Xian 1980 (IAU76 ellipsoid)',
      ja: '西安1980（IAU76 楕円体）'
    }
  },
  {
    id: 'beijing1954',
    epsg: 4214,
    ellps: 'krass',
    towgs84: '15.8,-154.4,-82.3,0,0,0,0',
    cmBase: { 3: 2422, 6: 21453 },
    label: {
      zh: '北京 1954（Krassovsky 椭球）',
      en: 'Beijing 1954 (Krassovsky ellipsoid)',
      ja: '北京1954（クラソフスキー楕円体）'
    }
  }
] as const

export function chinaDatum(id: ChinaDatumId): ChinaDatum {
  const d = CN_DATUMS.find((x) => x.id === id)
  if (!d) throw new Error(`unknown China datum: ${id}`)
  return d
}

/** 3° 带中央经线：75E ~ 135E，步长 3 */
export const CN_CM_3: readonly number[] = Array.from({ length: 21 }, (_, i) => 75 + i * 3)
/** 6° 带中央经线：75E ~ 135E，步长 6 */
export const CN_CM_6: readonly number[] = Array.from({ length: 11 }, (_, i) => 75 + i * 6)

export type BandWidth = 3 | 6

/** 该带宽下合法的中央经线列表 */
export function chinaCms(band: BandWidth): readonly number[] {
  return band === 3 ? CN_CM_3 : CN_CM_6
}

/** 中央经线 → 带号 */
export function chinaZoneOfCm(cm: number, band: BandWidth): number | undefined {
  if (!chinaCms(band).includes(cm)) return undefined
  return band === 3 ? cm / 3 : (cm + 3) / 6
}

/** 带号 → 中央经线 */
export function chinaCmOfZone(zone: number, band: BandWidth): number | undefined {
  if (band === 3) return zone >= 25 && zone <= 45 ? zone * 3 : undefined
  return zone >= 13 && zone <= 23 ? (zone - 1) * 6 + 3 : undefined
}

/**
 * 按经度推算高斯-克吕格带号与中央经线（PRD 6.4 异常表要求）。
 *
 * 3° 带：zone = round(lng / 3)，夹取到 25~45
 * 6° 带：zone = floor(lng / 6) + 1，夹取到 13~23
 */
export function chinaZoneForLongitude(
  lng: number,
  band: BandWidth
): { zone: number; cm: number } {
  if (band === 3) {
    const raw = Math.round(lng / 3)
    const zone = Math.min(45, Math.max(25, raw))
    return { zone, cm: zone * 3 }
  }
  const raw = Math.floor(lng / 6) + 1
  const zone = Math.min(23, Math.max(13, raw))
  return { zone, cm: (zone - 1) * 6 + 3 }
}

/** CM 基准的高斯-克吕格 EPSG 代码 */
export function chinaGkEpsg(datumId: ChinaDatumId, band: BandWidth, cm: number): number {
  const d = chinaDatum(datumId)
  if (!chinaCms(band).includes(cm)) throw new RangeError(`CM out of range: ${cm}`)
  return d.cmBase[band] + (cm - 75) / band
}

/** CM 基准的高斯-克吕格 proj4 定义（x_0 = 500000，无带号前缀） */
export function chinaGkProj4(datumId: ChinaDatumId, cm: number): string {
  const d = chinaDatum(datumId)
  const tw = d.towgs84 ? ` +towgs84=${d.towgs84}` : ''
  return (
    `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=1 +x_0=500000 +y_0=0 ` +
    `+ellps=${d.ellps}${tw} +units=m +no_defs`
  )
}

export function chinaGkCrs(datumId: ChinaDatumId, band: BandWidth, cm: number): CrsInfo {
  const d = chinaDatum(datumId)
  return {
    code: chinaGkEpsg(datumId, band, cm),
    name: `${d.label.en.split(' (')[0]} / ${band === 3 ? '3-degree ' : ''}Gauss-Kruger CM ${cm}E`,
    proj4: chinaGkProj4(datumId, cm),
    kind: 'projected',
    axisOrder: 'xy',
    datum: d.id.toUpperCase()
  }
}

export function chinaGeographicCrs(datumId: ChinaDatumId): CrsInfo {
  const d = chinaDatum(datumId)
  const tw = d.towgs84 ? ` +towgs84=${d.towgs84}` : ''
  return {
    code: d.epsg,
    name: d.label.en.split(' (')[0],
    proj4: `+proj=longlat +ellps=${d.ellps}${tw} +no_defs`,
    kind: 'geographic',
    axisOrder: 'xy',
    datum: d.id.toUpperCase()
  }
}

/** 该 EPSG 代码是否属于中国高斯-克吕格投影 */
export function isChinaGkCode(code: number): boolean {
  return (
    (code >= 4491 && code <= 4554) ||
    (code >= 2327 && code <= 2390) ||
    (code >= 2401 && code <= 2442) ||
    (code >= 21413 && code <= 21423) ||
    (code >= 21453 && code <= 21463)
  )
}

/** 高斯-克吕格 CM 条目的本地化标签 */
export function chinaGkLabel(datumId: ChinaDatumId, band: BandWidth, cm: number, lang: 'zh' | 'en' | 'ja'): string {
  const short =
    lang === 'zh'
      ? { cgcs2000: 'CGCS2000', xian1980: '西安80', beijing1954: '北京54' }[datumId]
      : lang === 'ja'
        ? { cgcs2000: 'CGCS2000', xian1980: '西安1980', beijing1954: '北京1954' }[datumId]
        : { cgcs2000: 'CGCS2000', xian1980: 'Xian 1980', beijing1954: 'Beijing 1954' }[datumId]
  if (lang === 'zh') return `${short} · ${band}° 带 · 中央经线 ${std(cm, 0)}°E`
  if (lang === 'ja') return `${short} · ${band}度帯 · 中央経線 ${std(cm, 0)}°E`
  return `${short} · ${band}° band · CM ${std(cm, 0)}°E`
}

/* ------------------------------------------------------------------ *
 * UTM
 * ------------------------------------------------------------------ */

/** 经度 → UTM 带号（1~60） */
export function utmZoneForLongitude(lng: number): number {
  return Math.min(60, Math.max(1, Math.floor((lng + 180) / 6) + 1))
}

export type UtmDatumId = 'wgs84' | 'jgd2011'

/** UTM EPSG（仅覆盖本期常用 datum） */
export function utmEpsg(datum: UtmDatumId, zone: number, south: boolean): number | undefined {
  if (datum === 'wgs84') return (south ? 32700 : 32600) + zone
  // JGD2011 只注册了 51~55 带（日本范围）
  if (zone >= 51 && zone <= 55) return 6688 + (zone - 51)
  return undefined
}

export function utmProj4(datum: UtmDatumId, zone: number, south: boolean): string {
  const southFlag = south ? ' +south' : ''
  if (datum === 'jgd2011') {
    return `+proj=utm +zone=${zone}${southFlag} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`
  }
  return `+proj=utm +zone=${zone}${southFlag} +datum=WGS84 +units=m +no_defs`
}