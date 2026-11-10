/**
 * 大地测量算法的黄金测试（SR-03 计算基准）
 *
 * 🔑 本文件的重点是 `finalBearing` 的**语义**：
 * 它曾被实现成 Vincenty 的 α2（到达时的前进方向），而接口注释与球面回退分支
 * 给的都是「回望起点」，两者相差整整 180° —— 差 180° 意味着用户会朝完全
 * 相反的方向走，而且近对跖点触发回退时结果会突变，很难被发现。
 * 下面几条断言就是这道回归防护。
 */
import { describe, expect, it } from 'vitest'

import {
  compass16Index,
  distanceAndBearing,
  haversineDistance,
  normalize360,
  normalizeLng,
  sphericalBearing,
  vincentyDirect,
  vincentyInverse
} from '../../src/lib/geo/geodesy'

/** 北京（WGS84） */
const BJ = { lat: 39.9088, lng: 116.3974 }
/** 上海（WGS84） */
const SH = { lat: 31.2304, lng: 121.4737 }
/** 北京的近对跖点附近：南纬 39.9、西经 63.6 —— Vincenty 在这一带不收敛 */
const NEAR_ANTIPODE = { lat: -39.9088, lng: -63.6026 }

describe('Vincenty 反算：距离与方位角', () => {
  it('北京 → 上海的距离约 1067 km（椭球）', () => {
    const r = vincentyInverse(BJ.lat, BJ.lng, SH.lat, SH.lng)
    expect(r).toBeDefined()
    expect(r!.distance / 1000).toBeCloseTo(1067, -1)
    expect(r!.iterations).toBeGreaterThan(0)
  })

  it('finalBearing 是「回望起点」的方向，不是 α2 前进方向', () => {
    const r = vincentyInverse(BJ.lat, BJ.lng, SH.lat, SH.lng)!
    // 正向 152.94°（南东南）。α2 是 155.90°，回望方向是 335.90°
    expect(r.initialBearing).toBeCloseTo(152.94, 1)
    expect(r.finalBearing).toBeCloseTo(335.9, 1)
    // 回归防护：绝不能又变回 α2
    expect(Math.abs(r.finalBearing - 155.9)).toBeGreaterThan(1)
  })

  it('短距离上正反方位角相差约 180°（子午线收敛可忽略）', () => {
    const near = { lat: BJ.lat, lng: BJ.lng + 0.01 }
    const r = vincentyInverse(BJ.lat, BJ.lng, near.lat, near.lng)!
    expect(normalize360(r.finalBearing - r.initialBearing)).toBeCloseTo(180, 1)
  })

  it('两点重合：距离 0、方位角 NaN，且不抛异常（PRD T04 专属异常①）', () => {
    const r = vincentyInverse(BJ.lat, BJ.lng, BJ.lat, BJ.lng)!
    expect(r.distance).toBe(0)
    expect(Number.isNaN(r.initialBearing)).toBe(true)
    expect(Number.isNaN(r.finalBearing)).toBe(true)
  })
})

describe('distanceAndBearing：模型选择与回退', () => {
  it('常规距离走椭球', () => {
    const r = distanceAndBearing(BJ.lat, BJ.lng, SH.lat, SH.lng)
    expect(r.model).toBe('ellipsoid')
  })

  it('近对跖点回退到球面，且 finalBearing 语义不变（不突变 180°）', () => {
    const r = distanceAndBearing(BJ.lat, BJ.lng, NEAR_ANTIPODE.lat, NEAR_ANTIPODE.lng)
    expect(r.model).toBe('sphere')
    // 回退后距离应接近半周长（约 20000 km 量级），而不是 0 或 NaN
    expect(r.distance / 1000).toBeGreaterThan(19000)
    // 语义一致性：球面路径下回望方向 = 交换两点后的正向方位角
    const back = sphericalBearing(NEAR_ANTIPODE.lat, NEAR_ANTIPODE.lng, BJ.lat, BJ.lng)
    expect(normalize360(r.finalBearing - back)).toBeCloseTo(0, 6)
  })
})

describe('球面模型（Haversine）', () => {
  it('与椭球结果相差约 0.3%（PRD T04 高级选项里要向用户说明的量级）', () => {
    const ellipsoid = vincentyInverse(BJ.lat, BJ.lng, SH.lat, SH.lng)!.distance
    const sphere = haversineDistance(BJ.lat, BJ.lng, SH.lat, SH.lng)
    const diff = Math.abs(sphere - ellipsoid) / ellipsoid
    expect(diff).toBeLessThan(0.005)
    expect(diff).toBeGreaterThan(0.0005)
  })

  it('赤道向正东：方位角 90°', () => {
    expect(sphericalBearing(0, 0, 0, 10)).toBeCloseTo(90, 6)
  })
})

describe('Vincenty 正算', () => {
  it('正算的 finalBearing 是前进方向 α2，与反算的回望语义刻意不同', () => {
    const r = vincentyDirect(BJ.lat, BJ.lng, 90, 100_000)!
    // 向东走 100 km，航向只因子午线收敛略微偏离 90°，绝不会跑到 270° 附近
    expect(r.finalBearing).toBeCloseTo(90, -1)
    expect(r.lng).toBeGreaterThan(BJ.lng)
  })

  it('Vincenty 1975 原文算例：Flinders Peak → Buninyong（正算黄金测试）', () => {
    // 起点 Flinders Peak：37°57'03.72030"S 144°25'29.52440"E
    // 方位角 306°52'05.37"，距离 54972.271 m
    // 期望终点 Buninyong：37°39'10.15610"S 143°55'35.38390"E，到达方位角 307°10'25.07"
    // 这是 Vincenty 论文自带的算例，也是唯一能锁死「经度修正项符号」的权威数据 ——
    // 符号写反不会报错，只会让经度偏掉两倍修正量（500 km 路径上约 1 km）
    const r = vincentyDirect(-(37 + 57 / 60 + 3.7203 / 3600), 144 + 25 / 60 + 29.5244 / 3600, 306 + 52 / 60 + 5.37 / 3600, 54972.271)!
    expect(r.lat).toBeCloseTo(-(37 + 39 / 60 + 10.1561 / 3600), 7)
    expect(r.lng).toBeCloseTo(143 + 55 / 60 + 35.3839 / 3600, 7)
    expect(r.finalBearing).toBeCloseTo(307 + 10 / 60 + 25.07 / 3600, 4)
  })

  it('正算 → 反算闭环：距离与终点能还原', () => {
    const d = vincentyDirect(BJ.lat, BJ.lng, 45, 500_000)!
    const back = vincentyInverse(BJ.lat, BJ.lng, d.lat, d.lng)!
    // 收敛阈值 1e-12 弧度 ≈ 6.4e-6 m，闭环误差应在亚米级
    expect(Math.abs(back.distance - 500_000)).toBeLessThan(1)
    expect(back.initialBearing).toBeCloseTo(45, 6)
  })

  it('零距离正算原地返回', () => {
    const r = vincentyDirect(BJ.lat, BJ.lng, 123, 0)!
    expect(r.lat).toBe(BJ.lat)
    expect(r.lng).toBe(BJ.lng)
    expect(r.finalBearing).toBeCloseTo(123, 6)
  })
})

describe('归一化与罗盘索引', () => {
  it('normalize360 落到 [0, 360)', () => {
    expect(normalize360(-90)).toBe(270)
    expect(normalize360(360)).toBe(0)
    expect(normalize360(720.5)).toBeCloseTo(0.5, 10)
  })

  it('normalizeLng 落到 (−180, 180]', () => {
    expect(normalizeLng(190)).toBeCloseTo(-170, 10)
    expect(normalizeLng(-180)).toBe(180)
    expect(normalizeLng(116.3974)).toBeCloseTo(116.3974, 10)
  })

  it('compass16Index：0 = 北，每 22.5° 一格，四舍五入', () => {
    expect(compass16Index(0)).toBe(0)
    expect(compass16Index(152.94)).toBe(7) // SSE
    expect(compass16Index(359)).toBe(0)
    // 340° → 340/22.5 = 15.1 → 15 = 北北西。
    // 不用 −11.25（= 348.75°）这种正好压在格线上的值：Math.round(15.5) = 16，
    // 16 % 16 = 0 会归到「北」，边界归属取决于舍入方向，不适合当断言
    expect(compass16Index(-20)).toBe(15)
  })
})
