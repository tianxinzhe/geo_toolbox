/**
 * OQ-15 核验：日本平面直角坐标系 EPSG 代码清单
 *
 * PRD 10 章 OQ-15 要求「逐一核对官方注册表后才能写入代码。错一个代码就会
 * 给出错误坐标」。本脚本在构建前把代码里的期望值逐条与 EPSG 注册表数据比对，
 * 任何一条不符就以非零码退出，构建失败。
 *
 * 数据来源：
 *   - 主数据：npm `epsg-index` v2.0.0（由 EPSG.io 的注册表数据集生成，
 *     含 8112 个 CRS 的官方名称与 proj4 定义）
 *   - 交叉校验：npm `epsg` v0.5.0（proj4js-defs 派生，用于确认旧代码段）
 *
 * 已知并已纠正的 PRD 笔误：
 *   PRD 原文写 JGD2000 平面直角 = 2451~2469。
 *   实际 2451 是第 IX 系，2469 是 Pulkovo 1942 的投影；
 *   JGD2000 的正确区间是 2443~2461。
 */

import { createRequire } from 'node:module'

import { CN_CM_3, CN_CM_6, CN_DATUMS, chinaGkEpsg, chinaZoneOfCm } from '../src/lib/crs/china'
import { JP_DATUMS, JP_ZONES, japanPlaneEpsg, japanZoneOfCode, toRoman } from '../src/lib/crs/japan'

const require = createRequire(import.meta.url)
const registry = require('epsg-index/all.json') as Record<
  string,
  { name: string; proj4: string; kind: string }
>

interface Failure {
  code: number | string
  reason: string
}

const failures: Failure[] = []
let checked = 0

function check(code: number, reason: string, ok: boolean): void {
  checked++
  if (!ok) failures.push({ code, reason })
}

function expectContains(code: number, needle: string): void {
  const rec = registry[String(code)]
  if (!rec) {
    check(code, 'EPSG 注册表中不存在该代码', false)
    return
  }
  check(code, `名称应包含「${needle}」，实际为「${rec.name}」`, rec.name.includes(needle))
}

function expectProj4(code: number, needle: string): void {
  const rec = registry[String(code)]
  if (!rec) {
    check(code, 'EPSG 注册表中不存在该代码', false)
    return
  }
  check(code, `proj4 定义应包含「${needle}」，实际为「${rec.proj4}」`, rec.proj4.includes(needle))
}

/** 数值型 proj4 参数按容差比较（注册表会截断循环小数的位数） */
function expectProj4Number(code: number, key: string, expected: number): void {
  const rec = registry[String(code)]
  if (!rec) {
    check(code, 'EPSG 注册表中不存在该代码', false)
    return
  }
  const m = new RegExp(`\\+${key}=([^\\s]+)`).exec(rec.proj4)
  const actual = m ? Number(m[1]) : NaN
  check(
    code,
    `+${key} 应为 ${expected}，实际为 ${m?.[1] ?? '缺失'}`,
    Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9
  )
}

/* ------------------------------------------------------------------ *
 * 日本：3 个 datum × 19 区带
 * ------------------------------------------------------------------ */

for (const d of JP_DATUMS) {
  for (const z of JP_ZONES) {
    const code = japanPlaneEpsg(d.id, z.zone)
    expectContains(code, `Japan Plane Rectangular CS ${toRoman(z.zone)}`)
    expectProj4(code, '+proj=tmerc')
    expectProj4Number(code, 'lat_0', z.lat0)
    expectProj4Number(code, 'lon_0', z.lon0)
    expectProj4Number(code, 'k', 0.9999)
    expectProj4Number(code, 'x_0', 0)
    expectProj4Number(code, 'y_0', 0)
    expectProj4(code, `+ellps=${d.ellps}`)
    // Tokyo 的 towgs84 是 EPSG 现行值，不是旧 proj4js 表的 -148,507,685
    expectProj4(code, `+towgs84=${d.towgs84}`)
    check(code, `代码应映射回第 ${z.zone} 系`, japanZoneOfCode(code) === z.zone)
  }
  const geo = d.epsg
  expectContains(geo, d.id === 'jgd2011' ? 'JGD2011' : d.id === 'jgd2000' ? 'JGD2000' : 'Tokyo')
  expectProj4(geo, `+ellps=${d.ellps}`)
}

/* ------------------------------------------------------------------ *
 * 中国：CGCS2000 3° / 6° 带
 * ------------------------------------------------------------------ */

for (const band of [3, 6] as const) {
  const cms = band === 3 ? CN_CM_3 : CN_CM_6
  for (const cm of cms) {
    const code = chinaGkEpsg('cgcs2000', band, cm)
    // EPSG 官方名称只在 3° 带带「3-degree」前缀，6° 带直接写 Gauss-Kruger
    expectContains(code, `${band === 3 ? '3-degree ' : ''}Gauss-Kruger CM ${cm}E`)
    expectProj4(code, '+proj=tmerc')
    expectProj4Number(code, 'lon_0', cm)
    expectProj4Number(code, 'x_0', 500000)
    expectProj4(code, '+ellps=GRS80')
    check(
      code,
      `中央经线 ${cm}° 应能反算出带号 ${(cm + 3) / 6}`,
      chinaZoneOfCm(cm, band) === (band === 3 ? cm / 3 : (cm + 3) / 6)
    )
  }
}

// 4490 的官方英文名是全称，不是缩写
expectContains(4490, 'China Geodetic Coordinate System 2000')
for (const d of CN_DATUMS) {
  if (d.id === 'cgcs2000') continue
  expectContains(d.epsg, d.label.en.split(' (')[0])
}

/* ------------------------------------------------------------------ *
 * 全球常用
 * ------------------------------------------------------------------ */

const GLOBAL: [number, string][] = [
  [4326, 'WGS 84'],
  [3857, 'WGS 84 / Pseudo-Mercator'],
  [4258, 'ETRS89'],
  [4269, 'NAD83'],
  [4267, 'NAD27'],
  [4277, 'OSGB36'],
  [27700, 'OSGB36 / British National Grid']
]

for (const [code, name] of GLOBAL) expectContains(code, name)

/* ------------------------------------------------------------------ *
 * 报告
 * ------------------------------------------------------------------ */

if (failures.length > 0) {
  console.error(`\n✗ EPSG 核验失败：${failures.length} / ${checked} 条不符\n`)
  for (const f of failures) console.error(`  ${f.code}: ${f.reason}`)
  console.error('\n来源：epsg-index v2.0.0（EPSG 注册表数据集）\n')
  process.exit(1)
}

console.log(`✓ EPSG 核验通过：${checked} 条（日本 3 datum × 19 区带、中国 32 个高斯带、全球 7 个）`)
console.log('  来源：epsg-index v2.0.0（EPSG 注册表数据集）')
console.log('  已纠正 PRD 笔误：JGD2000 平面直角应为 2443~2461，不是 2451~2469')