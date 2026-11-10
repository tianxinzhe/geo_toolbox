/**
 * Google / XYZ 瓦片坐标测试（T14）。
 *
 * 参考值独立按公式计算后固化：
 *   x = floor((lng + 180) / 360 * 2^z)
 *   y = floor((1 - ln(tan(lat) + sec(lat)) / π) / 2 * 2^z)
 * 并额外验证边界夹取、跨 180° 经线与超限错误路径。
 */
import { describe, expect, it } from 'vitest'

import {
  MAX_MERCATOR_LAT,
  TileError,
  bboxOfPoints,
  clampLat,
  countTilesForBbox,
  latToTileY,
  lngToTileX,
  tileBounds,
  tileOf,
  tilesForBbox,
  tilesForGeometries,
  type BBox
} from '../../src/lib/geo/tiles'
import type { GeoJsonGeometry } from '../../src/lib/convert/wkt'

const WORLD: BBox = { west: -180, south: -90, east: 180, north: 90 }

describe('tileOf', () => {
  it('z=0 时全球只有 (0,0)', () => {
    expect(tileOf(0, 0, 0)).toEqual({ x: 0, y: 0, z: 0 })
    expect(tileOf(116.3974, 39.9088, 0)).toEqual({ x: 0, y: 0, z: 0 })
    expect(tileOf(-179.9, -85, 0)).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('lng=0, lat=0, z=1 → x=1, y=1', () => {
    expect(tileOf(0, 0, 1)).toEqual({ x: 1, y: 1, z: 1 })
  })

  it('北京 116.3974 / 39.9088 在 z=10 为 843 / 388', () => {
    expect(tileOf(116.3974, 39.9088, 10)).toEqual({ x: 843, y: 388, z: 10 })
  })

  it('经度 180° 落在最右列，−180° 落在最左列', () => {
    expect(lngToTileX(180, 1)).toBe(1)
    expect(lngToTileX(-180, 1)).toBe(0)
    expect(lngToTileX(190, 1)).toBe(0)
  })
})

describe('纬度边界', () => {
  it('±85.05112878° 分别贴到首行与末行', () => {
    expect(latToTileY(MAX_MERCATOR_LAT, 10)).toBe(0)
    expect(latToTileY(-MAX_MERCATOR_LAT, 10)).toBe(1023)
  })

  it('超出投影范围的纬度被夹取，而不是产生负数或越界行号', () => {
    expect(latToTileY(90, 4)).toBe(0)
    expect(latToTileY(-90, 4)).toBe(15)
    expect(clampLat(90)).toBe(MAX_MERCATOR_LAT)
  })
})

describe('tileBounds', () => {
  it('z=1 / x=0 / y=0 是西北象限', () => {
    const b = tileBounds(1, 0, 0)
    expect(b.west).toBe(-180)
    expect(b.east).toBe(0)
    expect(b.north).toBeCloseTo(MAX_MERCATOR_LAT, 6)
    expect(b.south).toBeCloseTo(0, 10)
  })

  it('z=1 / x=1 / y=1 是东南象限', () => {
    const b = tileBounds(1, 1, 1)
    expect(b.west).toBe(0)
    expect(b.east).toBe(180)
    expect(b.north).toBeCloseTo(0, 10)
    expect(b.south).toBeCloseTo(-MAX_MERCATOR_LAT, 6)
  })

  it('越界瓦片抛 tile-range', () => {
    expect(() => tileBounds(1, 2, 0)).toThrowError(TileError)
  })
})

describe('tilesForBbox', () => {
  it('世界范围在 z=0 只有一张瓦片', () => {
    expect(tilesForBbox(WORLD, 0, 0)).toEqual([{ x: 0, y: 0, z: 0 }])
  })

  it('逐层数量正确且按 z/y/x 排序稳定', () => {
    const bbox: BBox = { west: -1, south: -1, east: 1, north: 1 }
    const tiles = tilesForBbox(bbox, 0, 2)

    expect(tiles.map((t) => `${t.z}/${t.y}/${t.x}`)).toEqual([
      '0/0/0',
      '1/0/0',
      '1/0/1',
      '1/1/0',
      '1/1/1',
      '2/1/1',
      '2/1/2',
      '2/2/1',
      '2/2/2'
    ])
    expect(tiles).toHaveLength(9)
    expect(countTilesForBbox(bbox, 0, 2)).toBe(9)
  })

  it('跨 180° 经线时按最小包围范围取瓦片', () => {
    const bbox: BBox = { west: 170, south: -1, east: -170, north: 1 }
    const tiles = tilesForBbox(bbox, 2, 2)
    expect(tiles.map((t) => `${t.y}/${t.x}`)).toEqual(['1/0', '1/3', '2/0', '2/3'])
    expect(countTilesForBbox(bbox, 2, 2)).toBe(4)
  })

  it('跨线 bbox 的 z=0 不产生重复瓦片', () => {
    const bbox: BBox = { west: 179, south: -1, east: 178, north: 1 }
    expect(tilesForBbox(bbox, 0, 0)).toEqual([{ x: 0, y: 0, z: 0 }])
  })
})

describe('错误路径', () => {
  it('min > max 抛 zoom-order', () => {
    try {
      tilesForBbox(WORLD, 10, 9)
      expect.unreachable('应当抛错')
    } catch (error) {
      expect(error).toBeInstanceOf(TileError)
      expect((error as TileError).code).toBe('zoom-order')
    }
  })

  it('缩放级别越界抛 zoom-range', () => {
    expect(() => tilesForBbox(WORLD, -1, 2)).toThrowError(TileError)
    expect(() => tilesForBbox(WORLD, 0, 23)).toThrowError(TileError)
  })

  it('世界范围的数量统计不会因数值大而被拒绝', () => {
    expect(countTilesForBbox(WORLD, 0, 22)).toBeGreaterThan(1_000_000_000)
  })

  it('bbox 经纬度越界与南北颠倒会被拒绝', () => {
    expect(() =>
      tilesForBbox({ west: -181, south: -1, east: 1, north: 1 }, 0, 1)
    ).toThrowError(TileError)
    expect(() =>
      tilesForBbox({ west: -1, south: 2, east: 1, north: 1 }, 0, 1)
    ).toThrowError(TileError)
  })
})

describe('bboxOfPoints', () => {
  it('普通点集取最小包围盒', () => {
    expect(bboxOfPoints([[116.3, 39.8], [116.5, 40.0]])).toEqual({
      west: 116.3,
      south: 39.8,
      east: 116.5,
      north: 40
    })
  })

  it('经度跨度超过 180° 时取更短的一侧并标记跨线', () => {
    expect(bboxOfPoints([[170, 10], [-170, 20]])).toEqual({
      west: 170,
      south: 10,
      east: -170,
      north: 20
    })
    expect(bboxOfPoints([[170, 10], [-170, 20]])!.west).toBeGreaterThan(
      bboxOfPoints([[170, 10], [-170, 20]])!.east
    )
  })

  it('空点集返回 null', () => {
    expect(bboxOfPoints([])).toBeNull()
  })
})

describe('tilesForGeometries', () => {
  it('单点只返回该点所在的瓦片', () => {
    const point: GeoJsonGeometry = { type: 'Point', coordinates: [116.3974, 39.9088] }
    expect(tilesForGeometries([point], 10, 10)).toEqual([{ x: 843, y: 388, z: 10 }])
  })

  it('同一瓦片内的多个点会去重', () => {
    const points: GeoJsonGeometry = {
      type: 'MultiPoint',
      coordinates: [
        [116.3974, 39.9088],
        [116.3975, 39.9089]
      ]
    }
    expect(tilesForGeometries([points], 10, 10)).toHaveLength(1)
  })

  it('完全落在单张瓦片内的多边形只返回 1 张瓦片', () => {
    const b = tileBounds(10, 843, 388)
    const cx = (b.west + b.east) / 2
    const cy = (b.south + b.north) / 2
    const dx = (b.east - b.west) * 0.1
    const dy = (b.north - b.south) * 0.1
    const polygon: GeoJsonGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [cx - dx, cy - dy],
          [cx + dx, cy - dy],
          [cx + dx, cy + dy],
          [cx - dx, cy + dy],
          [cx - dx, cy - dy]
        ]
      ]
    }
    expect(tilesForGeometries([polygon], 10, 10)).toEqual([{ x: 843, y: 388, z: 10 }])
  })

  it('线数据剔除包围盒内不相交的瓦片', () => {
    const line: GeoJsonGeometry = {
      type: 'LineString',
      coordinates: [
        [116.0, 39.0],
        [117.0, 40.0]
      ]
    }
    const bbox = bboxOfPoints([
      [116.0, 39.0],
      [117.0, 40.0]
    ])!
    const bboxCount = countTilesForBbox(bbox, 10, 10)
    const tiles = tilesForGeometries([line], 10, 10)

    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles.length).toBeLessThan(bboxCount)
    for (let i = 1; i < tiles.length; i++) {
      const prev = tiles[i - 1]
      const cur = tiles[i]
      const ordered =
        cur.z > prev.z ||
        (cur.z === prev.z && (cur.y > prev.y || (cur.y === prev.y && cur.x > prev.x)))
      expect(ordered).toBe(true)
    }
  })

  it('多点跨层级时按 z 升序输出', () => {
    const points: GeoJsonGeometry = {
      type: 'MultiPoint',
      coordinates: [
        [116.3974, 39.9088],
        [121.4737, 31.2304]
      ]
    }
    const tiles = tilesForGeometries([points], 9, 10)
    expect(tiles.map((t) => t.z)).toEqual([9, 9, 10, 10])
  })

  it('空几何返回空数组', () => {
    expect(tilesForGeometries([], 12, 14)).toEqual([])
    expect(
      tilesForGeometries([{ type: 'GeometryCollection', geometries: [] }], 12, 14)
    ).toEqual([])
  })
})