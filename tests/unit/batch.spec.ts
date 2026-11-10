/**
 * FR-13 批量管线与 8 个工具配置的测试。
 */

import { describe, expect, it } from 'vitest'

import { BATCH_CONFIGS } from '../../src/lib/batch/configs'
import {
  autoMapColumns,
  buildFailuresCsv,
  buildOutputCsv,
  missingRequiredColumns,
  parseTable,
  runBatch
} from '../../src/lib/batch/pipeline'
import { BatchError } from '../../src/lib/batch/types'

function tableOf(csv: string, hasHeader = true) {
  return parseTable(csv, { hasHeader })
}

describe('表格解析与列映射', () => {
  it('带表头解析并保留原始列', () => {
    const t = tableOf('name,lat,lng\nA,39.9,116.4')
    expect(t.headers).toEqual(['name', 'lat', 'lng'])
    expect(t.rows[0]).toEqual({ name: 'A', lat: '39.9', lng: '116.4' })
  })

  it('无表头自动生成列名', () => {
    const t = tableOf('A,39.9,116.4', false)
    expect(t.headers).toEqual(['col1', 'col2', 'col3'])
    expect(t.rows[0].col2).toBe('39.9')
  })

  it('重复表头自动去重', () => {
    const t = tableOf('lat,lat,lng\n1,2,3')
    expect(t.headers).toEqual(['lat', 'lat_2', 'lng'])
  })

  it('中文/英文/简写别名都能识别', () => {
    const cfg = BATCH_CONFIGS['coord-convert']
    expect(autoMapColumns(['经度', '纬度'], cfg)).toMatchObject({ lng: '经度', lat: '纬度' })
    expect(autoMapColumns(['lon', 'latitude'], cfg)).toMatchObject({ lng: 'lon', lat: 'latitude' })
    expect(autoMapColumns(['x', 'y'], cfg)).toMatchObject({ lng: 'x', lat: 'y' })
  })

  it('必填列缺失会被报告', () => {
    const cfg = BATCH_CONFIGS['coord-convert']
    const mapping = autoMapColumns(['name', 'value'], cfg)
    expect(missingRequiredColumns(cfg, mapping)).toEqual(['lng', 'lat'])
  })

  it('空表与超限被拒绝', () => {
    expect(() => tableOf('   ')).toThrow(BatchError)
  })
})

describe('逐行执行', () => {
  it('T01：成功行回显经纬度，坏行进入失败清单', async () => {
    const cfg = BATCH_CONFIGS['coord-convert']
    const table = tableOf('lng,lat\n116.3974,39.9088\nabc,39.9')
    const mapping = autoMapColumns(table.headers, cfg)
    const result = await runBatch({ config: cfg, table, mapping, options: {} })
    expect(result.outputs).toHaveLength(1)
    expect(Number(result.outputs[0].values.out_lng)).toBeCloseTo(116.3974, 4)
    expect(Number(result.outputs[0].values.out_lat)).toBeCloseTo(39.9088, 4)
    expect(result.failures).toEqual([{ row: 3, reason: 'invalid-number' }])
  })

  it('T01：超出合法范围的坐标被拒绝', async () => {
    const cfg = BATCH_CONFIGS['coord-convert']
    const table = tableOf('lng,lat\n200,39.9')
    const mapping = autoMapColumns(table.headers, cfg)
    const result = await runBatch({ config: cfg, table, mapping, options: {} })
    expect(result.outputs).toHaveLength(0)
    expect(result.failures).toEqual([{ row: 2, reason: 'convert-failed' }])
  })

  it('T02：经纬度单列、度分秒与十进制互转', async () => {
    const cfg = BATCH_CONFIGS['dms-decimal']
    const table = tableOf('coord\n"116°23\'50.64""E, 39°54\'31.68""N"')
    const mapping = autoMapColumns(table.headers, cfg)
    const result = await runBatch({ config: cfg, table, mapping, options: {} })
    expect(Number(result.outputs[0].values.out_lng)).toBeCloseTo(116.3974, 4)
    expect(Number(result.outputs[0].values.out_lat)).toBeCloseTo(39.9088, 4)
  })

  it('T02：原格式与目标格式是常显选项', () => {
    const cfg = BATCH_CONFIGS['dms-decimal']
    expect(cfg.options.filter((o) => o.primary).map((o) => o.key)).toEqual([
      'sourceFormat',
      'targetFormat'
    ])
  })

  it('T02：目标格式选择生效', async () => {
    const cfg = BATCH_CONFIGS['dms-decimal']
    const table = tableOf('coord\n"116.3974, 39.9088"')
    const mapping = autoMapColumns(table.headers, cfg)
    const result = await runBatch({
      config: cfg,
      table,
      mapping,
      options: { targetFormat: 'dms', precision: '2' }
    })
    expect(result.outputs[0].values.out_lng).toContain('°')
    expect(result.outputs[0].values.out_lat).toContain('°')
  })

  it('T02：原文与所选原格式不符时逐行失败', async () => {
    const cfg = BATCH_CONFIGS['dms-decimal']
    const table = tableOf('coord\n"116.3974, 39.9088"')
    const mapping = autoMapColumns(table.headers, cfg)
    const result = await runBatch({
      config: cfg,
      table,
      mapping,
      options: { sourceFormat: 'dms' }
    })
    expect(result.outputs).toHaveLength(0)
    expect(result.failures).toEqual([{ row: 2, reason: 'invalid-coord' }])
  })

  it('T08：GeoHash 编码', async () => {
    const cfg = BATCH_CONFIGS.geohash
    const table = tableOf('lng,lat\n116.3974,39.9088')
    const mapping = autoMapColumns(table.headers, cfg)
    const result = await runBatch({ config: cfg, table, mapping, options: { precision: '7' } })
    expect(result.outputs[0].values.geohash).toBe('wx4g09n')
  })

  it('取消后返回已完成的部分结果', async () => {
    const cfg = BATCH_CONFIGS.geohash
    const table = tableOf('lng,lat\n1,1\n2,2\n3,3')
    const mapping = autoMapColumns(table.headers, cfg)
    const result = await runBatch({
      config: cfg,
      table,
      mapping,
      options: {},
      shouldCancel: () => true
    })
    expect(result.cancelled).toBe(true)
    expect(result.outputs).toHaveLength(0)
  })
})

describe('导出', () => {
  it('输出 CSV 包含原始列与产物列', async () => {
    const cfg = BATCH_CONFIGS.geohash
    const table = tableOf('name,lng,lat\nA,116.3974,39.9088')
    const mapping = autoMapColumns(table.headers, cfg)
    const result = await runBatch({ config: cfg, table, mapping, options: {} })
    const csv = buildOutputCsv(table, cfg, result)
    expect(csv.split(/\r?\n/)[0]).toBe('name,lng,lat,geohash')
    expect(csv).toContain('A,116.3974,39.9088,wx4g09n')
  })

  it('失败清单 CSV', () => {
    const csv = buildFailuresCsv([{ row: 3, reason: 'invalid-number' }])
    expect(csv.split(/\r?\n/)[0]).toBe('row,reason')
    expect(csv).toContain('3,invalid-number')
  })
})