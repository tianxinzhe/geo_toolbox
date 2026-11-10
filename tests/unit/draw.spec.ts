/**
 * T09 绘制器状态层测试（纯函数，不依赖 Leaflet）。
 */

import { describe, expect, it } from 'vitest'

import {
  DrawHistory,
  adoptFeatures,
  circlePolygon,
  exportFeatures,
  measureFeature,
  parseStored,
  rectanglePolygon,
  serializeForStorage,
  statsOf,
  type DrawFeature
} from '../../src/lib/draw/state'

const point: DrawFeature = {
  type: 'Feature',
  id: 'p1',
  geometry: { type: 'Point', coordinates: [116.3974, 39.9088] },
  properties: { name: 'A' }
}

const line: DrawFeature = {
  type: 'Feature',
  id: 'l1',
  geometry: {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [0.01, 0]
    ]
  },
  properties: {}
}

describe('矩形与圆', () => {
  it('矩形闭合且为五个点', () => {
    const g = rectanglePolygon([116.3, 39.9], [116.5, 40.0])
    expect(g.type).toBe('Polygon')
    const ring = (g as { coordinates: number[][][] }).coordinates[0]
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
  })

  it('圆半径由两点距离决定，边界点闭合', () => {
    const built = circlePolygon([116.3974, 39.9088], [116.4074, 39.9088], 32)
    expect(built.radiusM).toBeGreaterThan(800)
    expect(built.radiusM).toBeLessThan(900)
    const ring = (built.geometry as { coordinates: number[][][] }).coordinates[0]
    expect(ring).toHaveLength(33)
    expect(ring[0]).toEqual(ring[32])
  })
})

describe('量测与统计', () => {
  it('点、线、面的量测类型', () => {
    expect(measureFeature(point).kind).toBe('point')
    expect(measureFeature(line).kind).toBe('line')
    expect(measureFeature(line).lengthM).toBeGreaterThan(800)
  })

  it('统计汇总数量、长度与面积', () => {
    const poly: DrawFeature = {
      type: 'Feature',
      id: 'a1',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0.01, 0],
            [0.01, 0.01],
            [0, 0.01],
            [0, 0]
          ]
        ]
      },
      properties: {}
    }
    const s = statsOf([point, line, poly])
    expect(s.count).toBe(3)
    expect(s.counts).toEqual({ Point: 1, LineString: 1, Polygon: 1 })
    expect(s.totalLengthM).toBeGreaterThan(800)
    expect(s.totalAreaM2).toBeGreaterThan(1_000_000)
  })
})

describe('撤销 / 重做', () => {
  it('提交、撤销、重做与分支覆盖', () => {
    const h = new DrawHistory({ features: [] })
    expect(h.canUndo).toBe(false)

    h.commit({ features: [point] })
    expect(h.current.features).toHaveLength(1)
    expect(h.canUndo).toBe(true)

    h.undo()
    expect(h.current.features).toHaveLength(0)
    expect(h.canRedo).toBe(true)

    h.redo()
    expect(h.current.features).toHaveLength(1)

    // 撤销后再提交，重做分支被丢弃
    h.undo()
    h.commit({ features: [line] })
    expect(h.canRedo).toBe(false)
    expect(h.current.features[0].id).toBe('l1')
  })

  it('历史深度上限为 50 步', () => {
    const h = new DrawHistory({ features: [] })
    for (let i = 0; i < 80; i++) {
      h.commit({ features: [{ ...point, id: `p${i}` }] })
    }
    let steps = 0
    while (h.canUndo) {
      h.undo()
      steps++
    }
    expect(steps).toBe(50)
  })
})

describe('导入与导出', () => {
  it('导入要素自动分配 id', () => {
    const adopted = adoptFeatures([
      { type: 'Feature', geometry: point.geometry, properties: { name: 'X' } }
    ])
    expect(adopted[0].id).not.toBe('')
    expect(adopted[0].properties.name).toBe('X')
  })

  it('GeoJSON 导出保留原始 WGS84 坐标', () => {
    const r = exportFeatures([point], 'geojson')
    const a = JSON.parse(r.text).features[0].geometry.coordinates
    expect(a[0]).toBeCloseTo(116.3974, 8)
    expect(a[1]).toBeCloseTo(39.9088, 8)
  })

  it('GPX 导出的面要素被跳过并计数', () => {
    const poly: DrawFeature = {
      type: 'Feature',
      id: 'a1',
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
      properties: {}
    }
    const r = exportFeatures([poly], 'gpx')
    expect(r.unsupported.count).toBe(1)
    expect(r.text).not.toContain('<trk>')
  })
})

describe('本地保存', () => {
  it('序列化与解析往返', () => {
    const raw = serializeForStorage([point])
    const back = parseStored(raw)
    expect(back?.features).toHaveLength(1)
    expect(back?.features[0].properties.name).toBe('A')
  })

  it('损坏或版本不符的数据被拒绝', () => {
    expect(parseStored('{')).toBeNull()
    expect(parseStored('{"version":2,"features":[]}')).toBeNull()
  })
})