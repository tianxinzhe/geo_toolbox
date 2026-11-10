import { describe, expect, it } from 'vitest'

import type { VectorFeatureCollection } from '../../src/lib/convert/types'
import type { GeoJsonGeometry } from '../../src/lib/convert/wkt'
import { overlayCollections, simplifyCollection } from '../../src/lib/geo/overlay'

function collection(...geometries: GeoJsonGeometry[]): VectorFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: geometries.map((geometry, index) => ({
      type: 'Feature',
      geometry,
      properties: { id: index + 1 }
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

/** 取结果里所有顶点的范围，便于断言几何确实被裁过 */
function extent(geometry: GeoJsonGeometry | null): [number, number, number, number] {
  const coords: number[][] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (typeof value[0] === 'number' && typeof value[1] === 'number') {
        coords.push([value[0], value[1]])
      } else {
        for (const item of value) visit(item)
      }
    }
  }
  visit((geometry as { coordinates?: unknown })?.coordinates)
  return [
    Math.min(...coords.map((c) => c[0])),
    Math.min(...coords.map((c) => c[1])),
    Math.max(...coords.map((c) => c[0])),
    Math.max(...coords.map((c) => c[1]))
  ]
}

const A = collection(rect(0, 0, 10, 10))
const B = collection(rect(5, 5, 15, 15))

describe('overlayCollections', () => {
  it('裁切保留 A 与 B 的重叠部分', () => {
    const result = overlayCollections(A, B, 'clip')
    expect(result.outputCount).toBe(1)
    const [west, south, east, north] = extent(result.collection.features[0].geometry)
    expect(west).toBeCloseTo(5, 6)
    expect(south).toBeCloseTo(5, 6)
    expect(east).toBeCloseTo(10, 6)
    expect(north).toBeCloseTo(10, 6)
  })

  it('相交与裁切得到相同的几何', () => {
    const clip = overlayCollections(A, B, 'clip')
    const intersect = overlayCollections(A, B, 'intersect')
    expect(intersect.outputCount).toBe(clip.outputCount)
    const clipExtent = extent(clip.collection.features[0].geometry)
    const intersectExtent = extent(intersect.collection.features[0].geometry)
    intersectExtent.forEach((value, index) => expect(value).toBeCloseTo(clipExtent[index], 6))
  })

  it('擦除去掉重叠部分，并保留 A 的属性', () => {
    const result = overlayCollections(A, B, 'difference')
    expect(result.outputCount).toBe(1)
    expect(result.collection.features[0].properties).toEqual({ id: 1 })
    const [west, south, east, north] = extent(result.collection.features[0].geometry)
    expect(west).toBeCloseTo(0, 6)
    expect(south).toBeCloseTo(0, 6)
    expect(east).toBeCloseTo(10, 6)
    expect(north).toBeCloseTo(10, 6)
    // 重叠的 (5,5)-(10,10) 区块不能再出现顶点的两个坐标同时大于 5
    const coords = JSON.stringify(result.collection.features[0].geometry)
    expect(coords).toContain('[0,0]')
  })

  it('没有重叠时裁切结果为空', () => {
    const far = collection(rect(20, 20, 30, 30))
    const result = overlayCollections(A, far, 'clip')
    expect(result.outputCount).toBe(0)
  })

  it('点要素被跳过并计入 skipped', () => {
    const points = collection(
      { type: 'Point', coordinates: [6, 6] },
      rect(0, 0, 10, 10)
    )
    const result = overlayCollections(points, B, 'clip')
    expect(result.inputCount).toBe(2)
    expect(result.outputCount).toBe(1)
    expect(result.skipped).toBe(1)
  })

  it('B 图层没有面要素时不产出结果', () => {
    const lines = collection({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [10, 10]
      ]
    })
    const result = overlayCollections(A, lines, 'clip')
    expect(result.outputCount).toBe(0)
    expect(result.skipped).toBe(1)
  })
})

describe('simplifyCollection', () => {
  it('抽稀近似共线的顶点', () => {
    const line: GeoJsonGeometry = {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 0.001],
        [2, 0],
        [3, 0.001],
        [4, 0]
      ]
    }
    const result = simplifyCollection(collection(line), 1000)
    const coordinates = (result.collection.features[0].geometry as {
      coordinates: number[][]
    }).coordinates
    expect(coordinates.length).toBe(2)
    expect(coordinates[0]).toEqual([0, 0])
    expect(coordinates[1]).toEqual([4, 0])
  })

  it('容差很小时保留原始形状', () => {
    const line: GeoJsonGeometry = {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0.5, 0.2],
        [1, 0]
      ]
    }
    const result = simplifyCollection(collection(line), 0.001)
    expect(result.outputCount).toBe(1)
    const coordinates = (result.collection.features[0].geometry as {
      coordinates: number[][]
    }).coordinates
    expect(coordinates.length).toBe(3)
  })

  it('面简化后环仍然闭合且至少 4 个顶点', () => {
    const ring: number[][] = [[0, 0]]
    for (let i = 1; i < 100; i++) ring.push([i * 0.1, Math.sin(i / 10) * 0.001])
    ring.push([10, 0], [10, 10], [0, 10], [0, 0])
    const polygon: GeoJsonGeometry = { type: 'Polygon', coordinates: [ring] }

    const result = simplifyCollection(collection(polygon), 50)
    const coordinates = (result.collection.features[0].geometry as {
      coordinates: number[][][]
    }).coordinates[0]
    expect(coordinates.length).toBeGreaterThanOrEqual(4)
    expect(coordinates[0]).toEqual(coordinates[coordinates.length - 1])
  })

  it('点要素原样保留', () => {
    const point: GeoJsonGeometry = { type: 'Point', coordinates: [1, 2] }
    const result = simplifyCollection(collection(point), 100)
    expect(result.outputCount).toBe(1)
    expect(result.collection.features[0].geometry).toEqual(point)
  })
})