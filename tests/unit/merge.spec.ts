import { describe, expect, it } from 'vitest'

import type { VectorFeatureCollection } from '../../src/lib/convert/types'
import { mergeCollections } from '../../src/lib/geo/merge'

function pointCollection(count: number, props: Record<string, unknown> = {}): VectorFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: count }, (_, index) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [index, index] },
      properties: { ...props, index }
    }))
  }
}

describe('mergeCollections', () => {
  it('拼接多源要素并统计每个来源的要素数', () => {
    const result = mergeCollections([
      { name: 'a.geojson', collection: pointCollection(2) },
      { name: 'b.geojson', collection: pointCollection(3) }
    ])

    expect(result.total).toBe(5)
    expect(result.collection.features).toHaveLength(5)
    expect(result.sources).toEqual([
      { name: 'a.geojson', count: 2 },
      { name: 'b.geojson', count: 3 }
    ])
  })

  it('只在没有 source 字段时写入来源文件名', () => {
    const result = mergeCollections([
      { name: 'first.geojson', collection: pointCollection(1) },
      { name: 'second.geojson', collection: pointCollection(1, { source: '原始来源' }) }
    ])

    expect(result.collection.features[0].properties.source).toBe('first.geojson')
    expect(result.collection.features[1].properties.source).toBe('原始来源')
  })

  it('统计几何类型分布，空几何记为 none', () => {
    const withPolygon: VectorFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0]
              ]
            ]
          },
          properties: {}
        },
        { type: 'Feature', geometry: null, properties: {} }
      ]
    }

    const result = mergeCollections([
      { name: 'mixed.geojson', collection: withPolygon },
      { name: 'points.geojson', collection: pointCollection(1) }
    ])

    expect(result.geometryCounts).toEqual({ Point: 1, Polygon: 1, none: 1 })
  })

  it('空输入返回空集合', () => {
    const result = mergeCollections([])
    expect(result.total).toBe(0)
    expect(result.collection.features).toHaveLength(0)
    expect(result.sources).toHaveLength(0)
  })
})