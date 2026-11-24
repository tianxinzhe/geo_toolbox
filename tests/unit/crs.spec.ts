/**
 * CRS 层单测：中国高斯带、UTM、基准变换与坐标量级检查。
 *
 * 黄金值来源：
 *   - 带号参数来自 EPSG 注册表（scripts/verify-epsg.ts 逐条核验）
 *   - Web Mercator 用公式可手算的已知值
 */

import { describe, expect, it } from 'vitest'

import {
  chinaCmOfZone,
  chinaGkEpsg,
  chinaZoneForLongitude,
  chinaZoneOfCm,
  utmEpsg,
  utmZoneForLongitude,
  CN_CM_3,
  CN_CM_6
} from '../../src/lib/crs/china'
import {
  checkCoord,
  createTransform,
  datumShiftOf,
  parseEpsgId,
  resolveCrs,
  resolveCrsId,
  normalizeTowgs84
} from '../../src/lib/crs/engine'

describe('中国高斯-克吕格与 UTM', () => {
  it('3° / 6° 带的 CM 清单长度', () => {
    expect(CN_CM_3).toHaveLength(21)
    expect(CN_CM_6).toHaveLength(11)
    expect(CN_CM_3[0]).toBe(75)
    expect(CN_CM_3[20]).toBe(135)
    expect(CN_CM_6[0]).toBe(75)
    expect(CN_CM_6[10]).toBe(135)
  })

  it('CM 与带号互算', () => {
    expect(chinaZoneOfCm(117, 3)).toBe(39)
    expect(chinaCmOfZone(39, 3)).toBe(117)
    expect(chinaZoneOfCm(117, 6)).toBe(20)
    expect(chinaCmOfZone(20, 6)).toBe(117)
    expect(chinaZoneOfCm(76, 3)).toBeUndefined()
  })

  it('EPSG 代码映射', () => {
    expect(chinaGkEpsg('cgcs2000', 3, 117)).toBe(4548)
    expect(chinaGkEpsg('cgcs2000', 6, 117)).toBe(4509)
    expect(chinaGkEpsg('xian1980', 3, 117)).toBe(2384)
    expect(chinaGkEpsg('beijing1954', 3, 117)).toBe(2436)
  })

  it('按经度推算带号并夹取到合法范围', () => {
    expect(chinaZoneForLongitude(116.3974, 3)).toEqual({ zone: 39, cm: 117 })
    expect(chinaZoneForLongitude(116.3974, 6)).toEqual({ zone: 20, cm: 117 })
    expect(chinaZoneForLongitude(-20, 3).zone).toBe(25) // 夹到西端
    expect(chinaZoneForLongitude(170, 3).zone).toBe(45) // 夹到东端
  })

  it('UTM 带号与 EPSG', () => {
    expect(utmZoneForLongitude(116.3974)).toBe(50)
    expect(utmZoneForLongitude(-0.1276)).toBe(30)
    expect(utmZoneForLongitude(179.9)).toBe(60)
    expect(utmEpsg(50, false)).toBe(32650)
    expect(utmEpsg(50, true)).toBe(32750)
    expect(utmEpsg(54, false)).toBe(32654)
  })
})

describe('投影引擎', () => {
  it('WGS84 → Web Mercator 与手算值一致', async () => {
    const t = await createTransform('epsg:4326', 'epsg:3857')
    const [x, y] = t.forward(116.3974, 39.9088)
    expect(x).toBeCloseTo(12_957_299.30, 0)
    expect(y).toBeCloseTo(4_852_698.18, 0)
  })

  it('CGCS2000 3° 带 → WGS84 的往返', async () => {
    const t = await createTransform('epsg:4548', 'epsg:4326')
    const [lng, lat] = t.forward(442_000, 4_420_000)
    expect(lng).toBeCloseTo(116.32, 1)
    expect(lat).toBeCloseTo(39.9, 1)
    const [x, y] = t.inverse(lng, lat)
    expect(x).toBeCloseTo(442_000, 3)
    expect(y).toBeCloseTo(4_420_000, 3)
  })

  it('自动带号按锚点经度解析', async () => {
    const t = await createTransform('epsg:4326', 'auto:utm:WGS84', {
      anchor: { lng: 116.3974, lat: 39.9088 }
    })
    expect(t.to.code).toBe(32650)
  })

  it('自动带号作为源坐标系被拒绝', async () => {
    await expect(createTransform('auto:utm:WGS84', 'epsg:4326')).rejects.toMatchObject({
      code: 'auto-source-unsupported'
    })
  })

  it('未命中内置表时异步加载完整 EPSG 表', async () => {
    const info = await resolveCrs(32633)
    expect(info.name).toBe('WGS 84 / UTM zone 33N')
    expect(info.kind).toBe('projected')
  })

  it('不存在的代码报 not-found', async () => {
    await expect(resolveCrs(999_999)).rejects.toMatchObject({ code: 'not-found' })
  })

  it('解析 EPSG id 的多种写法', () => {
    expect(parseEpsgId('epsg:4548')).toBe(4548)
    expect(parseEpsgId('EPSG:4548')).toBe(4548)
    expect(parseEpsgId('4548')).toBe(4548)
    expect(() => parseEpsgId('abc')).toThrow()
  })

  it('resolveCrsId 接受自动带号', async () => {
    const info = await resolveCrsId('auto:gk:cgcs2000:3', {
      anchor: { lng: 116.3974, lat: 39.9088 }
    })
    expect(info.code).toBe(4548)
  })
})

describe('基准变换判定', () => {
  it('同 datum → none', async () => {
    const a = await resolveCrs(4326)
    const b = await resolveCrs(3857)
    expect(datumShiftOf(a, b)).toBe('none')
  })

  it('OSGB36 ↔ WGS84 走七参数', async () => {
    const a = await resolveCrs(4277)
    const b = await resolveCrs(4326)
    expect(datumShiftOf(a, b)).toBe('7param')
  })

  it('西安 1980 无官方参数 → missing', async () => {
    const a = await resolveCrs(4610)
    const b = await resolveCrs(4326)
    expect(datumShiftOf(a, b)).toBe('missing')
  })

  it('CGCS2000 按与 WGS84 等值处理', async () => {
    const a = await resolveCrs(4490)
    const b = await resolveCrs(4326)
    expect(datumShiftOf(a, b)).toBe('none')
  })

  it('自定义七参数覆盖源 CRS', async () => {
    expect(normalizeTowgs84('1,2,3,0.1,0.2,0.3,1.5')).toBe('1,2,3,0.1,0.2,0.3,1.5')
    expect(normalizeTowgs84('1,2')).toBeUndefined()
    expect(normalizeTowgs84('1,2,x')).toBeUndefined()

    const t = await createTransform('epsg:4610', 'epsg:4326', {
      customTowgs84: '-24.4,171.7,28.6,0,0,0,0'
    })
    expect(t.datumShift).toBe('custom')
    expect(t.from.proj4).toContain('+towgs84=-24.4,171.7,28.6,0,0,0,0')
  })
})

describe('坐标量级检查', () => {
  it('地理坐标超范围是硬错误', async () => {
    const info = await resolveCrs(4326)
    expect(checkCoord(info, 200, 39)).toContain('geo-range')
    expect(checkCoord(info, 116, 100)).toContain('geo-range')
  })

  it('投影坐标却填了经纬度量级 → 警告但不阻断', async () => {
    const info = await resolveCrs(4548)
    expect(checkCoord(info, 116.3974, 39.9088)).toContain('looks-like-degrees')
  })

  it('X/Y 颠倒（X 百万级、Y 十万级）→ 警告', async () => {
    const info = await resolveCrs(4548)
    expect(checkCoord(info, 4_420_000, 442_000)).toContain('axis-swap')
  })
})