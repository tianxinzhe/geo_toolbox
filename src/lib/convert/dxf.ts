/**
 * DXF（ASCII）读写（T06）。
 *
 * 只处理二维实体：POINT / LINE / LWPOLYLINE / POLYLINE / CIRCLE / ARC。
 * 这是文件转换里最常用的子集；块引用、样条、三维实体、文字样式不在范围内。
 *
 * 两个必须说清楚的限制：
 *   - DXF 的坐标是 CAD 坐标，文件本身不声明地理坐标系，读入时按原值当作
 *     经纬度给后续校验，并给出警告（真实投影坐标应先用 T03 处理）；
 *   - 属性无法写进基础实体，写出时统一提示「属性已丢弃」。
 */

import type {
  FeatureIssue,
  ParseOutcome,
  VectorFeature,
  VectorFeatureCollection
} from './types'
import type { GeoJsonGeometry } from './wkt'

function pair(code: number, value: string | number): string {
  return `${code}\n${value}`
}

function dxfNum(v: number): string {
  return String(v)
}

interface Entity {
  type: string
  layer: string
  values: Map<number, string[]>
}

function entityText(type: string, layer: string, codes: Array<[number, string]>): string {
  return [pair(0, type), pair(8, layer), ...codes.map(([c, v]) => pair(c, v))].join('\n')
}

function geometryEntities(g: GeoJsonGeometry, layer: string, out: string[]): void {
  switch (g.type) {
    case 'Point':
      out.push(
        entityText('POINT', layer, [
          [10, dxfNum(g.coordinates[0])],
          [20, dxfNum(g.coordinates[1])]
        ])
      )
      return
    case 'MultiPoint':
      g.coordinates.forEach((c) => geometryEntities({ type: 'Point', coordinates: c }, layer, out))
      return
    case 'LineString':
      if (g.coordinates.length >= 2) {
        out.push(
          entityText('LWPOLYLINE', layer, [
            [90, String(g.coordinates.length)],
            [70, '0'],
            ...g.coordinates.flatMap<[number, string]>((c) => [
              [10, dxfNum(c[0])],
              [20, dxfNum(c[1])]
            ])
          ])
        )
      }
      return
    case 'MultiLineString':
      g.coordinates.forEach((line) => geometryEntities({ type: 'LineString', coordinates: line }, layer, out))
      return
    case 'Polygon':
      // 外环与内环都按闭合多段线写出；DXF 没有「洞」的通用语义
      g.coordinates.forEach((ring) => {
        if (ring.length < 2) return
        out.push(
          entityText('LWPOLYLINE', layer, [
            [90, String(ring.length)],
            [70, '1'],
            ...ring.flatMap<[number, string]>((c) => [
              [10, dxfNum(c[0])],
              [20, dxfNum(c[1])]
            ])
          ])
        )
      })
      return
    case 'MultiPolygon':
      g.coordinates.forEach((poly) => geometryEntities({ type: 'Polygon', coordinates: poly }, layer, out))
      return
    case 'GeometryCollection':
      g.geometries.forEach((child) => geometryEntities(child, layer, out))
      return
  }
}

export function collectionToDxf(fc: VectorFeatureCollection): {
  text: string
  warnings: string[]
} {
  const entities: string[] = []
  let attrsDropped = 0
  for (const f of fc.features) {
    if (!f.geometry) continue
    if (Object.keys(f.properties ?? {}).length > 0) attrsDropped++
    const layer = String(f.properties.layer ?? f.properties.Layer ?? '0')
    geometryEntities(f.geometry, layer, entities)
  }

  const text = `${[
    pair(0, 'SECTION'),
    pair(2, 'HEADER'),
    pair(9, '$ACADVER'),
    pair(1, 'AC1009'),
    pair(0, 'ENDSEC'),
    pair(0, 'SECTION'),
    pair(2, 'ENTITIES'),
    ...entities,
    pair(0, 'ENDSEC'),
    pair(0, 'EOF')
  ].join('\n')}\n`

  return {
    text,
    warnings: attrsDropped > 0 ? [`dxf-attrs-dropped:${attrsDropped}`] : []
  }
}

/* ------------------------------------------------------------------ *
 * 解析
 * ------------------------------------------------------------------ */

function readPairs(text: string): Array<[number, string]> | null {
  const lines = text.split(/\r?\n/)
  const out: Array<[number, string]> = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim())
    if (!Number.isFinite(code)) return null
    out.push([code, lines[i + 1].trim()])
  }
  return out
}

function collectEntities(pairs: Array<[number, string]>): Entity[] | null {
  let section = ''
  let inEntities = false
  let current: Entity | null = null
  const entities: Entity[] = []

  const flush = (): void => {
    if (current) entities.push(current)
    current = null
  }

  for (const [code, value] of pairs) {
    if (code === 0) {
      if (value === 'SECTION') {
        section = ''
        inEntities = false
        flush()
        continue
      }
      if (value === 'ENDSEC') {
        flush()
        inEntities = section === 'ENTITIES' ? false : inEntities
        continue
      }
      if (inEntities) {
        flush()
        current = { type: value, layer: '0', values: new Map() }
      }
      continue
    }
    if (code === 2 && !inEntities && section === '') {
      section = value
      if (value === 'ENTITIES') inEntities = true
      continue
    }
    if (!inEntities || !current) continue
    if (code === 8) current.layer = value
    const list = current.values.get(code)
    if (list) list.push(value)
    else current.values.set(code, [value])
  }
  flush()

  // 没有 ENTITIES 段说明不是可用的 DXF
  const hasSection = pairs.some(([c, v]) => c === 2 && v === 'ENTITIES')
  return hasSection ? entities : null
}

function first(e: Entity, code: number): number | null {
  const v = e.values.get(code)?.[0]
  if (v === undefined || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function all(e: Entity, code: number): number[] {
  return (e.values.get(code) ?? [])
    .filter((v) => v.trim() !== '')
    .map(Number)
    .filter(Number.isFinite)
}

function lwPolyline(e: Entity): GeoJsonGeometry | null {
  const xs = all(e, 10)
  const ys = all(e, 20)
  const coords = xs.map((x, i) => [x, ys[i]]).filter((p) => p.length === 2 && Number.isFinite(p[1]))
  if (coords.length < 2) return null
  const closed = ((first(e, 70) ?? 0) & 1) === 1
  if (closed) {
    const ring = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      ? coords
      : [...coords, coords[0]]
    if (ring.length >= 4) return { type: 'Polygon', coordinates: [ring] }
  }
  return { type: 'LineString', coordinates: coords }
}

function circle(e: Entity): GeoJsonGeometry | null {
  const cx = first(e, 10)
  const cy = first(e, 20)
  const r = first(e, 40)
  if (cx === null || cy === null || r === null || r <= 0) return null
  const ring: number[][] = []
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2
    ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return { type: 'Polygon', coordinates: [ring] }
}

function arc(e: Entity): GeoJsonGeometry | null {
  const cx = first(e, 10)
  const cy = first(e, 20)
  const r = first(e, 40)
  if (cx === null || cy === null || r === null || r <= 0) return null
  const start = ((first(e, 50) ?? 0) * Math.PI) / 180
  const end = ((first(e, 51) ?? 360) * Math.PI) / 180
  const span = start <= end ? end - start : Math.PI * 2 - start + end
  const coords: number[][] = []
  for (let i = 0; i <= 36; i++) {
    const a = start + (span * i) / 36
    coords.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return { type: 'LineString', coordinates: coords }
}

export function parseDxf(text: string): ParseOutcome {
  const pairs = readPairs(text)
  if (!pairs) throw new Error('invalid-dxf')
  const raw = collectEntities(pairs)
  if (!raw) throw new Error('invalid-dxf')

  // POLYLINE 的顶点是后续独立的 VERTEX 实体，这里合并成一条多段线
  const entities: Entity[] = []
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i]
    if (e.type === 'POLYLINE') {
      const xs: string[] = []
      const ys: string[] = []
      let j = i + 1
      while (j < raw.length && raw[j].type === 'VERTEX') {
        const vx = raw[j].values.get(10)?.[0] ?? ''
        const vy = raw[j].values.get(20)?.[0] ?? ''
        if (vx.trim() !== '' && vy.trim() !== '') {
          xs.push(vx)
          ys.push(vy)
        }
        j++
      }
      if (j < raw.length && raw[j].type === 'SEQEND') j++
      e.values.set(10, xs)
      e.values.set(20, ys)
      entities.push(e)
      i = j - 1
      continue
    }
    if (e.type === 'VERTEX' || e.type === 'SEQEND') continue
    entities.push(e)
  }

  const features: VectorFeature[] = []
  const issues: FeatureIssue[] = []
  const warnings = new Set<string>(['dxf-crs-unknown'])

  for (const e of entities) {
    let geometry: GeoJsonGeometry | null = null
    if (e.type === 'POINT') {
      const x = first(e, 10)
      const y = first(e, 20)
      if (x !== null && y !== null) geometry = { type: 'Point', coordinates: [x, y] }
    } else if (e.type === 'LINE') {
      const x1 = first(e, 10)
      const y1 = first(e, 20)
      const x2 = first(e, 11)
      const y2 = first(e, 21)
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
        geometry = { type: 'LineString', coordinates: [[x1, y1], [x2, y2]] }
      }
    } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      geometry = lwPolyline(e)
    } else if (e.type === 'CIRCLE') {
      geometry = circle(e)
    } else if (e.type === 'ARC') {
      geometry = arc(e)
    } else {
      continue
    }

    if (!geometry) {
      issues.push({ feature: features.length, code: 'invalid-geometry', detail: e.type })
      continue
    }
    features.push({
      type: 'Feature',
      geometry,
      properties: e.layer && e.layer !== '0' ? { layer: e.layer } : {}
    })
  }

  return {
    format: 'dxf',
    collection: { type: 'FeatureCollection', features },
    issues,
    warnings: [...warnings]
  }
}