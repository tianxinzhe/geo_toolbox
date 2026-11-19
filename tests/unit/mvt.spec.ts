import { gzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  MvtError,
  decodeMvt,
  isValidTile,
  mvtFromBase64,
  tileFromFileName
} from '../../src/lib/convert/mvt'

/* ------------------------------------------------------------------ *
 * 测试用的最小 protobuf 编码器
 *
 * MVT 的 wire 格式只有 varint 与 length-delimited 两种，十几行就够拼出
 * 合法瓦片。这里刻意不引入第三方库：测试要独立验证解码器，而不是用
 * 同一个库自证。
 * ------------------------------------------------------------------ */

function varint(value: number): number[] {
  const out: number[] = []
  let rest = value
  while (rest > 0x7f) {
    out.push((rest & 0x7f) | 0x80)
    rest = Math.floor(rest / 128)
  }
  out.push(rest)
  return out
}

function tag(field: number, wire: number): number[] {
  return varint(field * 8 + wire)
}

function bytesField(field: number, payload: readonly number[]): number[] {
  return [...tag(field, 2), ...varint(payload.length), ...payload]
}

function textField(field: number, value: string): number[] {
  return bytesField(field, [...new TextEncoder().encode(value)])
}

function uintField(field: number, value: number): number[] {
  return [...tag(field, 0), ...varint(value)]
}

function zigzag(value: number): number {
  return value >= 0 ? value * 2 : -value * 2 - 1
}

function command(id: number, count = 1): number {
  return (count << 3) | id
}

interface FeatureSpec {
  id?: number
  type: number
  tags?: number[]
  geometry: number[]
}

interface LayerSpec {
  name: string
  version?: number
  extent?: number
  keys?: string[]
  values?: number[][]
  features: FeatureSpec[]
}

function featureBytes(spec: FeatureSpec): number[] {
  const out: number[] = []
  if (spec.id !== undefined) out.push(...uintField(1, spec.id))
  if (spec.tags?.length) out.push(...bytesField(2, spec.tags.flatMap(varint)))
  out.push(...uintField(3, spec.type))
  out.push(...bytesField(4, spec.geometry.flatMap(varint)))
  return out
}

function layerBytes(spec: LayerSpec): number[] {
  const out: number[] = []
  out.push(...textField(1, spec.name))
  for (const feature of spec.features) out.push(...bytesField(2, featureBytes(feature)))
  for (const key of spec.keys ?? []) out.push(...textField(3, key))
  for (const value of spec.values ?? []) out.push(...bytesField(4, value))
  out.push(...uintField(5, spec.extent ?? 4096))
  out.push(...uintField(15, spec.version ?? 2))
  return out
}

function tileBytes(layers: LayerSpec[]): Uint8Array {
  const payload = layers.flatMap((layer) => bytesField(3, layerBytes(layer)))
  return new Uint8Array(payload)
}

function stringValue(value: string): number[] {
  return textField(1, value)
}

function doubleBytes(field: number, value: number): number[] {
  const buf = new DataView(new ArrayBuffer(8))
  buf.setFloat64(0, value, true)
  return [...tag(field, 1), ...new Uint8Array(buf.buffer)]
}

function doubleValue(value: number): number[] {
  return doubleBytes(3, value)
}

function boolValue(value: boolean): number[] {
  return uintField(7, value ? 1 : 0)
}

function sintValue(value: number): number[] {
  return uintField(6, zigzag(value))
}

const CENTER = [command(1), zigzag(2048), zigzag(2048)]

function pointTile(extra: Partial<LayerSpec> = {}): Uint8Array {
  return tileBytes([
    {
      name: 'poi',
      keys: ['name'],
      values: [stringValue('Times Square')],
      features: [{ id: 7, type: 1, tags: [0, 0], geometry: CENTER }],
      ...extra
    }
  ])
}

describe('MVT 解码：基础结构', () => {
  it('解析图层元数据与单个点', () => {
    const result = decodeMvt(pointTile(), { z: 0, x: 0, y: 0 })

    expect(result.layers).toHaveLength(1)
    expect(result.layers[0]).toMatchObject({
      name: 'poi',
      version: 2,
      extent: 4096,
      features: 1,
      points: 1,
      lines: 0,
      polygons: 0,
      unknown: 0
    })

    expect(result.features).toHaveLength(1)
    expect(result.features[0].id).toBe(7)
    expect(result.features[0].type).toBe('Point')
    expect(result.features[0].properties).toEqual({ name: 'Times Square' })

    const geometry = result.features[0].geometry
    expect(geometry.type).toBe('Point')
    if (geometry.type !== 'Point') throw new Error('expected point')
    expect(geometry.coordinates[0]).toBeCloseTo(0, 10)
    expect(geometry.coordinates[1]).toBeCloseTo(0, 10)
  })

  it('未提供 z/x/y 时保留瓦片内坐标', () => {
    const result = decodeMvt(pointTile())
    const geometry = result.features[0].geometry
    if (geometry.type !== 'Point') throw new Error('expected point')
    expect(geometry.coordinates).toEqual([2048, 2048])
    expect(result.warnings.map((w) => w.code)).toContain('no-tile')
  })

  it('extent 缩放到 512 时仍落在瓦片中心', () => {
    const bytes = tileBytes([
      {
        name: 'tiny',
        extent: 512,
        features: [
          { type: 1, geometry: [command(1), zigzag(256), zigzag(256)] }
        ]
      }
    ])
    const result = decodeMvt(bytes, { z: 0, x: 0, y: 0 })
    const geometry = result.features[0].geometry
    if (geometry.type !== 'Point') throw new Error('expected point')
    expect(geometry.coordinates[0]).toBeCloseTo(0, 10)
    expect(geometry.coordinates[1]).toBeCloseTo(0, 10)
  })

  it('属性支持 double / bool / sint', () => {
    const bytes = tileBytes([
      {
        name: 'attrs',
        keys: ['score', 'open', 'delta'],
        values: [doubleValue(2.5), boolValue(true), sintValue(-7)],
        features: [{ type: 1, tags: [0, 0, 1, 1, 2, 2], geometry: CENTER }]
      }
    ])
    const result = decodeMvt(bytes)
    expect(result.features[0].properties).toEqual({ score: 2.5, open: true, delta: -7 })
  })
})

describe('MVT 解码：几何类型', () => {
  it('MoveTo 带多个点时输出 MultiPoint', () => {
    const bytes = tileBytes([
      {
        name: 'multi-point',
        features: [
          {
            type: 1,
            geometry: [command(1, 2), zigzag(0), zigzag(0), zigzag(4096), zigzag(4096)]
          }
        ]
      }
    ])
    const result = decodeMvt(bytes, { z: 0, x: 0, y: 0 })
    const geometry = result.features[0].geometry
    expect(geometry.type).toBe('MultiPoint')
    if (geometry.type !== 'MultiPoint') throw new Error('expected multipoint')
    expect(geometry.coordinates).toHaveLength(2)
    expect(geometry.coordinates[0][0]).toBeCloseTo(-180, 9)
    expect(geometry.coordinates[1][0]).toBeCloseTo(180, 9)
    expect(geometry.coordinates[0][1]).toBeCloseTo(85.05112878, 6)
  })

  it('LineString 按增量还原折线', () => {
    const bytes = tileBytes([
      {
        name: 'roads',
        features: [
          {
            type: 2,
            geometry: [
              command(1),
              zigzag(0),
              zigzag(0),
              command(2),
              zigzag(4096),
              zigzag(4096)
            ]
          }
        ]
      }
    ])
    const result = decodeMvt(bytes, { z: 0, x: 0, y: 0 })
    expect(result.layers[0].lines).toBe(1)
    const geometry = result.features[0].geometry
    expect(geometry.type).toBe('LineString')
    if (geometry.type !== 'LineString') throw new Error('expected linestring')
    expect(geometry.coordinates).toHaveLength(2)
    expect(geometry.coordinates[1][0]).toBeCloseTo(180, 9)
    expect(geometry.coordinates[1][1]).toBeCloseTo(-85.05112878, 6)
  })

  it('多个 MoveTo 输出 MultiLineString', () => {
    const bytes = tileBytes([
      {
        name: 'paths',
        features: [
          {
            type: 2,
            geometry: [
              command(1),
              zigzag(0),
              zigzag(0),
              command(2),
              zigzag(100),
              zigzag(100),
              command(1),
              zigzag(200),
              zigzag(200),
              command(2),
              zigzag(100),
              zigzag(100)
            ]
          }
        ]
      }
    ])
    const result = decodeMvt(bytes, { z: 0, x: 0, y: 0 })
    const geometry = result.features[0].geometry
    expect(geometry.type).toBe('MultiLineString')
    if (geometry.type !== 'MultiLineString') throw new Error('expected multilinestring')
    expect(geometry.coordinates).toHaveLength(2)
  })

  it('面按外环/内环组装，并统一到 GeoJSON 绕向', () => {
    // 外环：屏幕坐标系顺时针（y 向下时面积为正）
    const outer = [
      command(1),
      zigzag(0),
      zigzag(0),
      command(2, 3),
      zigzag(4096),
      zigzag(0),
      zigzag(0),
      zigzag(4096),
      zigzag(-4096),
      zigzag(0),
      command(7)
    ]
    // 内环：反向绕，面积为负，判定为洞
    const hole = [
      command(1),
      zigzag(1000),
      zigzag(1000),
      command(2, 3),
      zigzag(0),
      zigzag(1000),
      zigzag(1000),
      zigzag(0),
      zigzag(0),
      zigzag(-1000),
      command(7)
    ]

    const bytes = tileBytes([
      { name: 'land', features: [{ type: 3, geometry: [...outer, ...hole] }] }
    ])
    const result = decodeMvt(bytes, { z: 0, x: 0, y: 0 })
    expect(result.layers[0].polygons).toBe(1)

    const geometry = result.features[0].geometry
    expect(geometry.type).toBe('Polygon')
    if (geometry.type !== 'Polygon') throw new Error('expected polygon')
    expect(geometry.coordinates).toHaveLength(2)

    const [exterior, interior] = geometry.coordinates
    expect(exterior[0]).toEqual(exterior[exterior.length - 1])
    expect(interior[0]).toEqual(interior[interior.length - 1])

    const area = (ring: number[][]): number => {
      let sum = 0
      for (let i = 0; i < ring.length - 1; i++) {
        sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
      }
      return sum / 2
    }
    expect(area(exterior)).toBeGreaterThan(0)
    expect(area(interior)).toBeLessThan(0)
  })

  it('缺少 ClosePath 时也补齐闭合环', () => {
    const bytes = tileBytes([
      {
        name: 'open-ring',
        features: [
          {
            type: 3,
            geometry: [
              command(1),
              zigzag(0),
              zigzag(0),
              command(2, 2),
              zigzag(4096),
              zigzag(0),
              zigzag(0),
              zigzag(4096)
            ]
          }
        ]
      }
    ])
    const result = decodeMvt(bytes)
    const geometry = result.features[0].geometry
    if (geometry.type === 'Polygon') {
      const ring = geometry.coordinates[0]
      expect(ring[0]).toEqual(ring[ring.length - 1])
    }
    expect(result.warnings.map((w) => w.code)).toContain('missing-close')
  })
})

describe('MVT 解码：容错', () => {
  it('未知要素类型只计入 unknown，不中断整块瓦片', () => {
    const bytes = tileBytes([
      {
        name: 'mixed',
        features: [
          { type: 0, geometry: CENTER },
          { type: 1, geometry: CENTER }
        ]
      }
    ])
    const result = decodeMvt(bytes)
    expect(result.layers[0].unknown).toBe(1)
    expect(result.features).toHaveLength(1)
    expect(result.warnings.map((w) => w.code)).toContain('unknown-geometry')
  })

  it('tags 长度为奇数时记录警告', () => {
    const bytes = tileBytes([
      {
        name: 'odd',
        keys: ['name'],
        values: [stringValue('x')],
        features: [{ type: 1, tags: [0], geometry: CENTER }]
      }
    ])
    const result = decodeMvt(bytes)
    expect(result.features[0].properties).toEqual({})
    expect(result.warnings.map((w) => w.code)).toContain('tags-odd')
  })

  it('自动解压 gzip 瓦片', () => {
    const raw = pointTile()
    const gz = gzipSync(raw)
    const result = decodeMvt(gz, { z: 0, x: 0, y: 0 })
    expect(result.gzipped).toBe(true)
    expect(result.features).toHaveLength(1)
    expect(result.warnings.map((w) => w.code)).toContain('gzip')
  })

  it('空输入、损坏 protobuf、无图层分别报对应错误', () => {
    expect(() => decodeMvt(new Uint8Array())).toThrowError(MvtError)
    try {
      decodeMvt(new Uint8Array())
    } catch (error) {
      expect((error as MvtError).code).toBe('empty')
    }

    try {
      decodeMvt(new Uint8Array([0x1a, 0x05, 0x01]))
    } catch (error) {
      expect((error as MvtError).code).toBe('protobuf')
    }

    try {
      decodeMvt(new Uint8Array([0x08, 0x01]))
    } catch (error) {
      expect((error as MvtError).code).toBe('no-layers')
    }
  })

  it('瓦片编号越界时报 tile-range', () => {
    try {
      decodeMvt(pointTile(), { z: 0, x: 0, y: 1 })
    } catch (error) {
      expect((error as MvtError).code).toBe('tile-range')
    }
    expect(isValidTile({ z: 3, x: 7, y: 7 })).toBe(true)
    expect(isValidTile({ z: 3, x: 8, y: 0 })).toBe(false)
  })
})

describe('Base64 与文件名', () => {
  it('标准 base64 与 data URL 前缀都能解码', () => {
    const bytes = pointTile()
    const base64 = Buffer.from(bytes).toString('base64')
    expect([...mvtFromBase64(base64)]).toEqual([...bytes])
    expect([...mvtFromBase64(`data:application/x-protobuf;base64,${base64}`)]).toEqual([...bytes])
  })

  it('base64url 与换行也能解码', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0x00, 0x10])
    const url = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    const wrapped = `${url.slice(0, 4)}\n${url.slice(4)}`
    expect([...mvtFromBase64(wrapped)]).toEqual([...bytes])
  })

  it('非法 base64 明确报错', () => {
    try {
      mvtFromBase64('!!!!')
    } catch (error) {
      expect((error as MvtError).code).toBe('base64')
    }
    try {
      mvtFromBase64('   ')
    } catch (error) {
      expect((error as MvtError).code).toBe('empty')
    }
  })

  it('从常见文件名推断 z/x/y', () => {
    expect(tileFromFileName('14_4823_6160.pbf')).toEqual({ z: 14, x: 4823, y: 6160 })
    expect(tileFromFileName('14/4823/6160.mvt')).toEqual({ z: 14, x: 4823, y: 6160 })
    expect(tileFromFileName('14-4823-6160.pbf.gz')).toEqual({ z: 14, x: 4823, y: 6160 })
    expect(tileFromFileName('tile.pbf')).toBeNull()
    expect(tileFromFileName('3_8_0.pbf')).toBeNull()
  })
})