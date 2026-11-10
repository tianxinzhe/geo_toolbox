/**
 * XLSX 导入（P1 / OQ-17）。
 *
 * SheetJS 只在用户真正选择 .xlsx 时才动态加载，不进入首屏包。
 * 读取规则：
 *   - 只读第一个工作表（PRD FR-13「上传区预留格式扩展点」）；
 *   - 日期单元格转成 YYYY-MM-DD，避免序列号泄漏到列映射；
 *   - 数值保持标准小数写法，不加千分位（SR-11 导出规则）。
 */

export interface XlsxSheet {
  sheetName: string
  matrix: string[][]
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
    if (value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0) {
      return date
    }
    return `${date} ${pad(value.getHours())}:${pad(value.getMinutes())}`
  }
  return String(value)
}

export async function readXlsxMatrix(bytes: Uint8Array): Promise<XlsxSheet> {
  let XLSX: typeof import('xlsx')
  try {
    XLSX = await import('xlsx')
  } catch {
    throw new Error('xlsx-load-failed')
  }

  let book: import('xlsx').WorkBook
  try {
    book = XLSX.read(bytes, { type: 'array', cellDates: true })
  } catch {
    throw new Error('xlsx-parse-failed')
  }

  const sheetName = book.SheetNames[0]
  if (!sheetName) throw new Error('xlsx-empty')
  const sheet = book.Sheets[sheetName]
  if (!sheet) throw new Error('xlsx-empty')

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false
  })

  const matrix = raw.map((row) => (Array.isArray(row) ? row.map(cellText) : []))
  if (matrix.every((row) => row.every((c) => c.trim() === ''))) {
    throw new Error('xlsx-empty')
  }
  return { sheetName, matrix }
}