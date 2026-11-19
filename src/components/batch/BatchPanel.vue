<script setup lang="ts">
/**
 * FR-13 批量处理面板（6 个计算类工具共用）。
 *
 * 放在工具页工具区下方的独立 section，id="batch"：
 *   - 单点模式仍是页面的主内容，批量是并列能力；
 *   - 窄屏隐藏（PRD FR-13），桌面端展开；
 *   - 上传、列映射、试算、执行、失败清单、下载全部本地完成。
 *
 * 管线本身在 src/lib/batch/，组件只负责文件读取与交互状态。
 */

import { computed, onMounted, ref, watch } from 'vue'

import type { Lang } from '../../config/i18n'
import {
  BATCH_LIMITS,
  autoMapColumns,
  buildFailuresCsv,
  buildOutputCsv,
  missingRequiredColumns,
  parseTable,
  runBatch,
  tableFromMatrix,
  type TableData
} from '../../lib/batch/pipeline'
import { BATCH_CONFIGS } from '../../lib/batch/configs'
import { readXlsxMatrix } from '../../lib/batch/xlsx'
import type { BatchOptions, BatchRow, BatchRunResult } from '../../lib/batch/types'
import CopyButton from '../ui/CopyButton.vue'

interface Props {
  lang: Lang
  ui: Record<string, string>
  slug: string
  toolId: string
  /** 是否提供粘贴 CSV/TSV 的入口；个别工具只允许上传文件 */
  allowPaste?: boolean
}

const props = defineProps<Props>()

const config = BATCH_CONFIGS[props.slug]

const text = ref('')
const fileName = ref('')
const fileBytes = ref<Uint8Array | null>(null)
/** XLSX 解析后的矩阵；非空即表示当前数据来自 Excel */
const xlsxMatrix = ref<string[][] | null>(null)
const xlsxLoading = ref(false)
const sheetName = ref('')
const encoding = ref('utf-8')
const hasHeader = ref(true)
const delimiter = ref('')
const bom = ref(true)

const table = ref<TableData | null>(null)
const mapping = ref<Record<string, string>>({})
const optionValues = ref<BatchOptions>({})
const preview = ref<BatchRow[] | null>(null)
const previewFailures = ref(0)
const previewLoading = ref(false)

const errorCode = ref('')
const errorDetail = ref('')
const running = ref(false)
const progress = ref(0)
const cancelFlag = ref(false)
const cancelled = ref(false)
const result = ref<BatchRunResult | null>(null)

const missing = computed(() =>
  config ? missingRequiredColumns(config, mapping.value) : []
)

const isXlsx = computed(() => xlsxMatrix.value !== null || xlsxLoading.value)

const canRun = computed(
  () => table.value !== null && table.value.rows.length > 0 && missing.value.length === 0 && !running.value
)

const outputHeader = computed(() => config?.outputs.map((o) => props.ui[o.labelKey] ?? o.key) ?? [])

/** 常显选项（如 T02 的原/目标格式）与折叠选项分开渲染 */
const primaryOptions = computed(() => config?.options.filter((o) => o.primary) ?? [])
const advancedOptions = computed(() => config?.options.filter((o) => !o.primary) ?? [])

function setError(code: string, detail = ''): void {
  errorCode.value = code
  errorDetail.value = detail
}

function errorText(): string {
  const key = `batch.err.${errorCode.value}`
  const text = props.ui[key]
  return text ?? errorCode.value
}

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder(encoding.value).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function initOptions(): void {
  if (!config) return
  const next: BatchOptions = {}
  for (const o of config.options) next[o.key] = o.defaultValue
  optionValues.value = next
}

function resetResults(): void {
  result.value = null
  preview.value = null
  previewFailures.value = 0
  progress.value = 0
  cancelled.value = false
}

function parseNow(): void {
  // Excel 数据由 applyXlsx 维护，文本解析不能覆盖它（含选择文件后的空文本事件）
  if (xlsxMatrix.value || xlsxLoading.value) return
  resetResults()
  errorCode.value = ''
  errorDetail.value = ''
  if (!config) return
  if (text.value.trim() === '') {
    table.value = null
    return
  }
  if (text.value.length > BATCH_LIMITS.pasteChars) {
    setError('too-large')
    table.value = null
    return
  }
  try {
    const parsed = parseTable(text.value, {
      hasHeader: hasHeader.value,
      delimiter: delimiter.value
    })
    table.value = parsed
    mapping.value = autoMapColumns(parsed.headers, config)
    void refreshPreview()
  } catch (e) {
    setError(e instanceof Error ? e.message : 'parse-failed')
    table.value = null
  }
}

/** XLSX 矩阵 → TableData；切换「首行是表头」时也走这里 */
function applyXlsx(): void {
  if (!config || !xlsxMatrix.value) return
  resetResults()
  errorCode.value = ''
  errorDetail.value = ''
  try {
    const parsed = tableFromMatrix(xlsxMatrix.value, { hasHeader: hasHeader.value })
    table.value = parsed
    mapping.value = autoMapColumns(parsed.headers, config)
    void refreshPreview()
  } catch (e) {
    setError(e instanceof Error ? e.message : 'parse-failed')
    table.value = null
  }
}

function onPickFile(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > BATCH_LIMITS.fileBytes) {
    setError('file-too-large')
    return
  }
  fileName.value = file.name

  // XLSX：懒加载 SheetJS，读第一个工作表
  if (/\.xlsx$/i.test(file.name)) {
    fileBytes.value = null
    text.value = ''
    xlsxMatrix.value = null
    xlsxLoading.value = true
    sheetName.value = ''
    resetResults()
    errorCode.value = ''
    void file.arrayBuffer().then(async (buf) => {
      try {
        const r = await readXlsxMatrix(new Uint8Array(buf))
        xlsxMatrix.value = r.matrix
        sheetName.value = r.sheetName
        applyXlsx()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'xlsx-parse-failed')
        table.value = null
      } finally {
        xlsxLoading.value = false
      }
    })
    return
  }

  xlsxMatrix.value = null
  xlsxLoading.value = false
  sheetName.value = ''
  void file.arrayBuffer().then((buf) => {
    fileBytes.value = new Uint8Array(buf)
    text.value = decode(fileBytes.value)
  })
}

let previewSeq = 0

async function refreshPreview(): Promise<void> {
  if (!config || !table.value || missing.value.length > 0) {
    preview.value = null
    return
  }
  const token = ++previewSeq
  previewLoading.value = true
  try {
    const slice: TableData = {
      ...table.value,
      rows: table.value.rows.slice(0, BATCH_LIMITS.previewRows)
    }
    const r = await runBatch({
      config,
      table: slice,
      mapping: mapping.value,
      options: optionValues.value
    })
    if (token !== previewSeq) return
    preview.value = r.outputs.map((o) => o.values)
    previewFailures.value = r.failures.length
    errorCode.value = ''
  } catch (e) {
    if (token !== previewSeq) return
    preview.value = null
    setError(e instanceof Error ? e.message : 'prepare-failed')
  } finally {
    if (token === previewSeq) previewLoading.value = false
  }
}

async function start(): Promise<void> {
  if (!config || !table.value || !canRun.value) return
  running.value = true
  progress.value = 0
  cancelled.value = false
  cancelFlag.value = false
  errorCode.value = ''
  result.value = null
  try {
    result.value = await runBatch({
      config,
      table: table.value,
      mapping: mapping.value,
      options: optionValues.value,
      onProgress: (r) => {
        progress.value = r
      },
      shouldCancel: () => cancelFlag.value
    })
    cancelled.value = result.value.cancelled
  } catch (e) {
    setError(e instanceof Error ? e.message : 'run-failed')
  } finally {
    running.value = false
  }
}

function cancel(): void {
  cancelFlag.value = true
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function download(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const outputCsv = computed(() => {
  if (!config || !table.value || !result.value) return ''
  return buildOutputCsv(table.value, config, result.value, bom.value)
})

const failuresCsv = computed(() =>
  result.value && result.value.failures.length > 0
    ? buildFailuresCsv(result.value.failures)
    : ''
)

function downloadResult(): void {
  if (outputCsv.value) download(`batch-${props.slug}-${timestamp()}.csv`, outputCsv.value)
}

function downloadFailures(): void {
  if (failuresCsv.value) download(`batch-${props.slug}-failed-${timestamp()}.csv`, failuresCsv.value)
}

function reasonText(code: string): string {
  return props.ui[`batch.err.${code}`] ?? code
}

function clearAll(): void {
  text.value = ''
  fileName.value = ''
  fileBytes.value = null
  xlsxMatrix.value = null
  xlsxLoading.value = false
  sheetName.value = ''
  table.value = null
  resetResults()
  errorCode.value = ''
}

let timer: ReturnType<typeof setTimeout> | undefined
watch([text, hasHeader, delimiter], () => {
  if (xlsxMatrix.value) {
    applyXlsx()
    return
  }
  clearTimeout(timer)
  timer = setTimeout(parseNow, 300)
})

watch([mapping, optionValues], () => {
  clearTimeout(timer)
  timer = setTimeout(() => void refreshPreview(), 300)
}, { deep: true })

watch(encoding, () => {
  if (!xlsxMatrix.value && fileBytes.value) text.value = decode(fileBytes.value)
})

onMounted(() => {
  initOptions()
})
</script>

<template>
  <section v-if="config" id="batch" class="batch-panel" aria-labelledby="batch-title">
    <div class="batch-head">
      <h2 id="batch-title" class="batch-title">{{ ui['batch.title'] }}</h2>
      <span class="batch-badge">{{ ui['batch.desktopOnly'] }}</span>
    </div>
    <p class="hint">{{ ui['batch.lead'] }}</p>

    <div class="upload-row">
      <label class="btn btn--secondary">
        {{ fileName ? ui['batch.replaceFile'] : ui['batch.chooseFile'] }}
        <input
          class="sr-only"
          type="file"
          accept=".csv,.tsv,.txt,.xlsx"
          @change="onPickFile"
        />
      </label>
      <button v-if="fileName" type="button" class="btn btn--ghost" @click="clearAll">
        {{ ui['common.clear'] }}
      </button>
      <span v-if="fileName" class="file-name mono">{{ fileName }}</span>
    </div>

    <p v-if="isXlsx" class="hint">
      {{ ui['batch.xlsxHint'] }}
      <span v-if="sheetName">
        · {{ ui['batch.xlsxSheet'].replace('{name}', sheetName) }}
      </span>
    </p>

    <div v-if="allowPaste !== false" class="field">
      <label for="batch-paste">{{ ui['batch.pasteLabel'] }}</label>
      <textarea
        id="batch-paste"
        v-model="text"
        class="mono"
        rows="4"
        spellcheck="false"
        :placeholder="ui['batch.pastePlaceholder']"
      ></textarea>
      <span class="field__hint">{{ ui['batch.limitHint'] }}</span>
    </div>

    <div class="options-grid">
      <div v-if="!isXlsx" class="field field--small">
        <label for="batch-encoding">{{ ui['batch.encoding'] }}</label>
        <select id="batch-encoding" v-model="encoding">
          <option value="utf-8">{{ ui['batch.encUtf8'] }}</option>
          <option value="gbk">{{ ui['batch.encGbk'] }}</option>
        </select>
      </div>
      <div v-if="!isXlsx" class="field field--small">
        <label for="batch-delimiter">{{ ui['batch.delimiter'] }}</label>
        <select id="batch-delimiter" v-model="delimiter">
          <option value="">{{ ui['batch.delimAuto'] }}</option>
          <option value=",">{{ ui['batch.delimComma'] }}</option>
          <option value="&#9;">{{ ui['batch.delimTab'] }}</option>
          <option value=";">{{ ui['batch.delimSemicolon'] }}</option>
        </select>
      </div>
      <label class="check">
        <input v-model="hasHeader" type="checkbox" />
        <span>{{ ui['batch.hasHeader'] }}</span>
      </label>
      <label class="check">
        <input v-model="bom" type="checkbox" />
        <span>{{ ui['batch.bom'] }}</span>
      </label>
    </div>

    <!-- 常显选项：决定整列解析/输出规则（如 T02 的原格式与目标格式），不藏进折叠区 -->
    <div v-if="primaryOptions.length" class="format-bar">
      <h3 class="sub-title">{{ ui['batch.formatTitle'] }}</h3>
      <div class="mapping-grid">
        <div v-for="opt in primaryOptions" :key="opt.key" class="field field--small">
          <label :for="`batch-opt-${opt.key}`">{{ ui[opt.labelKey] }}</label>
          <select
            v-if="opt.type === 'select'"
            :id="`batch-opt-${opt.key}`"
            v-model="optionValues[opt.key]"
          >
            <option v-for="c in opt.choices" :key="c.value" :value="c.value">
              {{ ui[c.labelKey] }}
            </option>
          </select>
          <input
            v-else
            :id="`batch-opt-${opt.key}`"
            v-model="optionValues[opt.key]"
            :type="opt.type === 'number' ? 'number' : 'text'"
            autocomplete="off"
          />
        </div>
      </div>
    </div>

    <p v-if="errorCode" class="note note--warn" role="alert">
      {{ errorText() }} <span v-if="errorDetail" class="mono">（{{ errorDetail }}）</span>
    </p>
    <p v-if="table && table.warnings.length" class="hint">
      {{ ui['batch.parseWarnings'].replace('{count}', String(table.warnings.length)) }}
    </p>

    <template v-if="table">
      <div class="mapping">
        <h3 class="sub-title">{{ ui['batch.mappingTitle'] }}</h3>
        <p class="hint">{{ ui['batch.mappingHint'] }}</p>
        <div class="mapping-grid">
          <div v-for="col in config.columns" :key="col.key" class="field field--small">
            <label :for="`batch-map-${col.key}`">
              {{ ui[col.labelKey] }}
              <span v-if="col.required !== false" class="req">*</span>
            </label>
            <select :id="`batch-map-${col.key}`" v-model="mapping[col.key]">
              <option value="">{{ ui['batch.notMapped'] }}</option>
              <option v-for="h in table.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
        </div>
        <p v-if="missing.length" class="note note--warn">
          {{ ui['batch.missingColumns'] }}
          <span class="mono">{{ missing.join(', ') }}</span>
        </p>
      </div>

      <details v-if="advancedOptions.length" class="batch-options">
        <summary>{{ ui['batch.optionsTitle'] }}</summary>
        <div class="mapping-grid">
          <div v-for="opt in advancedOptions" :key="opt.key" class="field field--small">
            <label :for="`batch-opt-${opt.key}`">{{ ui[opt.labelKey] }}</label>
            <select
              v-if="opt.type === 'select'"
              :id="`batch-opt-${opt.key}`"
              v-model="optionValues[opt.key]"
            >
              <option v-for="c in opt.choices" :key="c.value" :value="c.value">
                {{ ui[c.labelKey] }}
              </option>
            </select>
            <input
              v-else
              :id="`batch-opt-${opt.key}`"
              v-model="optionValues[opt.key]"
              :type="opt.type === 'number' ? 'number' : 'text'"
              autocomplete="off"
            />
          </div>
        </div>
      </details>

      <div class="preview-block">
        <div class="preview-head">
          <h3 class="sub-title">{{ ui['batch.previewTitle'] }}</h3>
          <span v-if="previewLoading" class="hint">{{ ui['batch.previewLoading'] }}</span>
        </div>
        <table v-if="preview && preview.length" class="data-table">
          <thead>
            <tr>
              <th v-for="h in outputHeader" :key="h">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in preview" :key="i">
              <td v-for="o in config.outputs" :key="o.key" class="mono">{{ row[o.key] }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="!previewLoading" class="hint">{{ ui['batch.previewEmpty'] }}</p>
        <p v-if="previewFailures > 0" class="hint">
          {{ ui['batch.previewFailures'].replace('{count}', String(previewFailures)) }}
        </p>
      </div>

      <div class="run-row">
        <button type="button" class="btn btn--primary" :disabled="!canRun" @click="start">
          {{ running ? ui['batch.running'] : ui['batch.run'] }}
        </button>
        <button v-if="running" type="button" class="btn btn--ghost" @click="cancel">
          {{ ui['batch.cancel'] }}
        </button>
        <span class="hint">
          {{ ui['batch.rowCount'].replace('{count}', String(table.rows.length)) }}
        </span>
      </div>

      <div v-if="running || progress > 0" class="progress">
        <div class="progress__bar" :style="{ inlineSize: `${Math.round(progress * 100)}%` }"></div>
        <span class="progress__text">{{ Math.round(progress * 100) }}%</span>
      </div>

      <p v-if="cancelled" class="note note--warn">{{ ui['batch.cancelled'] }}</p>

      <template v-if="result">
        <div class="result-head">
          <h3 class="sub-title">{{ ui['batch.resultTitle'] }}</h3>
          <span class="hint">
            {{ ui['batch.successCount'].replace('{count}', String(result.outputs.length)) }}
            · {{ ui['batch.failureCount'].replace('{count}', String(result.failures.length)) }}
          </span>
        </div>

        <div class="btn-row">
          <button type="button" class="btn btn--primary" :disabled="!outputCsv" @click="downloadResult">
            {{ ui['batch.download'] }}
          </button>
          <button
            v-if="failuresCsv"
            type="button"
            class="btn btn--ghost"
            @click="downloadFailures"
          >
            {{ ui['batch.downloadFailed'] }}
          </button>
          <CopyButton
            v-if="outputCsv"
            :text="outputCsv"
            :label="ui['common.copy']"
            :success-label="ui['common.copied']"
            :fail-label="ui['common.copyFailed']"
            variant="secondary"
          />
        </div>

        <details v-if="result.failures.length" class="failures">
          <summary>
            {{ ui['batch.failuresTitle'].replace('{count}', String(result.failures.length)) }}
          </summary>
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ ui['batch.colRow'] }}</th>
                <th>{{ ui['batch.colReason'] }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, i) in result.failures.slice(0, 50)" :key="i">
                <td>{{ f.row }}</td>
                <td>{{ reasonText(f.reason) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="result.failures.length > 50" class="hint">
            {{ ui['batch.failuresMore'].replace('{count}', String(result.failures.length - 50)) }}
          </p>
        </details>
      </template>
    </template>

    <p v-else-if="!errorCode && allowPaste !== false" class="empty-state">
      {{ ui['batch.emptyBody'] }}
    </p>
  </section>
</template>

<style scoped>
.batch-panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-block-start: var(--sp-6);
  padding-block-start: var(--sp-4);
  border-block-start: 2px solid var(--line);
}

.batch-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-2);
}

.batch-title {
  margin: 0;
  font-size: var(--fs-h2);
  line-height: var(--lh-h2);
}

.batch-badge {
  font-size: var(--fs-label);
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0 var(--sp-2);
}

.upload-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}

.file-name {
  font-size: var(--fs-label);
  overflow-wrap: anywhere;
}

.mono {
  font-family: var(--mono);
}

.options-grid,
.mapping-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-2) var(--sp-3);
  align-items: end;
}

.check {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--fs-label);
  color: var(--ink-2);
  min-block-size: 32px;
}

.req {
  color: var(--warn);
}

.sub-title {
  margin: 0;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.preview-head,
.result-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-2);
}

.data-table {
  inline-size: 100%;
  border-collapse: collapse;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  overflow-x: auto;
  display: block;
  max-block-size: 260px;
}

.data-table th,
.data-table td {
  text-align: start;
  padding: var(--sp-1) var(--sp-2);
  border-block-end: 1px solid var(--line);
  white-space: nowrap;
}

.run-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}

.progress {
  position: relative;
  block-size: 10px;
  background: var(--bg-sub);
  border: 1px solid var(--line);
  border-radius: 999px;
}

.progress__bar {
  block-size: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: inline-size 120ms linear;
}

.progress__text {
  position: absolute;
  inset-block-start: 12px;
  inset-inline-end: 0;
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.batch-options {
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  padding: var(--sp-2) var(--sp-3);
}

.format-bar {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  padding: var(--sp-2) var(--sp-3);
}

.failures {
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.note {
  margin: 0;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.note--warn {
  color: var(--warn);
}

.hint {
  margin: 0;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.sr-only {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* PRD FR-13：窄屏隐藏批量入口，功能本身仍可用单点模式完成 */
@media (max-width: 767px) {
  .batch-panel {
    display: none;
  }
}
</style>