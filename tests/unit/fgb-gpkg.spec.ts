/**
 * FlatGeobuf / GeoPackage / WKB 单测。
 *
 * GPKG 读写走 sql.js；在 Node 下由 sql.js 自行定位 wasm，
 * 这一条路径同时也验证了浏览器之外的可用性。
 */

import { describe, expect, it } from 'vitest'

import { collectionToFgb, parseFgb } from '../../src/lib/convert/fgb'
import { collectionToGpkg, parseGpkg } from '../../src/lib/convert/gpkg'
import type { VectorFeatureCollection } from '../../src/lib/convert/types'
import { readGpkgGeometry, readWkb, writeGpkgGeometry, writeWkb } from '../../src/lib/convert/wkb'
import type { GeoJsonGeometry } from '../../src/lib/convert/wkt'

const FC: VectorFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [116.3974, 39.9088] },
      properties: { name: 'Beijing', rank: 1, ok: true }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [116.3, 39.8],
          [116.4, 39.9],
          [116.5, 40]
        ]
      },
      properties: { name: 'Route', rank: 2, ok: false }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [116.3, 39.8],
            [116.5, 39.8],
            [116.5, 40],
            [116.3, 40],
            [116.3, 39.8]
          ]
        ]
      },
      properties: { name: 'Area', rank: 3, ok: true }
    }
  ]
}

describe('WKB', () => {
  const geometries: GeoJsonGeometry[] = [
    { type: 'Point', coordinates: [116.3974, 39.9088] },
    {
      type: 'MultiPoint',
      coordinates: [
        [0, 0],
        [1, 1]
      ]
    },
    {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1]
      ]
    },
    {
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 1]
        ]
      ]
    },
    {
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
    {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0]
          ]
        ]
      ]
    },
    {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [1, 2] },
        {
          type: 'LineString',
          coordinates: [
            [3, 4],
            [5, 6]
          ]
        }
      ]
    }
  ]

  it('全部几何类型可以往返', () => {
    for (const geometry of geometries) {
      const result = readWkb(writeWkb(geometry))
      expect(result.geometry).toEqual(geometry)
      expect(result.offset).toBe(writeWkb(geometry).length)
    }
  })

  it('GPKG 几何 blob 带 GP 头且可以往返', () => {
    const blob = writeGpkgGeometry(geometries[0])
    expect(blob[0]).toBe(0x47)
    expect(blob[1]).toBe(0x50)
    expect(readGpkgGeometry(blob)).toEqual(geometries[0])
  })

  it('非 GPKG blob 明确报错', () => {
    expect(() => readGpkgGeometry(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(
      'invalid-gpkg-geometry'
    )
  })
})

describe('FlatGeobuf', () => {
  it('点/线/面与属性可以往返', async () => {
    const { bytes } = collectionToFgb(FC)
    const out = await parseFgb(bytes)
    expect(out.format).toBe('fgb')
    expect(out.collection.features.map((f) => f.geometry?.type)).toEqual([
      'Point',
      'LineString',
      'Polygon'
    ])
    expect(out.collection.features[0].properties.name).toBe('Beijing')
    expect(out.collection.features[2].properties.rank).toBe(3)
  })

  it('属性列缺失时补齐，类型不一致降级为文本', async () => {
    const mixed: VectorFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { name: 'A', count: 1 }
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1, 1] },
          properties: { name: 'B', count: 'many' }
        }
      ]
    }
    const { bytes, warnings } = collectionToFgb(mixed)
    expect(warnings.some((w) => w.startsWith('fgb-attrs-stringified:'))).toBe(true)
    const out = await parseFgb(bytes)
    expect(out.collection.features.map((f) => String(f.properties.count))).toEqual(['1', 'many'])
  })

  it('空集合与损坏字节明确报错', async () => {
    expect(() =>
      collectionToFgb({ type: 'FeatureCollection', features: [] })
    ).toThrow('fgb-empty')
    await expect(parseFgb(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).rejects.toThrow(
      'invalid-fgb'
    )
  })
})

describe('GeoPackage', () => {
  it('点/线/面与属性可以往返，输出是 SQLite 数据库', async () => {
    const { bytes } = await collectionToGpkg(FC)
    const header = new TextDecoder().decode(bytes.slice(0, 15))
    expect(header).toBe('SQLite format 3')

    const out = await parseGpkg(bytes)
    expect(out.format).toBe('gpkg')
    expect(out.crsDeclared).toBe(true)
    expect(out.collection.features.map((f) => f.geometry?.type)).toEqual([
      'Point',
      'LineString',
      'Polygon'
    ])
    expect(out.collection.features.map((f) => f.properties.name)).toEqual([
      'Beijing',
      'Route',
      'Area'
    ])
    expect(out.collection.features[0].properties.rank).toBe(1)
    expect(out.collection.features[0].properties.ok).toBe(1)
  })

  it('混合类型属性列降级为文本，对象转 JSON', async () => {
    const mixed: VectorFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { v: 1, meta: { a: 1 } }
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1, 1] },
          properties: { v: 'two', meta: null }
        }
      ]
    }
    const { bytes } = await collectionToGpkg(mixed)
    const out = await parseGpkg(bytes)
    expect(out.collection.features[0].properties.v).toBe('1')
    expect(out.collection.features[1].properties.v).toBe('two')
    expect(JSON.parse(String(out.collection.features[0].properties.meta))).toEqual({ a: 1 })
  })

  it('空集合与非 GeoPackage 字节明确报错', async () => {
    await expect(
      collectionToGpkg({ type: 'FeatureCollection', features: [] })
    ).rejects.toThrow('gpkg-empty')
    await expect(parseGpkg(new Uint8Array(32))).rejects.toThrow('invalid-gpkg')
  })
})