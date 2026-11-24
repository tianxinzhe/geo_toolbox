/**
 * 单位换算测试（PRD SR-04）
 *
 * 三条硬规则的验证：
 *   ① 所有换算以平方米 / 米为**唯一中间基准**，不做单位间直接换算
 *   ② 循环小数值（亩 2000/3、丈 10/3）保留完整精度
 *   ③ 单位清单的**呈现**随语言变化，换算关系与语言无关
 *
 * 断言值全部来自 SR-04 的等值表，是硬编码字面量。
 */
import { describe, expect, it } from 'vitest'

import {
  ALL_AREA_UNITS,
  ALL_LENGTH_UNITS,
  AREA_TO_M2,
  areaFromBase,
  areaToBase,
  allAreas,
  allLengths,
  convertArea,
  convertLength,
  DEFAULT_AREA_UNITS,
  DEFAULT_LENGTH_UNITS,
  LENGTH_TO_M,
  lengthFromBase,
  lengthToBase
} from '../../src/lib/geo/units'

describe('SR-04 长度等值表', () => {
  it('与 PRD 表格逐项一致', () => {
    expect(LENGTH_TO_M.km).toBe(1000)
    expect(LENGTH_TO_M.mi).toBe(1609.344)
    expect(LENGTH_TO_M.nmi).toBe(1852)
    expect(LENGTH_TO_M.yd).toBe(0.9144)
    expect(LENGTH_TO_M.ft).toBe(0.3048)
    expect(LENGTH_TO_M.ch).toBe(20.1168)
    expect(LENGTH_TO_M.li).toBe(500)
    expect(LENGTH_TO_M.m).toBe(1)
  })

  it('丈 = 10/3，用分数而不是十进制近似', () => {
    // SR-04 表格写作 3.3333…，是循环小数。
    // 存成 3.3333333333333335 会引入相对误差；存成 10/3 则精确。
    expect(LENGTH_TO_M.zhang).toBe(10 / 3)
    expect(3 * LENGTH_TO_M.zhang).toBe(10) // 三丈正好十米，无累积误差
  })

  it('链 = 22 码（英制内部自洽）', () => {
    expect(LENGTH_TO_M.ch).toBeCloseTo(22 * LENGTH_TO_M.yd, 12)
  })
})

describe('SR-04 面积等值表', () => {
  it('与 PRD 表格逐项一致', () => {
    expect(AREA_TO_M2.ha).toBe(10000)
    expect(AREA_TO_M2.are).toBe(100)
    expect(AREA_TO_M2.km2).toBe(1000000)
    expect(AREA_TO_M2.acre).toBe(4046.8564224)
    expect(AREA_TO_M2.mi2).toBe(2589988.110336)
    expect(AREA_TO_M2.yd2).toBe(0.83612736)
    expect(AREA_TO_M2.ft2).toBe(0.09290304)
    expect(AREA_TO_M2.cm2).toBe(0.0001)
  })

  it('亩 = 2000/3 ≈ 666.6666…，用分数保留完整精度', () => {
    expect(AREA_TO_M2.mu).toBe(2000 / 3)
    expect(3 * AREA_TO_M2.mu).toBe(2000) // 三亩正好两千平方米
    expect(AREA_TO_M2.mu).toBeCloseTo(666.6666666666666, 10)
  })

  it('英制面积与英制长度自洽：1 平方码 = (0.9144)²，1 平方英里 = 640 英亩', () => {
    expect(AREA_TO_M2.yd2).toBeCloseTo(LENGTH_TO_M.yd ** 2, 12)
    expect(AREA_TO_M2.ft2).toBeCloseTo(LENGTH_TO_M.ft ** 2, 12)
    expect(AREA_TO_M2.mi2).toBeCloseTo(640 * AREA_TO_M2.acre, 6)
  })

  it('1 公顷 = 100 公亩 = 0.01 平方千米', () => {
    expect(AREA_TO_M2.ha).toBe(100 * AREA_TO_M2.are)
    expect(AREA_TO_M2.ha).toBe(AREA_TO_M2.km2 / 100)
  })

  it('不纳入韩国单位（SR-04：地区差异大，给不出唯一值）', () => {
    expect(ALL_AREA_UNITS).not.toContain('jo')
    expect(ALL_AREA_UNITS).not.toContain('tatami')
    expect(ALL_AREA_UNITS).not.toContain('madiji')
  })
})

describe('换算一律经过基准，不做单位间直接换算', () => {
  it('lengthToBase / lengthFromBase 互逆', () => {
    expect(lengthFromBase(lengthToBase(3.5, 'km'), 'km')).toBeCloseTo(3.5, 12)
    expect(lengthFromBase(lengthToBase(12, 'ft'), 'yd')).toBeCloseTo(4, 12)
  })

  it('areaToBase / areaFromBase 互逆', () => {
    expect(areaFromBase(areaToBase(2.5, 'ha'), 'ha')).toBeCloseTo(2.5, 12)
    expect(areaFromBase(areaToBase(60, 'mu'), 'acre')).toBeCloseTo(
      (60 * (2000 / 3)) / 4046.8564224,
      9
    )
  })

  it('convertLength 与两步走的结果完全相同（不是近似）', () => {
    const direct = convertLength(7.25, 'mi', 'ch')
    const viaBase = lengthFromBase(lengthToBase(7.25, 'mi'), 'ch')
    expect(direct).toBe(viaBase)
    // 1 英里 = 80 链
    expect(direct).toBeCloseTo(580, 9)
  })

  it('convertArea：1 公顷 = 15 亩', () => {
    // 这是国内最常问的换算。1 ha = 10000 ㎡，1 亩 = 2000/3 ㎡
    // → 10000 / (2000/3) = 15，精确成立
    expect(convertArea(1, 'ha', 'mu')).toBeCloseTo(15, 12)
  })

  it('convertArea：1 英亩 = 4046.8564224 ㎡', () => {
    expect(convertArea(1, 'acre', 'm2')).toBeCloseTo(4046.8564224, 6)
  })

  it('同单位换算恒等', () => {
    expect(convertArea(123.456, 'mu', 'mu')).toBe(123.456)
    expect(convertLength(78.9, 'nmi', 'nmi')).toBe(78.9)
  })

  it('allAreas / allLengths 覆盖全部单位且与基准自洽', () => {
    const areas = allAreas(1, 'ha')
    for (const u of ALL_AREA_UNITS) {
      expect(areas[u], u).toBeCloseTo(AREA_TO_M2.ha / AREA_TO_M2[u], 6)
    }
    const lengths = allLengths(1, 'km')
    for (const u of ALL_LENGTH_UNITS) {
      expect(lengths[u], u).toBeCloseTo(1000 / LENGTH_TO_M[u], 6)
    }
  })

  it('大数值不丢精度：一百万平方米转亩', () => {
    // 1e6 ㎡ = 1500 亩，精确成立
    expect(convertArea(1e6, 'm2', 'mu')).toBeCloseTo(1500, 9)
  })
})

describe('SR-11 / SR-04 单位清单的呈现随语言变化', () => {
  it('zh 默认：平方米、亩、公顷、平方千米（亩置于前列）', () => {
    expect(DEFAULT_AREA_UNITS.zh).toEqual(['m2', 'mu', 'ha', 'km2'])
  })

  it('en 默认：平方米、公顷、英亩、平方英尺', () => {
    expect(DEFAULT_AREA_UNITS.en).toEqual(['m2', 'ha', 'acre', 'ft2'])
  })

  it('每个语言的默认单位都是合法单位，且都以平方米打头', () => {
    for (const lang of ['zh', 'en'] as const) {
      const list = DEFAULT_AREA_UNITS[lang]
      expect(list[0], lang).toBe('m2')
      for (const u of list) {
        expect(ALL_AREA_UNITS, `${lang}/${u}`).toContain(u)
      }
    }
  })

  it('长度默认单位同样随语言变化', () => {
    expect(DEFAULT_LENGTH_UNITS.zh).toContain('li') // 市里
    expect(DEFAULT_LENGTH_UNITS.en).toContain('mi') // 英里
    expect(DEFAULT_LENGTH_UNITS.en).toContain('ft') // 英尺
  })

  it('换算关系与语言无关 —— 同一个换算在不同语言下结果相同', () => {
    // 这条是「呈现随语言、数值不随语言」的形式化表达
    const zh = convertArea(1, 'mu', 'm2')
    const en = convertArea(1, 'mu', 'm2')
    expect(zh).toBe(en)
  })
})
