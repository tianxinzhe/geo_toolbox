/**
 * T07 WKT ↔ GeoJSON 单测。
 *
 * 重点覆盖 PRD 6.1 T07 的四类硬要求：
 *   ① 括号不配对 / 未知类型 / 数值非法都要给出字符位置
 *   ② 多行输入逐行独立，失败行不影响其他行
 *   ③ 单条输出 Geometry，多条输出 FeatureCollection
 *   ④ 坐标顺序不交换（经度在前）
 */

import { describe, expect, it } from 'vitest'

import {
  convertWktText,
  detectDirection,
  geoJsonToWkt,
  geometryStats,
  geometryToWkt,
  parseGeoJsonText,
  parseWkt,
  wktToGeoJson,
  WktError
} from '../../src/lib/convert/wkt'

function wktError(fn: () => unknown): WktError {
  try {
    fn()
  } catch (e) {
    if (e instanceof WktError) return e
    throw e
  }
  throw new Error('expected a WktError')
}

describe('WKT 解析：基础几何', () => {
  it('POINT 小写类型与多余空白', () => {
    const p = parseWkt('  point ( 116.3974   39.9088 )  ')
    expect(p.geometry).toEqual({ type: 'Point', coordinates: [116.3974, 39.9088] })
    expect(p.dimension).toBe('XY')
    expect(p.vertices).toBe(1)
  })

  it('LINESTRING 保留顺序与全部顶点', () => {
    const p = parseWkt('LINESTRING (116.1 39.1, 116.2 39.2, 116.3 39.3)')
    expect(p.geometry.type).toBe('LineString')
    expect((p.geometry as { coordinates: number[][] }).coordinates).toHaveLength(3)
    expect(p.vertices).toBe(3)
  })

  it('POLYGON 已闭合时原样保留', () => {
    const p = parseWkt('POLYGON ((0 0, 1 0, 1 1, 0 0))')
    expect(p.vertices).toBe(4)
    expect(p.warnings).not.toContain('auto-closed-ring')
  })

  it('POLYGON 未闭合时自动补首点并给出警告', () => {
    const p = parseWkt('POLYGON ((0 0, 1 0, 1 1))')
    const ring = (p.geometry as { coordinates: number[][][] }).coordinates[0]
    expect(ring).toHaveLength(4)
    expect(ring[3]).toEqual([0, 0])
    expect(p.warnings).toContain('auto-closed-ring')
  })

  it('MULTIPOINT 两种写法都接受', () => {
    const a = parseWkt('MULTIPOINT ((1 2), (3 4))')
    const b = parseWkt('MULTIPOINT (1 2, 3 4)')
    expect(a.geometry).toEqual({ type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] })
    expect(b.geometry).toEqual(a.geometry)
  })

  it('MULTILINESTRING 与 MULTIPOLYGON 的嵌套层级', () => {
    const ml = parseWkt('MULTILINESTRING ((0 0, 1 1), (2 2, 3 3))')
    expect((ml.geometry as { coordinates: number[][][] }).coordinates).toHaveLength(2)

    const mp = parseWkt('MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((2 2, 3 2, 3 3, 2 2)))')
    expect((mp.geometry as { coordinates: number[][][][] }).coordinates).toHaveLength(2)
    expect(mp.vertices).toBe(8)
  })

  it('GEOMETRYCOLLECTION 递归解析子几何', () => {
    const p = parseWkt('GEOMETRYCOLLECTION (POINT (1 2), LINESTRING (0 0, 1 1))')
    expect(p.geometry.type).toBe('GeometryCollection')
    expect((p.geometry as { geometries: unknown[] }).geometries).toHaveLength(2)
    expect(p.vertices).toBe(3)
  })

  it('EMPTY 几何', () => {
    expect(parseWkt('POINT EMPTY').geometry).toEqual({ type: 'Point', coordinates: [] })
    expect(parseWkt('POLYGON EMPTY').geometry).toEqual({ type: 'Polygon', coordinates: [] })
    expect(parseWkt('GEOMETRYCOLLECTION EMPTY').geometry).toEqual({
      type: 'GeometryCollection',
      geometries: []
    })
  })
})

describe('WKT 解析：Z / M / ZM', () => {
  it('Z 维度保留第三分量', () => {
    const p = parseWkt('POINT Z (1 2 3)')
    expect(p.dimension).toBe('XYZ')
    expect(p.geometry).toEqual({ type: 'Point', coordinates: [1, 2, 3] })
  })

  it('M 维度丢弃并警告（GeoJSON 没有 M 位）', () => {
    const p = parseWkt('POINT M (1 2 30)')
    expect(p.dimension).toBe('XYM')
    expect(p.geometry).toEqual({ type: 'Point', coordinates: [1, 2] })
    expect(p.warnings).toContain('dropped-m')
  })

  it('ZM 保留 Z、丢弃 M', () => {
    const p = parseWkt('POINT ZM (1 2 3 4)')
    expect(p.dimension).toBe('XYZM')
    expect(p.geometry).toEqual({ type: 'Point', coordinates: [1, 2, 3] })
    expect(p.warnings).toContain('dropped-m')
  })

  it('声明维度与实际分量数不符时报错', () => {
    const e = wktError(() => parseWkt('POINT Z (1 2)'))
    expect(e.code).toBe('dimension-mismatch')
  })

  it('同一几何内维度必须一致', () => {
    const e = wktError(() => parseWkt('LINESTRING (0 0, 1 1 1)'))
    expect(e.code).toBe('dimension-mismatch')
  })
})

describe('WKT 解析：错误位置', () => {
  it('未知几何类型指出类型起始列', () => {
    const e = wktError(() => parseWkt('CIRCLE (1 2)'))
    expect(e.code).toBe('unknown-type')
    expect(e.index).toBe(0)
    expect(e.column).toBe(1)
  })

  it('括号不配对指出 EOF 位置', () => {
    const src = 'POINT (1 2'
    const e = wktError(() => parseWkt(src))
    expect(e.code).toBe('expected')
    expect(e.index).toBe(src.length)
    expect(e.column).toBe(src.length + 1)
  })

  it('非法数值指出具体列', () => {
    const e = wktError(() => parseWkt('POINT (1 x)'))
    expect(e.code).toBe('bad-number')
    expect(e.column).toBe(10)
  })

  it('经纬度超范围分别指出经度 / 纬度', () => {
    const lon = wktError(() => parseWkt('POINT (200 10)'))
    expect(lon.code).toBe('out-of-range')
    expect(lon.detail).toBe('longitude')
    expect(lon.column).toBe(8)

    const lat = wktError(() => parseWkt('POINT (120 100)'))
    expect(lat.detail).toBe('latitude')
  })

  it('LINESTRING 少于两个点、多边形少于三个点', () => {
    expect(wktError(() => parseWkt('LINESTRING (1 2)')).code).toBe('too-few-points')
    expect(wktError(() => parseWkt('POLYGON ((0 0, 1 1))')).code).toBe('too-few-points')
  })

  it('空输入报 unexpected-eof 而不是静默成功', () => {
    const e = wktError(() => parseWkt('   '))
    expect(e.code).toBe('unexpected-eof')
  })

  it('尾部多余字符被拒绝', () => {
    expect(wktError(() => parseWkt('POINT (1 2) extra')).code).toBe('unexpected-char')
  })
})

describe('多行输入', () => {
  const text = [
    'POINT (116.3974 39.9088)',
    '',
    'LINESTRING (0 0, 1 1)',
    'POINT (200 0)',
    'CIRCLE (1 2)'
  ].join('\n')

  it('逐行独立，空行跳过，失败行不影响成功行', () => {
    const results = convertWktText(text)
    expect(results).toHaveLength(4)
    expect(results[0]).toMatchObject({ ok: true, line: 1 })
    expect(results[1]).toMatchObject({ ok: true, line: 3 })
    expect(results[2]).toMatchObject({ ok: false, line: 4 })
    expect(results[3]).toMatchObject({ ok: false, line: 5 })
  })

  it('单条成功 → Geometry；多条 → FeatureCollection', () => {
    const single = wktToGeoJson('POINT (1 2)')
    expect(JSON.parse(single.json).type).toBe('Point')

    const many = wktToGeoJson('POINT (1 2)\nPOINT (3 4)')
    const parsed = JSON.parse(many.json)
    expect(parsed.type).toBe('FeatureCollection')
    expect(parsed.features).toHaveLength(2)
    expect(parsed.features[0]).toEqual({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [1, 2] }
    })
  })

  it('全部失败时 json 为空串', () => {
    const r = wktToGeoJson('POINT (200 0)\nCIRCLE (1 2)')
    expect(r.json).toBe('')
    expect(r.stats.total).toBe(0)
  })

  it('compact 输出不含换行', () => {
    const r = wktToGeoJson('POINT (1 2)\nPOINT (3 4)', true)
    expect(r.json).not.toContain('\n')
  })
})

describe('WKT 序列化', () => {
  it('点、线、面与集合的规范写法', () => {
    expect(geometryToWkt({ type: 'Point', coordinates: [116.3974, 39.9088] })).toBe(
      'POINT (116.3974 39.9088)'
    )
    expect(
      geometryToWkt({ type: 'LineString', coordinates: [[0, 0], [1.5, 2]] })
    ).toBe('LINESTRING (0 0, 1.5 2)')
    expect(
      geometryToWkt({
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]
      })
    ).toBe('POLYGON ((0 0, 1 0, 1 1, 0 0))')
    expect(
      geometryToWkt({
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [1, 2] },
          { type: 'LineString', coordinates: [[0, 0], [1, 1]] }
        ]
      })
    ).toBe('GEOMETRYCOLLECTION (POINT (1 2), LINESTRING (0 0, 1 1))')
  })

  it('compact 去掉类型后的空格', () => {
    expect(geometryToWkt({ type: 'Point', coordinates: [1, 2] }, false)).toBe('POINT(1 2)')
    expect(
      geometryToWkt({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }, false)
    ).toBe('LINESTRING(0 0,1 1)')
  })

  it('EMPTY 保留类型名', () => {
    expect(geometryToWkt({ type: 'Polygon', coordinates: [] })).toBe('POLYGON EMPTY')
    expect(geometryToWkt({ type: 'GeometryCollection', geometries: [] })).toBe(
      'GEOMETRYCOLLECTION EMPTY'
    )
  })

  it('Z 分量写回 WKT', () => {
    expect(geometryToWkt({ type: 'Point', coordinates: [1, 2, 3] })).toBe('POINT (1 2 3)')
  })
})

describe('GeoJSON 解析', () => {
  it('Geometry / Feature / FeatureCollection 三种入口', () => {
    const g = parseGeoJsonText('{"type":"Point","coordinates":[116.4,39.9]}')
    expect(g.items).toHaveLength(1)

    const f = parseGeoJsonText(
      '{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[1,2]}}'
    )
    expect(f.items[0].label).toBe('Feature')

    const fc = parseGeoJsonText(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 2] } },
          { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [3, 4] } }
        ]
      })
    )
    expect(fc.items).toHaveLength(2)
    expect(fc.stats.total).toBe(2)
  })

  it('GeometryCollection 作为单个几何保留', () => {
    const g = parseGeoJsonText(
      '{"type":"GeometryCollection","geometries":[{"type":"Point","coordinates":[1,2]}]}'
    )
    expect(g.items).toHaveLength(1)
    expect(g.items[0].geometry.type).toBe('GeometryCollection')
  })

  it('GeoJSON → WKT：FeatureCollection 输出多行', () => {
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 2] } },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }
        }
      ]
    })
    const r = geoJsonToWkt(text)
    expect(r.ok).toBe(true)
    expect(r.wkt.split('\n')).toEqual(['POINT (1 2)', 'LINESTRING (0 0, 1 1)'])
  })

  it('非法 JSON 带位置信息', () => {
    const r = geoJsonToWkt('{"type":')
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('invalid-json')
  })

  it('坐标超范围与未知类型被拒绝', () => {
    const r1 = geoJsonToWkt('{"type":"Point","coordinates":[200,0]}')
    expect(r1.ok).toBe(false)
    expect(r1.error?.code).toBe('invalid-geojson')
    expect(r1.error?.detail).toContain('longitude')

    const r2 = geoJsonToWkt('{"type":"Circle","coordinates":[1,2]}')
    expect(r2.ok).toBe(false)
    expect(r2.error?.detail).toContain('unsupported')
  })

  it('null geometry 被拒绝而不是崩溃', () => {
    const r = geoJsonToWkt('{"type":"Feature","properties":{},"geometry":null}')
    expect(r.ok).toBe(false)
    expect(r.error?.detail).toContain('null')
  })

  it('stats 统计类型与顶点数', () => {
    const stats = geometryStats([
      { type: 'Point', coordinates: [1, 2] },
      { type: 'LineString', coordinates: [[0, 0], [1, 1]] }
    ])
    expect(stats.total).toBe(2)
    expect(stats.vertices).toBe(3)
    expect(stats.types).toEqual({ Point: 1, LineString: 1 })
  })
})

describe('方向检测', () => {
  it('空文本、GeoJSON、WKT 三种结果', () => {
    expect(detectDirection('   ')).toBe('empty')
    expect(detectDirection('{"type":"Point"}')).toBe('geojson')
    expect(detectDirection('POINT (1 2)')).toBe('wkt')
    // 多行 WKT 的首字符不是 {，仍按 WKT 处理
    expect(detectDirection('POINT (1 2)\nPOINT (3 4)')).toBe('wkt')
  })
})