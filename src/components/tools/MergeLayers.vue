<script setup lang="ts">
/**
 * T19 合并图层
 *
 * 一次选择多个矢量文件（可追加），每个文件可单独切换图层，
 * 合并为一条 FeatureCollection 后上地图并导出 GeoJSON。
 * 单个文件解析失败只标记该条，不影响其余文件。
 */

import { computed, markRaw, nextTick, ref, watch } from 'vue'

import { DEFAULT_VIEW, type Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import { fmt } from '../../lib/coord/format'
import {
  FILE_LIMIT_BYTES,
  FEATURE_LIMIT,
  decodeBytes
} from '../../lib/convert/format'
import {
  listFileLayers,
  splitGeoJsonLayers,
  type GeoLayerGroup
} from '../../lib/convert/layers'
import {
  FORMAT_LABEL,
  type VectorFeatureCollection,
  type VectorFormat
} from '../../lib/convert/types'
import { mergeCollections, type MergeOutcome } from '../../lib/geo/merge'
import MapCanvas from '../map/MapCanvas.vue'

interface Props {
  lang: Lang
  ui: ToolUi & Record<string, string>
  toolId: string
}

const props = defineProps<Props>()

const ACCEPT =
  '.geojson,.json,.topojson,.kml,.kmz,.gpx,.csv,.tsv,.txt,.xlsx,.xls,.gml,.dxf,.gmt,.mif,.mid,.wkt,.zip,.shp,.fgb,.gpkg'

const BINARY_EXT = new Set(['kmz', 'xlsx', 'xls', 'zip', 'shp', 'fgb', 'gpkg'])

interface MergeFile {
  key: number
  name: string
  format: VectorFormat | ''
  bytes: Uint8Array | null
  source: VectorFormat | 'auto'
  layerNames: string[]
  geoGroups: GeoLayerGroup[]
  selection: string
  fullCollection: VectorFeatureCollection | null
  collection: VectorFeatureCollection | null
  loading: boolean
  errorKey: string
}

const mapCanvas = ref<InstanceType<typeof MapCanvas> | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const entries = ref<MergeFile[]>([])
const outcome = ref<MergeOutcome | null>(null)
const errorKey = ref('')
const busy = ref(false)

let nextKey = 1

let map: import('leaflet').Map | null = null
let leaflet: typeof import('leaflet') | null = null
let layerResult: import('leaflet').LayerGroup | null = null

const mapCenter = computed<[number, number]>(() => {
  const view = DEFAULT_VIEW[props.lang]
  return [view.center[1], view.center[0]]
})

const mapZoom = computed(() => DEFAULT_VIEW[props.lang].zoom)

const readyEntries = computed(() =>
  entries.value.filter((entry) => !entry.loading && entry.collection !== null)
)

const canMerge = computed(() => readyEntries.value.length > 0 && !busy.value)

function msg(key: string, vars: Record<string, string | number> = {}): string {
  let text = props.ui[key] ?? key
  for (const [name, replacement] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(replacement))
  }
  return text
}

function countText(value: number): string {
  return fmt(value, props.lang, 'measure', 0)
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function layerOptions(entry: MergeFile): Array<{ value: string; label: string }> {
  if (entry.layerNames.length > 1) {
    return entry.layerNames.map((name) => ({ value: name, label: name }))
  }
  if (entry.geoGroups.length > 1) {
    return [
      { value: 'all', label: props.ui['tool.merge-layers.layerAll'] },
      ...entry.geoGroups.map((group) => ({
        value: group.key,
        label: group.label || props.ui[`tool.merge-layers.layer.${group.key}`]
      }))
    ]
  }
  return []
}

function showLayerPicker(entry: MergeFile): boolean {
  return layerOptions(entry).length > 1
}

/* ------------------------------------------------------------------ *
 * 文件解析
 * ------------------------------------------------------------------ */

function applyEntryLayer(entry: MergeFile): void {
  const group = entry.geoGroups.find((item) => item.key === entry.selection)
  entry.collection = group ? group.collection : entry.fullCollection
  outcome.value = null
}

async function parseEntry(entry: MergeFile): Promise<void> {
  const bytes = entry.bytes
  if (!bytes) return

  const mod = await import('../../lib/convert/format')
  const binary = BINARY_EXT.has(extOf(entry.name))
  const text = binary ? '' : decodeBytes(bytes)
  const result = await mod.parseFileInput(text, {
    fileName: entry.name,
    bytes: binary ? bytes : undefined,
    source: entry.source,
    layer: entry.layerNames.length > 0 ? entry.selection || undefined : undefined
  })

  if (result.collection.features.length === 0) throw new Error('empty-file')
  if (result.collection.features.length > FEATURE_LIMIT) throw new Error('too-many')

  entry.fullCollection = result.collection
  entry.format = result.format

  if (result.format === 'geojson') {
    entry.geoGroups = splitGeoJsonLayers(result.collection)
    if (
      entry.selection !== 'all' &&
      !entry.geoGroups.some((group) => group.key === entry.selection)
    ) {
      entry.selection = 'all'
    }
  } else {
    entry.geoGroups = []
  }

  applyEntryLayer(entry)
}

function errorKeyFor(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code === 'too-large') return 'tool.merge-layers.errTooLarge'
  if (code === 'unknown-format') return 'tool.merge-layers.errUnknownFormat'
  if (code === 'too-many') return 'tool.merge-layers.errTooMany'
  if (code === 'empty-file') return 'tool.merge-layers.errEmpty'
  return 'tool.merge-layers.errParse'
}

async function loadEntry(entry: MergeFile, file: File): Promise<void> {
  entry.loading = true
  entry.errorKey = ''

  try {
    if (file.size === 0) throw new Error('empty-file')
    if (file.size > FILE_LIMIT_BYTES) throw new Error('too-large')

    const mod = await import('../../lib/convert/format')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const binary = BINARY_EXT.has(extOf(file.name))
    const text = binary ? '' : decodeBytes(bytes)

    if (!binary && text.trim() === '') throw new Error('empty-file')
    if (!binary && !mod.detectFormat(text, file.name)) throw new Error('unknown-format')

    entry.bytes = markRaw(bytes)
    entry.source = binary ? mod.detectFormat('', file.name) || 'auto' : 'auto'

    const { layers } = await listFileLayers({
      fileName: file.name,
      bytes,
      source: entry.source
    })
    entry.layerNames = layers
    entry.geoGroups = []
    entry.selection = layers[0] ?? 'all'

    await parseEntry(entry)
  } catch (error) {
    entry.errorKey = errorKeyFor(error)
    entry.collection = null
    entry.fullCollection = null
  } finally {
    entry.loading = false
    renderMap()
  }
}

async function onFilesPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.length === 0) return

  errorKey.value = ''
  outcome.value = null

  for (const file of files) {
    const entry: MergeFile = {
      key: nextKey++,
      name: file.name,
      format: '',
      bytes: null,
      source: 'auto',
      layerNames: [],
      geoGroups: [],
      selection: '',
      fullCollection: null,
      collection: null,
      loading: true,
      errorKey: ''
    }
    entries.value.push(entry)
    // 取回数组里的响应式代理再修改，直接改原始对象不会触发界面更新
    const reactiveEntry = entries.value[entries.value.length - 1]
    await loadEntry(reactiveEntry, file)
  }

  input.value = ''
}

async function onLayerChange(entry: MergeFile): Promise<void> {
  if (!entry.bytes) return
  entry.errorKey = ''

  if (entry.layerNames.length > 0) {
    entry.loading = true
    try {
      await parseEntry(entry)
    } catch (error) {
      entry.errorKey = errorKeyFor(error)
      entry.collection = null
    } finally {
      entry.loading = false
    }
  } else {
    applyEntryLayer(entry)
  }

  outcome.value = null
  renderMap()
}

function removeEntry(key: number): void {
  entries.value = entries.value.filter((entry) => entry.key !== key)
  outcome.value = null
  errorKey.value = ''
  renderMap()
}

function clearAll(): void {
  entries.value = []
  outcome.value = null
  errorKey.value = ''
  if (fileInput.value) fileInput.value.value = ''
  renderMap()
}

/* ------------------------------------------------------------------ *
 * 合并
 * ------------------------------------------------------------------ */

async function run(): Promise<void> {
  const ready = readyEntries.value
  if (ready.length === 0) {
    errorKey.value = 'tool.merge-layers.errNeedFiles'
    return
  }

  errorKey.value = ''
  busy.value = true
  outcome.value = null
  await nextTick()

  try {
    outcome.value = mergeCollections(
      ready.map((entry) => ({ name: entry.name, collection: entry.collection! }))
    )
  } catch {
    errorKey.value = 'tool.merge-layers.errParse'
  } finally {
    busy.value = false
  }
}

/* ------------------------------------------------------------------ *
 * 地图
 * ------------------------------------------------------------------ */

function renderMap(): void {
  if (!leaflet || !map) return
  layerResult?.clearLayers()

  const data = outcome.value?.collection
  if (!data) return

  leaflet
    .geoJSON(data as never, {
      style: { color: '#15803d', weight: 2, fillColor: '#15803d', fillOpacity: 0.25 },
      pointToLayer: (_feature, latlng) =>
        leaflet!.circleMarker(latlng, {
          radius: 4,
          color: '#15803d',
          fillColor: '#15803d',
          fillOpacity: 0.9
        })
    })
    .addTo(layerResult!)

  const bounds = leaflet.geoJSON(data as never).getBounds()
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16], maxZoom: 16 })
}

function onMapReady(): void {
  map = mapCanvas.value?.getMap() ?? null
  leaflet = mapCanvas.value?.getLeaflet() ?? null
  if (!map || !leaflet) return

  layerResult = leaflet.layerGroup().addTo(map)
  renderMap()
}

watch(outcome, () => renderMap())

/* ------------------------------------------------------------------ *
 * 导出与统计
 * ------------------------------------------------------------------ */

function typeKey(type: string): string {
  if (type === 'Point' || type === 'MultiPoint') return 'tool.merge-layers.geom.point'
  if (type === 'LineString' || type === 'MultiLineString') return 'tool.merge-layers.geom.line'
  if (type === 'Polygon' || type === 'MultiPolygon') return 'tool.merge-layers.geom.polygon'
  if (type === 'none') return 'tool.merge-layers.geom.none'
  return 'tool.merge-layers.geom.other'
}

const typeSummary = computed(() => {
  const counts = outcome.value?.geometryCounts ?? {}
  return Object.entries(counts)
    .map(([type, count]) => `${props.ui[typeKey(type)]} ${countText(count)}`)
    .join(' · ')
})

function download(): void {
  const data = outcome.value?.collection
  if (!data) return
  const blob = new Blob([JSON.stringify(data)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'merged-layers.geojson'
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <form class="mg" @submit.prevent>
    <div class="mg__layout">
      <div class="mg__panel">
        <div class="mg__card">
          <div class="mg__head">
            <p class="result-title">{{ ui['tool.merge-layers.filesTitle'] }}</p>
            <button type="button" class="btn btn--ghost" :disabled="entries.length === 0" @click="clearAll">
              {{ ui['tool.merge-layers.clear'] }}
            </button>
          </div>
          <div class="mg__row">
            <button type="button" class="btn btn--primary mg__choose" @click="fileInput?.click()">
              {{
                entries.length > 0
                  ? ui['tool.merge-layers.addMoreFiles']
                  : ui['tool.merge-layers.addFiles']
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
          <p v-if="entries.length === 0" class="hint">{{ ui['tool.merge-layers.emptyHint'] }}</p>
        </div>

        <div v-for="entry in entries" :key="entry.key" class="mg__card mg__file">
          <div class="mg__head">
            <p class="mg__name mono">{{ entry.name }}</p>
            <button
              type="button"
              class="btn btn--ghost mg__remove"
              :disabled="entry.loading"
              @click="removeEntry(entry.key)"
            >
              {{ ui['tool.merge-layers.remove'] }}
            </button>
          </div>
          <p class="hint">
            {{
              entry.loading
                ? ui['tool.merge-layers.parsing']
                : entry.format
                  ? `${FORMAT_LABEL[entry.format] ?? entry.format} · ${msg(
                      'tool.merge-layers.featuresCount',
                      { n: countText(entry.collection?.features.length ?? 0) }
                    )}`
                  : '—'
            }}
          </p>
          <label v-if="showLayerPicker(entry)" class="mg__field">
            <span>{{ ui['tool.merge-layers.layerLabel'] }}</span>
            <select
              v-model="entry.selection"
              :disabled="entry.loading"
              @change="onLayerChange(entry)"
            >
              <option v-for="option in layerOptions(entry)" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <p v-if="entry.errorKey" class="note note--danger" role="alert">
            {{ ui[entry.errorKey] ?? entry.errorKey }}
          </p>
        </div>

        <div class="mg__card">
          <button type="button" class="btn btn--primary mg__run" :disabled="!canMerge" @click="run">
            {{ busy ? ui['tool.merge-layers.merging'] : ui['tool.merge-layers.merge'] }}
          </button>
          <p v-if="errorKey" class="note note--danger" role="alert">
            {{ ui[errorKey] ?? errorKey }}
          </p>
        </div>

        <div v-if="outcome" class="mg__card">
          <p class="result-title">{{ ui['tool.merge-layers.resultTitle'] }}</p>
          <dl class="mg__stats">
            <div>
              <dt>{{ ui['tool.merge-layers.statFiles'] }}</dt>
              <dd class="mono">{{ countText(outcome.sources.length) }}</dd>
            </div>
            <div>
              <dt>{{ ui['tool.merge-layers.statFeatures'] }}</dt>
              <dd class="mono">{{ countText(outcome.total) }}</dd>
            </div>
          </dl>
          <p class="hint">
            {{ ui['tool.merge-layers.statTypes'] }}：<span class="mono">{{ typeSummary || '—' }}</span>
          </p>
          <button
            type="button"
            class="btn btn--primary mg__run"
            :disabled="outcome.total === 0"
            @click="download"
          >
            {{ ui['tool.merge-layers.download'] }}
          </button>
        </div>

        <p class="hint">{{ ui['tool.merge-layers.privacy'] }}</p>
      </div>

      <div class="mg__map-col">
        <MapCanvas
          ref="mapCanvas"
          :center="mapCenter"
          :zoom="mapZoom"
          :geojson="null"
          :fit="false"
          :drag-prompt="ui['common.mapDragPrompt']"
          :loading-text="ui['common.mapLoading']"
          :tile-error-text="ui['common.mapTileError']"
          :basemap-label="ui['common.basemap']"
          :basemap-street="ui['common.basemapStreet']"
          :basemap-satellite="ui['common.basemapSatellite']"
          :basemap-terrain="ui['common.basemapTerrain']"
          @ready="onMapReady"
        />
      </div>
    </div>
  </form>
</template>

<style scoped>
.mg {
  font-size: 13px;
}

.mg__layout {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  align-items: start;
  gap: var(--sp-4);
}

.mg__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-inline-size: 0;
}

.mg__map-col {
  min-inline-size: 0;
  position: sticky;
  top: var(--sp-3);
}

.mg__map-col :deep(.map-shell) {
  min-inline-size: 0;
}

.mg .hint {
  font-size: 12px;
  margin: 0;
}

.mg__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg-sub);
}

.mg__card .result-title {
  margin: 0;
  font-size: 13px;
}

.mg__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}

.mg__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.mg__choose {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.mg__file {
  gap: var(--sp-2);
}

.mg__name {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 12px;
}

.mg__remove {
  flex: 0 0 auto;
  font-size: 12px;
}

.mg__field {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.mg__field > span {
  flex: 0 0 auto;
  white-space: nowrap;
}

.mg__field select {
  flex: 1 1 auto;
  min-inline-size: 0;
  font-size: 13px;
}

.mg__run {
  inline-size: 100%;
}

.mg__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2);
  margin: 0;
}

.mg__stats dt {
  font-size: 12px;
  color: var(--ink-3);
}

.mg__stats dd {
  margin: 0;
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
  .mg__layout {
    grid-template-columns: 1fr;
  }

  .mg__map-col {
    position: static;
    order: -1;
  }
}
</style>