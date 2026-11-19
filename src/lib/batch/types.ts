/**
 * FR-13 批量管线的共享类型。
 *
 * 6 个工具各自只提供「输入列 → 输出列 → 逐行计算」的配置，
 * 解析、列映射、试算、进度、取消、失败清单与 CSV 导出全部共用一套管线。
 */

export type BatchRow = Record<string, string>
export type BatchOptions = Record<string, string>

export interface BatchColumn {
  /** 逻辑键，作为 runner 读 row 的键，不直接等于 CSV 表头 */
  key: string
  labelKey: string
  /** 自动识别表头时使用的别名（已归一化比较） */
  aliases: string[]
  required?: boolean
}

export interface BatchOutput {
  key: string
  labelKey: string
}

export interface BatchOptionChoice {
  value: string
  labelKey: string
}

export interface BatchOption {
  key: string
  labelKey: string
  type: 'select' | 'number' | 'text'
  defaultValue: string
  choices?: BatchOptionChoice[]
  hintKey?: string
  /**
   * 常显选项：直接展示在批量面板中，不放进「选项」折叠区。
   * 用于决定整列解析/输出规则的选项，例如 T02 的原格式与目标格式。
   */
  primary?: boolean
}

export interface BatchRunner {
  run(row: BatchRow): BatchRow | Promise<BatchRow>
}

export interface BatchConfig {
  slug: string
  columns: BatchColumn[]
  outputs: BatchOutput[]
  options: BatchOption[]
  /** 只执行一次：加载 EPSG 定义、初始化投影等 */
  prepare(options: BatchOptions): Promise<BatchRunner>
}

/** PRD FR-13：首期接入的计算类工具 */
export const BATCH_SLUGS = new Set([
  'dms-decimal',
  'epsg-convert',
  'geohash'
])

export interface BatchFailure {
  /** 数据行号：含表头时从 2 开始，无表头时从 1 开始 */
  row: number
  reason: string
}

export interface BatchRunResult {
  outputs: { row: BatchRow; values: BatchRow }[]
  failures: BatchFailure[]
  cancelled: boolean
}

export class BatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BatchError'
  }
}