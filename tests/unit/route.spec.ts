/**
 * 多点里程与 CSV 导出测试（PRD T04 / SR-02 / SR-03 / SR-11）
 *
 * 黄金值的来源：
 *   - `556.14 m` 与 `554.93 m` 直接取自 PRD 6.1 的短距离算例（北京点与其以东
 *     约 556 m 的参考点，椭球值与球面值），是全站唯一有文档背书的距离基准
 *   - 其余断言验证的是**规则**（累计 = 各段之和、重合不报错、不收敛必回退），
 *     不是具体数字，因此用 toBeCloseTo 而不是硬编码全精度值
 */
import { describe, expect, it } from 'vitest'

import {
  COMPASS_UNDEFINED,
  legBetween,
  ROUTE_CSV_DIGITS,
  ROUTE_CSV_HEADER,
  routeCsv,
  routeSegments,
  type RoutePoint
} from '../../src/lib/geo/route'

/** PRD 6.1 算例一：北京点（WGS84） */
const BJ: RoutePoint = { lng: 116.3974, lat: 39.9088 }
/** PRD 6.1 算例中的参考点，与 BJ 相距 556.14 m（椭球） */
const BJ_NEAR: RoutePoint = { lng: 116.40364357, lat: 39.91020348 }
const SH: RoutePoint = { lng: 121.4737, lat: 31.2304 }

describe('legBetween：单段距离与方位角', () => {
  it('椭球模型给出 PRD 6.1 的黄金值 556.14 m', () => {
    const leg = legBetween(BJ, BJ_NEAR, 'ellipsoid')
    expect(leg.meters).toBeCloseTo(556.14, 2)
    expect(leg.model).toBe('ellipsoid')
  })

  it('球面模型给出 PRD 6.1 括注的 554.93 m，且比椭球值略小', () => {
    const sphere = legBetween(BJ, BJ_NEAR, 'sphere')
    const ellipsoid = legBetween(BJ, BJ_NEAR, 'ellipsoid')
    expect(sphere.meters).toBeCloseTo(554.93, 2)
    expect(sphere.meters).toBeLessThan(ellipsoid.meters)
    expect(sphere.model).toBe('sphere')
  })

  it('用户主动选球面时不算「回退」', () => {
    const s = routeSegments([BJ, BJ_NEAR], 'sphere')
    expect(s.legs[0].model).toBe('sphere')
    expect(s.fellBack).toBe(false)
  })

  it('方位角落在 [0, 360)；反向方位角短距离下与正向相差约 180°', () => {
    const leg = legBetween(BJ, BJ_NEAR, 'ellipsoid')
    expect(leg.initialBearing).toBeGreaterThanOrEqual(0)
    expect(leg.initialBearing).toBeLessThan(360)
    // 556 m 这种短距离上子午线收敛可忽略，回望方向就是正向 + 180°
    expect(leg.reverseBearing - leg.initialBearing).toBeCloseTo(180, 1)
  })

  it('长距离上正反方位角不是正好相差 180°（子午线收敛）', () => {
    const long = legBetween(BJ, SH, 'ellipsoid')
    // 正向 152.94°、回望 335.90°，差 182.96° 而不是 180°。
    // 这 3° 就是子午线收敛量 —— 也正是「反向方位角」不能拿
    // 正向 ± 180 糊弄过去的原因（Vincenty 的 α2 = 155.90° 是前进方向）
    expect(long.initialBearing).toBeCloseTo(152.94, 1)
    expect(long.reverseBearing).toBeCloseTo(335.9, 1)
    expect(Math.abs(long.reverseBearing - long.initialBearing - 180)).toBeGreaterThan(1)
  })

  it('椭球与球面两个模型对「反向方位角」的语义一致（回归防护）', () => {
    const e = legBetween(BJ, SH, 'ellipsoid')
    const s = legBetween(BJ, SH, 'sphere')
    // 两个模型的距离差约 0.3%，方位角差得更小。
    // 关键是**语义**必须一致 —— 都指回望方向，不能一个差了 180°。
    // geodesy.ts 的 finalBearing 曾有过这个不一致（椭球给 α2、球面给回望），
    // 已修好；这条断言是防它退回去的护栏
    expect(Math.abs(e.reverseBearing - s.reverseBearing)).toBeLessThan(1)
    expect(Math.abs(e.initialBearing - s.initialBearing)).toBeLessThan(1)
  })

  it('北京 → 上海的罗盘方位是南东南（索引 7）', () => {
    const s = routeSegments([BJ, SH], 'ellipsoid')
    expect(s.legs[0].initialBearing).toBeCloseTo(152.94, 1)
    // 索引 7 = SSE。152.94° / 22.5 = 6.8 → 四舍五入 7
    expect(s.legs[0].compass).toBe(7)
  })

  it('正反方位角各自给出罗盘索引，且相差 8 格（180°）', () => {
    const s = routeSegments([BJ, BJ_NEAR], 'ellipsoid')
    // 正向 73.73° / 22.5 → 3 = 东东北（ENE）
    expect(s.legs[0].compass).toBe(3)
    // 回望 253.73° / 22.5 → 11 = 西西南（WSW），与正向正好相反
    expect(s.legs[0].compassRev).toBe(11)
    expect((s.legs[0].compassRev - s.legs[0].compass + 16) % 16).toBe(8)
  })
})

describe('PRD T04 专属异常①：两点重合', () => {
  it('距离为 0、方位角未定义，但**不是错误**（正常返回对象）', () => {
    const s = routeSegments([BJ, BJ], 'ellipsoid')
    expect(s.legs).toHaveLength(1)
    expect(s.legs[0].meters).toBe(0)
    expect(s.legs[0].coincident).toBe(true)
    expect(Number.isNaN(s.legs[0].initialBearing)).toBe(true)
    expect(Number.isNaN(s.legs[0].reverseBearing)).toBe(true)
    expect(s.legs[0].compass).toBe(COMPASS_UNDEFINED)
    expect(s.legs[0].compassRev).toBe(COMPASS_UNDEFINED)
    expect(s.totalMeters).toBe(0)
  })

  it('球面模型下同样判为重合（公式退化不能给出「正北」）', () => {
    const s = routeSegments([BJ, BJ], 'sphere')
    expect(s.legs[0].coincident).toBe(true)
    expect(Number.isNaN(s.legs[0].initialBearing)).toBe(true)
  })

  it('重合判定用严格相等：相距极小的两点仍有良定义的方位角', () => {
    const near: RoutePoint = { lng: BJ.lng + 1e-9, lat: BJ.lat }
    const leg = legBetween(BJ, near, 'ellipsoid')
    expect(leg.coincident).toBe(false)
    expect(leg.initialBearing).toBeCloseTo(90, 6) // 正东
  })
})

describe('多点：分段距离与累计里程', () => {
  it('legs 数量 = 点数 − 1，index 从 1 开始', () => {
    const s = routeSegments([BJ, SH, BJ_NEAR], 'ellipsoid')
    expect(s.legs).toHaveLength(2)
    expect(s.legs.map((l) => l.index)).toEqual([1, 2])
  })

  it('累计里程逐段递增，末段累计 = 全程里程', () => {
    const s = routeSegments([BJ, SH, BJ_NEAR], 'ellipsoid')
    expect(s.legs[0].cumulativeMeters).toBe(s.legs[0].meters)
    expect(s.legs[1].cumulativeMeters).toBeCloseTo(s.legs[0].meters + s.legs[1].meters, 6)
    expect(s.totalMeters).toBeCloseTo(s.legs[1].cumulativeMeters, 6)
  })

  it('不排序、不去重：折返路线按用户给的顺序累加', () => {
    const s = routeSegments([BJ, SH, BJ], 'ellipsoid')
    expect(s.legs).toHaveLength(2)
    // A→B→A 的里程是单程的两倍，而不是 0
    expect(s.totalMeters).toBeCloseTo(2 * s.legs[0].meters, 6)
  })

  it('点数 <2 时返回空 legs 而不是抛异常（专属异常②由调用方处理）', () => {
    expect(routeSegments([], 'ellipsoid').legs).toEqual([])
    expect(routeSegments([BJ], 'ellipsoid').legs).toEqual([])
    expect(routeSegments([BJ], 'ellipsoid').totalMeters).toBe(0)
  })

  it('一段重合不影响其余段', () => {
    const s = routeSegments([BJ, BJ, SH], 'ellipsoid')
    expect(s.legs[0].coincident).toBe(true)
    expect(s.legs[1].coincident).toBe(false)
    expect(s.totalMeters).toBeCloseTo(s.legs[1].meters, 6)
  })
})

describe('PRD T04：Vincenty 不收敛 → 自动回退球面并标注', () => {
  it('近对跖点回退，fellBack 为 true', () => {
    const s = routeSegments([{ lng: 0, lat: 0 }, { lng: 179.7, lat: 0.5 }], 'ellipsoid')
    expect(s.legs[0].model).toBe('sphere')
    expect(s.fellBack).toBe(true)
    expect(s.legs[0].meters).toBeCloseTo(19_950_277, -2)
  })

  it('正对跖点（0,0 → 180,0）同样回退', () => {
    const s = routeSegments([{ lng: 0, lat: 0 }, { lng: 180, lat: 0 }], 'ellipsoid')
    expect(s.fellBack).toBe(true)
    expect(s.legs[0].meters).toBeCloseTo(20_015_114, -2)
  })

  it('多段路线中只要有一段回退，fellBack 就为 true', () => {
    const s = routeSegments([BJ, SH, { lng: 179.7, lat: 0.5 }, { lng: 0, lat: 0 }], 'ellipsoid')
    expect(s.fellBack).toBe(true)
    expect(s.legs.filter((l) => l.model === 'sphere').length).toBeGreaterThan(0)
  })

  it('普通距离不回退', () => {
    expect(routeSegments([BJ, SH], 'ellipsoid').fellBack).toBe(false)
  })
})

describe('routeCsv：导出与复制的标准数值形态（SR-11）', () => {
  it('首行是固定的 ASCII 表头，不随语言变化', () => {
    const csv = routeCsv(routeSegments([BJ, SH], 'ellipsoid'))
    expect(csv.split('\r\n')[0]).toBe(ROUTE_CSV_HEADER.join(','))
    expect(ROUTE_CSV_HEADER).toContain('distance_m')
  })

  it('行尾用 CRLF（Excel for Windows 粘贴只含 LF 的文本会挤进一个单元格）', () => {
    const csv = routeCsv(routeSegments([BJ, SH, BJ_NEAR], 'ellipsoid'))
    expect(csv.split('\r\n')).toHaveLength(3) // 表头 + 2 段
    expect(csv).not.toMatch(/(?<!\r)\n/)
  })

  it('每行字段数与表头一致，且数值列不含千分位逗号', () => {
    const csv = routeCsv(routeSegments([BJ, SH, BJ_NEAR], 'ellipsoid'))
    for (const line of csv.split('\r\n')) {
      expect(line.split(',')).toHaveLength(ROUTE_CSV_HEADER.length)
    }
    // 千分位会让字段数变多，上面的断言已经覆盖；这里再直接查一遍形态
    expect(csv).toMatch(/1066690\.18/)
    expect(csv).not.toMatch(/1,066,690/)
  })

  it('小数位数按 ROUTE_CSV_DIGITS：坐标 8 位、距离 2 位、方位角 2 位', () => {
    expect(ROUTE_CSV_DIGITS).toEqual({ coordDigits: 8, distanceDigits: 2, bearingDigits: 2 })
    const csv = routeCsv(routeSegments([BJ, SH], 'ellipsoid'))
    expect(csv.split('\r\n')[1]).toBe(
      '1,116.39740000,39.90880000,121.47370000,31.23040000,1066690.18,152.94,1066690.18'
    )
  })

  it('重合段的方位角是空单元格，不是 0 也不是 N/A', () => {
    const csv = routeCsv(routeSegments([BJ, BJ], 'ellipsoid'))
    const cells = csv.split('\r\n')[1].split(',')
    expect(cells[5]).toBe('0.00') // 距离照常给 0
    expect(cells[6]).toBe('') // 方位角留空
  })

  it('不追加 total 行：末行的 cumulative_m 就是全程里程', () => {
    const s = routeSegments([BJ, SH, BJ_NEAR], 'ellipsoid')
    const lines = routeCsv(s).split('\r\n')
    expect(lines).toHaveLength(1 + s.legs.length)
    const last = lines[lines.length - 1].split(',')
    expect(Number(last[7])).toBeCloseTo(s.totalMeters, 2)
  })

  it('没有分段时只输出表头', () => {
    expect(routeCsv(routeSegments([BJ], 'ellipsoid'))).toBe(ROUTE_CSV_HEADER.join(','))
  })
})
