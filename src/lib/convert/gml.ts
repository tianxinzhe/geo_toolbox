/**
 * GML 读写（T06）。
 *
 * 写出的是通用的 GML 3.2 FeatureCollection，读取按「常见简单要素」处理：
 * 支持 Point / LineString / Polygon 及其 Multi 形式与 GeometryCollection，
 * 坐标来源支持 gml:pos / gml:posList / gml:coordinates。
 *
 * 不做的部分（会给出警告，而不是静默处理）：
 *   - 非 EPSG:4326 / CRS84 的 srsName 只提示，不做投影变换；
 *   - 复杂 GML 应用模式（属性嵌套、曲线、曲面）不展开。
 */

import type {
  FeatureIssue,
  ParseOutcome,
  VectorFeature,
  VectorFeatureCollection
} from './types'
import type { GeoJsonGeometry } from './wkt'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function propName(s: string): string {
  let name = s.replace(/[^\w.-]/g, '_')
  if (!/^[A-Za-z_]/.test(name)) name = `_${name}`
  return name
}

function pos(v: number): string {
  return String(v)
}

function ringPosList(ring: number[][]): string {
  return ring.map((p) => `${pos(p[0])} ${pos(p[1])}`).join(' ')
}

function geometryXml(g: GeoJsonGeometry): string {
  switch (g.type) {
    case 'Point':
      return `<gml:Point srsName="EPSG:4326"><gml:pos>${pos(g.coordinates[0])} ${pos(g.coordinates[1])}</gml:pos></gml:Point>`
    case 'MultiPoint':
      return `<gml:MultiPoint srsName="EPSG:4326">${g.coordinates
        .map((c) => `<gml:pointMember>${geometryXml({ type: 'Point', coordinates: c })}</gml:pointMember>`)
        .join('')}</gml:MultiPoint>`
    case 'LineString':
      return `<gml:LineString srsName="EPSG:4326"><gml:posList>${ringPosList(g.coordinates)}</gml:posList></gml:LineString>`
    case 'MultiLineString':
      return `<gml:MultiLineString srsName="EPSG:4326">${g.coordinates
        .map((c) => `<gml:lineStringMember>${geometryXml({ type: 'LineString', coordinates: c })}</gml:lineStringMember>`)
        .join('')}</gml:MultiLineString>`
    case 'Polygon':
      return `<gml:Polygon srsName="EPSG:4326">${g.coordinates
        .map(
          (ring, i) =>
            `<gml:${i === 0 ? 'exterior' : 'interior'}><gml:LinearRing><gml:posList>${ringPosList(
              ring
            )}</gml:posList></gml:LinearRing></gml:${i === 0 ? 'exterior' : 'interior'}>`
        )
        .join('')}</gml:Polygon>`
    case 'MultiPolygon':
      return `<gml:MultiPolygon srsName="EPSG:4326">${g.coordinates
        .map((c) => `<gml:polygonMember>${geometryXml({ type: 'Polygon', coordinates: c })}</gml:polygonMember>`)
        .join('')}</gml:MultiPolygon>`
    case 'GeometryCollection':
      return `<gml:MultiGeometry>${g.geometries
        .map((child) => `<gml:geometryMember>${geometryXml(child)}</gml:geometryMember>`)
        .join('')}</gml:MultiGeometry>`
  }
}

export function collectionToGml(fc: VectorFeatureCollection): string {
  const members = fc.features
    .map((f) => {
      const props = Object.entries(f.properties ?? {})
        .filter(([k]) => propName(k) !== 'geometryProperty')
        .map(([k, v]) => `<ogr:${propName(k)}>${esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}</ogr:${propName(k)}>`)
        .join('')
      const geom = f.geometry ? `<ogr:geometryProperty>${geometryXml(f.geometry)}</ogr:geometryProperty>` : ''
      return `  <gml:featureMember>\n    <ogr:feature>${props}${geom}</ogr:feature>\n  </gml:featureMember>`
    })
    .join('\n')

  const head = `<?xml version="1.0" encoding="UTF-8"?>
<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:ogr="http://ogr.maptools.org/">`
  return `${head}\n${members}\n</gml:FeatureCollection>`
}

/* ------------------------------------------------------------------ *
 * 解析
 * ------------------------------------------------------------------ */

function localName(el: Element): string {
  return (el.localName || el.nodeName.split(':').pop() || '').toLowerCase()
}

function children(el: Element): Element[] {
  const out: Element[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 1) out.push(n as Element)
  }
  return out
}

function firstDescendant(el: Element, names: Set<string>): Element | null {
  for (const child of children(el)) {
    if (names.has(localName(child))) return child
    const found = firstDescendant(child, names)
    if (found) return found
  }
  return null
}

function descendants(el: Element, name: string): Element[] {
  const out: Element[] = []
  const walk = (node: Element): void => {
    for (const child of children(node)) {
      if (localName(child) === name) out.push(child)
      walk(child)
    }
  }
  walk(el)
  return out
}

function numbers(text: string | null | undefined): number[] {
  if (!text) return []
  return text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
}

function pairs(values: number[]): number[][] {
  const out: number[][] = []
  for (let i = 0; i + 1 < values.length; i += 2) out.push([values[i], values[i + 1]])
  return out
}

function readPositions(el: Element): number[][] {
  const posList = firstDescendant(el, new Set(['poslist']))
  if (posList) {
    const nums = numbers(posList.textContent)
    if (nums.length >= 2) return pairs(nums)
  }
  const coords = firstDescendant(el, new Set(['coordinates']))
  if (coords) {
    return coords.textContent
      ?.trim()
      .split(/\s+/)
      .map((s) => s.split(',').map(Number).slice(0, 2))
      .filter((p) => p.length === 2 && p.every(Number.isFinite)) ?? []
  }
  return descendants(el, 'pos')
    .map((p) => numbers(p.textContent))
    .filter((v) => v.length >= 2)
    .map((v) => [v[0], v[1]])
}

const GEOM_NAMES = new Set([
  'point',
  'linestring',
  'polygon',
  'multipoint',
  'multilinestring',
  'multipolygon',
  'multigeometry',
  'geometrycollection'
])

function parseGeometry(el: Element): GeoJsonGeometry | null {
  const name = localName(el)
  if (name === 'point') {
    const [p] = readPositions(el)
    return p ? { type: 'Point', coordinates: p } : null
  }
  if (name === 'linestring' || name === 'linearring') {
    const line = readPositions(el)
    return line.length >= 2 ? { type: 'LineString', coordinates: line } : null
  }
  if (name === 'polygon') {
    const exterior = children(el).find((c) => localName(c) === 'exterior')
    const interior = children(el).filter((c) => localName(c) === 'interior')
    const rings: number[][][] = []
    const outer = exterior ? firstDescendant(exterior, new Set(['linearring'])) : null
    const outerRing = outer ? readPositions(outer) : readPositions(el)
    if (outerRing.length >= 4) rings.push(outerRing)
    for (const inner of interior) {
      const ringEl = firstDescendant(inner, new Set(['linearring']))
      const ring = ringEl ? readPositions(ringEl) : readPositions(inner)
      if (ring.length >= 4) rings.push(ring)
    }
    return rings.length > 0 ? { type: 'Polygon', coordinates: rings } : null
  }
  if (name === 'multipoint') {
    const points = descendants(el, 'point')
      .map((p) => parseGeometry(p))
      .map((g) => (g?.type === 'Point' ? g.coordinates : null))
      .filter((c): c is number[] => c !== null)
    return points.length > 0 ? { type: 'MultiPoint', coordinates: points } : null
  }
  if (name === 'multilinestring') {
    const lines = descendants(el, 'linestring')
      .map((p) => parseGeometry(p))
      .map((g) => (g?.type === 'LineString' ? g.coordinates : null))
      .filter((c): c is number[][] => c !== null)
    return lines.length > 0 ? { type: 'MultiLineString', coordinates: lines } : null
  }
  if (name === 'multipolygon') {
    const polys = descendants(el, 'polygon')
      .map((p) => parseGeometry(p))
      .map((g) => (g?.type === 'Polygon' ? g.coordinates : null))
      .filter((c): c is number[][][] => c !== null)
    return polys.length > 0 ? { type: 'MultiPolygon', coordinates: polys } : null
  }
  if (name === 'multigeometry' || name === 'geometrycollection') {
    const geoms = children(el)
      .filter((c) => GEOM_NAMES.has(localName(c)) || localName(c).endsWith('member'))
      .map((c) => (localName(c).endsWith('member') ? firstDescendant(c, GEOM_NAMES) : c))
      .filter((c): c is Element => c !== null)
      .map((c) => parseGeometry(c))
      .filter((g): g is GeoJsonGeometry => g !== null)
    return geoms.length > 0 ? { type: 'GeometryCollection', geometries: geoms } : null
  }
  return null
}

export function parseGml(text: string): ParseOutcome {
  if (typeof DOMParser === 'undefined') throw new Error('dom-unavailable')
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(text, 'text/xml')
  } catch {
    throw new Error('invalid-gml')
  }
  if (!doc || doc.getElementsByTagName('parsererror').length > 0) throw new Error('invalid-gml')

  const root = doc.documentElement
  if (!root) throw new Error('invalid-gml')

  let members = descendants(root, 'featuremember')
  if (members.length === 0) members = descendants(root, 'member')
  const features: VectorFeature[] = []
  const issues: FeatureIssue[] = []
  const warnings = new Set<string>()

  const featureEls =
    members.length > 0
      ? members.map((m) => children(m)[0]).filter((e): e is Element => Boolean(e))
      : descendants(root, 'feature')

  for (const [i, featureEl] of featureEls.entries()) {
    const geomEl = firstDescendant(featureEl, GEOM_NAMES)
    const geometry = geomEl ? parseGeometry(geomEl) : null
    if (!geometry) issues.push({ feature: i, code: 'empty-geometry' })

    const srs = geomEl?.getAttribute('srsName') ?? root.getAttribute('srsName')
    if (srs && !/epsg:4326|ogc:crs84|crs:84|urn:ogc:def:crs:ogc:1\.3:crs84/i.test(srs)) {
      warnings.add(`gml-crs:${srs}`)
    }

    const properties: Record<string, unknown> = {}
    for (const child of children(featureEl)) {
      if (geomEl && (child === geomEl || child.contains(geomEl))) continue
      const name = localName(child)
      if (GEOM_NAMES.has(name) || name.endsWith('member')) continue
      const value = child.textContent?.trim() ?? ''
      if (value !== '') properties[child.localName || name] = value
    }
    features.push({ type: 'Feature', geometry, properties })
  }

  if (features.length === 0) throw new Error('invalid-gml')

  return {
    format: 'gml',
    collection: { type: 'FeatureCollection', features },
    issues,
    warnings: [...warnings]
  }
}