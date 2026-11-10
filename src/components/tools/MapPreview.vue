<script setup lang="ts">
/**
 * T15 地图速览
 *
 * 本地文件 → 统一解析成 FeatureCollection → Leaflet 叠加显示。
 * 支持一次选择多个文件：每个文件独立解析、独立删除，地图上合并叠加。
 * Leaflet 只认 GeoJSON，因此 KML / Shapefile / Excel 等格式都在这里
 * 复用 T06 的解析层先转成 GeoJSON；解析失败时允许手动指定格式重试。
 *
 * 全客户端处理，文件不上传；解析器与二进制格式的依赖都走动态 import，
 * 未选文件时不会下载。
 */

import { computed, ref, shallowReactive } from 'vue'

import { DEFAULT_VIEW, type Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import { fmt } from '../../lib/coord/format'
import { FORMAT_LABEL, type VectorFeatureCollection, type VectorFormat } from '../../lib/convert/types'
import MapCanvas from '../map/MapCanvas.vue'

interface Props {
  lang: Lang
  ui: ToolUi & Record<string, string>
  toolId: string
}

interface LoadedFile {
  id: number
  name: string
  bytes: Uint8Array
  /** 用户在左栏手动指定的格式；auto = 自动识别 */
  format: VectorFormat | 'auto'
  collection: VectorFeatureCollection | null
  detectedFormat: VectorFormat | ''
  featureCount: number
  typeCounts: Array<[string, number]>
  issueCount: number
  warningCount: number
  errorKey: string
  loading: boolean
  /** 解析序号：重新解析时丢弃上一次的异步结果 */
  seq: number
}

const props = defineProps<Props>()

/** 与 lib/convert/format.ts 的 FILE_LIMIT_BYTES 保持一致（单文件上限） */
const MAX_BYTES = 20 * 1024 * 1024
/** 与 lib/convert/format.ts 的 FEATURE_LIMIT 保持一致（单文件上限） */
const MAX_FEATURES = 50_000

const ACCEPT =
  '.geojson,.json,.topojson,.kml,.kmz,.gpx,.csv,.tsv,.txt,.xlsx,.xls,.gml,.dxf,.gmt,.mif,.mid,.wkt,.zip,.shp,.fgb,.gpkg'

const FORMATS = Object.keys(FORMAT_LABEL) as VectorFormat[]
/** 这些格式必须按字节解析，不能先解码成文本 */
const BINARY_FORMATS: VectorFormat[] = ['kmz', 'xlsx', 'shapefile', 'fgb', 'gpkg']
const BINARY_EXT = new Set(['kmz', 'xlsx', 'xls', 'zip', 'shp', 'fgb', 'gpkg'])

const fileInput = ref<HTMLInputElement | null>(null)
const files = ref<LoadedFile[]>([])

let nextId = 1

const mapCenter = computed<[number, number]>(() => {
  const view = DEFAULT_VIEW[props.lang]
  return [view.center[1], view.center[0]]
})

const mapZoom = computed(() => DEFAULT_VIEW[props.lang].zoom)

/** 所有解析成功的文件合并成一个 FeatureCollection 交给地图 */
const merged = computed<VectorFeatureCollection | null>(() => {
  const loaded = files.value.filter((entry) => entry.collection !== null)
  if (loaded.length === 0) return null
  if (loaded.length === 1) return loaded[0].collection
  return {
    type: 'FeatureCollection',
    features: loaded.flatMap((entry) => entry.collection!.features)
  }
})

const totalFeatures = computed(() =>
  files.value.reduce((sum, entry) => sum + entry.featureCount, 0)
)

function msg(key: string, vars: Record<string, string | number> = {}): string {
  let text = props.ui[key] ?? key
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

function countText(value: number): string {
  return fmt(value, props.lang, 'measure', 0)
}

function formatText(entry: LoadedFile): string {
  return entry.detectedFormat ? FORMAT_LABEL[entry.detectedFormat] : '—'
}

function typeText(counts: Array<[string, number]>): string {
  return counts.length > 0
    ? counts.map(([type, count]) => `${type} ×${countText(count)}`).join(' · ')
    : '—'
}

function openPicker(): void {
  fileInput.value?.click()
}

function clearAll(): void {
  files.value = []
}

function removeFile(target: LoadedFile): void {
  files.value = files.value.filter((entry) => entry !== target)
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

/** 强制指定格式时按格式判断，否则看扩展名 */
function isBinary(name: string, forced: VectorFormat | null): boolean {
  if (forced) return BINARY_FORMATS.includes(forced)
  return BINARY_EXT.has(extOf(name))
}

function countTypes(entry: LoadedFile, next: VectorFeatureCollection): void {
  const counts = new Map<string, number>()
  for (const feature of next.features) {
    const type = feature.geometry?.type ?? 'null'
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  entry.typeCounts = [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function resetEntry(entry: LoadedFile): void {
  entry.collection = null
  entry.detectedFormat = ''
  entry.featureCount = 0
  entry.typeCounts = []
  entry.issueCount = 0
  entry.warningCount = 0
}

async function parseFile(entry: LoadedFile): Promise<void> {
  const run = ++entry.seq
  entry.loading = true
  entry.errorKey = ''
  resetEntry(entry)

  try {
    const mod = await import('../../lib/convert/format')
    if (run !== entry.seq) return

    if (entry.bytes.length === 0) {
      entry.errorKey = 'tool.map-preview.errEmptyFile'
      return
    }

    const forced = entry.format === 'auto' ? null : entry.format
    const binary = isBinary(entry.name, forced)
    const text = binary ? '' : mod.decodeBytes(entry.bytes)

    if (!binary && text.trim() === '') {
      entry.errorKey = 'tool.map-preview.errEmptyFile'
      return
    }

    // 自动识别不到就明确报错，并让用户在文件行内手动指定格式
    if (!forced && !binary && !mod.detectFormat(text, entry.name)) {
      entry.errorKey = 'tool.map-preview.errUnknownFormat'
      return
    }

    const outcome = await mod.parseFileInput(text, {
      fileName: entry.name,
      // MIF 的纯文本文件不能按字节解析，只有 zip 打包的 MIF/MID 才传字节
      bytes:
        binary || (forced === 'mif' && extOf(entry.name) === 'zip') ? entry.bytes : undefined,
      // 二进制容器（KMZ / XLSX / Shapefile 等）由 parseFileInput 按显式格式走字节分支，
      // 自动识别时用扩展名补上这个格式，避免落到文本分支报 needs-file
      source: forced ?? (binary ? mod.detectFormat('', entry.name) || 'auto' : 'auto')
    })
    if (run !== entry.seq) return

    if (outcome.collection.features.length === 0) {
      entry.errorKey = 'tool.map-preview.errNoCoords'
      return
    }
    if (outcome.collection.features.length > MAX_FEATURES) {
      entry.errorKey = 'tool.map-preview.errTooMany'
      return
    }

    entry.collection = outcome.collection
    entry.detectedFormat = outcome.format
    entry.featureCount = outcome.collection.features.length
    entry.issueCount = outcome.issues.length
    entry.warningCount = outcome.warnings.length
    countTypes(entry, outcome.collection)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'unknown-format') {
      entry.errorKey = 'tool.map-preview.errUnknownFormat'
    } else if (message.includes('crs') || message.includes('coordinate')) {
      entry.errorKey = 'tool.map-preview.errCoordRange'
    } else {
      entry.errorKey = 'tool.map-preview.errParse'
    }
  } finally {
    if (run === entry.seq) entry.loading = false
  }
}

async function onFilesPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  // 清空 value，保证同一个文件再次选择也能触发 change
  input.value = ''

  for (const file of picked) {
    const entry = shallowReactive<LoadedFile>({
      id: nextId++,
      name: file.name,
      bytes: new Uint8Array(0),
      format: 'auto',
      collection: null,
      detectedFormat: '',
      featureCount: 0,
      typeCounts: [],
      issueCount: 0,
      warningCount: 0,
      errorKey: '',
      loading: false,
      seq: 0
    })
    files.value = [...files.value, entry]

    if (file.size > MAX_BYTES) {
      entry.errorKey = 'tool.map-preview.errTooLarge'
      continue
    }

    try {
      entry.bytes = new Uint8Array(await file.arrayBuffer())
      await parseFile(entry)
    } catch {
      entry.errorKey = 'tool.map-preview.errRead'
    }
  }
}

function onFormatChange(entry: LoadedFile): void {
  if (entry.bytes.length > 0) void parseFile(entry)
}
</script>

<template>
  <form class="dv" @submit.prevent>
    <div class="dv__layout">
      <div class="dv__panel">
        <div class="dv__card">
          <p class="result-title">{{ ui['tool.map-preview.fileTitle'] }}</p>
          <div class="dv__row">
            <button type="button" class="btn btn--primary dv__choose" @click="openPicker">
              {{
                files.length > 0
                  ? ui['tool.map-preview.addFile']
                  : ui['tool.map-preview.chooseFile']
              }}
            </button>
            <input
              ref="fileInput"
              class="visually-hidden"
              type="file"
              multiple
              :accept="ACCEPT"
              @change="onFilesPicked"
            />
          </div>
          <p class="hint">{{ ui['tool.map-preview.formatHint'] }}</p>
          <p class="hint">{{ ui['tool.map-preview.supported'] }}</p>
        </div>

        <div class="dv__card">
          <div class="dv__head">
            <p class="result-title">{{ ui['tool.map-preview.dataTitle'] }}</p>
            <button v-if="files.length > 0" type="button" class="btn btn--ghost" @click="clearAll">
              {{ ui['tool.map-preview.clearData'] }}
            </button>
          </div>

          <p v-if="files.length > 0" class="dv__summary">
            <span>{{ msg('tool.map-preview.fileCount', { n: countText(files.length) }) }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ msg('tool.map-preview.totalFeatures', { n: countText(totalFeatures) }) }}</span>
          </p>

          <ul v-if="files.length > 0" class="dv__files">
            <li v-for="entry in files" :key="entry.id" class="dv__file">
              <div class="dv__file-head">
                <span class="dv__name mono">{{ entry.name }}</span>
                <button
                  type="button"
                  class="dv__remove"
                  :aria-label="ui['tool.map-preview.removeFile']"
                  :title="ui['tool.map-preview.removeFile']"
                  @click="removeFile(entry)"
                >
                  ×
                </button>
              </div>

              <label class="dv__field">
                <span>{{ ui['tool.map-preview.formatLabel'] }}</span>
                <select
                  v-model="entry.format"
                  :disabled="entry.loading"
                  @change="onFormatChange(entry)"
                >
                  <option value="auto">{{ ui['tool.map-preview.formatAuto'] }}</option>
                  <option v-for="format in FORMATS" :key="format" :value="format">
                    {{ FORMAT_LABEL[format] }}
                  </option>
                </select>
              </label>

              <p v-if="entry.loading" class="hint" role="status">
                {{ ui['tool.map-preview.loading'] }}
              </p>
              <p v-else-if="entry.errorKey" class="note note--danger" role="alert">
                {{ ui[entry.errorKey] ?? entry.errorKey }}
              </p>
              <template v-else-if="entry.collection">
                <dl class="dv__stats">
                  <div>
                    <dt>{{ ui['tool.map-preview.statFormat'] }}</dt>
                    <dd class="mono">{{ formatText(entry) }}</dd>
                  </div>
                  <div>
                    <dt>{{ ui['tool.map-preview.statFeatures'] }}</dt>
                    <dd class="mono">{{ countText(entry.featureCount) }}</dd>
                  </div>
                  <div>
                    <dt>{{ ui['tool.map-preview.statTypes'] }}</dt>
                    <dd>{{ typeText(entry.typeCounts) }}</dd>
                  </div>
                  <div v-if="entry.issueCount > 0">
                    <dt>{{ ui['tool.map-preview.statIssues'] }}</dt>
                    <dd class="mono">
                      {{ msg('tool.map-preview.issuesValue', { n: countText(entry.issueCount) }) }}
                    </dd>
                  </div>
                </dl>
                <p v-if="entry.warningCount > 0" class="hint">
                  {{ msg('tool.map-preview.warnings', { n: countText(entry.warningCount) }) }}
                </p>
              </template>
            </li>
          </ul>
          <p v-else class="hint">{{ ui['tool.map-preview.empty'] }}</p>
        </div>
      </div>

      <div class="dv__map-col">
        <MapCanvas
          :center="mapCenter"
          :zoom="mapZoom"
          :geojson="merged"
          :fit="true"
          :drag-prompt="ui['common.mapDragPrompt']"
          :loading-text="ui['common.mapLoading']"
          :tile-error-text="ui['common.mapTileError']"
          :basemap-label="ui['common.basemap']"
          :basemap-street="ui['common.basemapStreet']"
          :basemap-satellite="ui['common.basemapSatellite']"
          :basemap-terrain="ui['common.basemapTerrain']"
        />
      </div>
    </div>
  </form>
</template>

<style scoped>
.dv {
  font-size: 13px;
}

/* 左操作、右地图：桌面上不用滚动就能看到数据落点 */
.dv__layout {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  align-items: start;
  gap: var(--sp-4);
}

.dv__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-inline-size: 0;
}

.dv__map-col {
  min-inline-size: 0;
  position: sticky;
  top: var(--sp-3);
}

/* 地图的 aspect-ratio + min-height 会反推出最小宽度，移动端需要允许收缩 */
.dv__map-col :deep(.map-shell) {
  min-inline-size: 0;
}

.dv .hint {
  font-size: 12px;
  margin: 0;
}

.dv__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg-sub);
}

.dv__card .result-title {
  margin: 0;
  font-size: 13px;
}

.dv__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}

.dv__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.dv__choose {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.dv__field {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.dv__field select {
  flex: 1 1 auto;
  min-inline-size: 0;
  font-size: 13px;
}

.dv__summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0;
  font-size: var(--fs-label);
  color: var(--ink-2);
}

/* 文件列表：每个文件一张小卡，名称 + 删除按钮在首行，格式下拉与统计在下方 */
.dv__files {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.dv__file {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-inline-size: 0;
  padding: var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg);
}

.dv__file-head {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
}

.dv__name {
  flex: 1 1 auto;
  min-inline-size: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.dv__remove {
  flex: 0 0 auto;
  inline-size: 28px;
  block-size: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--bg-sub);
  color: var(--ink-2);
  font-family: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.dv__remove:hover {
  border-color: var(--err);
  color: var(--err);
}

.dv__remove:focus-visible {
  outline: 2px solid var(--acc);
  outline-offset: 1px;
}

.dv__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: var(--sp-2);
  margin: 0;
}

.dv__stats div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.dv__stats dt {
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.dv__stats dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.note {
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  margin: 0;
  color: var(--ink-2);
}

.note--danger {
  color: var(--err);
  font-weight: 600;
}

@media (max-width: 900px) {
  .dv__layout {
    grid-template-columns: 1fr;
  }

  .dv__map-col {
    position: static;
    order: -1;
  }
}
</style>