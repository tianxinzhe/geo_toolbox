import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'

import { tableFromMatrix } from '../../src/lib/batch/pipeline'
import { readXlsxMatrix } from '../../src/lib/batch/xlsx'

function workbookBytes(rows: unknown[][], sheetName = 'Data'): Uint8Array {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName)
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
}

describe('XLSX 导入（P1）', () => {
  it('读取第一个工作表并保留标准数字写法', async () => {
    const bytes = workbookBytes([
      ['name', 'lng', 'lat'],
      ['A', 116.3974, 39.9088],
      ['B', 121.4737, 31.2304]
    ])
    const result = await readXlsxMatrix(bytes)

    expect(result.sheetName).toBe('Data')
    expect(result.matrix).toEqual([
      ['name', 'lng', 'lat'],
      ['A', '116.3974', '39.9088'],
      ['B', '121.4737', '31.2304']
    ])
  })

  it('日期单元格转成 YYYY-MM-DD', async () => {
    const bytes = workbookBytes([
      ['name', 'date'],
      ['A', new Date(2026, 2, 4)]
    ])
    const result = await readXlsxMatrix(bytes)
    expect(result.matrix[1][1]).toBe('2026-03-04')
  })

  it('空工作簿明确报错', async () => {
    const bytes = workbookBytes([[]])
    await expect(readXlsxMatrix(bytes)).rejects.toThrow('xlsx-empty')
  })

  it('矩阵复用 CSV 的表头与行规则', () => {
    const table = tableFromMatrix(
      [
        ['lng', 'lat', 'lng'],
        ['116.3974', '39.9088', '116.4']
      ],
      { hasHeader: true }
    )
    expect(table.headers).toEqual(['lng', 'lat', 'lng_2'])
    expect(table.rows[0]).toEqual({ lng: '116.3974', lat: '39.9088', lng_2: '116.4' })
  })

  it('无表头时使用 col1、col2 命名', () => {
    const table = tableFromMatrix([['1', '2']], { hasHeader: false })
    expect(table.headers).toEqual(['col1', 'col2'])
    expect(table.rows[0]).toEqual({ col1: '1', col2: '2' })
  })
})