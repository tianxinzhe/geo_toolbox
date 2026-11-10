import { DOMParser as XmlDOMParser } from '@xmldom/xmldom'
import { beforeAll, describe, expect, it } from 'vitest'

import { collectionToDxf, parseDxf } from '../../src/lib/convert/dxf'
import { collectionToGml, parseGml } from '../../src/lib/convert/gml'
import { collectionToGmt, parseGmt } from '../../src/lib/convert/gmt'
import { collectionToMif, parseMifZip } from '../../src/lib/convert/mif'
import { collectionToXlsx, parseXlsxInput } from '../../src/lib/convert/xlsx'
import { parseKmz, serializeCollection } from '../../src/lib/convert/format'
import type { SerializeOptions, VectorFeatureCollection } from '../../src/lib/convert/types'

beforeAll(() => {
  ;(globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDOMParser
})

const FC: VectorFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [116.3974, 39.9088] },
      properties: { name: 'Beijing', code: 'BJ' }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [116.3, 39.8],
            [116.5, 39.8],
            [116.5, 40.0],
            [116.3, 40.0],
            [116.3, 39.8]
          ]
        ]
      },
      properties: { name: 'Area' }
    }
  ]
}

const OPTS: SerializeOptions = {
  target: 'geojson',
  indent: true,
  digits: 7,
  removeEmpty: false,
  gpxAttrs: 'name-desc',
  skipUnsupported: false
}

describe('GMT 读写', () => {
  it('点与闭合多边形可以往返', () => {
    const { text } = collectionToGmt(FC, OPTS)
    const out = parseGmt(text)
    expect(out.format).toBe('gmt')
    expect(out.collection.features.map((f) => f.geometry?.type)).toEqual(['Point', 'Polygon'])
    expect(out.collection.features[0].properties.name).toBe('Beijing')
  })

  it('未闭合段按 LineString 处理', () => {
    const out = parseGmt('> track\n116 39\n116.1 39.1\n')
    expect(out.collection.features[0].geometry?.type).toBe('LineString')
  })
})

describe('DXF 读写', () => {
  it('点与闭合多段线可以往返，属性丢弃有警告', () => {
    const { text, warnings } = collectionToDxf(FC)
    expect(warnings[0]).toMatch(/dxf-attrs-dropped/)
    const out = parseDxf(text)
    expect(out.format).toBe('dxf')
    expect(out.collection.features.map((f) => f.geometry?.type)).toEqual(['Point', 'Polygon'])
    expect(out.warnings).toContain('dxf-crs-unknown')
  })

  it('非 DXF 文本明确报错', () => {
    expect(() => parseDxf('hello')).toThrow('invalid-dxf')
  })
})

describe('GML 读写', () => {
  it('点与多边形可以往返，属性保留', () => {
    const text = collectionToGml(FC)
    const out = parseGml(text)
    expect(out.format).toBe('gml')
    expect(out.collection.features).toHaveLength(2)
    expect(out.collection.features[0].geometry?.type).toBe('Point')
    expect(out.collection.features[0].properties.name).toBe('Beijing')
    expect(out.collection.features[1].geometry?.type).toBe('Polygon')
  })

  it('非 4326 的 srsName 给出警告', () => {
    const out = parseGml(`<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2">
      <gml:featureMember><f><gml:Point srsName="EPSG:3857"><gml:pos>1 2</gml:pos></gml:Point></f></gml:featureMember>
    </gml:FeatureCollection>`)
    expect(out.warnings).toContain('gml-crs:EPSG:3857')
  })

  it('损坏 XML 明确报错', () => {
    expect(() => parseGml('<gml:FeatureCollection>')).toThrow('invalid-gml')
  })
})

describe('MIF/MID 读写', () => {
  it('输出 ZIP 后可以读回几何与属性', () => {
    const { bytes } = collectionToMif(FC)
    const out = parseMifZip(bytes)
    expect(out.format).toBe('mif')
    expect(out.collection.features.map((f) => f.geometry?.type)).toEqual(['Point', 'Polygon'])
    expect(out.collection.features[0].properties.name).toBe('Beijing')
    expect(out.collection.features[1].properties.name).toBe('Area')
  })
})

describe('KMZ 输出', () => {
  it('输出 ZIP 内包含 doc.kml 并可读回', () => {
    const out = serializeCollection(FC, { ...OPTS, target: 'kmz' })
    expect(out.bytes).toBeTruthy()
    const parsed = parseKmz(out.bytes as Uint8Array)
    expect(parsed.collection.features.length).toBeGreaterThan(0)
  })
})

describe('XLSX 读写', () => {
  it('导出后可以按经纬度列读回', async () => {
    const points: VectorFeatureCollection = {
      type: 'FeatureCollection',
      features: [FC.features[0]]
    }
    const bytes = collectionToXlsx(points, 7)
    const out = await parseXlsxInput(bytes)
    expect(out.collection.features).toHaveLength(1)
    expect(out.columns.latColumn).toBe('lat')
    expect(out.columns.lngColumn).toBe('lng')
    expect(out.collection.features[0].properties.name).toBe('Beijing')
  })
})