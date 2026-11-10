/**
 * URL 状态分享编解码测试（FR-05 / SR-10）
 *
 * 重点验证三条容易被忽略的规则：
 *   ① **未知参数一律忽略，不报错** —— 向前兼容，旧链接不能因为新版本
 *      改了参数集就打不开
 *   ② **不含计算结果** —— 只编码输入与选项，结果由打开方本地重算
 *   ③ **超长降级到 hash + 压缩，压不下来就报 tooLarge**，
 *      而不是生成一条浏览器会截断的巨型 URL
 */
import { describe, expect, it } from 'vitest'

import {
  buildShareUrl,
  decodeState,
  encodeState,
  fromBase64Url,
  MAX_QUERY_LENGTH,
  readShareState,
  T01_PARAMS,
  toBase64Url
} from '../../src/lib/share'

const PATH = '/zh/tools/coord-convert/'

const DEFAULTS = { from: 'WGS84', to: ['CGCS2000'], p: 8, comma: 'auto' }

/**
 * n 个等差小数，序列化成查询串约 n×9 字符。
 * 用于制造「超过 1800 字符但可压缩」的状态（FR-05 第 ② 档）。
 */
function rampPoints(n: number): number[] {
  return Array.from({ length: n }, (_, i) => Number((116 + i * 0.0001).toFixed(6)))
}

describe('encodeState —— 只编码声明过的参数', () => {
  it('T01 的典型状态', () => {
    const q = encodeState(
      { lng: 116.3974, lat: 39.9088, from: 'WGS84', to: ['CGCS2000'], p: 8 },
      T01_PARAMS
    )
    expect(q).toContain('lng=116.3974')
    expect(q).toContain('lat=39.9088')
    expect(q).toContain('from=WGS84')
    // 目标可多选（PRD T01），多值用逗号分隔且不被百分号转义（SR-10）
    expect(q).toContain('to=CGCS2000')
    expect(q).not.toContain('%2C')
    expect(q).toContain('p=8')
  })

  it('未在参数表中声明的键不会出现在 URL 里', () => {
    // 防止调试字段或中间状态意外泄露到分享链接（FR-05 敏感数据的同源考虑）
    const q = encodeState(
      { lng: 116.3974, lat: 39.9088, debug: 'secret', internalFlag: true },
      T01_PARAMS
    )
    expect(q).not.toContain('debug')
    expect(q).not.toContain('secret')
    expect(q).not.toContain('internalFlag')
  })

  it('不编码计算结果 —— 只有输入与选项（FR-05）', () => {
    // 结果由打开方本地重算，保证一致性；写进 URL 只会让链接变长且可能与重算结果冲突
    const q = encodeState(
      { lng: 116.3974, lat: 39.9088, from: 'WGS84', to: 'CGCS2000', resultLng: 116.40364357 },
      T01_PARAMS
    )
    expect(q).not.toContain('resultLng')
    expect(q).not.toContain('116.40364357')
  })

  it('与默认值相同的参数被省略，缩短链接', () => {
    const q = encodeState(
      { lng: 116.3974, lat: 39.9088, from: 'WGS84', to: ['CGCS2000'], p: 8 },
      T01_PARAMS,
      DEFAULTS
    )
    // from / to / p 都与默认值相同 → 全部省略。
    // 多值参数按元素逐个比，不能用 === （数组是引用比较，永远不相等）
    expect(q).not.toContain('from=')
    expect(q).not.toContain('to=')
    expect(q).not.toContain('p=')
    // 只有坐标是用户真正填的，必须保留
    expect(q).toContain('lng=116.3974')
    expect(q).toContain('lat=39.9088')
  })

  it('与默认值不同的参数会写入', () => {
    const q = encodeState({ from: 'WGS84', to: ['WGS84'], p: 6 }, T01_PARAMS, DEFAULTS)
    expect(q).not.toContain('from=') // 与默认相同 → 省略
    expect(q).toContain('to=WGS84') // 与默认不同 → 写入
    expect(q).toContain('p=6')
  })

  it('坐标按 SR-02 精度编码，句点小数点、无千分位', () => {
    const q = encodeState({ lng: 4412345.123456789, lat: 39.9 }, T01_PARAMS)
    // lng 超出 ±180 会被拒绝（参数表声明了范围），因此不出现
    expect(q).not.toContain('lng=')
    expect(q).toContain('lat=39.9')
    expect(q).not.toContain(',')
  })

  it('超范围与非法枚举值被拒绝，不写入 URL', () => {
    expect(encodeState({ lng: 200, lat: 39.9 }, T01_PARAMS)).not.toContain('lng')
    expect(encodeState({ lng: 116, lat: 95 }, T01_PARAMS)).not.toContain('lat')
    expect(encodeState({ from: 'NOT_A_CRS' }, T01_PARAMS)).toBe('')
    expect(encodeState({ p: 99 }, T01_PARAMS)).toBe('')
    expect(encodeState({ p: 3.5 }, T01_PARAMS)).toBe('')
  })

  it('bool 为 false 时不写入（false 是常态）', () => {
    const table = [{ key: 'adv', type: 'bool' }] as const
    expect(encodeState({ adv: false }, table)).toBe('')
    expect(encodeState({ adv: true }, table)).toBe('adv=1')
  })

  it('多值参数用逗号分隔（SR-10）', () => {
    const table = [{ key: 'pts', type: 'numbers' }] as const
    expect(encodeState({ pts: [116.3974, 39.9088] }, table)).toBe('pts=116.3974,39.9088')
  })

  it('空状态产生空串', () => {
    expect(encodeState({}, T01_PARAMS)).toBe('')
  })
})

describe('decodeState —— 宽容解码', () => {
  it('round trip：编码后解码得到同样的值', () => {
    const state = { lng: 116.3974, lat: 39.9088, from: 'CGCS2000', to: ['WGS84'], p: 6 }
    const q = encodeState(state, T01_PARAMS)
    const r = decodeState(q, T01_PARAMS)
    expect(r.hadProblems).toBe(false)
    expect(r.state).toEqual(state)
  })

  it('带前导 ? 也能解析', () => {
    const r = decodeState('?lng=116.3974&lat=39.9088', T01_PARAMS)
    expect(r.state.lng).toBeCloseTo(116.3974, 10)
  })

  it('① 未知参数一律忽略，且不记为问题（SR-10 向前兼容）', () => {
    const r = decodeState('lng=116.3974&futureParam=xyz&legacy=1', T01_PARAMS)
    expect(r.state.lng).toBeCloseTo(116.3974, 10)
    expect(r.state).not.toHaveProperty('futureParam')
    expect(r.issues).toHaveLength(0)
    expect(r.hadProblems).toBe(false)
  })

  it('已声明但值非法 → 丢弃该参数并记 issue（与「未知」不同）', () => {
    const r = decodeState('lng=999&lat=39.9088', T01_PARAMS)
    expect(r.state).not.toHaveProperty('lng')
    expect(r.state.lat).toBeCloseTo(39.9088, 10)
    expect(r.issues).toEqual([{ kind: 'invalid', key: 'lng', raw: '999' }])
    expect(r.hadProblems).toBe(true)
  })

  it('枚举外的字符串值被拒绝', () => {
    const r = decodeState('from=MARS', T01_PARAMS)
    expect(r.state).not.toHaveProperty('from')
    expect(r.issues[0]).toMatchObject({ kind: 'invalid', key: 'from' })
  })

  it('非数字的数值参数被拒绝，不产生 NaN', () => {
    const r = decodeState('lng=abc&lat=39.9', T01_PARAMS)
    expect(r.state).not.toHaveProperty('lng')
    expect(Number.isNaN(r.state.lng as number)).toBe(false)
  })

  it('int 参数拒绝小数', () => {
    expect(decodeState('p=3.5', T01_PARAMS).state).not.toHaveProperty('p')
    expect(decodeState('p=3', T01_PARAMS).state.p).toBe(3)
  })

  it('bool 参数接受 1/0/true/false/空', () => {
    const table = [{ key: 'adv', type: 'bool' }] as const
    expect(decodeState('adv=1', table).state.adv).toBe(true)
    expect(decodeState('adv=true', table).state.adv).toBe(true)
    expect(decodeState('adv=0', table).state.adv).toBe(false)
    expect(decodeState('adv=false', table).state.adv).toBe(false)
    expect(decodeState('adv=', table).state.adv).toBe(false)
    expect(decodeState('adv=maybe', table).state).not.toHaveProperty('adv')
  })

  it('多值参数解析为数组', () => {
    const table = [{ key: 'pts', type: 'numbers' }] as const
    const r = decodeState('pts=116.3974,39.9088', table)
    expect(r.state.pts).toEqual([116.3974, 39.9088])
  })

  it('空查询串 → 空状态、无问题', () => {
    const r = decodeState('', T01_PARAMS)
    expect(r.state).toEqual({})
    expect(r.hadProblems).toBe(false)
  })

  it('百分号转义能正确还原', () => {
    const table = [{ key: 'q', type: 'string' }] as const
    const q = encodeState({ q: 'a b&c=d' }, table)
    expect(decodeState(q, table).state.q).toBe('a b&c=d')
  })
})

describe('Base64URL', () => {
  it('round trip 保持字节不变', () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 128, 63, 200])
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
  })

  it('输出不含 URL 不安全字符（+ / =）', () => {
    for (let i = 0; i < 50; i++) {
      const bytes = new Uint8Array(Array.from({ length: i + 1 }, (_, k) => (k * 37 + i * 11) % 256))
      const s = toBase64Url(bytes)
      expect(s, `i=${i}`).not.toMatch(/[+/=]/)
    }
  })

  it('空数组', () => {
    expect(fromBase64Url(toBase64Url(new Uint8Array(0)))).toEqual(new Uint8Array(0))
  })
})

describe('buildShareUrl —— 三档降级（FR-05）', () => {
  it('① 短状态走 query，URL 含语言前缀（SR-10）', async () => {
    const r = await buildShareUrl(PATH, { lng: 116.3974, lat: 39.9088, to: 'CGCS2000' }, T01_PARAMS)
    expect(r.mode).toBe('query')
    expect(r.url.startsWith(PATH + '?')).toBe(true)
    expect(r.url).toContain('lng=116.3974')
    // 分享链接包含语言前缀：从 /zh/ 生成的链接默认指向中文版
    expect(r.url).toContain('/zh/tools/coord-convert/')
  })

  it('空状态不产生孤立的 ?', async () => {
    const r = await buildShareUrl(PATH, {}, T01_PARAMS)
    expect(r.url).toBe(PATH)
    expect(r.url).not.toContain('?')
  })

  it('② 超长状态降级到 hash + 压缩', async () => {
    // 造一个查询串远超 1800 字符、但压缩后能塞进 1800 的多值参数。
    // 400 个等差小数的 JSON 约 3.5KB，deflate 后约 700B，Base64 约 950 字符 ——
    // 正好落在「查询串超限、压缩后可用」这一档。
    const table = [{ key: 'pts', type: 'numbers' }] as const
    const pts = rampPoints(400)
    const query = encodeState({ pts }, table)
    expect(query.length).toBeGreaterThan(MAX_QUERY_LENGTH)

    const r = await buildShareUrl(PATH, { pts }, table)
    expect(r.mode).toBe('hash')
    expect(r.url).toContain('#s=')
    expect(r.url.length).toBeLessThan(MAX_QUERY_LENGTH)
    // 压缩确实起了作用
    expect(r.length).toBeLessThan(JSON.stringify({ pts }).length)
  })

  it('② hash 链接能被 readShareState 还原', async () => {
    const table = [{ key: 'pts', type: 'numbers' }] as const
    const pts = rampPoints(400)
    const built = await buildShareUrl(PATH, { pts }, table)
    expect(built.mode).toBe('hash')

    const hash = built.url.slice(built.url.indexOf('#'))
    const r = await readShareState({ search: '', hash }, table)
    expect(r.hadProblems).toBe(false)
    expect(r.state.pts).toEqual(pts)
  })

  it('③ 压缩后仍超长 → tooLarge，且不写入 URL', async () => {
    // 必须是**真正不可压缩**的数据。
    // ⚠️ 用 `(i * 7919) % 90` 这类公式生成"看起来随机"的字符串是陷阱：
    // 7919 与 90 互质意味着序列以 90 为周期循环，deflate 能把它压到几百字节，
    // 于是这条测试会错误地走进 hash 分支。必须用真随机。
    const table = [{ key: 'blob', type: 'string' }] as const
    const bytes = new Uint8Array(30000)
    crypto.getRandomValues(bytes)
    // 映射到可打印 ASCII，避免 JSON 转义把体积进一步放大
    const blob = Array.from(bytes, (b) => String.fromCharCode(33 + (b % 90))).join('')

    const r = await buildShareUrl(PATH, { blob }, table)
    expect(r.mode).toBe('tooLarge')
    // 不写入 URL：返回的是干净的路径，调用方据此提示「请下载文件后发送」
    expect(r.url).toBe(PATH)
    expect(r.url).not.toContain('#')
    expect(r.length).toBeGreaterThan(MAX_QUERY_LENGTH)
  })
})

describe('readShareState —— 打开带参链接（FR-05）', () => {
  it('从 query 读取', async () => {
    const r = await readShareState(
      { search: '?lng=116.3974&lat=39.9088&to=CGCS2000', hash: '' },
      T01_PARAMS
    )
    expect(r.state.lng).toBeCloseTo(116.3974, 10)
    // `to` 是多值参数，解码后是数组（即使只有一个元素）
    expect(r.state.to).toEqual(['CGCS2000'])
    expect(r.hadProblems).toBe(false)
  })

  it('多值 to 解码为数组，枚举外的元素使整个参数被丢弃', async () => {
    const good = await readShareState({ search: '?to=CGCS2000,WGS84', hash: '' }, T01_PARAMS)
    expect(good.state.to).toEqual(['CGCS2000', 'WGS84'])

    // 不做部分接受：接收方拿到不完整的坐标系集合比拿不到更糟
    const bad = await readShareState({ search: '?to=CGCS2000,MARS', hash: '' }, T01_PARAMS)
    expect(bad.state).not.toHaveProperty('to')
    expect(bad.hadProblems).toBe(true)
  })

  it('hash 优先于 query', async () => {
    const table = [{ key: 'pts', type: 'numbers' }] as const
    const pts = rampPoints(400)
    const built = await buildShareUrl(PATH, { pts }, table)
    expect(built.mode).toBe('hash')
    const hash = built.url.slice(built.url.indexOf('#'))

    // query 里放一份**不同**的数据，验证 hash 胜出
    const r = await readShareState({ search: '?pts=1,2,3', hash }, table)
    expect(r.state.pts).toEqual(pts)
    expect(r.state.pts).not.toEqual([1, 2, 3])
  })

  it('hash 内容非法 → 返回空状态 + unparsable，不抛异常', async () => {
    const r = await readShareState({ search: '', hash: '#s=!!!not-base64!!!' }, T01_PARAMS)
    expect(r.state).toEqual({})
    expect(r.hadProblems).toBe(true)
    expect(r.issues[0].kind).toBe('unparsable')
  })

  it('hash 解压成功但不是对象 → unparsable', async () => {
    const { deflateSync } = await import('fflate')
    const hash = '#s=' + toBase64Url(deflateSync(new TextEncoder().encode('"just a string"')))
    const r = await readShareState({ search: '', hash }, T01_PARAMS)
    expect(r.hadProblems).toBe(true)
    expect(r.issues[0]).toMatchObject({ kind: 'unparsable', detail: 'shape' })
  })

  it('完全没有参数 → 空状态、无问题（不是错误）', async () => {
    const r = await readShareState({ search: '', hash: '' }, T01_PARAMS)
    expect(r.state).toEqual({})
    expect(r.hadProblems).toBe(false)
    expect(r.issues).toHaveLength(0)
  })

  it('解析失败时仍返回可用的空 state，让页面以默认状态加载（FR-05 降级）', async () => {
    const r = await readShareState({ search: '', hash: '#s=@@@@' }, T01_PARAMS)
    expect(r.state).toBeDefined()
    expect(typeof r.state).toBe('object')
  })
})

describe('SR-10：参数名一经发布不再变更', () => {
  it('T01 的参数名固定为 lng/lat/from/to/p/comma', () => {
    // 这条测试的作用是**阻止重命名**：改了键名，已分享出去的旧链接就全废了。
    // 新增参数可以，重命名或删除不行 —— 若确需变更，必须同时保留旧名做兼容解码。
    expect(T01_PARAMS.map((p) => p.key)).toEqual(['lng', 'lat', 'from', 'to', 'p', 'comma'])
  })

  it('旧链接（缺少新增参数）仍能正常解析', () => {
    // 假设 comma 是后来新增的，只有 lng/lat/from/to 的老链接不该报错
    const r = decodeState('lng=116.3974&lat=39.9088&from=WGS84&to=CGCS2000', T01_PARAMS)
    expect(r.hadProblems).toBe(false)
    expect(r.state).not.toHaveProperty('comma')
  })
})
