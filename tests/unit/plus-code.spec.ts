import { describe, expect, it } from 'vitest'

import {
  PLUS_CODE_SPANS,
  decodePlusCode,
  encodePlusCode
} from '../../src/lib/coord/plusCode'

describe('Plus Codes 编码', () => {
  it('官方示例：苏黎世', () => {
    expect(encodePlusCode(47.36559, 8.524997, 10)).toBe('8FVC9G8F+6X')
  })

  it('Google 总部附近', () => {
    expect(encodePlusCode(37.4221, -122.0841, 10)).toBe('849VCWC8+R9')
  })

  it('11 位数字的编码以 10 位结果开头，只多一位数字', () => {
    const ten = encodePlusCode(39.9088, 116.3974, 10)
    const eleven = encodePlusCode(39.9088, 116.3974, 11)
    expect(eleven).toHaveLength(12)
    expect(eleven.slice(0, 11)).toBe(ten)
  })

  it('极点与日期变更线附近不越界', () => {
    expect(encodePlusCode(90, 180, 10)).toHaveLength(11)
    expect(encodePlusCode(-90, -180, 10)).toHaveLength(11)
  })
})

describe('Plus Codes 解码', () => {
  it('解码官方示例并返回区域中心与边界', () => {
    const r = decodePlusCode('8FVC9G8F+6X')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lat).toBeCloseTo(47.36559, 3)
    expect(r.lng).toBeCloseTo(8.524997, 3)
    expect(r.north - r.south).toBeCloseTo(PLUS_CODE_SPANS[10].lat)
    expect(r.east - r.west).toBeCloseTo(PLUS_CODE_SPANS[10].lng)
  })

  it('大小写与空格不敏感', () => {
    const lower = decodePlusCode('8fvc9g8f+6x')
    const spaced = decodePlusCode(' 8FVC9G8F + 6X ')
    expect(lower.ok && spaced.ok).toBe(true)
    if (lower.ok && spaced.ok) {
      expect(lower.lat).toBe(spaced.lat)
      expect(lower.lng).toBe(spaced.lng)
    }
  })

  it('11 位编码精度更高且落在原始点附近', () => {
    const code = encodePlusCode(39.9088, 116.3974, 11)
    const r = decodePlusCode(code)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.latSpan).toBeCloseTo(PLUS_CODE_SPANS[11].lat)
    expect(r.lngSpan).toBeCloseTo(PLUS_CODE_SPANS[11].lng)
    expect(Math.abs(r.lat - 39.9088)).toBeLessThanOrEqual(r.latSpan / 2 + 1e-9)
    expect(Math.abs(r.lng - 116.3974)).toBeLessThanOrEqual(r.lngSpan / 2 + 1e-9)
  })

  it('往返：中心点不超过半个格子', () => {
    const points: Array<[number, number]> = [
      [39.9088, 116.3974],
      [35.6812, 139.7671],
      [-33.8688, 151.2093],
      [-0.1276, 51.5072]
    ]
    for (const [lat, lng] of points) {
      const r = decodePlusCode(encodePlusCode(lat, lng, 11))
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      expect(Math.abs(r.lat - lat)).toBeLessThanOrEqual(r.latSpan / 2 + 1e-9)
      expect(Math.abs(r.lng - lng)).toBeLessThanOrEqual(r.lngSpan / 2 + 1e-9)
    }
  })

  it('短码缺少参考地点，明确拒绝', () => {
    expect(decodePlusCode('9G8F+6W')).toMatchObject({ ok: false, reason: 'short-code' })
  })

  it('缺少分隔符', () => {
    expect(decodePlusCode('8FVC9G8F6X')).toMatchObject({
      ok: false,
      reason: 'missing-separator'
    })
  })

  it('长度不合法', () => {
    expect(decodePlusCode('8FVC9G8F+6')).toMatchObject({
      ok: false,
      reason: 'invalid-length'
    })
  })

  it('非法字符给出位置', () => {
    expect(decodePlusCode('8FVC9G8F+6A')).toMatchObject({
      ok: false,
      reason: 'invalid-char',
      position: 9
    })
  })

  it('空输入', () => {
    expect(decodePlusCode('   ')).toMatchObject({ ok: false, reason: 'empty' })
  })
})