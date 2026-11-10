/**
 * GeoHash 编解码测试（T08，PRD 6.1 规格表）
 *
 * 参考值来源：GeoHash 是公开标准算法，`wx4g0` 系列对应北京附近，
 * `gcpvj0` 对应伦敦附近。这里的断言值由标准实现独立算出后固化，
 * 并用「编解码往返一致」「邻居互逆」两条结构性性质交叉验证 ——
 * 只固化字面量容易把实现错误一起固化下来。
 */
import { describe, expect, it } from 'vitest'

import {
  BASE32,
  clampPrecision,
  decode,
  DEFAULT_PRECISION,
  DIRECTIONS,
  encode,
  looksLikeGeoHash,
  MAX_PRECISION,
  MIN_GEOHASH_LIKE_LENGTH,
  MIN_PRECISION,
  neighbor,
  neighbors,
  PRECISION_TABLE,
  precisionInfo
} from '../../src/lib/coord/geohash'

/** 北京（PRD 6.1 算例一的 WGS84 值） */
const BEIJING = { lng: 116.3974, lat: 39.9088 }
/** 伦敦（PRD 6.1 算例二的 WGS84 值） */
const LONDON = { lng: -0.1276, lat: 51.5072 }

describe('Base32 字母表', () => {
  it('正好 32 个字符，且排除了 a i l o', () => {
    expect(BASE32).toHaveLength(32)
    // 排除这四个是为了避免与数字 1 / 0 以及字母 I 混淆
    for (const excluded of ['a', 'i', 'l', 'o']) {
      expect(BASE32, `不应包含 ${excluded}`).not.toContain(excluded)
    }
  })

  it('包含全部数字与其余小写字母', () => {
    for (const c of '0123456789bcdefghjkmnpqrstuvwxyz') {
      expect(BASE32).toContain(c)
    }
  })
})

describe('编码', () => {
  it('默认精度 7 位（T08：约 150m × 150m）', () => {
    expect(DEFAULT_PRECISION).toBe(7)
    expect(encode(BEIJING.lng, BEIJING.lat)).toHaveLength(7)
  })

  it('输出只含合法 Base32 字符', () => {
    const h = encode(BEIJING.lng, BEIJING.lat, 12)
    for (const c of h) expect(BASE32).toContain(c)
  })

  it('精度越长前缀越稳定（GeoHash 的前缀性质）', () => {
    const h5 = encode(BEIJING.lng, BEIJING.lat, 5)
    const h9 = encode(BEIJING.lng, BEIJING.lat, 9)
    expect(h9.startsWith(h5)).toBe(true)
  })

  it('相同坐标不同精度是前缀关系', () => {
    let prev = ''
    for (let p = MIN_PRECISION; p <= MAX_PRECISION; p++) {
      const h = encode(LONDON.lng, LONDON.lat, p)
      expect(h).toHaveLength(p)
      if (prev) expect(h.startsWith(prev), `p=${p}`).toBe(true)
      prev = h
    }
  })

  it('经度先于纬度交错（搞反会得到完全不同但看似合法的字符串）', () => {
    // 赤道与本初子午线交点 (0,0) 的 GeoHash 是 's' 开头 ——
    // 这是标准算法的著名特征值，若把经纬度顺序搞反会得到 '7' 开头
    expect(encode(0, 0, 1)).toBe('s')
  })

  it('四个象限的首字符符合标准划分', () => {
    // GeoHash 首字符把地球分成 32 块。这四个是常用的象限锚点：
    // 东北半球 → 'w' 区一带，西北 → 'c'/'d'，东南 → 'q'/'r'，西南 → '6'/'7'
    expect(encode(116.3974, 39.9088, 1)).toBe('w') // 北京
    expect(encode(-0.1276, 51.5072, 1)).toBe('g') // 伦敦
    expect(encode(-73.9857, 40.7484, 1)).toBe('d') // 纽约
    expect(encode(151.2093, -33.8688, 1)).toBe('r') // 悉尼
  })

  it('精度会被夹到 1~12', () => {
    expect(encode(BEIJING.lng, BEIJING.lat, 0)).toHaveLength(MIN_PRECISION)
    expect(encode(BEIJING.lng, BEIJING.lat, 99)).toHaveLength(MAX_PRECISION)
    expect(encode(BEIJING.lng, BEIJING.lat, 3.7)).toHaveLength(DEFAULT_PRECISION)
  })

  it('极点与日期变更线也能编码', () => {
    expect(encode(0, 90, 6)).toHaveLength(6)
    expect(encode(0, -90, 6)).toHaveLength(6)
    expect(encode(180, 0, 6)).toHaveLength(6)
    expect(encode(-180, 0, 6)).toHaveLength(6)
  })
})

describe('解码', () => {
  it('返回中心点、边界框、误差、尺寸与精度', () => {
    const h = encode(BEIJING.lng, BEIJING.lat, 9)
    const d = decode(h)
    expect(d.ok).toBe(true)
    if (!d.ok) return
    expect(d.hash).toBe(h)
    expect(d.precision).toBe(9)
    expect(d.center.lng).toBeCloseTo(BEIJING.lng, 3)
    expect(d.center.lat).toBeCloseTo(BEIJING.lat, 3)
    // 中心点必须在边界框内
    expect(d.center.lng).toBeGreaterThanOrEqual(d.box.sw.lng)
    expect(d.center.lng).toBeLessThanOrEqual(d.box.ne.lng)
    expect(d.center.lat).toBeGreaterThanOrEqual(d.box.sw.lat)
    expect(d.center.lat).toBeLessThanOrEqual(d.box.ne.lat)
    expect(d.error.lng).toBeGreaterThan(0)
    expect(d.error.lat).toBeGreaterThan(0)
    expect(d.size.lng).toBeGreaterThan(0)
    expect(d.size.lat).toBeGreaterThan(0)
  })

  it('大小写不敏感，且自动去空白', () => {
    const h = encode(LONDON.lng, LONDON.lat, 8)
    const upper = decode(`  ${h.toUpperCase()}  `)
    const lower = decode(h)
    expect(upper.ok && lower.ok).toBe(true)
    if (!upper.ok || !lower.ok) return
    expect(upper.hash).toBe(lower.hash)
    expect(upper.center.lng).toBe(lower.center.lng)
  })

  it('编解码往返：中心点落回原格子', () => {
    for (const p of [1, 4, 7, 9, 12]) {
      const h = encode(BEIJING.lng, BEIJING.lat, p)
      const d = decode(h)
      if (!d.ok) throw new Error('decode failed')
      // 用解码出的中心点重新编码，必须得到同一个 hash
      expect(encode(d.center.lng, d.center.lat, p), `p=${p}`).toBe(h)
    }
  })

  it('非法字符 → 指出**具体位置**与该字符（T08 专属异常）', () => {
    // `a` `i` `l` `o` 不在 Base32 字母表中
    const d = decode('wx4a0bk')
    expect(d.ok).toBe(false)
    if (d.ok) return
    expect(d.reason).toBe('illegalChar')
    expect(d.position).toBe(3)
    expect(d.char).toBe('a')
    expect(d.alphabet).toBe(BASE32)
  })

  it('多个非法字符时报第一个的位置', () => {
    const d = decode('iloa')
    expect(d.ok).toBe(false)
    if (d.ok) return
    expect(d.position).toBe(0)
    expect(d.char).toBe('i')
  })

  it('大写非法字符同样能被抓住（先转小写再校验）', () => {
    const d = decode('WX4A0BK')
    expect(d.ok).toBe(false)
    if (d.ok) return
    expect(d.char).toBe('a')
  })

  it('空输入', () => {
    expect(decode('')).toMatchObject({ ok: false, reason: 'empty' })
    expect(decode('   ')).toMatchObject({ ok: false, reason: 'empty' })
  })

  it('解码结果自带 8 个邻居', () => {
    const d = decode(encode(BEIJING.lng, BEIJING.lat, 7))
    if (!d.ok) throw new Error('decode failed')
    for (const dir of DIRECTIONS) {
      expect(d.neighbors[dir], dir).toHaveLength(7)
    }
  })
})

describe('精度对照表（T08：常驻文档区，最高频的查询意图）', () => {
  it('覆盖 1~12 全部精度', () => {
    expect(PRECISION_TABLE).toHaveLength(12)
    expect(PRECISION_TABLE[0].precision).toBe(1)
    expect(PRECISION_TABLE[11].precision).toBe(12)
  })

  it('精度越高误差越小、格子越小（严格单调递减）', () => {
    for (let i = 1; i < PRECISION_TABLE.length; i++) {
      const prev = PRECISION_TABLE[i - 1]
      const cur = PRECISION_TABLE[i]
      expect(cur.latError, `p=${cur.precision}`).toBeLessThan(prev.latError)
      expect(cur.lngError, `p=${cur.precision}`).toBeLessThan(prev.lngError)
      expect(cur.latSize).toBeLessThan(prev.latSize)
      expect(cur.lngSize).toBeLessThan(prev.lngSize)
    }
  })

  it('7 位约 150m × 150m（T08 规格给出的默认精度描述）', () => {
    const p7 = precisionInfo(7)
    expect(p7.latSize).toBeGreaterThan(100)
    expect(p7.latSize).toBeLessThan(200)
    expect(p7.lngSize).toBeGreaterThan(100)
    expect(p7.lngSize).toBeLessThan(200)
  })

  it('12 位达到厘米级', () => {
    const p12 = precisionInfo(12)
    expect(p12.latSize).toBeLessThan(0.02)
  })

  it('1 位是行星级（数千公里）', () => {
    const p1 = precisionInfo(1)
    expect(p1.latSize).toBeGreaterThan(1_000_000)
  })

  it('precisionInfo 会夹住越界的精度', () => {
    expect(precisionInfo(0).precision).toBe(MIN_PRECISION)
    expect(precisionInfo(99).precision).toBe(MAX_PRECISION)
    expect(clampPrecision(3.5)).toBe(DEFAULT_PRECISION)
  })

  it('解码得到的尺寸与对照表一致', () => {
    for (const p of [1, 5, 7, 9, 12]) {
      const h = encode(BEIJING.lng, BEIJING.lat, p)
      const d = decode(h)
      if (!d.ok) throw new Error('decode failed')
      const info = precisionInfo(p)
      expect(d.size.lat, `p=${p}`).toBeCloseTo(info.latSize, 3)
      expect(d.size.lng, `p=${p}`).toBeCloseTo(info.lngSize, 3)
      expect(d.error.lat, `p=${p}`).toBeCloseTo(info.latError, 8)
    }
  })
})

describe('邻居计算', () => {
  it('八个方向都返回同长度的合法 hash', () => {
    const h = encode(BEIJING.lng, BEIJING.lat, 7)
    const n = neighbors(h)
    for (const dir of DIRECTIONS) {
      expect(n[dir], dir).toHaveLength(7)
      for (const c of n[dir]) expect(BASE32, `${dir} 含非法字符`).toContain(c)
    }
  })

  it('八个邻居互不相同，且都不等于自身', () => {
    const h = encode(BEIJING.lng, BEIJING.lat, 7)
    const n = neighbors(h)
    const values = DIRECTIONS.map((d) => n[d])
    expect(new Set(values).size).toBe(8)
    expect(values).not.toContain(h)
  })

  it('方向互逆：往北再往南回到原格子', () => {
    const h = encode(BEIJING.lng, BEIJING.lat, 7)
    expect(neighbor(neighbor(h, 'n'), 's')).toBe(h)
    expect(neighbor(neighbor(h, 'e'), 'w')).toBe(h)
    expect(neighbor(neighbor(h, 'ne'), 'sw')).toBe(h)
    expect(neighbor(neighbor(h, 'nw'), 'se')).toBe(h)
  })

  it('对角方向等价于两次正交移动', () => {
    const h = encode(LONDON.lng, LONDON.lat, 6)
    expect(neighbor(h, 'ne')).toBe(neighbor(neighbor(h, 'n'), 'e'))
    expect(neighbor(h, 'sw')).toBe(neighbor(neighbor(h, 's'), 'w'))
  })

  it('邻居的中心点与原格子相距约一个格宽', () => {
    const h = encode(BEIJING.lng, BEIJING.lat, 7)
    const c = decode(h)
    const n = decode(neighbor(h, 'e'))
    if (!c.ok || !n.ok) throw new Error('decode failed')
    // 经度方向相邻格子的中心差 ≈ 一个格宽（用度数比较，避免纬度收缩干扰）
    expect(Math.abs(n.center.lng - c.center.lng)).toBeCloseTo(c.error.lng * 2, 5)
    expect(Math.abs(n.center.lat - c.center.lat)).toBeLessThan(1e-9)
  })

  it('跨 ±180 经线时经度归一化，不产生 181 这类非法值', () => {
    // 日期变更线附近的格子
    const h = encode(179.99, 0, 5)
    const e = neighbor(h, 'e')
    const d = decode(e)
    if (!d.ok) throw new Error('decode failed')
    expect(Math.abs(d.center.lng)).toBeLessThanOrEqual(180)
  })

  it('越过极点时返回原 hash（极点之外没有格子）', () => {
    const h = encode(0, 89.99999, 5)
    expect(neighbor(h, 'n')).toBe(h)
  })

  it('非法 hash 的邻居返回原值，不抛异常', () => {
    expect(neighbor('a', 'n')).toBe('a')
  })
})

describe('looksLikeGeoHash —— 供其他工具识别并引导前往 T08（SR-01 表）', () => {
  it('真实 GeoHash 返回 true', () => {
    expect(looksLikeGeoHash('wx4g0bk')).toBe(true)
    expect(looksLikeGeoHash('gcpvj0v0')).toBe(true)
    expect(looksLikeGeoHash('WX4G0BK')).toBe(true) // 大小写不敏感
  })

  it('含 a i l o 的字符串返回 false（它们不是合法 Base32 字符）', () => {
    expect(looksLikeGeoHash('wx4a0bk')).toBe(false)
    expect(looksLikeGeoHash('code')).toBe(false) // 含 o
    expect(looksLikeGeoHash('beijing')).toBe(false) // 含 i
    expect(looksLikeGeoHash('london')).toBe(false) // 含 l 与 o
  })

  it('短于 6 位返回 false —— 避免把 `news`、`west` 这类英文词误判', () => {
    // Base32 字母表含 22 个字母，大量常见英文词完全由它们组成，
    // 语法上都是合法 GeoHash。长度下限取 6 是「能表示一个有意义地点」的实际下限。
    expect(looksLikeGeoHash('news')).toBe(false)
    expect(looksLikeGeoHash('west')).toBe(false)
    expect(looksLikeGeoHash('wx4')).toBe(false)
    expect(looksLikeGeoHash('wx4g0')).toBe(false) // 5 位，仍太短
    expect(looksLikeGeoHash('s')).toBe(false)
    expect(MIN_GEOHASH_LIKE_LENGTH).toBe(6)
  })

  it('6 位及以上的纯 Base32 字符串返回 true', () => {
    expect(looksLikeGeoHash('wx4g0b')).toBe(true)
  })

  it('超过 12 位返回 false', () => {
    expect(looksLikeGeoHash('w'.repeat(13))).toBe(false)
    expect(looksLikeGeoHash('w'.repeat(12))).toBe(true)
  })

  it('含分隔符、空格或小数点返回 false', () => {
    expect(looksLikeGeoHash('wx4g 0bk')).toBe(false)
    expect(looksLikeGeoHash('116.3974,39.9088')).toBe(false)
    expect(looksLikeGeoHash('wx4g0bk-')).toBe(false)
  })

  it('常见英文词一律返回 false', () => {
    // 这些词若被判成 GeoHash，用户在坐标框里输入普通文字时
    // 会收到「这是 GeoHash，请去 T08」的误导提示
    for (const w of ['news', 'code', 'latlng', 'beijing', 'london', 'west', 'send', 'deep']) {
      expect(looksLikeGeoHash(w), w).toBe(false)
    }
  })
})
