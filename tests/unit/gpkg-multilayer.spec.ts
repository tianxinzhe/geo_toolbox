import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'

import { collectionToGpkg, gpkgLayerNames, parseGpkg } from '../../src/lib/convert/gpkg'
import type { VectorFeatureCollection } from '../../src/lib/convert/types'

const FC: VectorFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [116.4, 39.9] },
      properties: { name: 'A' }
    }
  ]
}

/** 在单图层 GPKG 上再复制一个要素表，模拟真实的多图层文件 */
async function multiLayerGpkg(): Promise<Uint8Array> {
  const { bytes } = await collectionToGpkg(FC)
  const SQL = await initSqlJs()
  const db = new SQL.Database(bytes)
  try {
    db.run('ALTER TABLE features RENAME TO layer_a')
    db.run("UPDATE gpkg_contents SET table_name='layer_a', identifier='layer_a' WHERE table_name='features'")
    db.run("UPDATE gpkg_geometry_columns SET table_name='layer_a' WHERE table_name='features'")
    db.run('CREATE TABLE layer_b AS SELECT * FROM layer_a')
    db.run(
      "INSERT INTO gpkg_contents (table_name, data_type, identifier, srs_id) VALUES ('layer_b','features','layer_b',4326)"
    )
    db.run(
      "INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m) VALUES ('layer_b','geom','GEOMETRY',4326,0,0)"
    )
    return db.export()
  } finally {
    db.close()
  }
}

describe('GeoPackage 多图层', () => {
  it('列出全部要素图层', async () => {
    const bytes = await multiLayerGpkg()
    expect(await gpkgLayerNames(bytes)).toEqual(['layer_a', 'layer_b'])
  })

  it('按图层名解析对应表', async () => {
    const bytes = await multiLayerGpkg()
    const a = await parseGpkg(bytes, 'layer_a')
    const b = await parseGpkg(bytes, 'layer_b')
    expect(a.collection.features).toHaveLength(1)
    expect(b.collection.features).toHaveLength(1)
    expect(a.warnings.some((w) => w.startsWith('gpkg-multi-layer'))).toBe(false)
  })
})