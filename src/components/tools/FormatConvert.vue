<script setup lang="ts">
/**
 * T06 矢量格式转换（PRD 6.2 / FR-07）
 *
 * 交互状态机（FR-07）：
 *   待选择 → 解析中 → 解析完成（摘要 + 问题清单 + 目标格式）
 *          → 转换完成（预览 + 下载）｜ 部分成功（GPX 不支持面）
 *          → 解析失败（保留上一份成功数据）
 *
 * 关键规则：
 *   ① 文件只在当前标签页内存中读取，不上传、不写入本地存储；
 *   ② 目标格式不支持某几何时不静默丢弃，先让用户明确选择「跳过」；
 *   ③ 解析失败不清空上一份成功结果（除非用户重新选择了新文件）；
 *   ④ 同格式提交等同「格式化 + 校验」，并明确说明。
 */

import { computed, reactive, ref, watch } from 'vue'

import type { Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import {
  FEATURE_LIMIT,
  FILE_LIMIT_BYTES,
  PASTE_LIMIT,
  PREVIEW_FEATURES,
  PREVIEW_LINES,
  decodeBytes,
  parseFileInput,
  serializeCollectionAsync,
  summarize,
  validateCollection,
  type CollectionSummary
} from '../../lib/convert/format'
import {
  CsvColumnsError,
  UnsupportedGeometryError,
  type CsvColumnInfo,
  type FeatureIssue,
  type ParseOutcome,
  type SerializeOutcome,
  type VectorFormat
} from '../../lib/convert/types'
import { FORMAT_LABEL, OUTPUT_FORMATS } from '../../lib/convert/types'
import CopyButton from '../ui/CopyButton.vue'

interface Props {
  lang: Lang
  ui: ToolUi & Record<string, string>
  toolId: string
}

const props = defineProps<Props>()

const ACCEPT =
  '.geojson,.json,.kml,.kmz,.gpx,.csv,.tsv,.xlsx,.xls,.gml,.dxf,.gmt,.mif,.mid,.topojson,.wkt,.txt,.zip,.fgb,.gpkg'

/** 可作为输入的格式；顺序即下拉框顺序 */
const SOURCE_FORMATS: readonly VectorFormat[] = [
  'geojson',
  'topojson',
  'kml',
  'kmz',
  'gpx',
  'csv',
  'tsv',
  'xlsx',
  'gml',
  'dxf',
  'gmt',
  'mif',
  'wkt',
  'shapefile',
  'fgb',
  'gpkg'
]

const ERROR_KEYS: Record<string, string> = {
  'invalid-json': 'tool.format-convert.errInvalidJson',
  'invalid-geojson': 'tool.format-convert.errInvalidGeojson',
  'invalid-topojson': 'tool.format-convert.errInvalidTopojson',
  'invalid-xml': 'tool.format-convert.errInvalidXml',
  'invalid-kmz': 'tool.format-convert.errInvalidKmz',
  'kmz-no-kml': 'tool.format-convert.errKmzNoKml',
  'kmz-needs-file': 'tool.format-convert.errKmzNeedsFile',
  'unknown-format': 'tool.format-convert.errUnknownFormat',
  'dom-unavailable': 'tool.format-convert.errDom',
  'invalid-shapefile-zip': 'tool.format-convert.errShapefileZip',
  'shapefile-no-shp': 'tool.format-convert.errShapefileNoShp',
  'shapefile-parse-failed': 'tool.format-convert.errShapefileParse',
  'shapefile-load-failed': 'tool.format-convert.errShapefileParse',
  'shapefile-needs-file': 'tool.format-convert.errShapefileParse',
  'shapefile-empty': 'tool.format-convert.errShapefileEmpty',
  'xlsx-empty': 'tool.format-convert.errXlsx',
  'xlsx-needs-file': 'tool.format-convert.errXlsx',
  'invalid-gml': 'tool.format-convert.errInvalidGml',
  'invalid-dxf': 'tool.format-convert.errInvalidDxf',
  'invalid-mif': 'tool.format-convert.errInvalidMif',
  'invalid-fgb': 'tool.format-convert.errInvalidFgb',
  'fgb-needs-file': 'tool.format-convert.errFgbNeedsFile',
  'fgb-empty': 'tool.format-convert.errNoFeatures',
  'invalid-gpkg': 'tool.format-convert.errInvalidGpkg',
  'gpkg-needs-file': 'tool.format-convert.errGpkgNeedsFile',
  'gpkg-empty': 'tool.format-convert.errNoFeatures',
  'gpkg-no-feature-table': 'tool.format-convert.errGpkgNoLayer'
}

const ISSUE_KEYS: Record<string, string> = {
  'empty-geometry': 'tool.format-convert.issueEmpty',
  'out-of-range': 'tool.format-convert.issueRange',
  'unclosed-ring': 'tool.format-convert.issueRing',
  'invalid-geometry': 'tool.format-convert.issueInvalid',
  'csv-row-skipped': 'tool.format-convert.issueRow'
}

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

const mode = ref<'file' | 'paste'>('file')
/** 源格式：'auto' 按内容/文件名识别，其余强制按所选格式解析 */
const source = ref<'auto' | VectorFormat>('auto')
const fileName = ref('')
const fileBytes = ref<Uint8Array | null>(null)
const encoding = ref('utf-8')
const text = ref('')
const target = ref<VectorFormat>('geojson')

const parsed = ref<ParseOutcome | null>(null)
const summary = ref<CollectionSummary | null>(null)
const issues = ref<FeatureIssue[]>([])
const parseError = ref('')
const parseDetail = ref('')

const csvInfo = ref<CsvColumnInfo | null>(null)
const csvLat = ref('')
const csvLng = ref('')

const result = ref<SerializeOutcome | null>(null)
const resultError = ref('')
const unsupported = ref<{ count: number; types: string[] } | null>(null)

const dragActive = ref(false)

const options = reactive({
  indent: true,
  digits: 7,
  removeEmpty: false,
  gpxAttrs: 'name-desc' as 'name-desc' | 'name',
  skipUnsupported: false
})

/* ------------------------------------------------------------------ *
 * 派生
 * ------------------------------------------------------------------ */

const hasInput = computed(() =>
  mode.value === 'file' ? fileBytes.value !== null : text.value.trim() !== ''
)

const inputFormat = computed(() => parsed.value?.format ?? '')

const targetOptions = computed(() =>
  OUTPUT_FORMATS.map((f) => ({
    value: f,
    label: FORMAT_LABEL[f]
  }))
)

const isBinary = computed(() => Boolean(result.value?.bytes))

/** 二进制输出的说明文案（页面内无法预览） */
const BINARY_NOTE_KEYS: Partial<Record<VectorFormat, string>> = {
  xlsx: 'tool.format-convert.xlsxBinaryNote',
  mif: 'tool.format-convert.mifBinaryNote',
  kmz: 'tool.format-convert.kmzBinaryNote',
  shapefile: 'tool.format-convert.shapefileBinaryNote',
  fgb: 'tool.format-convert.fgbBinaryNote',
  gpkg: 'tool.format-convert.gpkgBinaryNote'
}

const binaryNote = computed(
  () =>
    props.ui[BINARY_NOTE_KEYS[target.value] ?? 'tool.format-convert.shapefileBinaryNote'] ?? ''
)

const sameFormat = computed(() => parsed.value !== null && parsed.value.format === target.value)

const previewLines = computed(() => {
  if (!result.value) return []
  const lines = result.value.text.split('\n')
  return lines.slice(0, PREVIEW_LINES)
})

const previewTruncated = computed(() => {
  if (!result.value) return false
  return result.value.text.split('\n').length > PREVIEW_LINES
})

const featurePreview = computed(() => {
  if (!parsed.value) return []
  return parsed.value.collection.features.slice(0, PREVIEW_FEATURES).map((f, i) => ({
    index: i,
    type: f.geometry?.type ?? '—',
    name: String(f.properties.name ?? f.properties.Name ?? '')
  }))
})

const detectedLabel = computed(() =>
  inputFormat.value ? inputFormat.value.toUpperCase() : ''
)

/* ------------------------------------------------------------------ *
 * 文件 / 粘贴
 * ------------------------------------------------------------------ */

function errorText(err: unknown, fallbackKey: string): string {
  const msg = err instanceof Error ? err.message : ''
  const key = ERROR_KEYS[msg] ?? fallbackKey
  return props.ui[key] ?? props.ui[fallbackKey]
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

/** 解析/序列化警告码 → 文案；未知码原样显示（便于排查） */
function warningText(code: string): string {
  if (code === 'skipped-null-geometry') return props.ui['tool.format-convert.warnNullGeometry']
  if (code === 'shapefile-prj') return props.ui['tool.format-convert.warnShapefilePrj']
  if (code === 'shapefile-no-prj') return props.ui['tool.format-convert.warnShapefileNoPrj']
  if (code.startsWith('shapefile-multi-layer:')) {
    return props.ui['tool.format-convert.warnShapefileMulti'].replace(
      '{count}',
      code.slice('shapefile-multi-layer:'.length)
    )
  }
  if (code.startsWith('shapefile-skipped-geometry:')) {
    return props.ui['tool.format-convert.warnShapefileSkipped'].replace(
      '{count}',
      code.slice('shapefile-skipped-geometry:'.length)
    )
  }
  if (code.startsWith('shapefile-fields-dropped:')) {
    return props.ui['tool.format-convert.warnShapefileFieldsDropped'].replace(
      '{count}',
      code.slice('shapefile-fields-dropped:'.length)
    )
  }
  if (code === 'shapefile-field-renamed') return props.ui['tool.format-convert.warnShapefileFieldRenamed']
  if (code === 'dxf-crs-unknown') return props.ui['tool.format-convert.warnDxfCrs']
  if (code.startsWith('dxf-attrs-dropped:')) {
    return props.ui['tool.format-convert.warnDxfAttrs'].replace(
      '{count}',
      code.slice('dxf-attrs-dropped:'.length)
    )
  }
  if (code.startsWith('gmt-holes-dropped:')) {
    return props.ui['tool.format-convert.warnGmtHoles'].replace(
      '{count}',
      code.slice('gmt-holes-dropped:'.length)
    )
  }
  if (code.startsWith('gml-crs:')) {
    return props.ui['tool.format-convert.warnGmlCrs'].replace(
      '{crs}',
      code.slice('gml-crs:'.length)
    )
  }
  if (code === 'mif-empty') return props.ui['tool.format-convert.warnMifEmpty']
  if (code.startsWith('mif-row-mismatch:')) {
    const [, objects, rows] = code.split(':')
    return props.ui['tool.format-convert.warnMifRows']
      .replace('{objects}', objects)
      .replace('{rows}', rows)
  }
  if (code.startsWith('fgb-attrs-stringified:')) {
    return props.ui['tool.format-convert.warnFgbAttrs'].replace(
      '{count}',
      code.slice('fgb-attrs-stringified:'.length)
    )
  }
  if (code.startsWith('gpkg-multi-layer:')) {
    return props.ui['tool.format-convert.warnGpkgMulti'].replace(
      '{count}',
      code.slice('gpkg-multi-layer:'.length)
    )
  }
  if (code.startsWith('gpkg-crs:')) {
    return props.ui['tool.format-convert.warnGpkgCrs'].replace(
      '{srid}',
      code.slice('gpkg-crs:'.length)
    )
  }
  if (code.startsWith('gpkg-geometry-skipped:')) {
    return props.ui['tool.format-convert.warnGpkgGeometrySkipped'].replace(
      '{count}',
      code.slice('gpkg-geometry-skipped:'.length)
    )
  }
  if (code.startsWith('gpkg-empty-geometry:')) {
    return props.ui['tool.format-convert.warnGpkgEmptyGeometry'].replace(
      '{count}',
      code.slice('gpkg-empty-geometry:'.length)
    )
  }
  return code
}

function loadFile(file: File): void {
  if (file.size > FILE_LIMIT_BYTES) {
    parseError.value = props.ui[ 'tool.format-convert.errFileSize']
      .replace('{size}', formatBytes(file.size))
      .replace('{limit}', formatBytes(FILE_LIMIT_BYTES))
    return
  }
  mode.value = 'file'
  text.value = ''
  fileName.value = file.name
  void file.arrayBuffer().then((buf) => {
    fileBytes.value = new Uint8Array(buf)
    parseError.value = ''
    void run()
  })
}

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) loadFile(file)
  input.value = ''
}

function onDrop(e: DragEvent): void {
  dragActive.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) loadFile(file)
}

function switchMode(next: 'file' | 'paste'): void {
  if (next === mode.value) return
  mode.value = next
  if (next === 'file') {
    text.value = ''
  } else {
    fileBytes.value = null
    fileName.value = ''
  }
  parsed.value = null
  summary.value = null
  result.value = null
  issues.value = []
  parseError.value = ''
  csvInfo.value = null
  unsupported.value = null
}

/* ------------------------------------------------------------------ *
 * 解析 → 转换
 * ------------------------------------------------------------------ */

let parseKey = ''
let lastFormat = ''
let pinnedTarget = false
let seq = 0

function currentText(): string | null {
  if (mode.value === 'file') {
    if (!fileBytes.value) return null
    // KMZ / ZIP / XLSX / FGB / GPKG 是二进制容器，交给各自的解析器，不先解码
    if (/\.(kmz|zip|xlsx?|fgb|gpkg)$/i.test(fileName.value)) return ''
    return decodeBytes(fileBytes.value, encoding.value)
  }
  return text.value
}

async function run(): Promise<void> {
  const token = ++seq
  if (!hasInput.value) {
    parsed.value = null
    summary.value = null
    issues.value = []
    result.value = null
    parseError.value = ''
    return
  }

  const raw = currentText()
  if (raw === null) return

  if (mode.value === 'paste' && raw.length > PASTE_LIMIT) {
    parseError.value = props.ui['tool.format-convert.errPasteLimit'].replace(
      '{limit}',
      String(PASTE_LIMIT)
    )
    return
  }

  const key = `${mode.value}|${source.value}|${fileName.value}|${fileBytes.value?.length ?? 0}|${encoding.value}|${csvLat.value}|${csvLng.value}|${raw}`
  if (key === parseKey && parsed.value) {
    void serialize()
    return
  }

  try {
    const outcome = await parseFileInput(raw, {
      fileName: mode.value === 'file' ? fileName.value : undefined,
      bytes: fileBytes.value ?? undefined,
      encoding: encoding.value,
      source: source.value,
      csv: { latColumn: csvLat.value || undefined, lngColumn: csvLng.value || undefined }
    })
    if (token !== seq) return

    if (outcome.collection.features.length > FEATURE_LIMIT) {
      parseError.value = props.ui['tool.format-convert.errFeatureLimit']
        .replace('{count}', String(outcome.collection.features.length))
        .replace('{limit}', String(FEATURE_LIMIT))
      return
    }

    parsed.value = outcome
    summary.value = summarize(outcome.collection)
    issues.value = [...outcome.issues, ...validateCollection(outcome.collection)]
    parseError.value =
      outcome.collection.features.length === 0
        ? props.ui['tool.format-convert.errNoFeatures']
        : ''
    parseDetail.value = ''
    csvInfo.value = null
    csvLat.value = ''
    csvLng.value = ''
    parseKey = key
    if (outcome.collection.features.length === 0) return

    // 输入格式变化时给一个合理的目标格式，避免用户刚选好的目标被每次编辑重置
    if (!pinnedTarget && outcome.format !== lastFormat) {
      target.value = outcome.format === 'geojson' ? 'kml' : 'geojson'
      lastFormat = outcome.format
    }
    pinnedTarget = false
    options.skipUnsupported = false
    void serialize()
  } catch (e) {
    if (token !== seq) return
    if (e instanceof CsvColumnsError) {
      if (e.headers.length === 0) {
        parseError.value = props.ui['tool.format-convert.errCsvEmpty']
      } else {
        csvInfo.value = { headers: e.headers }
        parseError.value = props.ui['tool.format-convert.errCsvColumns']
      }
      return
    }
    parseError.value = errorText(e, 'tool.format-convert.errParse')
    parseDetail.value = e instanceof Error ? e.message : ''
  }
}

let serializeSeq = 0

async function serialize(): Promise<void> {
  if (!parsed.value) return
  const token = ++serializeSeq
  resultError.value = ''
  unsupported.value = null
  try {
    const outcome = await serializeCollectionAsync(parsed.value.collection, {
      target: target.value,
      indent: options.indent,
      digits: Math.min(12, Math.max(0, Math.round(options.digits))),
      removeEmpty: options.removeEmpty,
      gpxAttrs: options.gpxAttrs,
      skipUnsupported: options.skipUnsupported
    })
    // FGB / GPKG 要等依赖加载，期间用户可能又改了目标格式
    if (token !== serializeSeq) return
    result.value = outcome
  } catch (e) {
    if (token !== serializeSeq) return
    result.value = null
    if (e instanceof UnsupportedGeometryError) {
      unsupported.value = { count: e.count, types: e.types }
      return
    }
    resultError.value = errorText(e, 'tool.format-convert.errSerialize')
  }
}

function skipUnsupported(): void {
  options.skipUnsupported = true
  void serialize()
}

function pickCsvColumns(): void {
  if (!csvInfo.value) return
  void run()
}

/* ------------------------------------------------------------------ *
 * 偏好 / 防抖
 * ------------------------------------------------------------------ */

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  [mode, source, encoding, text, target, () => ({ ...options }), csvLat, csvLng],
  () => {
    clearTimeout(timer)
    timer = setTimeout(() => void run(), 300)
  }
)

function download(): void {
  if (!result.value) return
  const now = new Date()
  const p = (n: number) => (n < 10 ? `0${n}` : String(n))
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
  const body = result.value.bytes
    ? ([result.value.bytes] as unknown as BlobPart[])
    : [`${result.value.text}\n`]
  const blob = new Blob(body, {
    type: result.value.mime
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `format-convert-${stamp}.${result.value.extension}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <form class="t06" @submit.prevent>
    <!-- 输入方式切换 -->
    <div class="mode-row">
      <button
        type="button"
        class="btn"
        :class="mode === 'file' ? 'btn--primary' : 'btn--ghost'"
        @click="switchMode('file')"
      >
        {{ ui['tool.format-convert.modeFile'] }}
      </button>
      <button
        type="button"
        class="btn"
        :class="mode === 'paste' ? 'btn--primary' : 'btn--ghost'"
        @click="switchMode('paste')"
      >
        {{ ui['tool.format-convert.modePaste'] }}
      </button>
    </div>

    <p class="hint">{{ ui['tool.format-convert.privacyNote'] }}</p>

    <!-- 源格式 / 目标格式：始终可见，先选格式再给数据，避免长文件传完才发现读错 -->
    <div class="row format-row">
      <div class="field field--small">
        <label for="t06-source">{{ ui['tool.format-convert.sourceLabel'] }}</label>
        <select id="t06-source" v-model="source">
          <option value="auto">{{ ui['tool.format-convert.sourceAuto'] }}</option>
          <option v-for="f in SOURCE_FORMATS" :key="f" :value="f">{{ FORMAT_LABEL[f] }}</option>
        </select>
      </div>

      <div class="field field--small">
        <label for="t06-target">{{ ui['tool.format-convert.targetLabel'] }}</label>
        <select id="t06-target" v-model="target">
          <option v-for="o in targetOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>
    </div>

    <!-- 文件上传 -->
    <div v-if="mode === 'file'" class="upload">
      <div
        class="dropzone"
        :class="{ 'dropzone--active': dragActive }"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="onDrop"
      >
        <p class="dropzone__title">{{ ui['tool.format-convert.dropTitle'] }}</p>
        <p class="hint">{{ ui['tool.format-convert.dropHint'] }}</p>
        <p class="hint">{{ ui['tool.format-convert.shapefileHint'] }}</p>
        <label class="btn btn--secondary">
          {{ fileName ? ui['tool.format-convert.replaceFile'] : ui['tool.format-convert.chooseFile'] }}
          <input class="sr-only" type="file" :accept="ACCEPT" @change="onPick" />
        </label>
        <p v-if="fileName" class="file-name mono">{{ fileName }}</p>
      </div>

      <div class="field field--small">
        <label for="t06-encoding">{{ ui['tool.format-convert.encoding'] }}</label>
        <select id="t06-encoding" v-model="encoding">
          <option value="utf-8">{{ ui['tool.format-convert.encUtf8'] }}</option>
          <option value="gbk">{{ ui['tool.format-convert.encGbk'] }}</option>
        </select>
      </div>
      <p class="hint">{{ ui['tool.format-convert.limitHint'] }}</p>
    </div>

    <!-- 粘贴 -->
    <div v-else class="field">
      <label for="t06-paste">{{ ui['tool.format-convert.pasteLabel'] }}</label>
      <textarea
        id="t06-paste"
        v-model="text"
        class="mono paste"
        rows="8"
        spellcheck="false"
        :placeholder="ui['tool.format-convert.pastePlaceholder']"
      ></textarea>
      <span class="field__hint">{{ ui['tool.format-convert.pasteHint'] }}</span>
    </div>

    <!-- CSV 列选择 -->
    <div v-if="csvInfo" class="field csv-columns">
      <p class="note note--warn">{{ ui['tool.format-convert.errCsvColumns'] }}</p>
      <div class="row">
        <div class="field field--small">
          <label for="t06-lat">{{ ui['tool.format-convert.csvLat'] }}</label>
          <select id="t06-lat" v-model="csvLat" @change="pickCsvColumns">
            <option value="">{{ ui['tool.format-convert.csvChoose'] }}</option>
            <option v-for="h in csvInfo.headers" :key="`lat-${h}`" :value="h">{{ h }}</option>
          </select>
        </div>
        <div class="field field--small">
          <label for="t06-lng">{{ ui['tool.format-convert.csvLng'] }}</label>
          <select id="t06-lng" v-model="csvLng" @change="pickCsvColumns">
            <option value="">{{ ui['tool.format-convert.csvChoose'] }}</option>
            <option v-for="h in csvInfo.headers" :key="`lng-${h}`" :value="h">{{ h }}</option>
          </select>
        </div>
      </div>
    </div>

    <p v-if="parseError" class="note note--warn" role="alert">
      {{ parseError }}
      <span v-if="parseDetail" class="mono">（{{ parseDetail }}）</span>
    </p>

    <!-- 解析摘要 -->
    <output v-if="summary && parsed" class="summary" aria-live="polite">
      <p class="result-title">
        {{ ui['tool.format-convert.parsedTitle'] }} ·
        <span class="mono">{{ detectedLabel }}</span>
      </p>
      <div class="stats">
        <span>{{ ui['tool.format-convert.summaryCount'].replace('{count}', String(summary.count)) }}</span>
        <span>{{ ui['tool.format-convert.summaryVertices'].replace('{count}', String(summary.vertices)) }}</span>
      </div>
      <p v-if="Object.keys(summary.types).length" class="hint">
        {{ ui['tool.format-convert.summaryTypes'] }}:
        <span class="mono">{{ Object.entries(summary.types).map(([t, n]) => `${t} × ${n}`).join(' · ') }}</span>
      </p>
      <p v-if="summary.properties.length" class="hint">
        {{ ui['tool.format-convert.summaryProps'] }}:
        <span class="mono">{{ summary.properties.join(' · ') }}</span>
      </p>

      <p v-if="!parsed.crsDeclared" class="note note--warn">
        {{ ui['tool.format-convert.crsWarning'] }}
      </p>

      <ul v-if="parsed.warnings.length" class="warnings">
        <li v-for="(w, i) in parsed.warnings" :key="`pw${i}`" class="hint">
          {{ warningText(w) }}
        </li>
      </ul>

      <details v-if="issues.length" class="issues" open>
        <summary>{{ ui['tool.format-convert.issuesTitle'].replace('{count}', String(issues.length)) }}</summary>
        <ul>
          <li v-for="(issue, i) in issues.slice(0, 30)" :key="i">
            {{ ui['tool.format-convert.issueFeature'].replace('{index}', String(issue.feature + 1)) }}
            <template v-if="issue.code === 'out-of-range'">
              — {{ ui[ISSUE_KEYS[issue.code]] }}
            </template>
            <template v-else-if="issue.code === 'unclosed-ring'">
              — {{ ui[ISSUE_KEYS[issue.code]] }}
            </template>
            <template v-else>
              — {{ ui[ISSUE_KEYS[issue.code]] }}
            </template>
          </li>
        </ul>
      </details>

      <details v-if="featurePreview.length" class="issues">
        <summary>{{ ui['tool.format-convert.featurePreview'] }}</summary>
        <table class="preview">
          <thead>
            <tr>
              <th>{{ ui['tool.format-convert.colIndex'] }}</th>
              <th>{{ ui['tool.format-convert.colType'] }}</th>
              <th>{{ ui['tool.format-convert.colName'] }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in featurePreview" :key="f.index">
              <td>{{ f.index + 1 }}</td>
              <td class="mono">{{ f.type }}</td>
              <td>{{ f.name }}</td>
            </tr>
          </tbody>
        </table>
      </details>

      <!-- 源格式与目标格式相同：不是错误，但要让用户知道这是一次「格式化 + 校验」 -->
      <p v-if="sameFormat" class="hint">{{ ui['tool.format-convert.sameFormatNote'] }}</p>

      <details class="advanced">
        <summary>{{ ui['common.advanced'] }}</summary>
        <label class="check">
          <input v-model="options.indent" type="checkbox" />
          <span>{{ ui['tool.format-convert.optIndent'] }}</span>
        </label>
        <div class="field field--small">
          <label for="t06-digits">{{ ui['tool.format-convert.optDigits'] }}</label>
          <input id="t06-digits" v-model.number="options.digits" type="number" min="0" max="12" step="1" />
        </div>
        <label class="check">
          <input v-model="options.removeEmpty" type="checkbox" />
          <span>{{ ui['tool.format-convert.optRemoveEmpty'] }}</span>
        </label>
        <div class="field field--small">
          <label for="t06-gpx">{{ ui['tool.format-convert.optGpxAttrs'] }}</label>
          <select id="t06-gpx" v-model="options.gpxAttrs">
            <option value="name-desc">{{ ui['tool.format-convert.gpxAttrsDesc'] }}</option>
            <option value="name">{{ ui['tool.format-convert.gpxAttrsName'] }}</option>
          </select>
        </div>
      </details>
    </output>

    <!-- GPX 不支持几何时的明确选择 -->
    <div v-if="unsupported" class="note note--warn block">
      <p>
        {{
          ui['tool.format-convert.unsupportedBody']
            .replace('{count}', String(unsupported.count))
            .replace('{types}', unsupported.types.join(' · '))
        }}
      </p>
      <div class="btn-row">
        <button type="button" class="btn btn--primary" @click="skipUnsupported">
          {{ ui['tool.format-convert.unsupportedSkip'] }}
        </button>
        <button type="button" class="btn btn--ghost" @click="unsupported = null; target = 'geojson'">
          {{ ui['tool.format-convert.unsupportedCancel'] }}
        </button>
      </div>
    </div>

    <p v-if="resultError" class="note note--warn" role="alert">{{ resultError }}</p>

    <!-- 转换结果 -->
    <template v-if="result && (result.text || result.bytes)">
      <p class="result-title">
        {{ ui['tool.format-convert.resultTitle'] }} ·
        <span class="mono">{{ FORMAT_LABEL[target] }}</span>
      </p>

      <pre v-if="result.text" class="output mono">{{ previewLines.join('\n') }}</pre>
      <p v-else class="note note--dim">
        {{ binaryNote }}
      </p>
      <p v-if="result.text && previewTruncated" class="hint">
        {{ ui['tool.format-convert.previewLimited'].replace('{lines}', String(PREVIEW_LINES)) }}
      </p>

      <p v-for="(w, i) in result.warnings" :key="`rw${i}`" class="note note--warn">
        {{ warningText(w) }}
      </p>

      <div class="btn-row">
        <CopyButton
          v-if="!isBinary"
          :text="result.text"
          :label="ui['common.copy']"
          :success-label="ui['common.copied']"
          :fail-label="ui['common.copyFailed']"
          variant="secondary"
        />
        <button type="button" class="btn btn--primary" @click="download">
          {{ ui['common.download'] }}
        </button>
      </div>
    </template>

    <div v-if="!hasInput && !parseError" class="empty-state">
      <p>{{ ui['tool.format-convert.emptyTitle'] }}</p>
      <p>{{ ui['tool.format-convert.emptyBody'] }}</p>
    </div>
  </form>
</template>

<style scoped>
.t06 {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.mode-row {
  display: flex;
  gap: var(--sp-2);
}

.upload {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-4);
  border: 1px dashed var(--line-strong, var(--line));
  border-radius: var(--r-ctl);
  background: var(--bg-sub);
}

.dropzone--active {
  border-color: var(--accent);
}

.dropzone__title {
  margin: 0;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink);
}

.file-name {
  margin: 0;
  font-size: var(--fs-label);
  overflow-wrap: anywhere;
}

.mono {
  font-family: var(--mono);
}

.sr-only {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.paste {
  font-size: var(--fs-num);
}

.csv-columns {
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
}

.summary {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.result-title {
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
  margin: 0;
  padding-block-end: var(--sp-1);
  border-block-end: 1px solid var(--line);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-4);
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.issues {
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.issues ul {
  margin: var(--sp-1) 0 0;
  padding-inline-start: var(--sp-4);
}

.issues li {
  margin-block-end: var(--sp-1);
}

.preview {
  inline-size: 100%;
  border-collapse: collapse;
  margin-block-start: var(--sp-2);
}

.preview th,
.preview td {
  text-align: start;
  padding: var(--sp-1) var(--sp-2);
  border-block-end: 1px solid var(--line);
}

.advanced {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.check {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.output {
  margin: 0;
  padding: var(--sp-3);
  max-block-size: 360px;
  overflow: auto;
  background: var(--bg-sub);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  white-space: pre;
  tab-size: 2;
}

.block {
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
}

.note {
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
  margin: 0;
}

.note--warn {
  color: var(--warn);
}

.note--dim {
  opacity: 0.85;
}

.hint {
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
  margin: 0;
}
</style>