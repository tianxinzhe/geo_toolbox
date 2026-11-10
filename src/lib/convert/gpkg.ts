/**
 * GeoPackage（.gpkg）适配器。
 *
 * 读写都基于 sql.js（SQLite 的 WASM 构建），因此整个模块只被动态 import：
 * 首屏、以及非 GPKG 的转换都不会加载 ~700KB 的 wasm。
 *
 * 输出策略（与 PRD T06 的限制说明一致）：
 *   ① 单图层，表名 features，几何列 geom，SRS 固定 EPSG:4326；
 *   ② 几何按 GPKG 几何 blob（magic 'GP' + WKB）写入，支持全部 GeoJSON 几何；
 *   ③ 属性列类型跨要素推断：混合类型降级为 TEXT，对象/数组转 JSON 文本；
 *   ④ 不静默丢几何：空/无效几何写 NULL 并累计警告。
 */

import { readGpkgGeometry, writeGpkgGeometry } from './wkb'
import type {
  FeatureIssue,
  ParseOutcome,
  VectorFeature,
  VectorFeatureCollection
} from './types'
import type { GeoJsonGeometry } from './wkt'

type SqlFactory = typeof import('sql.js')
type SqlStatic = Awaited<ReturnType<SqlFactory>>
type SqlDatabase = InstanceType<SqlStatic['Database']>
type SqlValue = number | string | Uint8Array | null

const FEATURE_TABLE = 'features'
const GEOMETRY_COLUMN = 'geom'
const SRS_ID = 4326

/** GPKG 要求存在的三个 SRS 记录 */
const WGS84_WKT =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],' +
  'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'

/* ------------------------------------------------------------------ *
 * sql.js 懒加载
 * ------------------------------------------------------------------ */

let pending: Promise<SqlStatic> | null = null

async function createSql(): Promise<SqlStatic> {
  const mod = await import('sql.js')
  const init = (mod.default ?? mod) as unknown as SqlFactory
  // 浏览器里由 Vite 把 wasm 作为静态资源产出，显式给出 URL；
  // Node（单测）交给 sql.js 自己按 __dirname 查找。
  if (typeof window === 'undefined') return init()
  const { default: wasmUrl } = await import('sql.js/dist/sql-wasm.wasm?url')
  return init({ locateFile: () => wasmUrl })
}

function loadSql(): Promise<SqlStatic> {
  if (!pending) {
    pending = createSql().catch((e) => {
      pending = null
      throw e
    })
  }
  return pending
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function hasTable(db: SqlDatabase, name: string): boolean {
  const r = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`)
  return (r[0]?.values.length ?? 0) > 0
}

/* ------------------------------------------------------------------ *
 * 读取
 * ------------------------------------------------------------------ */

interface LayerInfo {
  table: string
  geometryColumn: string
  srsId: number
  layerCount: number
}

function featureTables(db: SqlDatabase): string[] {
  const contents = db.exec(
    "SELECT table_name FROM gpkg_contents WHERE data_type = 'features' ORDER BY table_name"
  )
  return (contents[0]?.values ?? []).map((row) => String(row[0]))
}

function resolveLayer(db: SqlDatabase, tableName?: string): LayerInfo {
  const tables = featureTables(db)
  if (tables.length === 0) throw new Error('gpkg-no-feature-table')

  const table = tableName && tables.includes(tableName) ? tableName : tables[0]
  const cols = db.exec(
    'SELECT column_name, srs_id FROM gpkg_geometry_columns WHERE table_name = ?',
    [table]
  )
  const row = cols[0]?.values[0]
  return {
    table,
    geometryColumn: row ? String(row[0]) : GEOMETRY_COLUMN,
    srsId: row ? Number(row[1]) : 0,
    layerCount: tables.length
  }
}

function readDatabase(db: SqlDatabase, tableName?: string): ParseOutcome {
  if (!hasTable(db, 'gpkg_contents') || !hasTable(db, 'gpkg_geometry_columns')) {
    throw new Error('invalid-gpkg')
  }
  const layer = resolveLayer(db, tableName)
  const warnings: string[] = []
  // 显式选择图层后不再提示「多图层只读了第一个」
  if (!tableName && layer.layerCount > 1) warnings.push(`gpkg-multi-layer:${layer.layerCount}`)
  if (layer.srsId > 0 && layer.srsId !== SRS_ID) warnings.push(`gpkg-crs:${layer.srsId}`)

  const stmt = db.prepare(`SELECT * FROM ${quoteIdent(layer.table)}`)
  const features: VectorFeature[] = []
  const issues: FeatureIssue[] = []
  let broken = 0

  try {
    const columns = stmt.getColumnNames()
    while (stmt.step()) {
      const row = stmt.getAsObject()
      const blob = row[layer.geometryColumn]
      let geometry: GeoJsonGeometry | null = null
      if (blob instanceof Uint8Array) {
        try {
          geometry = readGpkgGeometry(blob)
        } catch {
          broken++
          issues.push({ feature: features.length, code: 'invalid-geometry' })
        }
      }
      const properties: Record<string, unknown> = {}
      for (const name of columns) {
        if (name === layer.geometryColumn) continue
        const value = row[name]
        properties[name] = value === undefined ? null : value
      }
      features.push({ type: 'Feature', geometry, properties })
    }
  } finally {
    stmt.free()
  }

  if (broken > 0) warnings.push(`gpkg-geometry-skipped:${broken}`)

  return {
    format: 'gpkg',
    collection: { type: 'FeatureCollection', features },
    issues,
    warnings,
    crsDeclared: layer.srsId > 0
  }
}

/** 列出 GeoPackage 内的要素图层名（供多图层选择） */
export async function gpkgLayerNames(bytes: Uint8Array): Promise<string[]> {
  if (bytes.length < 16) throw new Error('invalid-gpkg')
  const SQL = await loadSql()
  let db: SqlDatabase
  try {
    db = new SQL.Database(bytes)
  } catch {
    throw new Error('invalid-gpkg')
  }
  try {
    if (!hasTable(db, 'gpkg_contents') || !hasTable(db, 'gpkg_geometry_columns')) {
      throw new Error('invalid-gpkg')
    }
    const tables = featureTables(db)
    if (tables.length === 0) throw new Error('gpkg-no-feature-table')
    return tables
  } finally {
    db.close()
  }
}

/** 解析 .gpkg 字节；table 为空时读取第一个要素图层 */
export async function parseGpkg(bytes: Uint8Array, table?: string): Promise<ParseOutcome> {
  if (bytes.length < 16) throw new Error('invalid-gpkg')
  const SQL = await loadSql()
  let db: SqlDatabase
  try {
    db = new SQL.Database(bytes)
  } catch {
    throw new Error('invalid-gpkg')
  }
  try {
    return readDatabase(db, table)
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('gpkg-')) throw e
    throw new Error('invalid-gpkg')
  } finally {
    db.close()
  }
}

/* ------------------------------------------------------------------ *
 * 写入
 * ------------------------------------------------------------------ */

type ColumnKind = 'INTEGER' | 'REAL' | 'TEXT'

interface Column {
  key: string
  name: string
  kind: ColumnKind
}

/** 属性键 → 合法列名；fid/geom 已被占用时加前缀 */
function safeName(key: string, used: Set<string>): string {
  let name = key.trim() === '' ? 'field' : key
  if (used.has(name.toLowerCase())) name = `attr_${name}`
  let candidate = name
  let n = 2
  while (used.has(candidate.toLowerCase())) {
    candidate = `${name}_${n++}`
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function inferKind(features: VectorFeature[], key: string): ColumnKind {
  let numeric = false
  let boolean = false
  let textual = false
  let integers = true
  for (const f of features) {
    const v = f.properties?.[key]
    if (v === null || v === undefined) continue
    if (typeof v === 'number') {
      numeric = true
      if (!Number.isInteger(v)) integers = false
    } else if (typeof v === 'boolean') {
      boolean = true
    } else {
      textual = true
    }
  }
  if (textual || (numeric && boolean)) return 'TEXT'
  if (boolean) return 'INTEGER'
  if (numeric) return integers ? 'INTEGER' : 'REAL'
  return 'TEXT'
}

function buildColumns(features: VectorFeature[]): Column[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const f of features) {
    for (const k of Object.keys(f.properties ?? {})) {
      if (!seen.has(k)) {
        seen.add(k)
        keys.push(k)
      }
    }
  }
  const used = new Set(['fid', GEOMETRY_COLUMN])
  return keys.map((key) => ({
    key,
    name: safeName(key, used),
    kind: inferKind(features, key)
  }))
}

function toSqlValue(v: unknown, kind: ColumnKind): SqlValue {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (kind === 'TEXT') return String(v)
  const n = Number(v)
  return Number.isFinite(n) ? n : String(v)
}

interface Bbox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function extendBbox(g: GeoJsonGeometry, box: Bbox): void {
  const take = (p: number[]): void => {
    if (p.length < 2) return
    if (p[0] < box.minX) box.minX = p[0]
    if (p[1] < box.minY) box.minY = p[1]
    if (p[0] > box.maxX) box.maxX = p[0]
    if (p[1] > box.maxY) box.maxY = p[1]
  }
  const points = (list: number[][]): void => {
    for (const p of list) take(p)
  }
  switch (g.type) {
    case 'Point':
      take(g.coordinates)
      return
    case 'MultiPoint':
    case 'LineString':
      points(g.coordinates)
      return
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of g.coordinates) points(ring)
      return
    case 'MultiPolygon':
      for (const poly of g.coordinates) {
        for (const ring of poly) points(ring)
      }
      return
    case 'GeometryCollection':
      for (const child of g.geometries) extendBbox(child, box)
      return
  }
}

/** 空点（坐标为 []）无法写成合法 WKB 点，按 NULL 处理 */
function isEmptyGeometry(g: GeoJsonGeometry): boolean {
  return g.type === 'Point' && g.coordinates.length < 2
}

/** 集合 → GPKG 字节（单图层、EPSG:4326） */
export async function collectionToGpkg(fc: VectorFeatureCollection): Promise<{
  bytes: Uint8Array
  warnings: string[]
}> {
  if (fc.features.length === 0) throw new Error('gpkg-empty')
  const SQL = await loadSql()
  const db = new SQL.Database()
  const warnings: string[] = []

  try {
    db.run(`PRAGMA application_id = 1196444487`)
    db.run(`PRAGMA user_version = 10300`)

    db.run(`CREATE TABLE gpkg_spatial_ref_sys (
      srs_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL PRIMARY KEY,
      organization TEXT NOT NULL,
      organization_coordsys_id INTEGER NOT NULL,
      definition TEXT NOT NULL,
      description TEXT
    )`)
    const insertSrs = db.prepare(
      'INSERT INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, organization_coordsys_id, definition, description) VALUES (?, ?, ?, ?, ?, ?)'
    )
    insertSrs.run(['Undefined Cartesian SRS', -1, 'NONE', -1, 'undefined', null])
    insertSrs.run(['Undefined geographic SRS', 0, 'NONE', 0, 'undefined', null])
    insertSrs.run(['WGS 84 geodetic', SRS_ID, 'EPSG', SRS_ID, WGS84_WKT, null])
    insertSrs.free()

    db.run(`CREATE TABLE gpkg_contents (
      table_name TEXT NOT NULL PRIMARY KEY,
      data_type TEXT NOT NULL,
      identifier TEXT UNIQUE,
      description TEXT DEFAULT '',
      last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      min_x DOUBLE,
      min_y DOUBLE,
      max_x DOUBLE,
      max_y DOUBLE,
      srs_id INTEGER,
      CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    )`)
    db.run(`CREATE TABLE gpkg_geometry_columns (
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL,
      z TINYINT NOT NULL,
      m TINYINT NOT NULL,
      CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
      CONSTRAINT uk_gc_table_name UNIQUE (table_name),
      CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
      CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id)
    )`)

    const columns = buildColumns(fc.features)
    const columnDdl = columns
      .map((c) => `,\n      ${quoteIdent(c.name)} ${c.kind}`)
      .join('')
    db.run(`CREATE TABLE ${quoteIdent(FEATURE_TABLE)} (
      fid INTEGER PRIMARY KEY AUTOINCREMENT,
      ${quoteIdent(GEOMETRY_COLUMN)} BLOB${columnDdl}
    )`)

    db.run(
      'INSERT INTO gpkg_contents (table_name, data_type, identifier, description, srs_id) VALUES (?, ?, ?, ?, ?)',
      [FEATURE_TABLE, 'features', FEATURE_TABLE, '', SRS_ID]
    )
    db.run(
      'INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m) VALUES (?, ?, ?, ?, ?, ?)',
      [FEATURE_TABLE, GEOMETRY_COLUMN, 'GEOMETRY', SRS_ID, 0, 0]
    )

    const fields = columns.map((c) => `, ${quoteIdent(c.name)}`).join('')
    const marks = columns.map(() => ', ?').join('')
    const insert = db.prepare(
      `INSERT INTO ${quoteIdent(FEATURE_TABLE)} (${quoteIdent(GEOMETRY_COLUMN)}${fields}) VALUES (?${marks})`
    )

    const box: Bbox = {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
    let emptyGeometries = 0

    for (const f of fc.features) {
      let blob: Uint8Array | null = null
      if (f.geometry && !isEmptyGeometry(f.geometry)) {
        blob = writeGpkgGeometry(f.geometry, SRS_ID)
        extendBbox(f.geometry, box)
      } else {
        emptyGeometries++
      }
      const values = columns.map((c) => toSqlValue(f.properties?.[c.key], c.kind))
      insert.run([blob, ...values])
    }
    insert.free()

    if (emptyGeometries > 0) warnings.push(`gpkg-empty-geometry:${emptyGeometries}`)

    if (Number.isFinite(box.minX)) {
      db.run(
        'UPDATE gpkg_contents SET min_x = ?, min_y = ?, max_x = ?, max_y = ? WHERE table_name = ?',
        [box.minX, box.minY, box.maxX, box.maxY, FEATURE_TABLE]
      )
    }

    return { bytes: db.export(), warnings }
  } finally {
    db.close()
  }
}