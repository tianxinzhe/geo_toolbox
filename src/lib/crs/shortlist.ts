/**
 * 按语言分区的常用 CRS 快捷列表（PRD 6.4）。
 *
 * 这里只负责「给用户看什么」，不负责解析。真正的坐标换算在 engine.ts。
 * 列表是数据，不是代码分支 —— 将来新增国家只需往这里加一组 options。
 */

import type { Lang } from '../../config/i18n'
import { CN_CM_3, CN_CM_6, chinaDatum, chinaGkLabel } from './china'
import { JP_DATUMS, zoneLabel } from './japan'
import type { CrsGroup, CrsOption } from './model'

/** 自定义 EPSG 代码的哨兵 id */
export const CUSTOM_ID = 'custom'

/** 自动带号类选项的 id 前缀 */
export const AUTO_UTM_WGS84 = 'auto:utm:WGS84'
export const AUTO_UTM_JGD2011 = 'auto:utm:JGD2011'
export const AUTO_GK_CGCS2000_3 = 'auto:gk:cgcs2000:3'
export const AUTO_GK_CGCS2000_6 = 'auto:gk:cgcs2000:6'

const GLOBAL_LABELS: Record<string, Record<Lang, string>> = {
  '4326': { zh: 'WGS 84（经纬度）', en: 'WGS 84 (geographic)', ja: 'WGS 84（地理座標）' },
  '3857': { zh: 'Web Mercator（Web 地图）', en: 'Web Mercator (web maps)', ja: 'Web メルカトル（Web 地図）' },
  '4258': { zh: 'ETRS89（欧洲）', en: 'ETRS89 (Europe)', ja: 'ETRS89（ヨーロッパ）' },
  '4269': { zh: 'NAD83（北美）', en: 'NAD83 (North America)', ja: 'NAD83（北米）' },
  '4267': { zh: 'NAD27（北美旧基准）', en: 'NAD27 (legacy North America)', ja: 'NAD27（北米旧測地系）' },
  '4277': { zh: 'OSGB36（英国旧基准）', en: 'OSGB36 (legacy UK)', ja: 'OSGB36（英国旧測地系）' },
  '27700': { zh: 'British National Grid（英国国土地图）', en: 'British National Grid (UK)', ja: 'British National Grid（英国）' }
}

function globalOptions(lang: Lang): CrsOption[] {
  return Object.entries(GLOBAL_LABELS).map(([code, labels]) => ({
    id: `epsg:${code}`,
    code: Number(code),
    label: labels[lang]
  }))
}

function chinaOptions(lang: Lang): CrsOption[] {
  const out: CrsOption[] = []
  const cgcs = chinaDatum('cgcs2000')
  out.push({ id: 'epsg:4490', code: 4490, label: cgcs.label[lang] })
  out.push({ id: 'epsg:4610', code: 4610, label: chinaDatum('xian1980').label[lang] })
  out.push({ id: 'epsg:4214', code: 4214, label: chinaDatum('beijing1954').label[lang] })

  // CGCS2000 的 3° / 6° 带：最常用的 32 个 CM 条目
  for (const cm of CN_CM_3) {
    out.push({
      id: `epsg:${chinaDatum('cgcs2000').cmBase[3] + (cm - 75) / 3}`,
      code: chinaDatum('cgcs2000').cmBase[3] + (cm - 75) / 3,
      label: chinaGkLabel('cgcs2000', 3, cm, lang)
    })
  }
  for (const cm of CN_CM_6) {
    out.push({
      id: `epsg:${chinaDatum('cgcs2000').cmBase[6] + (cm - 75) / 6}`,
      code: chinaDatum('cgcs2000').cmBase[6] + (cm - 75) / 6,
      label: chinaGkLabel('cgcs2000', 6, cm, lang)
    })
  }
  return out
}

function japanDatumOptions(lang: Lang): CrsGroup[] {
  return JP_DATUMS.map((d) => {
    const options: CrsOption[] = [
      { id: `epsg:${d.epsg}`, code: d.epsg, label: d.label[lang] }
    ]
    for (let zone = 1; zone <= 19; zone++) {
      const code = d.zoneBase + zone - 1
      const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX'][zone - 1]
      options.push({
        id: `epsg:${code}`,
        code,
        label:
          lang === 'ja'
            ? `${d.label.ja.split('（')[0]} · 第${roman}系`
            : lang === 'zh'
              ? `${d.label.zh.split('（')[0]} · 第 ${roman} 系`
              : `${d.label.en.split(' (')[0]} · Zone ${roman}`,
        detail: zoneLabel(zone, lang)
      })
    }
    return {
      id: `japan-${d.id}`,
      label:
        lang === 'ja'
          ? `${d.label.ja} 平面直角座標系`
          : lang === 'zh'
            ? `${d.label.zh} 平面直角坐标系`
            : `${d.label.en} — Japan Plane Rectangular`,
      options
    }
  })
}

function autoOptions(lang: Lang): CrsOption[] {
  const labels =
    lang === 'zh'
      ? {
          utmWgs: 'WGS 84 / UTM（按经度自动选带）',
          utmJgd: 'JGD2011 / UTM 51~55（按经度自动选带）',
          gk3: 'CGCS2000 / 3° 带（按经度自动推算中央经线）',
          gk6: 'CGCS2000 / 6° 带（按经度自动推算中央经线）'
        }
      : lang === 'ja'
        ? {
            utmWgs: 'WGS 84 / UTM（経度から自動選択）',
            utmJgd: 'JGD2011 / UTM 51~55（経度から自動選択）',
            gk3: 'CGCS2000 / 3度帯（中央経線を自動推算）',
            gk6: 'CGCS2000 / 6度帯（中央経線を自動推算）'
          }
        : {
            utmWgs: 'WGS 84 / UTM (zone from longitude)',
            utmJgd: 'JGD2011 / UTM 51–55 (zone from longitude)',
            gk3: 'CGCS2000 / 3° band (central meridian from longitude)',
            gk6: 'CGCS2000 / 6° band (central meridian from longitude)'
          }
  return [
    { id: AUTO_UTM_WGS84, code: null, label: labels.utmWgs },
    { id: AUTO_UTM_JGD2011, code: null, label: labels.utmJgd },
    { id: AUTO_GK_CGCS2000_3, code: null, label: labels.gk3 },
    { id: AUTO_GK_CGCS2000_6, code: null, label: labels.gk6 }
  ]
}

function groupLabel(id: string, lang: Lang): string {
  const labels: Record<string, Record<Lang, string>> = {
    global: { zh: '全球常用', en: 'Global', ja: '世界共通' },
    china: { zh: '中国法定坐标系', en: 'China', ja: '中国' },
    utm: { zh: 'UTM 与自动带号', en: 'UTM & automatic zones', ja: 'UTM・自動帯' },
    custom: { zh: '自定义 EPSG 代码', en: 'Custom EPSG code', ja: 'EPSG コードを直接入力' }
  }
  return labels[id]?.[lang] ?? id
}

/** 该语言的常用列表。顺序体现该语言用户的优先场景（PRD 6.4 分区表） */
export function crsGroups(lang: Lang): CrsGroup[] {
  const global: CrsGroup = { id: 'global', label: groupLabel('global', lang), options: globalOptions(lang) }
  const china: CrsGroup = { id: 'china', label: groupLabel('china', lang), options: chinaOptions(lang) }
  const utm: CrsGroup = { id: 'utm', label: groupLabel('utm', lang), options: autoOptions(lang) }
  const custom: CrsGroup = {
    id: 'custom',
    label: groupLabel('custom', lang),
    options: [{ id: CUSTOM_ID, code: null, label: groupLabel('custom', lang) }]
  }

  const japan = japanDatumOptions(lang)

  if (lang === 'zh') return [china, ...japan, utm, global, custom]
  if (lang === 'ja') return [...japan, utm, global, china, custom]
  return [global, utm, china, ...japan, custom]
}

/** 打开页面时的默认源 / 目标（让首屏就有一次可执行的换算） */
export function defaultPair(lang: Lang): { from: string; to: string } {
  if (lang === 'zh') return { from: 'epsg:4326', to: 'epsg:4548' } // 北京 → CGCS2000 3° 117E
  if (lang === 'ja') return { from: 'epsg:6668', to: 'epsg:6677' } // 东京 → JGD2011 第 IX 系
  return { from: 'epsg:4326', to: 'epsg:3857' } // 伦敦 → Web Mercator
}

/** 默认示例坐标（与各语言默认源 CRS 匹配） */
export function defaultPoint(lang: Lang): { x: string; y: string } {
  if (lang === 'ja') return { x: '139.7671', y: '35.6812' }
  if (lang === 'zh') return { x: '116.3974', y: '39.9088' }
  return { x: '-0.1276', y: '51.5072' }
}