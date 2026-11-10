/**
 * 坐标解析器测试（SR-01）
 *
 * 覆盖 SR-01 的三张表：接受的形式、经纬度顺序判定、小数点与分隔符歧义。
 * 断言的重点不只是「解析对了」，更是「解析错了要如实说出来」——
 * SR-01 的核心原则是**不静默改写用户输入**。
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CTX,
  normalizeFullWidth,
  parseCoord,
  resolveOrder,
  tokenize,
  type ParseCtx
} from '../../src/lib/coord/parse'

const ctx = (over: Partial<ParseCtx> = {}): ParseCtx => ({ ...DEFAULT_CTX, ...over })

/** 断言解析成功并返回结果，失败时给出可读的错误信息 */
function ok(input: string, c: ParseCtx = DEFAULT_CTX) {
  const r = parseCoord(input, c)
  expect(r.ok, `期望解析成功，实际得到错误：${JSON.stringify(r)}`).toBe(true)
  if (!r.ok) throw new Error('unreachable')
  return r
}

/** 断言解析失败并返回错误 */
function err(input: string, c: ParseCtx = DEFAULT_CTX) {
  const r = parseCoord(input, c)
  expect(r.ok, `期望解析失败，实际得到：${JSON.stringify(r)}`).toBe(false)
  if (r.ok) throw new Error('unreachable')
  return r
}

describe('SR-01 表「接受的形式」', () => {
  it('十进制度（逗号分隔）', () => {
    const r = ok('116.3974, 39.9088')
    expect(r.lng).toBeCloseTo(116.3974, 10)
    expect(r.lat).toBeCloseTo(39.9088, 10)
    expect(r.order).toBe('lngFirst')
  })

  it('十进制度（空格分隔）', () => {
    const r = ok('116.3974 39.9088')
    expect(r.lng).toBeCloseTo(116.3974, 10)
    expect(r.lat).toBeCloseTo(39.9088, 10)
  })

  it('十进制度（Tab 与换行分隔）', () => {
    expect(ok('116.3974\t39.9088').lng).toBeCloseTo(116.3974, 10)
    expect(ok('116.3974\n39.9088').lat).toBeCloseTo(39.9088, 10)
  })

  it('度分秒（符号式）', () => {
    const r = ok(`116°23'50.64"E, 39°54'31.68"N`)
    expect(r.lng).toBeCloseTo(116.3974, 6)
    expect(r.lat).toBeCloseTo(39.9088, 6)
    expect(r.confidence).toBe('high')
  })

  it('度分秒（冒号式，常见于 GPS 设备导出）', () => {
    const r = ok('116:23:50.64, 39:54:31.68')
    expect(r.lng).toBeCloseTo(116.3974, 6)
    expect(r.lat).toBeCloseTo(39.9088, 6)
  })

  it('度分（无秒）', () => {
    const r = ok('116 23.844, 39 54.528')
    expect(r.lng).toBeCloseTo(116.3974, 5)
    expect(r.lat).toBeCloseTo(39.9088, 5)
  })

  it('中文度分秒', () => {
    const r = ok('116度23分50.64秒, 39度54分31.68秒')
    expect(r.lng).toBeCloseTo(116.3974, 6)
    expect(r.lat).toBeCloseTo(39.9088, 6)
  })

  it('带半球符号：前置、后置、大小写都接受', () => {
    expect(ok('N39.9088 E116.3974').lng).toBeCloseTo(116.3974, 10)
    expect(ok('39.9088N 116.3974E').lat).toBeCloseTo(39.9088, 10)
    expect(ok('39.9088n 116.3974e').lat).toBeCloseTo(39.9088, 10)
  })

  it('中文方向词', () => {
    const r = ok('北纬39.9088 东经116.3974')
    expect(r.lat).toBeCloseTo(39.9088, 10)
    expect(r.lng).toBeCloseTo(116.3974, 10)
  })

  it('数组 / JSON 片段：剥掉括号与引号', () => {
    const r = ok('[116.3974, 39.9088]')
    expect(r.lng).toBeCloseTo(116.3974, 10)
    expect(r.lat).toBeCloseTo(39.9088, 10)
  })

  it('西经南纬为负值（SR-01 符号约定）', () => {
    const r = ok('W0.1276 S51.5072')
    expect(r.lng).toBeCloseTo(-0.1276, 10)
    expect(r.lat).toBeCloseTo(-51.5072, 10)
  })

  it('带 W/S 符号时输入值取绝对值后再置负（不会双重取负）', () => {
    const r = ok('W-0.1276 S-51.5072')
    expect(r.lng).toBeCloseTo(-0.1276, 10)
    expect(r.lat).toBeCloseTo(-51.5072, 10)
  })

  it('含高程的三元组：取前两个，不报错', () => {
    const r = ok('116.3974, 39.9088, 50')
    expect(r.lng).toBeCloseTo(116.3974, 10)
    expect(r.lat).toBeCloseTo(39.9088, 10)
  })

  it('疑似 GeoHash → 明确引导前往 T08，不自己乱解析（SR-01 表）', () => {
    const e = err('wx4g0bk')
    expect(e.kind).toBe('geohash')
    expect(e.token).toBe('wx4g0bk')
    expect(e.hint).toContain('T08')
  })
})

describe('SR-01 全角归一化（ja 版必须）', () => {
  it('全角数字与全角逗号', () => {
    const r = ok('１１６．３９７４，３９．９０８８')
    expect(r.lng).toBeCloseTo(116.3974, 10)
    expect(r.lat).toBeCloseTo(39.9088, 10)
    expect(r.warnings.some((w) => w.kind === 'fullWidthNormalized')).toBe(true)
  })

  it('全角空格', () => {
    const r = ok('１１６．３９７４　３９．９０８８')
    expect(r.lng).toBeCloseTo(116.3974, 10)
  })

  it('归一化在识别格式之前 —— 全角度分秒也能解析', () => {
    const r = ok('１１６°２３′５０．６４″Ｅ，３９°５４′３１．６８″Ｎ')
    expect(r.lng).toBeCloseTo(116.3974, 5)
    expect(r.lat).toBeCloseTo(39.9088, 5)
  })

  it('normalizeFullWidth 覆盖 Unicode 减号与弯引号', () => {
    expect(normalizeFullWidth('−116.3974').text).toBe('-116.3974')
    expect(normalizeFullWidth('116°23′50.64″').text).toBe(`116°23'50.64"`)
    expect(normalizeFullWidth('116º').text).toBe('116°')
  })

  it('未发生变化时不报 warning', () => {
    expect(normalizeFullWidth('116.3974, 39.9088').changed).toBe(false)
    expect(ok('116.3974, 39.9088').warnings.some((w) => w.kind === 'fullWidthNormalized')).toBe(false)
  })

  it('ctx.fullWidth=false 时不做归一化，全角输入判为不可解析', () => {
    const e = err('１１６．３９７４，３９．９０８８', ctx({ fullWidth: false }))
    expect(e.kind).toBe('unparsable')
  })
})

describe('SR-01 表「经纬度顺序」判定', () => {
  it('带明确半球符号 → 按符号确定，忽略书写顺序', () => {
    // 纬度写在前面也能正确识别
    const r = ok('N39.9088 E116.3974')
    expect(r.order).toBe('latFirst')
    expect(r.confidence).toBe('high')
    expect(r.lng).toBeCloseTo(116.3974, 10)
    expect(r.lat).toBeCloseTo(39.9088, 10)
  })

  it('第一个绝对值 >90 且第二个 ≤90 → 经度在前，置信度高', () => {
    const r = resolveOrder(116.3974, 39.9088, undefined, undefined, 'lngFirst')
    expect(r).toEqual({ ok: true, order: 'lngFirst', confidence: 'high', byHemisphere: false })
  })

  it('第二个绝对值 >90 且第一个 ≤90 → 纬度在前，置信度高', () => {
    const r = resolveOrder(39.9088, 116.3974, undefined, undefined, 'lngFirst')
    expect(r).toEqual({ ok: true, order: 'latFirst', confidence: 'high', byHemisphere: false })
    const p = ok('39.9088 116.3974')
    expect(p.lat).toBeCloseTo(39.9088, 10)
    expect(p.lng).toBeCloseTo(116.3974, 10)
    expect(p.confidence).toBe('high')
  })

  it('两个都 ≤90 → 歧义，默认经度在前，标注假定并提供交换入口的依据', () => {
    const r = ok('30.5, 25.25')
    expect(r.order).toBe('lngFirst')
    expect(r.confidence).toBe('mid')
    expect(r.warnings.some((w) => w.kind === 'orderAssumed')).toBe(true)
  })

  it('defaultOrder 可覆盖歧义时的默认约定', () => {
    const r = ok('30.5, 25.25', ctx({ defaultOrder: 'latFirst' }))
    expect(r.order).toBe('latFirst')
    expect(r.lat).toBeCloseTo(30.5, 10)
    expect(r.lng).toBeCloseTo(25.25, 10)
  })

  it('两个都 >90 → 非法，报错并说明合法范围（不取模、不截断）', () => {
    const e = err('116.3974, 139.9088')
    expect(e.kind).toBe('range')
    expect(e.hint).toContain('90')
  })
})

describe('SR-01 小数点与分隔符歧义（防御性规则）', () => {
  it('规则 ②：无显式格式时逗号一律视为分隔符', () => {
    const r = ok('116,39')
    expect(r.lng).toBeCloseTo(116, 10)
    expect(r.lat).toBeCloseTo(39, 10)
  })

  it('规则 ①：带度分秒符号时逗号一律视为分隔符', () => {
    const r = ok(`116°23'50.64",39°54'31.68"`)
    expect(r.lng).toBeCloseTo(116.3974, 6)
    expect(r.lat).toBeCloseTo(39.9088, 6)
  })

  it('规则 ③：`116,3974` 标记为疑似歧义，且**不自动改写**', () => {
    // 按分隔符解释是 116 与 3974；3974 超纬度范围，因此解析失败。
    // 关键是失败信息里必须带上「疑似逗号作小数点」的提示 ——
    // 只报「超范围」的话，用户想不到真正的原因是小数点写成了逗号。
    const e = err('116,3974')
    expect(e.kind).toBe('range')
    expect(e.warnings?.some((w) => w.kind === 'commaAmbiguous')).toBe(true)
    expect(e.hint).toContain('逗号')
    // 不自动改写：不会悄悄当成 116.3974 解析成功
    expect(e.hint).not.toContain('116.3974')
  })

  it('规则 ③：歧义提示给出「按小数点解释」的值，供用户确认', () => {
    const e = err('116,3974')
    const w = e.warnings?.find((x) => x.kind === 'commaAmbiguous')
    expect(w).toBeDefined()
    if (w?.kind !== 'commaAmbiguous') return
    expect(w.token).toBe('116,3974')
    expect(w.asDecimal).toBeCloseTo(116.3974, 10)
  })

  it('规则 ⑤：手动切成 commaAs="decimal" 后 `116,3974` 正常解析', () => {
    const r = ok('116,3974 39,9088', ctx({ commaAs: 'decimal' }))
    expect(r.lng).toBeCloseTo(116.3974, 10)
    expect(r.lat).toBeCloseTo(39.9088, 10)
  })

  it('规则 ⑥：回显串一律用句点小数点，即使 commaAs="decimal"', () => {
    const r = ok('116,3974 39,9088', ctx({ commaAs: 'decimal' }))
    expect(r.normalized).toBe('116.3974, 39.9088')
    expect(r.normalized).not.toContain('116,3974')
  })

  it('规则 ④：强制回显确认，用标准格式', () => {
    const r = ok('116.39740000000, 39.9088')
    expect(r.normalized).toBe('116.3974, 39.9088')
  })

  it('千分位分组不被误切成多个 token', () => {
    // 单值场景：`1,234.5` 应理解为 1234.5
    const tokens = tokenize('1,234.5 39.9', 'separator')
    expect(tokens).toEqual(['1234.5', '39.9'])
  })
})

describe('SR-01 合法范围与拒绝规则', () => {
  it('经度超范围 → 报出具体数值与合法范围', () => {
    const e = err('200, 39.9088')
    expect(e.kind).toBe('range')
    expect(e.field).toBe('lng')
    expect(e.value).toBe('200')
    expect(e.limit).toEqual({ min: -180, max: 180 })
    expect(e.hint).toContain('−180')
  })

  it('纬度超范围 → 报出具体数值与合法范围', () => {
    const e = err('116.3974, 95')
    expect(e.kind).toBe('range')
    expect(e.field).toBe('lat')
    expect(e.limit).toEqual({ min: -90, max: 90 })
  })

  it('端点值合法（含端点）', () => {
    expect(ok('180, 90').lng).toBe(180)
    expect(ok('-180, -90').lat).toBe(-90)
  })

  it('**不取模、不截断修正** —— 200 不会被折成 -160', () => {
    const e = err('200, 39.9088')
    expect(e.kind).toBe('range')
  })

  it('空值 → 明确提示', () => {
    expect(err('').kind).toBe('empty')
    expect(err('   ').kind).toBe('empty')
  })

  it('仅一个数值 → 明确提示需要两个值', () => {
    const e = err('116.3974')
    expect(e.kind).toBe('singleValue')
    expect(e.hint).toContain('经度')
  })

  it('非数值内容 → 不可解析', () => {
    expect(err('北京市朝阳区').kind).toBe('unparsable')
    expect(err('abc, def').kind).toBe('unparsable')
  })

  it('超过三个数值 → 判为不可解析（避免把整行 CSV 当成一个坐标）', () => {
    const e = err('116.3974, 39.9088, 50, 999, 888')
    expect(e.kind).toBe('unparsable')
    expect(e.hint).toContain('批量')
  })
})

describe('错误对象必须携带 SR-06 三段式所需的信息', () => {
  it('每个错误都有 hint（正确写法示例）与出错值', () => {
    for (const input of ['', '116.3974', 'abc', '200, 39.9', 'wx4g0bk', '1,2,3,4,5']) {
      const e = err(input)
      expect(e.hint, `input=${JSON.stringify(input)}`).toBeTruthy()
      expect(e.hint.length, `input=${JSON.stringify(input)}`).toBeGreaterThan(5)
      // value 携带出错的那个值：整体不可解析时是原始输入，
      // 范围错误时是越界的那个数值 —— 两种都比空字符串有用，
      // 且都不会清空用户已输入的内容（SR-06）。
      // 唯一例外是 kind='empty'，此时输入本来就是空的。
      if (e.kind !== 'empty') {
        expect(e.value.length, `input=${JSON.stringify(input)}`).toBeGreaterThan(0)
      }
      // field 让 UI 知道该把错误标在哪个输入框上
      expect(e.field, `input=${JSON.stringify(input)}`).toBeTruthy()
    }
  })

  it('范围错误精确指出是哪个字段、哪个值、合法区间是什么', () => {
    const e = err('200, 39.9088')
    expect(e.kind).toBe('range')
    expect(e.field).toBe('lng')
    expect(e.value).toBe('200')
    expect(e.limit).toEqual({ min: -180, max: 180 })
  })
})
