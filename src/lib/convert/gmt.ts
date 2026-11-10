/**
 * GMT 纯文本（Generic Mapping Tools）读写。
 *
 * 格式本身没有规范：习惯是 `>` 开头一行作为段头，随后每行 `x y`。
 * 这里按最通用的约定处理：
 *   - 一个段 = 一个要素；段头文字作为 name 属性；
 *   - 单点 → Point，闭合且 ≥4 点 → Polygon，其余 → LineString；
 *   - 多边形内环无法在纯文本里表达，写出时丢弃并给出警告。
 */

import type {
  FeatureIssue,
  ParseOutcome,
  SerializeOptions,
  VectorFeature,
  VectorFeatureCollection
} from './types'
import type { GeoJsonGeometry } from './wkt'

function num(v: number, digits: number): string {
  return String(Number(v.toFixed(digits)))
}

function pointLines(coords: number[][], digits: number): string[] {
  return coords.map((c) => `${num(c[0], digits)} ${num(c[1], digits)}`)
}

interface GmtBlock {
  name: string
  lines: string[]
}

function collectBlocks(
  g: GeoJsonGeometry | null,
  digits: number,
  name: string,
  out: GmtBlock[]
): void {
  if (!g) return
  switch (g.type) {
    case 'Point':
      out.push({ name, lines: pointLines([g.coordinates], digits) })
      return
    case 'MultiPoint':
      out.push({ name, lines: pointLines(g.coordinates, digits) })
      return
    case 'LineString':
      out.push({ name, lines: pointLines(g.coordinates, digits) })
      return
    case 'MultiLineString':
      g.coordinates.forEach((line) => out.push({ name, lines: pointLines(line, digits) }))
      return
    case 'Polygon':
      // 只写外环；内环在 GMT 纯文本里没有标准表达
      if (g.coordinates[0]) out.push({ name, lines: pointLines(g.coordinates[0], digits) })
      return
    case 'MultiPolygon':
      g.coordinates.forEach((poly) => {
        if (poly[0]) out.push({ name, lines: pointLines(poly[0], digits) })
      })
      return
    case 'GeometryCollection':
      g.geometries.forEach((child) => collectBlocks(child, digits, name, out))
      return
  }
}

export function collectionToGmt(
  fc: VectorFeatureCollection,
  opts: SerializeOptions
): { text: string; warnings: string[] } {
  const blocks: GmtBlock[] = []
  let holesDropped = 0
  for (const f of fc.features) {
    const before = blocks.length
    collectBlocks(f.geometry, opts.digits, String(f.properties.name ?? ''), blocks)
    if (f.geometry?.type === 'Polygon' && f.geometry.coordinates.length > 1) holesDropped++
    if (f.geometry?.type === 'MultiPolygon') {
      for (const poly of f.geometry.coordinates) if (poly.length > 1) holesDropped++
    }
    if (blocks.length === before && f.geometry) blocks.push({ name: '', lines: [] })
  }
  const text = blocks
    .map((b) => `>${b.name ? ` ${b.name}` : ''}\n${b.lines.join('\n')}`)
    .join('\n\n')
  const warnings = holesDropped > 0 ? [`gmt-holes-dropped:${holesDropped}`] : []
  return { text: text ? `${text}\n` : '', warnings }
}

interface GmtState {
  name: string
  coords: number[][]
}

function finishBlock(state: GmtState | null, features: VectorFeature[], issues: FeatureIssue[]): void {
  if (!state) return
  const { coords } = state
  if (coords.length === 0) return
  if (coords.length === 1) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords[0] },
      properties: state.name ? { name: state.name } : {}
    })
    return
  }
  const first = coords[0]
  const last = coords[coords.length - 1]
  const closed = first[0] === last[0] && first[1] === last[1]
  if (closed && coords.length >= 4) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] },
      properties: state.name ? { name: state.name } : {}
    })
    return
  }
  if (coords.length < 2) {
    issues.push({ feature: features.length, code: 'invalid-geometry', detail: 'short-segment' })
    return
  }
  features.push({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: state.name ? { name: state.name } : {}
  })
}

export function parseGmt(text: string): ParseOutcome {
  const features: VectorFeature[] = []
  const issues: FeatureIssue[] = []
  let state: GmtState | null = null

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    if (line.startsWith('>')) {
      finishBlock(state, features, issues)
      state = { name: line.slice(1).trim(), coords: [] }
      continue
    }
    if (!state) state = { name: '', coords: [] }
    const parts = line.split(/[\s,]+/).filter(Boolean)
    const lng = Number(parts[0])
    const lat = Number(parts[1])
    if (parts.length < 2 || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      issues.push({ feature: features.length, code: 'invalid-geometry', detail: line.slice(0, 40) })
      continue
    }
    state.coords.push([lng, lat])
  }
  finishBlock(state, features, issues)

  return {
    format: 'gmt',
    collection: { type: 'FeatureCollection', features },
    issues,
    warnings: []
  }
}