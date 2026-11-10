/**
 * T06 矢量格式转换单测。
 *
 * KML / GPX 的解析依赖浏览器 DOMParser；Node 环境下用 xmldom 注入全局
 * DOMParser 后测试，等价覆盖浏览器路径。
 */

import { describe, expect, it, beforeAll } from 'vitest'
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom'

import { collectionToCsv, detectCsvColumns, parseCsv } from '../../src/lib/convert/csv'
import {
  cleanProperties,
  detectFormat,
  parseGeoJson,
  parseGpx,
  parseInput,
  parseKml,
  parseTopoJson,
  parseWktInput,
  roundCollection,
  serializeCollection,
  summarize,
  validateCollection
} from '../../src/lib/convert/format'
import { CsvColumnsError, UnsupportedGeometryError } from '../../src/lib/convert/types'

const FC = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { name: 'A', value: 1 },
      geometry: { type: 'Point' as const, coordinates: [116.3974, 39.9088] }
    },
    {
      type: 'Feature' as const,
      properties: { name: 'B' },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [0, 0],
          [1, 1]
        ]
      }
    }
  ]
}

const BASE_OPTS = {
  indent: true,
  digits: 7,
  removeEmpty: false,
  gpxAttrs: 'name-desc' as const,
  skipUnsupported: false
}

// KML / GPX 解析依赖 DOMParser；Node 环境下用 xmldom 补齐
beforeAll(() => {
  ;(globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDOMParser
})

describe('格式识别', () => {
  it('按内容识别 JSON 系', () => {
    expect(detectFormat('{"type":"FeatureCollection","features":[]}')).toBe('geojson')
    expect(detectFormat('{"type":"Topology","objects":{}}')).toBe('topojson')
  })

  it('按内容识别 XML / WKT / 表格', () => {
    expect(detectFormat('<kml xmlns="x"></kml>')).toBe('kml')
    expect(detectFormat('<gpx version="1.1"></gpx>')).toBe('gpx')
    expect(detectFormat('POLYGON ((0 0, 1 0, 1 1, 0 0))')).toBe('wkt')
    expect(detectFormat('lat,lng\n1,2')).toBe('csv')
    expect(detectFormat('lat\tlng\n1\t2')).toBe('tsv')
  })

  it('内容无法判断时回退扩展名', () => {
    expect(detectFormat('', 'data.kml')).toBe('kml')
    expect(detectFormat('', 'data.kmz')).toBe('kmz')
    expect(detectFormat('', 'data.gpx')).toBe('gpx')
    expect(detectFormat('', 'data.csv')).toBe('csv')
  })

  it('无法识别返回空串', () => {
    expect(detectFormat('hello world')).toBe('')
  })

  it('显式源格式优先于自动识别，不做静默回退', () => {
    const wkt = 'POINT (116 39)'
    expect(detectFormat(wkt)).toBe('wkt')
    // 指定为 CSV 后按 CSV 解析，缺少经纬度列时应报错而不是回退到 WKT
    expect(() => parseInput(wkt, { source: 'csv' })).toThrow()
    expect(parseInput(wkt, { source: 'wkt' }).format).toBe('wkt')
  })
})

describe('GeoJSON 解析', () => {
  it('FeatureCollection / Feature / Geometry 三种入口', () => {
    expect(parseGeoJson(JSON.stringify(FC)).collection.features).toHaveLength(2)

    const f = parseGeoJson(
      '{"type":"Feature","properties":{"a":1},"geometry":{"type":"Point","coordinates":[1,2]}}'
    )
    expect(f.collection.features[0].properties).toEqual({ a: 1 })

    const g = parseGeoJson('{"type":"Point","coordinates":[1,2]}')
    expect(g.collection.features[0].geometry).toEqual({ type: 'Point', coordinates: [1, 2] })
  })

  it('null 几何被保留为 null，交给校验清单报告', () => {
    const r = parseGeoJson(
      '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":null}]}'
    )
    expect(r.collection.features[0].geometry).toBeNull()
    expect(validateCollection(r.collection)[0].code).toBe('empty-geometry')
  })

  it('非法 JSON 抛错', () => {
    expect(() => parseGeoJson('{')).toThrow('invalid-json')
  })

  it('TopoJSON 入口', () => {
    const topo = {
      type: 'Topology',
      objects: {
        points: {
          type: 'GeometryCollection',
          geometries: [{ type: 'Point', coordinates: [1, 2] }]
        }
      }
    }
    const r = parseTopoJson(JSON.stringify(topo))
    expect(r.format).toBe('topojson')
    expect(r.collection.features).toHaveLength(1)
    expect(r.collection.features[0].geometry).toEqual({ type: 'Point', coordinates: [1, 2] })
  })
})

describe('CSV 解析', () => {
  it('识别常见经纬度列名', () => {
    expect(detectCsvColumns(['name', 'lat', 'lng'])).toMatchObject({
      latColumn: 'lat',
      lngColumn: 'lng'
    })
    expect(detectCsvColumns(['纬度', '经度'])).toMatchObject({
      latColumn: '纬度',
      lngColumn: '经度'
    })
    expect(detectCsvColumns(['latitude', 'longitude', 'x'])).toMatchObject({
      latColumn: 'latitude',
      lngColumn: 'longitude'
    })
    expect(detectCsvColumns(['y', 'x'])).toMatchObject({ latColumn: 'y', lngColumn: 'x' })
  })

  it('缺列时抛 CsvColumnsError 并携带表头', () => {
    try {
      parseCsv('name,value\nA,1')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(CsvColumnsError)
      expect((e as CsvColumnsError).headers).toEqual(['name', 'value'])
    }
  })

  it('逐行构建点要素，跳过坏行并保留其他属性', () => {
    const r = parseCsv('name,lat,lng\nA,39.9,116.4\nB,,\nC,35.6,139.7')
    expect(r.collection.features).toHaveLength(2)
    expect(r.collection.features[0].properties).toEqual({ name: 'A' })
    expect(r.collection.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [116.4, 39.9]
    })
    expect(r.issues).toEqual([{ feature: 1, code: 'csv-row-skipped', detail: 'lat/lng' }])
  })

  it('手动指定列时忽略自动识别', () => {
    const r = parseCsv('a,b,c\n1,2,3', { latColumn: 'b', lngColumn: 'c' })
    expect(r.collection.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [3, 2]
    })
  })
})

describe('CSV 输出', () => {
  it('纯点输出 lng,lat + 属性列', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { name: 'A' },
          geometry: { type: 'Point' as const, coordinates: [116.3974, 39.9088] }
        }
      ]
    }
    const csv = collectionToCsv(fc, 7)
    expect(csv.split(/\r?\n/)[0]).toBe('lng,lat,name')
    expect(csv).toContain('116.3974,39.9088,A')
  })

  it('含线/面时输出 WKT 列', () => {
    const csv = collectionToCsv(FC, 7)
    expect(csv.split(/\r?\n/)[0]).toBe('wkt,name,value')
    expect(csv).toContain('LINESTRING (0 0, 1 1)')
  })
})

describe('校验与取整', () => {
  it('未闭合环、超范围、空几何都会被列出', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1]
              ]
            ]
          }
        },
        {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: [200, 0] }
        }
      ]
    }
    const issues = validateCollection(fc)
    expect(issues.map((i) => i.code)).toContain('unclosed-ring')
    expect(issues.map((i) => i.code)).toContain('out-of-range')
  })

  it('坐标取整不改变结构', () => {
    const r = roundCollection(FC, 2)
    expect((r.features[0].geometry as { coordinates: number[] }).coordinates).toEqual([
      116.4, 39.91
    ])
  })

  it('清空属性只移除空值', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { a: '', b: 0, c: null, d: 'x' },
          geometry: { type: 'Point' as const, coordinates: [1, 2] }
        }
      ]
    }
    expect(cleanProperties(fc).features[0].properties).toEqual({ b: 0, d: 'x' })
  })

  it('摘要统计类型、顶点与属性', () => {
    const s = summarize(FC)
    expect(s.count).toBe(2)
    expect(s.vertices).toBe(3)
    expect(s.types).toEqual({ Point: 1, LineString: 1 })
    expect(s.properties).toEqual(['name', 'value'])
  })
})

describe('序列化', () => {
  it('GeoJSON 缩进 / 压缩', () => {
    const pretty = serializeCollection(FC, { ...BASE_OPTS, target: 'geojson' })
    expect(pretty.text).toContain('\n  ')
    const compact = serializeCollection(FC, { ...BASE_OPTS, target: 'geojson', indent: false })
    expect(compact.text).not.toContain('\n')
  })

  it('KML 输出包含 kml 根节点与名称', () => {
    const r = serializeCollection(FC, { ...BASE_OPTS, target: 'kml' })
    expect(r.text).toContain('<kml')
    expect(r.text).toContain('A')
  })

  it('WKT 每条要素一行', () => {
    const r = serializeCollection(FC, { ...BASE_OPTS, target: 'wkt' })
    expect(r.text.split('\n')).toEqual(['POINT (116.3974 39.9088)', 'LINESTRING (0 0, 1 1)'])
  })

  it('TopoJSON 输出可再次解析', () => {
    const r = serializeCollection(FC, { ...BASE_OPTS, target: 'topojson' })
    const back = parseTopoJson(r.text)
    expect(back.collection.features).toHaveLength(2)
  })

  it('GPX 支持点与线', () => {
    const r = serializeCollection(FC, { ...BASE_OPTS, target: 'gpx' })
    expect(r.text).toContain('<wpt lat="39.9088" lon="116.3974">')
    expect(r.text).toContain('<trk>')
    expect(r.unsupported.count).toBe(0)
  })

  it('GPX 遇到面要素默认抛错，明确跳过后才成功', () => {
    const polygon = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { name: 'area' },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0]
              ]
            ]
          }
        }
      ]
    }
    expect(() => serializeCollection(polygon, { ...BASE_OPTS, target: 'gpx' })).toThrow(
      UnsupportedGeometryError
    )
    const r = serializeCollection(polygon, {
      ...BASE_OPTS,
      target: 'gpx',
      skipUnsupported: true
    })
    expect(r.unsupported.count).toBe(1)
    expect(r.unsupported.types).toContain('Polygon')
    expect(r.text).not.toContain('<trk>')
  })

  it('GPX 属性降级：仅保留 name', () => {
    const r = serializeCollection(FC, {
      ...BASE_OPTS,
      target: 'gpx',
      gpxAttrs: 'name'
    })
    expect(r.text).toContain('<name>A</name>')
    expect(r.text).not.toContain('<desc>')
  })

  it('同格式提交等同格式化与校验', () => {
    const r = serializeCollection(FC, { ...BASE_OPTS, target: 'geojson', indent: false })
    const back = parseGeoJson(r.text)
    expect(back.collection.features).toHaveLength(2)
  })
})

describe('KML / GPX 解析', () => {
  const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>A</name>
      <Point><coordinates>116.3974,39.9088,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`

  const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="39.9088" lon="116.3974"><name>P</name></wpt>
  <trk><name>T</name><trkseg>
    <trkpt lat="0" lon="0"/><trkpt lat="1" lon="1"/>
  </trkseg></trk>
</gpx>`

  it('KML → 要素集合', () => {
    const r = parseKml(KML)
    expect(r.format).toBe('kml')
    expect(r.collection.features).toHaveLength(1)
    expect(r.collection.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [116.3974, 39.9088, 0]
    })
    expect(r.collection.features[0].properties.name).toBe('A')

    const out = serializeCollection(r.collection, { ...BASE_OPTS, target: 'geojson' })
    expect(JSON.parse(out.text).features[0].geometry.type).toBe('Point')
  })

  it('GPX → 要素集合，并可再次输出 GPX', () => {
    const r = parseGpx(GPX)
    expect(r.format).toBe('gpx')
    expect(r.collection.features).toHaveLength(2)
    const types = r.collection.features.map((f) => f.geometry?.type)
    expect(types).toContain('Point')
    expect(types).toContain('LineString')

    const out = serializeCollection(r.collection, { ...BASE_OPTS, target: 'gpx' })
    expect(out.text).toContain('<wpt lat="39.9088" lon="116.3974">')
    expect(out.text).toContain('<trk>')

    const back = parseGpx(out.text)
    expect(back.collection.features.length).toBeGreaterThanOrEqual(2)
  })

  it('损坏的 XML 被拒绝', () => {
    expect(() => parseKml('<kml><Point></kml>')).toThrow('invalid-xml')
  })
})

describe('WKT 输入', () => {
  it('多行 WKT 逐行成为要素，失败行进 issues', () => {
    const r = parseWktInput('POINT (1 2)\nCIRCLE (1 2)')
    expect(r.collection.features).toHaveLength(1)
    expect(r.issues[0]).toMatchObject({ feature: 1, code: 'invalid-geometry' })
  })
})