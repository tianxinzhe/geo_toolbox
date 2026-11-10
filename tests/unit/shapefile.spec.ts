import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { parseShapefile } from '../../src/lib/convert/format'
import { shapefileLayers } from '../../src/lib/convert/shapefile'

/** 构造只含一个点的最小 .shp（SHP 头 100B + 记录头 8B + 点 20B） */
function pointShp(lng: number, lat: number): Uint8Array {
  const view = new DataView(new ArrayBuffer(128))
  view.setInt32(0, 9994, false)
  view.setInt32(24, 64, false) // 文件长度，单位 16-bit word
  view.setInt32(28, 1000, true)
  view.setInt32(32, 1, true) // Point
  view.setFloat64(36, lng, true)
  view.setFloat64(44, lat, true)
  view.setFloat64(52, lng, true)
  view.setFloat64(60, lat, true)
  view.setInt32(100, 1, false) // 记录号
  view.setInt32(104, 10, false) // 记录内容长度
  view.setInt32(108, 1, true)
  view.setFloat64(112, lng, true)
  view.setFloat64(120, lat, true)
  return new Uint8Array(view.buffer)
}

const WGS84_WKT =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],' +
  'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'

describe('Shapefile ZIP 导入（P1）', () => {
  it('读取首个 .shp 并给出未声明坐标系的警告', async () => {
    const zip = zipSync({ 'sample/point.shp': pointShp(116.3974, 39.9088) })
    const outcome = await parseShapefile(zip)

    expect(outcome.format).toBe('shapefile')
    expect(outcome.collection.features).toHaveLength(1)
    const geometry = outcome.collection.features[0].geometry
    expect(geometry?.type).toBe('Point')
    if (geometry?.type === 'Point') {
      expect(geometry.coordinates[0]).toBeCloseTo(116.3974, 6)
      expect(geometry.coordinates[1]).toBeCloseTo(39.9088, 6)
    }
    expect(outcome.crsDeclared).toBe(false)
    expect(outcome.warnings).toContain('shapefile-no-prj')
  })

  it('存在 .prj 时标记为已声明坐标系', async () => {
    const zip = zipSync({
      'point.shp': pointShp(116.3974, 39.9088),
      'point.prj': new TextEncoder().encode(WGS84_WKT)
    })
    const outcome = await parseShapefile(zip)

    expect(outcome.crsDeclared).toBe(true)
    expect(outcome.warnings).toContain('shapefile-prj')
  })

  it('多图层只取第一个并给出提示', async () => {
    const zip = zipSync({
      'a.shp': pointShp(1, 2),
      'b.shp': pointShp(3, 4)
    })
    const outcome = await parseShapefile(zip)

    expect(shapefileLayers(zip)).toEqual(['a.shp', 'b.shp'])
    expect(outcome.collection.features).toHaveLength(1)
    expect(outcome.warnings).toContain('shapefile-multi-layer:2')
  })

  it('ZIP 内没有 .shp 时明确报错', async () => {
    const zip = zipSync({ 'readme.txt': new TextEncoder().encode('no shapefile') })
    await expect(parseShapefile(zip)).rejects.toThrow('shapefile-no-shp')
  })

  it('损坏的 ZIP 被拒绝', async () => {
    await expect(parseShapefile(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(
      'invalid-shapefile-zip'
    )
  })
})