/**
 * 太阳位置与日出日落测试（PRD T11 / SR-02「时刻精确到分钟」/ SR-03「结果一致性」）
 *
 * 黄金值的来源与容差依据：
 *   - 北京、赤道、Tromsø 的时刻由 NOAA Solar Calculator 的同一套公式实算，
 *     并与公开日出日落表核对到分钟。NOAA 低精度太阳位置本身的误差约 ±1 分钟，
 *     再叠加「用正午附近的赤纬近似整天」的偏差，因此普通日期给 ±4 分钟；
 *     赤道春分另有 ±10 分钟的规格要求，见对应用例注释。
 *   - 赤纬与时差方程直接对照天文年历的常识值（6 月至点 +23.44°、
 *     11 月初时差 +16.4 min、2 月中旬 −14.2 min），容差分别取 0.3° / 0.5 min。
 *   - 其余断言验证的是**规则**（昼长 = 日落 − 日出、曙暮光先后、方位角范围、
 *     重复调用一致），不是某个具体数字，因此不硬编码全精度值。
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  bestFixedTilt,
  isSupportedDate,
  solarPosition,
  sunTimes,
  timezoneFromLongitude,
  ZENITH_ASTRONOMICAL,
  ZENITH_CIVIL,
  ZENITH_NAUTICAL,
  ZENITH_OFFICIAL,
  type CalendarDate
} from '../../src/lib/astro/sun'

/** 时:分 → 当地分钟数 */
const hm = (h: number, m: number): number => h * 60 + m

/**
 * 断言某时刻在期望值 ±tolerance 分钟内。
 * 单独抽出来是为了让「黄金值 + 容差」在用例里一眼可读，而不是散落成
 * `Math.abs(...) < ...`。null 视为失败（极昼极夜用例会显式断言 null）。
 */
function expectNear(actual: number | null, expected: number, tolerance: number): void {
  if (actual === null) throw new Error(`期望 ${expected} 分钟附近，实际为 null`)
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

/** 北京（天安门附近） */
const BJ = { lat: 39.9088, lng: 116.3974 }
const BJ_JUN: CalendarDate = { year: 2024, month: 6, day: 21 }
const BJ_DEC: CalendarDate = { year: 2024, month: 12, day: 21 }
/** 赤道本初子午线交点 */
const EQ = { lat: 0, lng: 0 }
const EQ_MAR: CalendarDate = { year: 2024, month: 3, day: 20 }

describe('天顶角常量', () => {
  it('四个天顶角符合 NOAA 定义（日出 90.833°，三种曙暮光 96/102/108°）', () => {
    expect(ZENITH_OFFICIAL).toBe(90.833)
    expect(ZENITH_CIVIL).toBe(96)
    expect(ZENITH_NAUTICAL).toBe(102)
    expect(ZENITH_ASTRONOMICAL).toBe(108)
    // 数值必须递增：天顶角越大，太阳越深在地平线下，事件发生得越早/越晚
    expect(ZENITH_OFFICIAL).toBeLessThan(ZENITH_CIVIL)
    expect(ZENITH_CIVIL).toBeLessThan(ZENITH_NAUTICAL)
    expect(ZENITH_NAUTICAL).toBeLessThan(ZENITH_ASTRONOMICAL)
  })
})

describe('北京夏至（2024-06-21，UTC+8）', () => {
  const t = sunTimes(BJ_JUN, BJ.lat, BJ.lng, 480)

  it('日出约 04:46（±4 分钟）', () => {
    // NOAA 实算 04:46.1，与 PRD T11 规格表一致。
    // ±4 分钟覆盖低精度太阳位置 + 用正午赤纬近似整天的误差
    expectNear(t.sunrise, hm(4, 46), 4)
  })

  it('日落约 19:46（±4 分钟）', () => {
    expectNear(t.sunset, hm(19, 46), 4)
  })

  it('昼长约 15 小时（±4 分钟）', () => {
    expectNear(t.dayLength, 15 * 60, 4)
  })

  it('不是极昼 / 极夜', () => {
    expect(t.polar).toBe('none')
  })
})

describe('北京冬至（2024-12-21，UTC+8）', () => {
  const t = sunTimes(BJ_DEC, BJ.lat, BJ.lng, 480)

  it('日出约 07:33（±4 分钟）', () => {
    expectNear(t.sunrise, hm(7, 33), 4)
  })

  it('日落约 16:53（±4 分钟）', () => {
    expectNear(t.sunset, hm(16, 53), 4)
  })

  it('昼长约 9 小时 20 分（±4 分钟）', () => {
    expectNear(t.dayLength, 9 * 60 + 20, 4)
  })

  it('昼长比夏至少约 5 小时 40 分', () => {
    const summer = sunTimes(BJ_JUN, BJ.lat, BJ.lng, 480)
    // 15:00 − 9:20 = 5:40。北京纬度上冬夏昼长差近 6 小时，这是最直观的自洽校验
    expect(summer.dayLength - t.dayLength).toBeCloseTo(5 * 60 + 40, -2)
  })
})

describe('赤道春分（0N, 0E，2024-03-20）', () => {
  const t = sunTimes(EQ_MAR, EQ.lat, EQ.lng, 0)

  it('日出约 06:04（PRD 的 06:00 是整点提示，权威值含时差方程偏移）', () => {
    // 赤道春分昼夜理论上各 12 小时，但：
    //   ① 日出天顶角 90.833°（蒙气差 + 日面半径）让白昼多出约 6 分钟
    //   ② 2024-03-20 的时差方程约 −7.3 分钟，把整条时间轴向后推
    // 因此 NOAA / 公开日出表给出 06:04 与 18:11，而不是 06:00 / 18:00。
    // 规格里的「±10 分钟」容差恰好卡在 18:00 + 11 分的边界上，故以实算值为准
    expectNear(t.sunrise, hm(6, 4), 10)
  })

  it('日落约 18:11（同上，时差方程使日落晚于 18:00）', () => {
    expectNear(t.sunset, hm(18, 11), 10)
  })

  it('昼长略多于 12 小时（约 12 小时 07 分）', () => {
    expectNear(t.dayLength, 12 * 60 + 7, 3)
  })
})

describe('太阳赤纬', () => {
  it('2024-06-21 约 +23.44°（±0.3°）', () => {
    const p = solarPosition(BJ_JUN, 720, BJ.lat, BJ.lng, 480)
    expectNear(p.declination, 23.44, 0.3)
  })

  it('2024-12-21 约 −23.44°（±0.3°）', () => {
    const p = solarPosition(BJ_DEC, 720, BJ.lat, BJ.lng, 480)
    expectNear(p.declination, -23.44, 0.3)
  })

  it('2024-03-20 约 0°（±0.3°）', () => {
    // 春分当天赤纬并非严格 0：交点时刻不在 0h，日间会漂到 +0.15° 左右
    const p = solarPosition(EQ_MAR, 720, EQ.lat, EQ.lng, 0)
    expectNear(p.declination, 0, 0.3)
  })
})

describe('时差方程（equation of time）', () => {
  it('11 月初约 +16.4 分钟（±0.5）', () => {
    const p = solarPosition({ year: 2024, month: 11, day: 3 }, 720, 0, 0, 0)
    expectNear(p.equationOfTime, 16.4, 0.5)
  })

  it('2 月中旬约 −14.2 分钟（±0.5）', () => {
    const p = solarPosition({ year: 2024, month: 2, day: 11 }, 720, 0, 0, 0)
    expectNear(p.equationOfTime, -14.2, 0.5)
  })

  it('正值表示日晷快于钟表：11 月初太阳正午早于 12:00', () => {
    // 时差方程的正负号是这类算法最常见的错误来源。约定：
    //   EoT > 0 → 真太阳时领先平太阳时 → 太阳正午在钟表 12:00 之前
    const d: CalendarDate = { year: 2024, month: 11, day: 3 }
    const p = solarPosition(d, 720, 0, 0, 0)
    const t = sunTimes(d, 0, 0, 0)
    expect(p.equationOfTime).toBeGreaterThan(0)
    expect(t.solarNoon).toBeLessThan(720)
    expect(720 - t.solarNoon).toBeCloseTo(p.equationOfTime, 0)
  })
})

describe('极昼与极夜（Tromsø 69.65N, 18.96E，UTC+1）', () => {
  const SUMMER: CalendarDate = { year: 2024, month: 6, day: 21 }
  const WINTER: CalendarDate = { year: 2024, month: 12, day: 21 }

  it('夏至为极昼，日出/日落均为 null（不报错、不返回无效时间）', () => {
    const t = sunTimes(SUMMER, 69.65, 18.96, 60)
    expect(t.polar).toBe('polarDay')
    expect(t.sunrise).toBeNull()
    expect(t.sunset).toBeNull()
  })

  it('极昼昼长为 24 小时（1440 分钟）', () => {
    const t = sunTimes(SUMMER, 69.65, 18.96, 60)
    expect(t.dayLength).toBe(1440)
  })

  it('极昼时三种曙暮光也不存在（太阳始终在地平线上）', () => {
    const t = sunTimes(SUMMER, 69.65, 18.96, 60)
    expect(t.civilDawn).toBeNull()
    expect(t.civilDusk).toBeNull()
    expect(t.nauticalDawn).toBeNull()
    expect(t.nauticalDusk).toBeNull()
    expect(t.astroDawn).toBeNull()
    expect(t.astroDusk).toBeNull()
  })

  it('冬至为极夜，昼长为 0', () => {
    const t = sunTimes(WINTER, 69.65, 18.96, 60)
    expect(t.polar).toBe('polarNight')
    expect(t.sunrise).toBeNull()
    expect(t.sunset).toBeNull()
    expect(t.dayLength).toBe(0)
  })

  it('极夜只是「太阳不升起」，民用/航海/天文曙暮光仍各自存在', () => {
    // 极夜 ≠ 全天漆黑。太阳在地平线下 6°/12°/18° 以内时仍有曙暮光，
    // 因此这三种时刻必须独立判空，不能因为日出为 null 就一起置 null
    const t = sunTimes(WINTER, 69.65, 18.96, 60)
    expect(t.civilDawn).not.toBeNull()
    expect(t.civilDusk).not.toBeNull()
    expect(t.nauticalDawn).not.toBeNull()
    expect(t.astroDawn).not.toBeNull()
    // 顺序与北京一致：天文 dawn 最早，民用 dawn 最晚
    expect(t.astroDawn!).toBeLessThan(t.nauticalDawn!)
    expect(t.nauticalDawn!).toBeLessThan(t.civilDawn!)
  })

  it('极夜时正午太阳高度角在水平线以下', () => {
    const t = sunTimes(WINTER, 69.65, 18.96, 60)
    const p = solarPosition(WINTER, t.solarNoon, 69.65, 18.96, 60)
    expect(p.altitude).toBeLessThan(0)
  })
})

describe('规则断言：时刻之间的关系', () => {
  it('昼长 = 日落 − 日出（容差 1 分钟，实际是同一组加减）', () => {
    for (const [date, lat, lng, tz] of [
      [BJ_JUN, BJ.lat, BJ.lng, 480],
      [BJ_DEC, BJ.lat, BJ.lng, 480],
      [EQ_MAR, EQ.lat, EQ.lng, 0]
    ] as const) {
      const t = sunTimes(date, lat, lng, tz)
      expect(t.sunrise).not.toBeNull()
      expect(t.sunset).not.toBeNull()
      expect(t.dayLength).toBeCloseTo(t.sunset! - t.sunrise!, 6)
      expect(Math.abs(t.dayLength - (t.sunset! - t.sunrise!))).toBeLessThan(1)
    }
  })

  it('日出 < 太阳正午 < 日落（非极昼极夜）', () => {
    for (const [date, lat, lng, tz] of [
      [BJ_JUN, BJ.lat, BJ.lng, 480],
      [BJ_DEC, BJ.lat, BJ.lng, 480],
      [EQ_MAR, EQ.lat, EQ.lng, 0]
    ] as const) {
      const t = sunTimes(date, lat, lng, tz)
      expect(t.sunrise!).toBeLessThan(t.solarNoon)
      expect(t.solarNoon).toBeLessThan(t.sunset!)
    }
  })

  it('太阳正午 ≈ 720 − 4·lng + tz（±3 分钟，差值即时差方程）', () => {
    // 正午公式里没有时差方程项；允许 ±3 分钟，因为一年中时差方程在 −14~+16 分之间，
    // 这里只验证经度与时区换算没写反（写反会让正午偏出好几个小时）
    for (const [date, lat, lng, tz] of [
      [BJ_JUN, BJ.lat, BJ.lng, 480],
      [{ year: 2024, month: 6, day: 21 }, 20.5937, 77.2, 330],
      [BJ_DEC, BJ.lat, BJ.lng, 480]
    ] as const) {
      const t = sunTimes(date, lat, lng, tz)
      expectNear(t.solarNoon, 720 - 4 * lng + tz, 3)
    }
  })

  it('太阳正午落在当天 ±0.5 天以内（|noon − 720| ≤ 720）', () => {
    const t = sunTimes(BJ_JUN, BJ.lat, BJ.lng, 480)
    expect(Math.abs(t.solarNoon - 720)).toBeLessThanOrEqual(720)
  })

  it('曙暮光 dawn 按天文 → 航海 → 民用依次变晚', () => {
    const t = sunTimes(BJ_JUN, BJ.lat, BJ.lng, 480)
    // 天文 dawn 最早（太阳在地平线下 18° 时天边刚开始有光），
    // 民用 dawn 最晚（−6°，已接近日出）
    expect(t.astroDawn!).toBeLessThan(t.nauticalDawn!)
    expect(t.nauticalDawn!).toBeLessThan(t.civilDawn!)
    expect(t.civilDawn!).toBeLessThan(t.sunrise!)
  })

  it('曙暮光 dusk 按民用 → 航海 → 天文依次变晚', () => {
    const t = sunTimes(BJ_JUN, BJ.lat, BJ.lng, 480)
    expect(t.civilDusk!).toBeLessThan(t.nauticalDusk!)
    expect(t.nauticalDusk!).toBeLessThan(t.astroDusk!)
  })

  it('高纬夏季三种曙暮光独立判空：Oslo 有民用暮光，但没有航海/天文暮光', () => {
    // 59.91N 夏至的午夜太阳高度约 −6.6°，只穿过 96° 天顶角，
    // 不穿过 102°/108°。若实现把三种暮光绑在一起，这条会失败
    const t = sunTimes(BJ_JUN, 59.9139, 10.7522, 60)
    expect(t.polar).toBe('none')
    expect(t.civilDawn).not.toBeNull()
    expect(t.civilDusk).not.toBeNull()
    expect(t.nauticalDawn).toBeNull()
    expect(t.nauticalDusk).toBeNull()
    expect(t.astroDawn).toBeNull()
    expect(t.astroDusk).toBeNull()
  })

  it('北半球夏至正午高度角 ≈ 90 − |lat − 23.44|（±0.3°）', () => {
    const t = sunTimes(BJ_JUN, BJ.lat, BJ.lng, 480)
    const p = solarPosition(BJ_JUN, t.solarNoon, BJ.lat, BJ.lng, 480)
    expect(Math.abs(p.altitude - (90 - Math.abs(BJ.lat - 23.44)))).toBeLessThan(0.3)
  })

  it('方位角始终落在 [0, 360)', () => {
    for (const minutes of [0, 360, 720, 1080, 1439]) {
      const p = solarPosition(BJ_JUN, minutes, BJ.lat, BJ.lng, 480)
      expect(p.azimuth).toBeGreaterThanOrEqual(0)
      expect(p.azimuth).toBeLessThan(360)
    }
  })

  it('北半球太阳正午方位角约 180°（正南，±2°）', () => {
    const t = sunTimes(BJ_JUN, BJ.lat, BJ.lng, 480)
    const p = solarPosition(BJ_JUN, t.solarNoon, BJ.lat, BJ.lng, 480)
    expect(Math.abs(p.azimuth - 180)).toBeLessThan(2)
  })

  it('南半球太阳正午方位角约 0°（正北，±2°）', () => {
    // 悉尼冬至（南半球夏至）正午太阳在正北，方位角归一化后可能是 0 或 360 附近
    const date: CalendarDate = { year: 2024, month: 12, day: 21 }
    const t = sunTimes(date, -33.8688, 151.2093, 600)
    const p = solarPosition(date, t.solarNoon, -33.8688, 151.2093, 600)
    const off = Math.min(p.azimuth, 360 - p.azimuth)
    expect(off).toBeLessThan(2)
  })

  it('午夜太阳高度角为负（北京夏至约 −26.5°）', () => {
    const p = solarPosition(BJ_JUN, 0, BJ.lat, BJ.lng, 480)
    expect(p.altitude).toBeLessThan(0)
  })

  it('同一输入重复调用结果完全一致（无随机、无当前时间依赖）', () => {
    const a = sunTimes(BJ_JUN, BJ.lat, BJ.lng, 480)
    const b = sunTimes(BJ_JUN, BJ.lat, BJ.lng, 480)
    expect(a).toEqual(b)

    const pa = solarPosition(BJ_JUN, 500, BJ.lat, BJ.lng, 480)
    const pb = solarPosition(BJ_JUN, 500, BJ.lat, BJ.lng, 480)
    expect(pa).toEqual(pb)
  })

  it('源码中不出现 Date.now / new Date / Math.random（时间与随机都必须来自入参）', () => {
    // SR-03：同一输入在任意时间点必须得到相同结果。直接扫描源码，
    // 防止以后有人为了「默认当前时间」在 lib 里读取系统时钟
    const source = readFileSync(new URL('../../src/lib/astro/sun.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/Date\.now|new Date|Math\.random/)
  })
})

describe('timezoneFromLongitude：理论时区', () => {
  it('116.4E → +480、139.7E → +540、0 → 0、−179 → −720、179 → +720', () => {
    expect(timezoneFromLongitude(116.4)).toBe(480)
    expect(timezoneFromLongitude(139.7)).toBe(540)
    expect(timezoneFromLongitude(0)).toBe(0)
    expect(timezoneFromLongitude(-179)).toBe(-720)
    expect(timezoneFromLongitude(179)).toBe(720)
  })

  it('结果夹在 [−12, +14] 小时：220E → +840、−220 → −720', () => {
    // 现实中最东的时区是 +14（基里巴斯），最西是 −12
    expect(timezoneFromLongitude(220)).toBe(14 * 60)
    expect(timezoneFromLongitude(-220)).toBe(-12 * 60)
  })
})

describe('isSupportedDate：算法有效范围 1900-01-01 ~ 2100-12-31', () => {
  it('边界日期：1900-01-01 true、1899-12-31 false、2100-12-31 true、2101-01-01 false', () => {
    expect(isSupportedDate({ year: 1900, month: 1, day: 1 })).toBe(true)
    expect(isSupportedDate({ year: 1899, month: 12, day: 31 })).toBe(false)
    expect(isSupportedDate({ year: 2100, month: 12, day: 31 })).toBe(true)
    expect(isSupportedDate({ year: 2101, month: 1, day: 1 })).toBe(false)
  })

  it('拒绝不存在的日期：2024-02-30、2023-02-29、月份 0/13', () => {
    expect(isSupportedDate({ year: 2024, month: 2, day: 30 })).toBe(false)
    expect(isSupportedDate({ year: 2023, month: 2, day: 29 })).toBe(false)
    expect(isSupportedDate({ year: 2024, month: 0, day: 1 })).toBe(false)
    expect(isSupportedDate({ year: 2024, month: 13, day: 1 })).toBe(false)
    // 闰年 2 月 29 日有效
    expect(isSupportedDate({ year: 2024, month: 2, day: 29 })).toBe(true)
  })
})

describe('bestFixedTilt：最佳固定倾角参考值', () => {
  it('0° → 0°、90° → 90°、南北半球对称（±45° → 45°）', () => {
    expect(bestFixedTilt(0)).toBe(0)
    expect(bestFixedTilt(90)).toBe(90)
    expect(bestFixedTilt(45)).toBe(45)
    expect(bestFixedTilt(-45)).toBe(45)
  })

  it('随 |纬度| 单调不减', () => {
    const lats = [0, 15, 30, 45, 60, 75, 90]
    for (let i = 1; i < lats.length; i++) {
      expect(bestFixedTilt(lats[i])).toBeGreaterThanOrEqual(bestFixedTilt(lats[i - 1]))
    }
    // 南半球镜像与北半球逐点相等
    for (const lat of lats) {
      expect(bestFixedTilt(-lat)).toBe(bestFixedTilt(lat))
    }
  })
})

describe('非整点 UTC 偏移（SR-03：允许 +5:30 这类值）', () => {
  it('印度 77.2E / +5:30 的夏至日出约 05:42（±5 分钟）', () => {
    // 任务给的 05:23 与独立核算不符：20.59N 夏至昼长约 13h23m，
    // 太阳正午约 12:23 IST，因此日出必然落在 05:42 附近。
    // 用「与 +5:00 相比整体平移 30 分钟」的规则断言做交叉校验（下一条）
    const t = sunTimes(BJ_JUN, 20.5937, 77.2, 330)
    expectNear(t.sunrise, hm(5, 42), 5)
  })

  it('同一地点把 +330 换成 +300，所有时刻整体平移 30 分钟', () => {
    const plus330 = sunTimes(BJ_JUN, 20.5937, 77.2, 330)
    const plus300 = sunTimes(BJ_JUN, 20.5937, 77.2, 300)
    expect(plus330.sunrise! - plus300.sunrise!).toBeCloseTo(30, 2)
    expect(plus330.sunset! - plus300.sunset!).toBeCloseTo(30, 2)
    expect(plus330.solarNoon - plus300.solarNoon).toBeCloseTo(30, 2)
  })
})