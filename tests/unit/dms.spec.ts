/**
 * 度分秒转换测试（T02，PRD 6.1 规格表）
 *
 * 黄金值来自 PRD 6.1 算例一：
 *   116.3974 → `116°23'50.64"E`    39.9088 → `39°54'31.68"N`
 */
import { describe, expect, it } from 'vitest'

import {
  decimalToDm,
  decimalToDms,
  dmToDecimal,
  dmsToDecimal,
  formatDecimal,
  formatDmsSymbolic,
  formatDmsTextual,
  parseDmsInput
} from '../../src/lib/coord/dms'

describe('十进制度 → 度分秒（PRD 6.1 黄金值）', () => {
  it('116.3974 → 116°23\'50.64"E', () => {
    const d = decimalToDms(116.3974, 'lng')
    expect(d.degrees).toBe(116)
    expect(d.minutes).toBe(23)
    expect(d.seconds).toBeCloseTo(50.64, 6)
    expect(d.hemisphere).toBe('E')
    expect(formatDmsSymbolic(d, 2)).toBe(`116°23'50.64"E`)
  })

  it('39.9088 → 39°54\'31.68"N', () => {
    const d = decimalToDms(39.9088, 'lat')
    expect(d.degrees).toBe(39)
    expect(d.minutes).toBe(54)
    expect(d.seconds).toBeCloseTo(31.68, 6)
    expect(d.hemisphere).toBe('N')
    expect(formatDmsSymbolic(d, 2)).toBe(`39°54'31.68"N`)
  })

  it('负值：符号只留在 degrees 上，分秒恒为非负', () => {
    // 常见实现错误：把负号分散到三段，输出 `0°-30'`
    const d = decimalToDms(-0.5, 'lng')
    expect(d.degrees).toBe(0)
    expect(d.minutes).toBe(30)
    expect(d.seconds).toBe(0)
    expect(d.hemisphere).toBe('W')
    // -0.5 度 → 西经 0 度 30 分。degrees 是 0，方向靠 hemisphere 表达
    expect(formatDmsSymbolic(d, 1)).toBe(`0°30'0.0"W`)
  })

  it('负值且度数非零', () => {
    const d = decimalToDms(-51.5072, 'lat')
    expect(d.degrees).toBe(-51)
    expect(d.minutes).toBe(30)
    expect(d.seconds).toBeCloseTo(25.92, 5)
    expect(d.hemisphere).toBe('S')
    expect(formatDmsSymbolic(d, 2)).toBe(`-51°30'25.92"S`)
  })

  it('秒四舍五入到 60 时必须进位，不能输出 39°54\'60.0"', () => {
    // 39.9166666… 度 = 39°55'00"，若不做进位会得到 39°54'60.0"
    const d = decimalToDms(39 + 54 / 60 + 59.9999999 / 3600, 'lat')
    expect(d.seconds).toBeLessThan(60)
    expect(formatDmsSymbolic(d, 1)).not.toContain('60.0"')
  })

  it('整数度：分秒为 0', () => {
    const d = decimalToDms(120, 'lng')
    expect(d).toMatchObject({ degrees: 120, minutes: 0, seconds: 0, hemisphere: 'E' })
  })

  it('0 度没有方向，hemisphere 为 undefined', () => {
    // 赤道与本初子午线上，写 N 还是 S 都是错的
    expect(decimalToDms(0, 'lat').hemisphere).toBeUndefined()
    expect(decimalToDms(0, 'lng').hemisphere).toBeUndefined()
  })

  it('度分（无秒）输出', () => {
    const d = decimalToDm(116.3974, 'lng')
    expect(d.degrees).toBe(116)
    expect(d.minutes).toBeCloseTo(23.844, 5)
  })
})

describe('度分秒 → 十进制度（往返一致）', () => {
  it('116°23\'50.64" → 116.3974', () => {
    const r = dmsToDecimal({ degrees: 116, minutes: 23, seconds: 50.64 })
    expect(r.decimal).toBeCloseTo(116.3974, 8)
    expect(r.normalized).toBe('none')
  })

  it('负值：符号由 degrees 决定，分秒取正', () => {
    const r = dmsToDecimal({ degrees: -51, minutes: 30, seconds: 25.92 })
    expect(r.decimal).toBeCloseTo(-51.5072, 8)
  })

  it('degrees 为 -0 时符号仍然生效', () => {
    // `-0°30'` 是合法写法（西经 0.5 度）。JS 里 -0 < 0 为 false，
    // 必须用 Object.is 判断，否则会丢掉负号
    const r = dmsToDecimal({ degrees: -0, minutes: 30, seconds: 0 })
    expect(r.decimal).toBeCloseTo(-0.5, 10)
    expect(Object.is(r.decimal, 0.5)).toBe(false)
  })

  it('秒 ≥60 → 进位归一化，并标记 normalized', () => {
    // PRD T02：「秒值 ≥60 或分值 ≥60 时执行进位归一化，并在结果中提示」
    const r = dmsToDecimal({ degrees: 39, minutes: 54, seconds: 90 })
    expect(r.decimal).toBeCloseTo(39 + 55 / 60 + 30 / 3600, 10)
    expect(r.normalized).toBe('seconds')
  })

  it('分 ≥60 → 进位到度，并标记 normalized', () => {
    const r = dmsToDecimal({ degrees: 39, minutes: 75, seconds: 0 })
    expect(r.decimal).toBeCloseTo(40.25, 10)
    expect(r.normalized).toBe('minutes')
  })

  it('往返：decimal → dms → decimal 误差 < 1e-9', () => {
    for (const v of [116.3974, 39.9088, -0.1276, -51.5072, 139.7671, 0, 180, -90, 0.000001]) {
      const d = decimalToDms(v, 'lng')
      // 必须把 hemisphere 一起带回去：小于 1 度的西经 / 南纬，
      // 符号只存在于 hemisphere 里（degrees 是 0）
      const back = dmsToDecimal(d)
      expect(Math.abs(back.decimal - v), `v=${v}`).toBeLessThan(1e-9)
    }
  })

  it('小于 1 度的西经不丢符号（格林尼治 / 基多这类坐标）', () => {
    // `0°7'39.36"W` 的 degrees 是 0，只看 degrees 会得到 +0.1276。
    // 半球符号必须优先于 degrees 的符号。
    const r = dmsToDecimal({ degrees: 0, minutes: 7, seconds: 39.36, hemisphere: 'W' })
    expect(r.decimal).toBeCloseTo(-0.1276, 8)

    const s = dmsToDecimal({ degrees: 0, minutes: 0, seconds: 5.04, hemisphere: 'S' })
    expect(s.decimal).toBeCloseTo(-0.0014, 8) // 格林尼治天文台
  })

  it('parseDmsInput 解析 `0°7\'39.36"W` 得到负值', () => {
    const r = parseDmsInput(`0°7'39.36"W`, 'lng')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.decimal).toBeCloseTo(-0.1276, 7)
  })

  it('度分往返同样一致', () => {
    for (const v of [116.3974, -51.5072, 45.25, -0.25]) {
      const d = decimalToDm(v, 'lat')
      const back = dmToDecimal(d)
      expect(Math.abs(back.decimal - v), `v=${v}`).toBeLessThan(1e-9)
    }
  })
})

describe('parseDmsInput 自动识别格式', () => {
  it('识别十进制度', () => {
    const r = parseDmsInput('116.3974', 'lng')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.format).toBe('decimal')
    expect(r.decimal).toBeCloseTo(116.3974, 10)
  })

  it('识别符号式度分秒', () => {
    const r = parseDmsInput(`116°23'50.64"`, 'lng')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.format).toBe('dms')
    expect(r.decimal).toBeCloseTo(116.3974, 7)
  })

  it('识别冒号式度分秒（GPS 设备导出）', () => {
    const r = parseDmsInput('116:23:50.64', 'lng')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.format).toBe('dms')
    expect(r.decimal).toBeCloseTo(116.3974, 7)
  })

  it('识别度分', () => {
    const r = parseDmsInput('116 23.844', 'lng')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.format).toBe('dm')
    expect(r.decimal).toBeCloseTo(116.3974, 6)
  })

  it('识别中文度分秒', () => {
    const r = parseDmsInput('116度23分50.64秒', 'lng')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.format).toBe('dms')
    expect(r.decimal).toBeCloseTo(116.3974, 7)
  })

  it('前置半球符号', () => {
    const r = parseDmsInput('N39.9088', 'lat')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.detectedHemisphere).toBe('N')
    expect(r.decimal).toBeCloseTo(39.9088, 10)
  })

  it('后置半球符号', () => {
    const r = parseDmsInput('39.9088S', 'lat')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.decimal).toBeCloseTo(-39.9088, 10)
  })

  it('W/S 符号使数值取负（PRD T02 符号约定）', () => {
    const w = parseDmsInput('W0.1276', 'lng')
    expect(w.ok && w.decimal).toBeCloseTo(-0.1276, 10)
    const s = parseDmsInput('S51.5072', 'lat')
    expect(s.ok && s.decimal).toBeCloseTo(-51.5072, 10)
  })

  it('带 W 符号时再写负号不会双重取负', () => {
    // SR-01：「带 W/S 符号时输入值取绝对值后再置负」
    const r = parseDmsInput('W-0.1276', 'lng')
    expect(r.ok && r.decimal).toBeCloseTo(-0.1276, 10)
  })

  it('中文方向词', () => {
    const r = parseDmsInput('北纬39.9088', 'lat')
    expect(r.ok && r.detectedHemisphere).toBe('N')
    expect(r.ok && r.decimal).toBeCloseTo(39.9088, 10)
    const w = parseDmsInput('西经116.3974', 'lng')
    expect(w.ok && w.decimal).toBeCloseTo(-116.3974, 10)
  })

  it('日文方向词用日文字形（SR-11）', () => {
    const r = parseDmsInput('北緯35.6812', 'lat')
    expect(r.ok && r.detectedHemisphere).toBe('N')
    const e = parseDmsInput('東経139.7671', 'lng')
    expect(e.ok && e.detectedHemisphere).toBe('E')
  })

  it('detectedHemisphere 只在输入真的写了符号时才有值', () => {
    // 这条防止把 decimalToDms 合成的 hemisphere 误当成「用户写了符号」——
    // 那会让 parseCoord 的轴序判定把每个输入都当成 high 置信度
    const r = parseDmsInput('39.9088', 'lat')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.detectedHemisphere).toBeUndefined()
    expect(r.dms.hemisphere).toBe('N') // 合成的，与上面那个字段是两回事
  })

  it('strictAxis=false 时接受与轴不匹配的符号（供 parseCoord 判定轴序用）', () => {
    const r = parseDmsInput('N39.9088', 'lng', { strictAxis: false })
    expect(r.ok && r.detectedHemisphere).toBe('N')
  })

  it('strictAxis=true（默认）时纬度位置写 E 不被当作半球符号', () => {
    // 交给数字解析判为不可解析，比默默忽略更安全
    const r = parseDmsInput('E116.3974', 'lat')
    expect(r.ok).toBe(false)
  })

  it('validateRange=false 时不做范围校验（供 parseCoord 判定轴序后再校验）', () => {
    const r = parseDmsInput('200', 'lng', { validateRange: false })
    expect(r.ok).toBe(true)
    expect(r.ok && r.decimal).toBe(200)
  })

  it('默认做范围校验：经度 200 超范围', () => {
    const r = parseDmsInput('200', 'lng')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('range')
    expect(r.limit).toEqual({ min: -180, max: 180 })
  })

  it('纬度用 ±90 校验', () => {
    const r = parseDmsInput('95', 'lat')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('range')
    expect(r.limit).toEqual({ min: -90, max: 90 })
  })

  it('空输入与垃圾输入', () => {
    expect(parseDmsInput('', 'lng')).toMatchObject({ ok: false, reason: 'empty' })
    expect(parseDmsInput('   ', 'lng')).toMatchObject({ ok: false, reason: 'empty' })
    expect(parseDmsInput('北京', 'lng')).toMatchObject({ ok: false, reason: 'unparsable' })
  })
})

describe('PRD T02 格式歧义：`39.54` 可能是十进制度也可能是度分', () => {
  it('默认按十进制度处理，并给出另一种解读', () => {
    const r = parseDmsInput('39.54', 'lat')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.format).toBe('decimal')
    expect(r.decimal).toBeCloseTo(39.54, 10)
    // 另一种解读：39 度 54 分 = 39.9
    expect(r.alternative).toBeDefined()
    expect(r.alternative!.interpretation).toBe('dm')
    expect(r.alternative!.decimal).toBeCloseTo(39.9, 10)
  })

  it('另一种解读超出合法范围时不提示（避免制造困惑）', () => {
    // `89.99` 按度分解释是 89 + 99/60 —— 但 99 分本身非法，
    // 且结果 90.65 超出纬度范围，因此不该提示
    const r = parseDmsInput('89.99', 'lat')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.alternative).toBeUndefined()
  })

  it('带显式度分秒标记时不存在歧义', () => {
    const r = parseDmsInput('39°32.4', 'lat')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.format).toBe('dm')
    expect(r.alternative).toBeUndefined()
  })

  it('整数不构成歧义（`39` 不可能是 39 度 0 分之外的解释）', () => {
    const r = parseDmsInput('39', 'lat')
    expect(r.ok && r.alternative).toBeUndefined()
  })
})

describe('文本式输出按语言本地化（SR-11）', () => {
  const dms = decimalToDms(39.9088, 'lat')
  const west = decimalToDms(-116.3974, 'lng')

  it('zh 用「度分秒」与中文方向词', () => {
    expect(formatDmsTextual(dms, 'zh', 2)).toBe('北纬39度54分31.68秒')
    expect(formatDmsTextual(west, 'zh', 2)).toBe('西经116度23分50.64秒')
  })

  it('ja 用日文字形的「緯」「経」，不是中文的「纬」「经」', () => {
    const ja = formatDmsTextual(dms, 'ja', 2)
    expect(ja).toBe('北緯39度54分31.68秒')
    expect(ja).toContain('緯')
    expect(ja).not.toContain('纬')

    const jaWest = formatDmsTextual(west, 'ja', 2)
    expect(jaWest).toContain('西経')
    expect(jaWest).not.toContain('西经')
  })

  it('en 仍用符号式加方向字母', () => {
    expect(formatDmsTextual(dms, 'en', 2)).toBe(`39° 54' 31.68" N`)
    expect(formatDmsTextual(west, 'en', 2)).toBe(`116° 23' 50.64" W`)
  })
})

describe('formatDecimal —— SR-01 规则 ④ 的标准回显', () => {
  it('默认 8 位小数、句点小数点、无千分位', () => {
    expect(formatDecimal(116.3974)).toBe('116.3974')
    expect(formatDecimal(116.39741234567)).toBe('116.39741235')
  })

  it('可指定位数', () => {
    expect(formatDecimal(116.39741234567, 4)).toBe('116.3974')
    expect(formatDecimal(39.9088, 2)).toBe('39.91')
  })
})
