import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { parseShapefile, serializeCollection } from '../../src/lib/convert/format'
import type { SerializeOptions, VectorFeatureCollection } from '../../src/lib/convert/types'

const OPTS: SerializeOptions = {
  target: 'shapefile',
  indent: true,
  digits: 8,
  removeEmpty: false,
  gpxAttrs: 'name-desc',
  skipUnsupported: true
}

function fc(features: VectorFeatureCollection['features']): VectorFeatureCollection {
  return { type: 'FeatureCollection', features }
}

function ringArea(ring: number[][]): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return sum / 2
}

describe('Shapefile 导出（P1）', () => {
  it('输出 ZIP，并能被自身导入器读回几何与属性', async () => {
    const out = serializeCollection(
      fc([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [116.3974, 39.9088] },
          properties: { name: '天安门', population: 42 }
        }
      ]),
      OPTS
    )

    expect(out.extension).toBe('zip')
    expect(out.text).toBe('')
    expect(out.bytes).toBeInstanceOf(Uint8Array)

    const entries = Object.keys(unzipSync(out.bytes!))
    expect(entries).toEqual(
      expect.arrayContaining([
        'features.shp',
        'features.shx',
        'features.dbf',
        'features.prj',
        'features.cpg'
      ])
    )

    const parsed = await parseShapefile(out.bytes!)
    expect(parsed.collection.features).toHaveLength(1)
    const geometry = parsed.collection.features[0].geometry
    expect(geometry?.type).toBe('Point')
    if (geometry?.type === 'Point') {
      expect(geometry.coordinates[0]).toBeCloseTo(116.3974, 6)
      expect(geometry.coordinates[1]).toBeCloseTo(39.9088, 6)
    }
    expect(parsed.collection.features[0].properties.name).toBe('天安门')
    expect(parsed.collection.features[0].properties.population).toBe(42)
    // 导出的 ZIP 自带 .prj，所以读回时应声明坐标系
    expect(parsed.crsDeclared).toBe(true)
  })

  it('外环写顺时针、内环写逆时针', async () => {
    const outer = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0]
    ]
    const hole = [
      [0.5, 0.5],
      [1.5, 0.5],
      [1.5, 1.5],
      [0.5, 1.5],
      [0.5, 0.5]
    ]
    const out = serializeCollection(
      fc([
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [outer, hole] },
          properties: { id: 1 }
        }
      ]),
      OPTS
    )

    const parsed = await parseShapefile(out.bytes!)
    const geometry = parsed.collection.features[0].geometry
    expect(geometry?.type).toBe('Polygon')
    if (geometry?.type === 'Polygon') {
      expect(geometry.coordinates).toHaveLength(2)
      expect(ringArea(geometry.coordinates[0])).toBeLessThan(0)
      expect(ringArea(geometry.coordinates[1])).toBeGreaterThan(0)
    }
  })

  it('混合几何拆成多个图层并给出警告', () => {
    const out = serializeCollection(
      fc([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1, 2] },
          properties: { id: 1 }
        },
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [1, 2],
              [3, 4]
            ]
          },
          properties: { id: 2 }
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
                [0, 1],
                [0, 0]
              ]
            ]
          },
          properties: { id: 3 }
        }
      ]),
      OPTS
    )

    const entries = Object.keys(unzipSync(out.bytes!))
    expect(entries).toEqual(
      expect.arrayContaining(['points.shp', 'lines.shp', 'polygons.shp'])
    )
    expect(out.warnings).toContain('shapefile-multi-layer:3')
  })

  it('DBF 字段名超长或非 ASCII 时自动重命名并提示', () => {
    const out = serializeCollection(
      fc([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1, 2] },
          properties: { very_long_field_name: 'x', 中文名称: 'y' }
        }
      ]),
      OPTS
    )

    expect(out.warnings).toContain('shapefile-field-renamed')
    const dbf = unzipSync(out.bytes!)['features.dbf']
    const headerLen = new DataView(dbf.buffer).getUint16(8, true)
    const names: string[] = []
    for (let pos = 32; pos < headerLen - 1; pos += 32) {
      let name = ''
      for (let i = 0; i < 10; i++) {
        const code = dbf[pos + i]
        if (code === 0) break
        name += String.fromCharCode(code)
      }
      names.push(name)
    }
    expect(names).toHaveLength(2)
    names.forEach((name) => expect(name.length).toBeLessThanOrEqual(10))
    expect(new Set(names).size).toBe(2)
  })

  it('没有可导出的几何时明确报错', () => {
    expect(() => serializeCollection(fc([]), OPTS)).toThrow('shapefile-empty')
  })
})