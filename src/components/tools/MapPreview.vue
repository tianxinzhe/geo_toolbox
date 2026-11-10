<script setup lang="ts">
/**
 * T15 地图速览
 *
 * 本地文件 → 统一解析成 FeatureCollection → Leaflet 叠加显示。
 * Leaflet 只认 GeoJSON，因此 KML / Shapefile / Excel 等格式都在这里
 * 复用 T06 的解析层先转成 GeoJSON；解析失败时允许手动指定格式重试。
 *
 * 全客户端处理，文件不上传；解析器与二进制格式的依赖都走动态 import，
 * 未选文件时不会下载。
 */

import { computed, ref, shallowRef } from 'vue'

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

const props = defineProps<Props>()

/** 与 lib/convert/format.ts 的 FILE_LIMIT_BYTES 保持一致 */
const MAX_BYTES = 20 * 1024 * 1024
/** 与 lib/convert/format.ts 的 FEATURE_LIMIT 保持一致 */
const MAX_FEATURES = 50_000

const ACCEPT =
  '.geojson,.json,.topojson,.kml,.kmz,.gpx,.csv,.tsv,.txt,.xlsx,.xls,.gml,.dxf,.gmt,.mif,.mid,.wkt,.zip,.shp,.fgb,.gpkg'

const FORMATS = Object.keys(FORMAT_LABEL) as VectorFormat[]
/** 这些格式必须按字节解析，不能先解码成文本 */
const BINARY_FORMATS: VectorFormat[] = ['kmz', 'xlsx', 'shapefile', 'fgb', 'gpkg']
const BINARY_EXT = new Set(['kmz', 'xlsx', 'xls', 'zip', 'shp', 'fgb', 'gpkg'])

const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const sourceFormat = ref<VectorFormat | 'auto'>('auto')
const bytes = shallowRef<Uint8Array | null>(null)

const collection = ref<VectorFeatureCollection | null>(null)
const detectedFormat = ref<VectorFormat | ''>('')
const featureCount = ref(0)
const typeCounts = ref<Array<[string, number]>>([])
const issueCount = ref(0)
const warningCount = ref(0)

const loading = ref(false)
const errorKey = ref('')

let runId = 0

const mapCenter = computed<[number, number]>(() => {
  const view = DEFAULT_VIEW[props.lang]
  return [view.center[1], view.center[0]]
})

const mapZoom = computed(() => DEFAULT_VIEW[props.lang].zoom)

const formatLabel = computed(() =>
  detectedFormat.value ? FORMAT_LABEL[detectedFormat.value] : '—'
)

const typeSummary = computed(() =>
  typeCounts.value.length > 0
    ? typeCounts.value.map(([type, count]) => `${type} ×${countText(count)}`).join(' · ')
    : '—'
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

function setError(key: string): void {
  errorKey.value = key
}

function resetData(): void {
  collection.value = null
  detectedFormat.value = ''
  featureCount.value = 0
  typeCounts.value = []
  issueCount.value = 0
  warningCount.value = 0
}

function openPicker(): void {
  fileInput.value?.click()
}

function clearAll(): void {
  runId++
  bytes.value = null
  fileName.value = ''
  sourceFormat.value = 'auto'
  errorKey.value = ''
  loading.value = false
  resetData()
  if (fileInput.value) fileInput.value.value = ''
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

/** 强制指定格式时按格式判断，否则看扩展名 */
function isBinary(name: string, forced: VectorFormat | null): boolean {
  if (forced) return BINARY_FORMATS.includes(forced)
  return BINARY_EXT.has(extOf(name))
}

function countTypes(next: VectorFeatureCollection): void {
  const counts = new Map<string, number>()
  for (const feature of next.features) {
    const type = feature.geometry?.type ?? 'null'
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  typeCounts.value = [...counts.entries()].sort((a, b) => b[1] - a[1])
}

async function parse(): Promise<void> {
  const data = bytes.value
  if (!data) return

  const run = ++runId
  loading.value = true
  errorKey.value = ''
  resetData()

  try {
    const mod = await import('../../lib/convert/format')
    if (run !== runId) return

    if (data.length === 0) {
      setError('tool.map-preview.errEmptyFile')
      return
    }

    const forced = sourceFormat.value === 'auto' ? null : sourceFormat.value
    const binary = isBinary(fileName.value, forced)
    const text = binary ? '' : mod.decodeBytes(data)

    if (!binary && text.trim() === '') {
      setError('tool.map-preview.errEmptyFile')
      return
    }

    // 自动识别不到就明确报错，并让用户在左栏手动指定格式
    if (!forced && !binary && !mod.detectFormat(text, fileName.value)) {
      setError('tool.map-preview.errUnknownFormat')
      return
    }

    const outcome = await mod.parseFileInput(text, {
      fileName: fileName.value,
      // MIF 的纯文本文件不能按字节解析，只有 zip 打包的 MIF/MID 才传字节
      bytes:
        binary || (forced === 'mif' && extOf(fileName.value) === 'zip') ? data : undefined,
      // 二进制容器（KMZ / XLSX / Shapefile 等）由 parseFileInput 按显式格式走字节分支，
      // 自动识别时用扩展名补上这个格式，避免落到文本分支报 needs-file
      source: forced ?? (binary ? mod.detectFormat('', fileName.value) || 'auto' : 'auto')
    })
    if (run !== runId) return

    if (outcome.collection.features.length === 0) {
      setError('tool.map-preview.errNoCoords')
      return
    }
    if (outcome.collection.features.length > MAX_FEATURES) {
      setError('tool.map-preview.errTooMany')
      return
    }

    collection.value = outcome.collection
    detectedFormat.value = outcome.format
    featureCount.value = outcome.collection.features.length
    issueCount.value = outcome.issues.length
    warningCount.value = outcome.warnings.length
    countTypes(outcome.collection)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'unknown-format') {
      setError('tool.map-preview.errUnknownFormat')
    } else if (message.includes('crs') || message.includes('coordinate')) {
      setError('tool.map-preview.errCoordRange')
    } else {
      setError('tool.map-preview.errParse')
    }
  } finally {
    if (run === runId) loading.value = false
  }
}

async function onFilePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  errorKey.value = ''
  if (file.size > MAX_BYTES) {
    setError('tool.map-preview.errTooLarge')
    input.value = ''
    return
  }

  try {
    const buffer = await file.arrayBuffer()
    bytes.value = new Uint8Array(buffer)
    fileName.value = file.name
    sourceFormat.value = 'auto'
    await parse()
  } catch {
    setError('tool.map-preview.errRead')
  }
}

function onFormatChange(): void {
  if (bytes.value) void parse()
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
                collection
                  ? ui['tool.map-preview.changeFile']
                  : ui['tool.map-preview.chooseFile']
              }}
            </button>
            <input
              ref="fileInput"
              class="visually-hidden"
              type="file"
              :accept="ACCEPT"
              :disabled="loading"
              @change="onFilePicked"
            />
          </div>
          <label class="dv__field">
            <span>{{ ui['tool.map-preview.formatLabel'] }}</span>
            <select v-model="sourceFormat" :disabled="loading" @change="onFormatChange">
              <option value="auto">{{ ui['tool.map-preview.formatAuto'] }}</option>
              <option v-for="format in FORMATS" :key="format" :value="format">
                {{ FORMAT_LABEL[format] }}
              </option>
            </select>
          </label>
          <p class="hint">{{ ui['tool.map-preview.formatHint'] }}</p>
          <p class="hint">{{ ui['tool.map-preview.supported'] }}</p>
        </div>

        <div class="dv__card">
          <div class="dv__head">
            <p class="result-title">{{ ui['tool.map-preview.dataTitle'] }}</p>
            <button v-if="collection" type="button" class="btn btn--ghost" @click="clearAll">
              {{ ui['tool.map-preview.clearData'] }}
            </button>
          </div>

          <template v-if="collection">
            <p class="dv__name mono">{{ fileName }}</p>
            <dl class="dv__stats">
              <div>
                <dt>{{ ui['tool.map-preview.statFormat'] }}</dt>
                <dd class="mono">{{ formatLabel }}</dd>
              </div>
              <div>
                <dt>{{ ui['tool.map-preview.statFeatures'] }}</dt>
                <dd class="mono">{{ countText(featureCount) }}</dd>
              </div>
              <div>
                <dt>{{ ui['tool.map-preview.statTypes'] }}</dt>
                <dd>{{ typeSummary }}</dd>
              </div>
              <div v-if="issueCount > 0">
                <dt>{{ ui['tool.map-preview.statIssues'] }}</dt>
                <dd class="mono">
                  {{ msg('tool.map-preview.issuesValue', { n: countText(issueCount) }) }}
                </dd>
              </div>
            </dl>
            <p v-if="warningCount > 0" class="hint">
              {{ msg('tool.map-preview.warnings', { n: countText(warningCount) }) }}
            </p>
          </template>
          <p v-else class="hint">{{ ui['tool.map-preview.empty'] }}</p>
        </div>

        <p v-if="errorKey" class="note note--danger" role="alert">
          {{ ui[errorKey] ?? errorKey }}
        </p>
        <p v-if="loading" class="hint" role="status">{{ ui['tool.map-preview.loading'] }}</p>
      </div>

      <div class="dv__map-col">
        <MapCanvas
          :center="mapCenter"
          :zoom="mapZoom"
          :geojson="collection"
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

.dv__name {
  margin: 0;
  overflow-wrap: anywhere;
}

.dv__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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