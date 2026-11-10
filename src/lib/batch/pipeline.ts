/**
 * FR-13 批量管线：CSV/TSV 解析 → 列映射 → 试算 → 逐行执行 → 导出。
 *
 * 为什么分块 + 让出主线程：PRD 要求进度可观察、可取消。这里每 200 行
 * `await` 一次让浏览器有机会绘制进度条；真正的 Web Worker 化仍可在此
 * 接口后替换，调用方无需改动。
 */

import Papa from 'papaparse'

import type {
  BatchConfig,
  BatchFailure,
  BatchOptions,
  BatchRunResult,
  BatchRow
} from './types'
import { BatchError } from './types'

export const BATCH_LIMITS = {
  rows: 50_000,
  fileBytes: 20 * 1024 * 1024,
  pasteChars: 500_000,
  previewRows: 8,
  chunk: 200
} as const

export interface TableData {
  headers: string[]
  rows: BatchRow[]
  hasHeader: boolean
  delimiter: string
  warnings: string[]
}

export interface TableParseOptions {
  hasHeader: boolean
  /** 空串 = 自动探测 */
  delimiter?: string
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_\-()[\]]/g, '')
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((h, i) => {
    const base = h.trim() === '' ? `col${i + 1}` : h.trim()
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base}_${n + 1}`
  })
}

export function parseTable(text: string, opts: TableParseOptions): TableData {
  if (text.trim() === '') throw new BatchError('empty-table')
  if (text.length > BATCH_LIMITS.pasteChars) throw new BatchError('too-large')

  const parsed = Papa.parse<string[]>(text, {
    delimiter: opts.delimiter || undefined,
    skipEmptyLines: 'greedy'
  })
  return tableFromMatrix(
    parsed.data,
    { hasHeader: opts.hasHeader },
    parsed.meta.delimiter || ',',
    parsed.errors.length > 0 ? [`parse-errors:${parsed.errors.length}`] : []
  )
}

/**
 * 二维字符串矩阵 → TableData。
 * CSV/TSV 之外的表格来源（如 XLSX）复用同一套表头/行号规则，
 * 避免「Excel 导入」与「CSV 导入」在列映射阶段出现行为差异。
 */
export function tableFromMatrix(
  matrix: readonly (readonly unknown[])[],
  opts: Pick<TableParseOptions, 'hasHeader'>,
  delimiter = '',
  warnings: string[] = []
): TableData {
  const cleaned = matrix
    .map((r) => r.map((c) => String(c ?? '')))
    .filter((r) => r.some((c) => c.trim() !== ''))
  if (cleaned.length === 0) throw new BatchError('empty-table')

  const headers = opts.hasHeader
    ? uniqueHeaders(cleaned[0].map((c) => c))
    : cleaned[0].map((_, i) => `col${i + 1}`)
  const body = opts.hasHeader ? cleaned.slice(1) : cleaned
  if (body.length > BATCH_LIMITS.rows) throw new BatchError('too-many-rows')

  const rows: BatchRow[] = body.map((cells) => {
    const row: BatchRow = {}
    headers.forEach((h, i) => {
      row[h] = String(cells[i] ?? '').trim()
    })
    return row
  })

  return {
    headers,
    rows,
    hasHeader: opts.hasHeader,
    delimiter,
    warnings
  }
}

/** 根据别名自动匹配列；已匹配过的表头不会被第二个逻辑列复用 */
export function autoMapColumns(
  headers: string[],
  config: BatchConfig
): Record<string, string> {
  const normalized = headers.map((h) => ({ raw: h, key: normalizeHeader(h) }))
  const used = new Set<string>()
  const mapping: Record<string, string> = {}
  for (const col of config.columns) {
    const hit = normalized.find(
      (h) => !used.has(h.raw) && col.aliases.some((a) => normalizeHeader(a) === h.key)
    )
    if (hit) {
      mapping[col.key] = hit.raw
      used.add(hit.raw)
    } else {
      mapping[col.key] = ''
    }
  }
  return mapping
}

export function missingRequiredColumns(
  config: BatchConfig,
  mapping: Record<string, string>
): string[] {
  return config.columns
    .filter((c) => c.required !== false && (mapping[c.key] ?? '') === '')
    .map((c) => c.key)
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export interface RunBatchArgs {
  config: BatchConfig
  table: TableData
  mapping: Record<string, string>
  options: BatchOptions
  onProgress?: (ratio: number) => void
  shouldCancel?: () => boolean
}

export async function runBatch(args: RunBatchArgs): Promise<BatchRunResult> {
  const { config, table, mapping, options } = args
  const missing = missingRequiredColumns(config, mapping)
  if (missing.length > 0) throw new BatchError('missing-columns')

  const runner = await config.prepare(options)
  const outputs: { row: BatchRow; values: BatchRow }[] = []
  const failures: BatchFailure[] = []
  const total = table.rows.length
  const offset = table.hasHeader ? 2 : 1

  for (let i = 0; i < total; i++) {
    if (args.shouldCancel?.()) {
      return { outputs, failures, cancelled: true }
    }
    const source = table.rows[i]
    const mapped: BatchRow = {}
    for (const col of config.columns) {
      mapped[col.key] = source[mapping[col.key]] ?? ''
    }
    try {
      const values = await runner.run(mapped)
      outputs.push({ row: source, values })
    } catch (e) {
      failures.push({
        row: i + offset,
        reason: e instanceof Error ? e.message : 'failed'
      })
    }
    if (i % BATCH_LIMITS.chunk === 0) {
      args.onProgress?.((i + 1) / total)
      await yieldToMain()
    }
  }

  args.onProgress?.(1)
  return { outputs, failures, cancelled: false }
}

/** 导出结果：原始列 + 产物列，只包含成功行 */
export function buildOutputCsv(
  table: TableData,
  config: BatchConfig,
  result: BatchRunResult,
  bom = false
): string {
  const fields = [...table.headers, ...config.outputs.map((o) => o.key)]
  const data = result.outputs.map((o) => [
    ...table.headers.map((h) => o.row[h] ?? ''),
    ...config.outputs.map((out) => o.values[out.key] ?? '')
  ])
  const csv = Papa.unparse({ fields, data })
  return bom ? `\uFEFF${csv}` : csv
}

/** 失败清单：行号 + 原因码 */
export function buildFailuresCsv(failures: readonly BatchFailure[]): string {
  return Papa.unparse({
    fields: ['row', 'reason'],
    data: failures.map((f) => [String(f.row), f.reason])
  })
}