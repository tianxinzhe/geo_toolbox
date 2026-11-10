/**
 * T10 等距圈与缓冲区的纯函数测试。
 */

import { describe, expect, it } from 'vitest'

import {
  buildCircleCollection,
  circleMetrics,
  geodesicRing,
  MAX_RADIUS_M,
  metersToUnit,
  parseRadiusList,
  radiusToMeters
} from '../../src/lib/geo/circle'
import { bufferCollection } from '../../src/lib/geo/buffer'
import { vincentyInverse } from '../../src/lib/geo/geodesy'

describe('半径单位', () => {
  it('四种单位换算', () => {
    expect(radiusToMeters(1, 'km')).toBe(1000)
    expect(radiusToMeters(1, 'mi')).toBeCloseTo(1609.344, 3)
    expect(radiusToMeters(1, 'nmi')).toBe(1852)
    expect(radiusToMeters(500, 'm')).toBe(500)
    expect(metersToUnit(1609.344, 'mi')).toBeCloseTo(1, 9)
  })

  it('多重半径解析支持常见分隔符', () => {
    expect(parseRadiusList('1, 3, 5')).toEqual([1, 3, 5])
    expect(parseRadiusList('1 3 5')).toEqual([1, 3, 5])
    expect(parseRadiusList('1;3；5')).toEqual([1, 3, 5])
    expect(parseRadiusList('1、3')).toEqual([1, 3])
    expect(parseRadiusList('abc')).toEqual([])
  })
})

describe('等距圈几何', () => {
  it('生成的边界点都落在给定大地线距离上', () => {
    const center = { lat: 39.9088, lng: 116.3974 }
    const radius = 5000
    const ring = geodesicRing(center.lat, center.lng, radius, 32)
    expect(ring.ring).toHaveLength(33)
    expect(ring.ring[0]).toEqual(ring.ring[32])

    for (const [lng, lat] of ring.ring.slice(0, 32)) {
      const d = vincentyInverse(center.lat, center.lng, lat, lng)
      expect(d).toBeDefined()
      expect(d!.distance).toBeCloseTo(radius, 3)
    }
  })

  it('面积接近 πr²，周长接近 2πr', () => {
    const r = 10_000
    const m = circleMetrics(39.9088, 116.3974, r, 256)
    const areaErr = Math.abs(m.areaM2 - Math.PI * r * r) / (Math.PI * r * r)
    const periErr = Math.abs(m.perimeterM - 2 * Math.PI * r) / (2 * Math.PI * r)
    expect(areaErr).toBeLessThan(0.005)
    expect(periErr).toBeLessThan(0.005)
  })

  it('半径非法直接拒绝', () => {
    expect(() => geodesicRing(0, 0, 0, 32)).toThrow(RangeError)
    expect(() => geodesicRing(0, 0, -1, 32)).toThrow(RangeError)
    expect(() => geodesicRing(0, 0, MAX_RADIUS_M + 1, 32)).toThrow(RangeError)
    expect(() => geodesicRing(0, 0, 1000, 4)).toThrow(RangeError)
  })

  it('极点与大半径不会崩溃', () => {
    const ring = geodesicRing(89.9, 0, 1_000_000, 32)
    expect(ring.ring).toHaveLength(33)
    expect(ring.ring.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true)

    const huge = geodesicRing(0, 0, MAX_RADIUS_M, 16)
    expect(huge.ring).toHaveLength(17)
  })

  it('多重半径生成多个面，属性保留原始半径', () => {
    const fc = buildCircleCollection(35.6812, 139.7671, [
      { value: 1, unit: 'km' },
      { value: 3, unit: 'km' }
    ])
    expect(fc.features).toHaveLength(2)
    expect(fc.features[0].properties).toMatchObject({ radius: 1, unit: 'km', radius_m: 1000 })
    expect(fc.features[1].properties).toMatchObject({ radius: 3, unit: 'km', radius_m: 3000 })
    expect((fc.features[0].geometry as { type: string }).type).toBe('Polygon')
  })
})

describe('缓冲区', () => {
  it('点要素按半径外扩为面', () => {
    const fc = bufferCollection(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'P' },
            geometry: { type: 'Point', coordinates: [116.3974, 39.9088] }
          }
        ]
      },
      { radiiM: [1000, 3000], steps: 32 }
    )
    expect(fc.features).toHaveLength(2)
    expect(fc.features[0].geometry?.type).toBe('Polygon')
    expect(fc.features[0].properties.radius_m).toBe(1000)
    expect(fc.features[0].properties.name).toBe('P')
  })

  it('空输入返回空集合而不是抛错', () => {
    const fc = bufferCollection({ type: 'FeatureCollection', features: [] }, { radiiM: [1000], steps: 8 })
    expect(fc.features).toHaveLength(0)
  })
})