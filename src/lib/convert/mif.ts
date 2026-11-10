/**
 * MIF/MID 读写（T06）。
 *
 * MIF 存几何、MID 存属性，是一对文件。为了只给用户一个下载项，
 * 输出统一打包成 ZIP（data.mif + data.mid）；输入既接受这个 ZIP，
 * 也接受单个 .mif（此时没有属性）。
 *
 * 支持的对象：Point、Line、Pline、Region。Text/Rect/Ellipse/Arc 等
 * 装饰性对象不转换，解析时跳过。
 */

import Papa from 'papaparse'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

import type {
  FeatureIssue,
  ParseOutcome,
  VectorFeature,
  VectorFeatureCollection
} from './types'
import type { GeoJsonGeometry } from './wkt'

/* ------------------------------------------------------------------ *
 * 写出
 * ------------------------------------------------------------------ */

interface MifObject {
  text: string
  props: Record<string, unknown>
}

function coordPairs(coords: number[][]): string[] {
  return coords.map((c) => `${c[0]} ${c[1]}`)
}

function toObjects(f: VectorFeature, out: MifObject[]): void {
  const props = f.properties ?? {}
  const g = f.geometry
  if (!g) return
  switch (g.type) {
    case 'Point':
      out.push({ text: `Point ${g.coordinates[0]} ${g.coordinates[1]}`, props })
      return
    case 'MultiPoint':
      g.coordinates.forEach((c) => out.push({ text: `Point ${c[0]} ${c[1]}`, props }))
      return
    case 'LineString':
      if (g.coordinates.length >= 2) {
        out.push({ text: `Line ${coordPairs(g.coordinates).join(' ')}`, props })
      }
      return
    case 'MultiLineString':
      g.coordinates.forEach((line) =>
        out.push({ text: `Line ${coordPairs(line).join(' ')}`, props })
      )
      return
    case 'Polygon': {
      const ring = g.coordinates[0]
      if (!ring || ring.length < 3) return
      const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      const coords = closed ? ring : [...ring, ring[0]]
      out.push({
        text: `Region 1\n${coords.length}\n${coordPairs(coords).join(' ')}`,
        props
      })
      return
    }
    case 'MultiPolygon': {
      const rings = g.coordinates
        .map((poly) => poly[0])
        .filter((ring) => ring && ring.length >= 3)
        .map((ring) => {
          const closed =
            ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
          return closed ? ring : [...ring, ring[0]]
        })
      if (rings.length === 0) return
      out.push({
        text: `Region ${rings.length}\n${rings
          .map((ring) => `${ring.length}\n${coordPairs(ring).join(' ')}`)
          .join('\n')}`,
        props
      })
      return
    }
    case 'GeometryCollection':
      g.geometries.forEach((child) => toObjects({ ...f, geometry: child }, out))
      return
  }
}

function columnName(raw: string, used: Set<string>): string {
  let name = raw.replace(/[^\w]/g, '_').replace(/^(\d)/, '_$1').slice(0, 31) || 'field'
  let candidate = name
  let i = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${i++}`
    candidate = `${name.slice(0, 31 - suffix.length)}${suffix}`
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function midCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function collectionToMif(fc: VectorFeatureCollection): {
  bytes: Uint8Array
  warnings: string[]
} {
  const objects: MifObject[] = []
  for (const f of fc.features) toObjects(f, objects)

  const columns: string[] = []
  const used = new Set<string>()
  const seen = new Set<string>()
  for (const o of objects) {
    for (const key of Object.keys(o.props)) {
      if (seen.has(key)) continue
      seen.add(key)
      columns.push(columnName(key, used))
    }
  }
  // 原名 → 列名，写 MID 时按列顺序取值
  const sourceKeys: string[] = []
  const seen2 = new Set<string>()
  for (const o of objects) {
    for (const key of Object.keys(o.props)) {
      if (!seen2.has(key)) {
        seen2.add(key)
        sourceKeys.push(key)
      }
    }
  }

  const header = [
    'Version 300',
    'Charset "UTF-8"',
    'Delimiter ","',
    `Columns ${columns.length}`,
    ...columns.map((c) => `  ${c} Char(254)`),
    'Data'
  ]

  const mif = `${[...header, ...objects.map((o) => o.text)].join('\n')}\n`
  const mid = objects
    .map((o) => Papa.unparse([sourceKeys.map((k) => midCell(o.props[k]))], { delimiter: ',' }))
    .join('\n')
  const bytes = zipSync(
    { 'data.mif': strToU8(mif), 'data.mid': strToU8(mid || '\n') },
    { level: 6 }
  )
  return {
    bytes,
    warnings: objects.length === 0 ? ['mif-empty'] : []
  }
}

/* ------------------------------------------------------------------ *
 * 解析
 * ------------------------------------------------------------------ */

interface ParsedMif {
  columns: string[]
  objects: GeoJsonGeometry[]
}

function parseCoords(lines: string[], start: number, count: number): { coords: number[][]; next: number } {
  const coords: number[][] = []
  let i = start
  while (i < lines.length && coords.length < count) {
    const nums = lines[i].split(/\s+/).filter(Boolean).map(Number)
    for (let k = 0; k + 1 < nums.length && coords.length < count; k += 2) {
      if (Number.isFinite(nums[k]) && Number.isFinite(nums[k + 1])) coords.push([nums[k], nums[k + 1]])
    }
    i++
  }
  return { coords, next: i }
}

function parseMifText(text: string): ParsedMif {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const dataIndex = lines.findIndex((l) => /^Data$/i.test(l))
  if (dataIndex < 0) throw new Error('invalid-mif')

  const columns: string[] = []
  for (let i = 0; i < dataIndex; i++) {
    const m = /^Columns\s+(\d+)/i.exec(lines[i])
    if (!m) continue
    const count = Number(m[1])
    for (let k = 1; k <= count && i + k < dataIndex; k++) {
      const name = lines[i + k].split(/\s+/)[0]
      if (name) columns.push(name)
    }
  }

  const body = lines.slice(dataIndex + 1).filter((l) => l !== '')
  const objects: GeoJsonGeometry[] = []
  let i = 0
  while (i < body.length) {
    const head = body[i].split(/\s+/)
    const type = head[0]?.toLowerCase()
    if (type === 'point') {
      const x = Number(head[1])
      const y = Number(head[2])
      if (Number.isFinite(x) && Number.isFinite(y)) objects.push({ type: 'Point', coordinates: [x, y] })
      i++
      continue
    }
    if (type === 'line') {
      const nums = head.slice(1).map(Number)
      const coords: number[][] = []
      for (let k = 0; k + 1 < nums.length; k += 2) coords.push([nums[k], nums[k + 1]])
      if (coords.length >= 2) objects.push({ type: 'LineString', coordinates: coords })
      i++
      continue
    }
    if (type === 'pline') {
      const sections = Number(head[1])
      let j = i + 1
      const linesOut: number[][][] = []
      for (let s = 0; s < sections && j < body.length; s++) {
        const count = Number(body[j])
        j++
        const r = parseCoords(body, j, count)
        linesOut.push(r.coords)
        j = r.next
      }
      if (linesOut.length === 1) objects.push({ type: 'LineString', coordinates: linesOut[0] })
      else if (linesOut.length > 1) objects.push({ type: 'MultiLineString', coordinates: linesOut })
      i = j
      continue
    }
    if (type === 'region') {
      const polygons = Number(head[1])
      let j = i + 1
      const polys: number[][][][] = []
      for (let p = 0; p < polygons && j < body.length; p++) {
        const count = Number(body[j])
        j++
        const r = parseCoords(body, j, count)
        j = r.next
        if (r.coords.length >= 3) {
          const ring =
            r.coords[0][0] === r.coords[r.coords.length - 1][0] &&
            r.coords[0][1] === r.coords[r.coords.length - 1][1]
              ? r.coords
              : [...r.coords, r.coords[0]]
          polys.push([ring])
        }
      }
      if (polys.length === 1) objects.push({ type: 'Polygon', coordinates: polys[0] })
      else if (polys.length > 1) objects.push({ type: 'MultiPolygon', coordinates: polys })
      i = j
      continue
    }
    i++
  }

  return { columns, objects }
}

function parseMid(text: string): string[][] {
  return Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' }).data
}

function buildOutcome(
  mif: ParsedMif,
  midRows: string[][] | null,
  warnings: string[]
): ParseOutcome {
  const features: VectorFeature[] = []
  const issues: FeatureIssue[] = []
  mif.objects.forEach((geometry, i) => {
    const row = midRows?.[i]
    const properties: Record<string, unknown> = {}
    if (row) {
      mif.columns.forEach((c, k) => {
        const value = row[k]
        if (value !== undefined && value !== '') properties[c] = value
      })
    }
    features.push({ type: 'Feature', geometry, properties })
  })
  if (midRows && midRows.length !== mif.objects.length) {
    warnings.push(`mif-row-mismatch:${mif.objects.length}:${midRows.length}`)
  }
  if (features.length === 0) issues.push({ feature: 0, code: 'empty-geometry' })
  return {
    format: 'mif',
    collection: { type: 'FeatureCollection', features },
    issues,
    warnings
  }
}

export function parseMifTextInput(text: string): ParseOutcome {
  return buildOutcome(parseMifText(text), null, [])
}

export function parseMifZip(bytes: Uint8Array): ParseOutcome {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('invalid-mif')
  }
  const names = Object.keys(files)
  const mifName = names.find((n) => /\.mif$/i.test(n))
  if (!mifName) throw new Error('invalid-mif')
  const midName = names.find((n) => /\.mid$/i.test(n))
  const mif = parseMifText(strFromU8(files[mifName]))
  const midRows = midName ? parseMid(strFromU8(files[midName])) : null
  return buildOutcome(mif, midRows, [])
}