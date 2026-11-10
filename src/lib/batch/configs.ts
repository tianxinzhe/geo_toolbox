/**
 * FR-13：4 个工具的批量配置。
 *
 * 每个配置只描述「需要哪些列 / 产出哪些列 / 每行怎么算」，
 * 不含任何 UI 或 CSV 解析逻辑。
 */

import {
  formatAxisValue,
  parseCoordinatePair,
  type SourceFormat,
  type TargetFormat
} from '../coord/pairFormat'
import { encode as encodeGeohash } from '../coord/geohash'
import { createTransform } from '../crs/engine'
import type { BatchConfig, BatchRow } from './types'
import { BatchError } from './types'

const LAT_ALIASES = ['lat', 'latitude', '纬度', '緯度', 'y', 'wgs84lat']
const LNG_ALIASES = ['lng', 'lon', 'long', 'longitude', '经度', '經度', 'x', 'wgs84lng']

function num(row: BatchRow, key: string): number {
  const raw = (row[key] ?? '').trim().replace(/\s/g, '')
  if (raw === '') throw new BatchError('missing-value')
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new BatchError('invalid-number')
  return n
}

function fixed(n: number, digits = 6): string {
  if (!Number.isFinite(n)) throw new BatchError('not-finite')
  return String(Number(n.toFixed(digits)))
}

function requireText(row: BatchRow, key: string): string {
  const v = (row[key] ?? '').trim()
  if (v === '') throw new BatchError('missing-value')
  return v
}

const t01: BatchConfig = {
  slug: 'coord-convert',
  columns: [
    { key: 'lng', labelKey: 'batch.col.lng', aliases: LNG_ALIASES, required: true },
    { key: 'lat', labelKey: 'batch.col.lat', aliases: LAT_ALIASES, required: true }
  ],
  // WGS84 与 CGCS2000 在实用精度内等值，批量模式只做范围校验与数值规范化
  outputs: [
    { key: 'out_lng', labelKey: 'batch.out.lng' },
    { key: 'out_lat', labelKey: 'batch.out.lat' }
  ],
  options: [],
  async prepare() {
    return {
      run(row) {
        const lng = num(row, 'lng')
        const lat = num(row, 'lat')
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
          throw new BatchError('convert-failed')
        }
        return { out_lng: fixed(lng, 8), out_lat: fixed(lat, 8) }
      }
    }
  }
}

const t02: BatchConfig = {
  slug: 'dms-decimal',
  // 与单点模式一致：经纬度放在同一列，整串读取（`116.3974, 39.9088`）
  columns: [
    {
      key: 'coord',
      labelKey: 'batch.col.coord',
      aliases: [
        'coord',
        'coordinate',
        'coordinates',
        '坐标',
        '经纬度',
        'lnglat',
        'lonlat',
        'latlng',
        'position',
        'location',
        '位置'
      ],
      required: true
    }
  ],
  outputs: [
    { key: 'out_lng', labelKey: 'batch.out.lng' },
    { key: 'out_lat', labelKey: 'batch.out.lat' }
  ],
  options: [
    {
      key: 'sourceFormat',
      labelKey: 'batch.opt.sourceFormat',
      type: 'select',
      defaultValue: 'auto',
      primary: true,
      choices: [
        { value: 'auto', labelKey: 'batch.format.auto' },
        { value: 'decimal', labelKey: 'batch.format.decimal' },
        { value: 'dm', labelKey: 'batch.format.dm' },
        { value: 'dms', labelKey: 'batch.format.dms' }
      ]
    },
    {
      key: 'targetFormat',
      labelKey: 'batch.opt.targetFormat',
      type: 'select',
      defaultValue: 'decimal',
      primary: true,
      choices: [
        { value: 'decimal', labelKey: 'batch.format.decimal' },
        { value: 'dm', labelKey: 'batch.format.dm' },
        { value: 'dms', labelKey: 'batch.format.dms' }
      ]
    },
    {
      key: 'precision',
      labelKey: 'batch.opt.coordPrecision',
      type: 'number',
      defaultValue: '6'
    }
  ],
  async prepare(options) {
    const source = (options.sourceFormat ?? 'auto') as SourceFormat
    // 批量的目标格式只提供符号式度分秒：文本式是本地化写法，不适合数据文件
    const target: TargetFormat =
      options.targetFormat === 'dm'
        ? 'dm'
        : options.targetFormat === 'dms'
          ? 'dms-symbolic'
          : 'decimal'
    const digits = Math.min(12, Math.max(0, Math.round(Number(options.precision) || 6)))

    return {
      run(row) {
        const r = parseCoordinatePair(requireText(row, 'coord'), {
          source,
          commaAs: 'auto'
        })
        if (!r.ok) throw new BatchError('invalid-coord')
        return {
          out_lng: formatAxisValue(r.lng, 'lng', target, digits),
          out_lat: formatAxisValue(r.lat, 'lat', target, digits)
        }
      }
    }
  }
}

const t03: BatchConfig = {
  slug: 'epsg-convert',
  columns: [
    { key: 'x', labelKey: 'batch.col.x', aliases: ['x', 'easting', 'east', '东坐标'], required: true },
    { key: 'y', labelKey: 'batch.col.y', aliases: ['y', 'northing', 'north', '北坐标'], required: true }
  ],
  outputs: [
    { key: 'out_x', labelKey: 'batch.out.outX' },
    { key: 'out_y', labelKey: 'batch.out.outY' }
  ],
  options: [
    { key: 'fromId', labelKey: 'batch.opt.fromEpsg', type: 'text', defaultValue: '4326' },
    { key: 'toId', labelKey: 'batch.opt.toEpsg', type: 'text', defaultValue: '3857' }
  ],
  async prepare(options) {
    const from = (options.fromId ?? '4326').trim().replace(/^EPSG:/i, '')
    const to = (options.toId ?? '3857').trim().replace(/^EPSG:/i, '')
    const tr = await createTransform(from, to)
    return {
      run(row) {
        const [x, y] = tr.forward(num(row, 'x'), num(row, 'y'))
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new BatchError('convert-failed')
        return { out_x: fixed(x), out_y: fixed(y) }
      }
    }
  }
}

const t08: BatchConfig = {
  slug: 'geohash',
  columns: [
    { key: 'lng', labelKey: 'batch.col.lng', aliases: LNG_ALIASES, required: true },
    { key: 'lat', labelKey: 'batch.col.lat', aliases: LAT_ALIASES, required: true }
  ],
  outputs: [{ key: 'geohash', labelKey: 'batch.out.geohash' }],
  options: [
    { key: 'precision', labelKey: 'batch.opt.precision', type: 'number', defaultValue: '7' }
  ],
  async prepare(options) {
    const precision = Math.min(12, Math.max(1, Math.round(Number(options.precision) || 7)))
    return {
      run(row) {
        return { geohash: encodeGeohash(num(row, 'lng'), num(row, 'lat'), precision) }
      }
    }
  }
}

export const BATCH_CONFIGS: Record<string, BatchConfig> = {
  'coord-convert': t01,
  'dms-decimal': t02,
  'epsg-convert': t03,
  geohash: t08
}
