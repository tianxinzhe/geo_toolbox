import { describe, expect, it } from 'vitest'

import { splitGeoJsonLayers } from '../../src/lib/convert/layers'
import type { VectorFeatureCollection } from '../../src/lib/convert/types'

function fc(
  features: VectorFeatureCollection['features']
): VectorFeatureCollection {
  return { type: 'FeatureCollection', features }
}

const point = (lng: number, lat: number) => ({
  type: 'Point' as const,
  coordinates: [lng, lat]
})

describe('splitGeoJsonLayers', () => {
  it('没有图层字段时按几何类型拆分', () => {
    const groups = splitGeoJsonLayers(
      fc([
        { type: 'Feature', geometry: point(0, 0), properties: { name: 'a' } },
        { type: 'Feature', geometry: point(1, 1), properties: { name: 'b' } },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0]
              ]
            ]
          },
          properties: { name: 'c' }
        }
      ])
    )
    expect(groups.map((group) => group.key)).toEqual(['point', 'polygon'])
    expect(groups[0].collection.features).toHaveLength(2)
    expect(groups[1].collection.features).toHaveLength(1)
  })

  it('按几何类型区分点、线、面', () => {
    const groups = splitGeoJsonLayers(
      fc([
        { type: 'Feature', geometry: point(0, 0), properties: { layer_index: 1 } },
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1]
            ]
          },
          properties: { layer_index: 1 }
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0]
              ]
            ]
          },
          properties: { layer_index: 2 }
        }
      ])
    )
    expect(groups.map((group) => group.key)).toEqual(['point', 'line', 'polygon'])
    expect(groups.every((group) => group.collection.features.length === 1)).toBe(true)
  })

  it('单一几何类型且无图层字段时只有一个分组', () => {
    const groups = splitGeoJsonLayers(
      fc([{ type: 'Feature', geometry: point(0, 0), properties: {} }])
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('point')
  })
})