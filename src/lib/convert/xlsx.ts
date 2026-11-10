/**
 * XLSX 读写（T06）。
 *
 * 读取复用批量工具的 SheetJS 入口，再把矩阵交给 CSV 解析器 ——
 * 这样「经纬度列识别、手动选列、空行规则」与 CSV 完全一致，不会出现两套行为。
 *
 * 写出不引入 SheetJS：只需要一个工作表，用 fflate 直接拼最小 OOXML，
 * 避免把 500 KB 的 xlsx chunk 带进每个格式转换页面。
 */

import Papa from 'papaparse'
import { strToU8, zipSync } from 'fflate'

import { collectionToCsv, parseCsv, type CsvParseOutcome } from './csv'
import type { CsvParseOptions, VectorFeatureCollection } from './types'

/** XLSX → 点要素；列识别失败时照常抛 CsvColumnsError，供 UI 展示列选择器 */
export async function parseXlsxInput(
  bytes: Uint8Array,
  opts: CsvParseOptions = {}
): Promise<CsvParseOutcome> {
  const { readXlsxMatrix } = await import('../batch/xlsx')
  const { matrix } = await readXlsxMatrix(bytes)
  if (matrix.length === 0) throw new Error('xlsx-empty')
  return parseCsv(Papa.unparse(matrix), opts)
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 0 → A，25 → Z，26 → AA */
function columnName(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

const NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

function cellXml(ref: string, value: string): string {
  const t = value ?? ''
  if (t !== '' && NUMBER_RE.test(t) && Number.isFinite(Number(t))) {
    return `<c r="${ref}"><v>${t}</v></c>`
  }
  if (t === '') return ''
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(t)}</t></is></c>`
}

/**
 * 表头 + 行矩阵 → XLSX 字节（单工作表 Sheet1）。
 *
 * 纯数字单元格写成数值，其余写成内联字符串；
 * 供格式转换与只需要「一张表」的工具共用，避免第二套 OOXML 拼装逻辑。
 */
export function matrixToXlsx(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[]
): Uint8Array {
  const matrix: (string | number)[][] = [[...headers], ...rows.map((row) => [...row])]

  const sheetRows = matrix
    .map((row, r) => {
      const cells = row
        .map((v, c) => cellXml(`${columnName(c)}${r + 1}`, String(v ?? '')))
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`

  return zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rootRels),
      'xl/workbook.xml': strToU8(workbook),
      'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
      'xl/styles.xml': strToU8(styles),
      'xl/worksheets/sheet1.xml': strToU8(sheet)
    },
    { level: 6 }
  )
}

/**
 * 要素集合 → XLSX 字节。
 *
 * 列结构与 CSV 输出保持一致：纯点数据是 lng / lat + 属性列，
 * 含非点几何时退化为 wkt + 属性列。
 */
export function collectionToXlsx(
  fc: VectorFeatureCollection,
  digits = 7
): Uint8Array {
  const csv = collectionToCsv(fc, digits)
  const rows = Papa.parse<string[]>(csv, { skipEmptyLines: 'greedy' }).data
  return matrixToXlsx(rows[0] ?? [], rows.slice(1))
}