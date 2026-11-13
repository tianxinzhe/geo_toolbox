import { describe, expect, it } from 'vitest'

import type { VectorFeatureCollection } from '../../src/lib/convert/types'
import type { GeoJsonGeometry } from '../../src/lib/convert/wkt'
import { dissolveByField } from '../../src/lib/geo/dissolve'
import { signedAreaM2 } from '../../src/lib/geo/polygon'

function collection(
  features: Array<{ geometry: GeoJsonGeometry | null; properties: Record<string, unknown> }>
): VectorFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map((feature) => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: feature.properties
    }))
  }
}

function rect(west: number, south: number, east: number, north: number): GeoJsonGeometry {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south]
      ]
    ]
  }
}

/** 结果面的球面面积（平方米），所有外环取绝对值后相加 */
function polygonArea(geometry: GeoJsonGeometry | null): number {
  if (!geometry) return 0
  if (geometry.type === 'Polygon') {
    return Math.abs(signedAreaM2(geometry.coordinates[0].map(([lng, lat]) => ({ lng, lat }))))
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce(
      (sum, polygon) =>
        sum + Math.abs(signedAreaM2(polygon[0].map(([lng, lat]) => ({ lng, lat })))),
      0
    )
  }
  return 0
}

describe('dissolveByField', () => {
  it('相邻面 union 成一个面，面积近似等于两者之和', () => {
    const input = collection([
      { geometry: rect(0, 0, 1, 1), properties: { zone: 'A' } },
      { geometry: rect(1, 0, 2, 1), properties: { zone: 'A' } }
    ])

    const result = dissolveByField(input, 'zone')

    expect(result.groups).toHaveLength(1)
    expect(result.collection.features).toHaveLength(1)
    const feature = result.collection.features[0]
    expect(feature.geometry?.type).toBe('MultiPolygon')
    expect(feature.properties).toEqual({ zone: 'A', feature_count: 2 })

    const coordinates =
      feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : []
    expect(coordinates).toHaveLength(1)

    // 赤道附近 2° × 1° 的球面面积；等积球与椭球赤道尺度差约 0.4%，按 1% 容差断言
    const expected = 2 * 111_319.49 * 111_319.49
    const ratio = polygonArea(feature.geometry) / expected
    expect(ratio).toBeGreaterThan(0.99)
    expect(ratio).toBeLessThan(1.01)
  })

  it('点按字段分组并合并为 MultiPoint，保持首次出现顺序', () => {
    const input = collection([
      { geometry: { type: 'Point', coordinates: [0, 0] }, properties: { kind: 'b' } },
      { geometry: { type: 'Point', coordinates: [1, 1] }, properties: { kind: 'a' } },
      { geometry: { type: 'Point', coordinates: [2, 2] }, properties: { kind: 'b' } }
    ])

    const result = dissolveByField(input, 'kind')

    expect(result.groups.map((group) => group.value)).toEqual(['b', 'a'])
    expect(result.groups[0]).toMatchObject({ count: 2, geometryType: 'MultiPoint' })
    expect(result.groups[1]).toMatchObject({ count: 1, geometryType: 'MultiPoint' })
    expect(result.collection.features[0].geometry).toEqual({
      type: 'MultiPoint',
      coordinates: [
        [0, 0],
        [2, 2]
      ]
    })
  })

  it('线合并为 MultiLineString', () => {
    const input = collection([
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1]
          ]
        },
        properties: { road: 'R1' }
      },
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [2, 2],
            [3, 3]
          ]
        },
        properties: { road: 'R1' }
      }
    ])

    const result = dissolveByField(input, 'road')

    expect(result.collection.features[0].geometry).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 1]
        ],
        [
          [2, 2],
          [3, 3]
        ]
      ]
    })
  })

  it('null、undefined 与空串归为同一个空组', () => {
    const input = collection([
      { geometry: null, properties: { zone: null } },
      { geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
      { geometry: { type: 'Point', coordinates: [1, 1] }, properties: { zone: '' } }
    ])

    const result = dissolveByField(input, 'zone')

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]).toMatchObject({ value: '', count: 3 })
    expect(result.collection.features[0].properties).toEqual({ zone: '', feature_count: 3 })
    expect(result.collection.features[0].geometry?.type).toBe('MultiPoint')
  })

  it('同组混合几何输出 GeometryCollection', () => {
    const input = collection([
      { geometry: rect(0, 0, 1, 1), properties: { zone: 'A' } },
      { geometry: { type: 'Point', coordinates: [5, 5] }, properties: { zone: 'A' } }
    ])

    const result = dissolveByField(input, 'zone')
    const geometry = result.collection.features[0].geometry

    expect(geometry?.type).toBe('GeometryCollection')
    if (geometry?.type === 'GeometryCollection') {
      expect(geometry.geometries.map((item) => item.type)).toEqual(['MultiPolygon', 'MultiPoint'])
    }
  })

  it('不同字段值互不影响，并统计每组要素数', () => {
    const input = collection([
      { geometry: rect(0, 0, 1, 1), properties: { zone: 'A' } },
      { geometry: rect(1, 0, 2, 1), properties: { zone: 'B' } },
      { geometry: rect(2, 0, 3, 1), properties: { zone: 'A' } }
    ])

    const result = dissolveByField(input, 'zone')

    expect(result.groups.map((group) => group.count)).toEqual([2, 1])
    expect(result.collection.features).toHaveLength(2)
    expect(result.collection.features[1].properties).toEqual({ zone: 'B', feature_count: 1 })
  })
})