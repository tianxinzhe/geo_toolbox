<script setup lang="ts">
/**
 * T20 按字段融合
 *
 * 单个矢量文件 + 一个字段：取值相同的要素合并为一条，面做并集、
 * 线合为 MultiLineString、点合为 MultiPoint，混合类型输出 GeometryCollection。
 * 分组与几何合并在 lib/geo/dissolve.ts，全客户端处理，文件不上传。
 */

import { computed, nextTick, ref, shallowRef, watch } from 'vue'

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
import type { VectorFeatureCollection, VectorFormat } from '../../lib/convert/types'
import { listFields, type AttributeField } from '../../lib/geo/attribute'
import { dissolveByField, type DissolveOutcome } from '../../lib/geo/dissolve'
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
const GROUP_WARN_LIMIT = 2000

const mapCanvas = ref<InstanceType<typeof MapCanvas> | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const collection = ref<VectorFeatureCollection | null>(null)
const fullCollection = ref<VectorFeatureCollection | null>(null)
const fileName = ref('')
const loading = ref(false)
const busy = ref(false)

const fileBytes = shallowRef<Uint8Array | null>(null)
const fileSource = ref<VectorFormat | 'auto'>('auto')
const layerNames = ref<string[]>([])
const geoGroups = ref<GeoLayerGroup[]>([])
const selection = ref('')

const fields = ref<AttributeField[]>([])
const fieldName = ref('')
const outcome = ref<DissolveOutcome | null>(null)
const errorKey = ref('')

let map: import('leaflet').Map | null = null
let leaflet: typeof import('leaflet') | null = null
let layerSource: import('leaflet').LayerGroup | null = null
let layerResult: import('leaflet').LayerGroup | null = null

const mapCenter = computed<[number, number]>(() => {
  const view = DEFAULT_VIEW[props.lang]
  return [view.center[1], view.center[0]]
})

const mapZoom = computed(() => DEFAULT_VIEW[props.lang].zoom)

const layerOptions = computed<Array<{ value: string; label: string }>>(() => {
  if (layerNames.value.length > 1) {
    return layerNames.value.map((name) => ({ value: name, label: name }))
  }
  if (geoGroups.value.length > 1) {
    return [
      { value: 'all', label: props.ui['tool.dissolve.layerAll'] },
      ...geoGroups.value.map((group) => ({
        value: group.key,
        label: group.label || props.ui[`tool.dissolve.layer.${group.key}`]
      }))
    ]
  }
  return []
})

const showLayerPicker = computed(() => layerOptions.value.length > 1)

const selectedField = computed(() => fields.value.find((item) => item.name === fieldName.value))

const sampleHint = computed(() => {
  const field = selectedField.value
  if (!field) return ''
  return props.ui['tool.dissolve.sampleHint']
    .replaceAll('{field}', field.name)
    .replaceAll('{values}', field.samples.length > 0 ? field.samples.join('、') : '—')
})

const canRun = computed(() => collection.value !== null && fieldName.value !== '' && !busy.value)

const groupCount = computed(() => outcome.value?.groups.length ?? 0)

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

/* ------------------------------------------------------------------ *
 * 文件解析
 * ------------------------------------------------------------------ */

async function readFile(file: File): Promise<void> {
  const mod = await import('../../lib/convert/format')

  if (file.size === 0) throw new Error('empty-file')
  if (file.size > FILE_LIMIT_BYTES) throw new Error('too-large')

  const bytes = new Uint8Array(await file.arrayBuffer())
  const binary = BINARY_EXT.has(extOf(file.name))
  const text = binary ? '' : decodeBytes(bytes)

  if (!binary && text.trim() === '') throw new Error('empty-file')
  if (!binary && !mod.detectFormat(text, file.name)) throw new Error('unknown-format')

  fileBytes.value = bytes
  fileName.value = file.name
  fileSource.value = binary ? mod.detectFormat('', file.name) || 'auto' : 'auto'

  const { layers } = await listFileLayers({
    fileName: file.name,
    bytes,
    source: fileSource.value
  })
  layerNames.value = layers
  geoGroups.value = []
  selection.value = layers[0] ?? 'all'
}

function applyActive(): void {
  const full = fullCollection.value
  if (!full) {
    collection.value = null
    fields.value = []
    fieldName.value = ''
    outcome.value = null
    return
  }

  const group = geoGroups.value.find((item) => item.key === selection.value)
  const active = group ? group.collection : full
  const nextFields = listFields(active)

  collection.value = active
  fields.value = nextFields
  fieldName.value = nextFields[0]?.name ?? ''
  outcome.value = null
}

async function parseCurrent(): Promise<void> {
  const bytes = fileBytes.value
  if (!bytes) return

  const mod = await import('../../lib/convert/format')
  const binary = BINARY_EXT.has(extOf(fileName.value))
  const text = binary ? '' : decodeBytes(bytes)
  const result = await mod.parseFileInput(text, {
    fileName: fileName.value,
    bytes: binary ? bytes : undefined,
    source: fileSource.value,
    layer: layerNames.value.length > 0 ? selection.value || undefined : undefined
  })

  if (result.collection.features.length === 0) throw new Error('empty-file')
  if (result.collection.features.length > FEATURE_LIMIT) throw new Error('too-many')

  fullCollection.value = result.collection

  if (result.format === 'geojson') {
    geoGroups.value = splitGeoJsonLayers(result.collection)
    if (
      selection.value !== 'all' &&
      !geoGroups.value.some((group) => group.key === selection.value)
    ) {
      selection.value = 'all'
    }
  } else {
    geoGroups.value = []
  }

  applyActive()
}

function resetFile(): void {
  collection.value = null
  fullCollection.value = null
  fileName.value = ''
  fileBytes.value = null
  fileSource.value = 'auto'
  layerNames.value = []
  geoGroups.value = []
  selection.value = ''
  fields.value = []
  fieldName.value = ''
  outcome.value = null
}

async function onFilePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  errorKey.value = ''
  resetFile()
  loading.value = true

  try {
    await readFile(file)
    await parseCurrent()
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'too-large') errorKey.value = 'tool.dissolve.errTooLarge'
    else if (code === 'unknown-format') errorKey.value = 'tool.dissolve.errUnknownFormat'
    else if (code === 'too-many') errorKey.value = 'tool.dissolve.errTooMany'
    else if (code === 'empty-file') errorKey.value = 'tool.dissolve.errEmpty'
    else errorKey.value = 'tool.dissolve.errParse'
    resetFile()
    input.value = ''
  } finally {
    loading.value = false
    renderMap()
  }
}

async function onSelectionChange(): Promise<void> {
  if (!fileBytes.value) return
  errorKey.value = ''

  if (layerNames.value.length > 0) {
    loading.value = true
    try {
      await parseCurrent()
    } catch {
      errorKey.value = 'tool.dissolve.errParse'
      collection.value = null
      fields.value = []
      fieldName.value = ''
    } finally {
      loading.value = false
    }
  } else {
    applyActive()
  }

  renderMap()
}

/* ------------------------------------------------------------------ *
 * 融合
 * ------------------------------------------------------------------ */

async function run(): Promise<void> {
  const data = collection.value
  if (!data) {
    errorKey.value = 'tool.dissolve.errNeedFile'
    return
  }
  if (!fieldName.value) {
    errorKey.value = 'tool.dissolve.errNeedField'
    return
  }

  errorKey.value = ''
  busy.value = true
  outcome.value = null
  await nextTick()

  try {
    outcome.value = dissolveByField(data, fieldName.value)
    if (outcome.value.groups.length === 0) {
      errorKey.value = 'tool.dissolve.errNoGroups'
    }
  } catch {
    errorKey.value = 'tool.dissolve.errGeneric'
  } finally {
    busy.value = false
  }
}

/* ------------------------------------------------------------------ *
 * 地图
 * ------------------------------------------------------------------ */

function drawLayer(
  group: import('leaflet').LayerGroup,
  data: VectorFeatureCollection | null,
  color: string,
  fill: number
): void {
  if (!leaflet || !data) return
  leaflet
    .geoJSON(data as never, {
      style: { color, weight: 2, fillColor: color, fillOpacity: fill, interactive: false },
      pointToLayer: (_feature, latlng) =>
        leaflet!.circleMarker(latlng, {
          radius: 4,
          color,
          fillColor: color,
          fillOpacity: 1,
          interactive: false
        })
    })
    .addTo(group)
}

function renderMap(): void {
  if (!leaflet || !map) return
  layerSource?.clearLayers()
  layerResult?.clearLayers()

  drawLayer(layerSource!, collection.value, '#1d4ed8', 0.05)
  drawLayer(layerResult!, outcome.value?.collection ?? null, '#15803d', 0.32)

  const target = outcome.value?.collection ?? collection.value
  if (!target) return
  const layer = leaflet.geoJSON(target as never)
  const bounds = layer.getBounds()
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16], maxZoom: 16 })
}

function onMapReady(): void {
  map = mapCanvas.value?.getMap() ?? null
  leaflet = mapCanvas.value?.getLeaflet() ?? null
  if (!map || !leaflet) return

  layerSource = leaflet.layerGroup().addTo(map)
  layerResult = leaflet.layerGroup().addTo(map)
  renderMap()
}

watch([collection, outcome], () => renderMap())

watch(fieldName, () => {
  outcome.value = null
  errorKey.value = ''
})

/* ------------------------------------------------------------------ *
 * 导出
 * ------------------------------------------------------------------ */

function download(): void {
  const data = outcome.value?.collection
  if (!data) return
  const blob = new Blob([JSON.stringify(data)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'dissolve.geojson'
  link.click()
  URL.revokeObjectURL(url)
}

function clearAll(): void {
  resetFile()
  errorKey.value = ''
  if (inputRef.value) inputRef.value.value = ''
  renderMap()
}
</script>

<template>
  <form class="ds" @submit.prevent>
    <div class="ds__layout">
      <div class="ds__panel">
        <div class="ds__card">
          <p class="result-title">{{ ui['tool.dissolve.fileTitle'] }}</p>
          <div class="ds__row">
            <button type="button" class="btn btn--primary ds__choose" @click="inputRef?.click()">
              {{ collection ? ui['tool.dissolve.changeFile'] : ui['tool.dissolve.chooseFile'] }}
            </button>
            <input
              ref="inputRef"
              class="visually-hidden"
              type="file"
              :accept="ACCEPT"
              :disabled="loading"
              @change="onFilePicked"
            />
          </div>
          <p v-if="fileName" class="ds__name mono">{{ fileName }}</p>
          <label v-if="showLayerPicker" class="ds__field">
            <span>{{ ui['tool.dissolve.layerLabel'] }}</span>
            <select v-model="selection" :disabled="loading" @change="onSelectionChange">
              <option v-for="option in layerOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <p class="hint">
            {{
              loading
                ? ui['tool.dissolve.parsing']
                : collection
                  ? msg('tool.dissolve.featuresCount', { n: countText(collection.features.length) })
                  : ui['tool.dissolve.noFile']
            }}
          </p>
        </div>

        <div class="ds__card">
          <p class="result-title">{{ ui['tool.dissolve.fieldTitle'] }}</p>
          <label class="ds__field">
            <span>{{ ui['tool.dissolve.fieldLabel'] }}</span>
            <select v-model="fieldName" :disabled="fields.length === 0">
              <option v-if="fields.length === 0" value="">
                {{ ui['tool.dissolve.fieldPlaceholder'] }}
              </option>
              <option v-for="field in fields" :key="field.name" :value="field.name">
                {{ field.name }}
              </option>
            </select>
          </label>
          <p v-if="sampleHint" class="hint">{{ sampleHint }}</p>
          <button type="button" class="btn btn--primary ds__run" :disabled="!canRun" @click="run">
            {{ busy ? ui['tool.dissolve.running'] : ui['tool.dissolve.run'] }}
          </button>
          <p v-if="errorKey" class="note note--danger" role="alert">
            {{ ui[errorKey] ?? errorKey }}
          </p>
        </div>

        <div v-if="outcome" class="ds__card">
          <div class="ds__head">
            <p class="result-title">{{ ui['tool.dissolve.resultTitle'] }}</p>
            <button type="button" class="btn btn--ghost" @click="clearAll">
              {{ ui['tool.dissolve.clear'] }}
            </button>
          </div>
          <p class="ds__count mono">
            {{ msg('tool.dissolve.resultGroups', { n: countText(groupCount) }) }}
          </p>
          <p v-if="groupCount > 2000" class="hint">
            {{ msg('tool.dissolve.groupWarn', { n: countText(groupCount) }) }}
          </p>
          <div class="ds__table-wrap">
            <table class="ds__table">
              <thead>
                <tr>
                  <th>{{ ui['tool.dissolve.tableValue'] }}</th>
                  <th>{{ ui['tool.dissolve.tableCount'] }}</th>
                  <th>{{ ui['tool.dissolve.tableType'] }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(group, index) in outcome.groups" :key="index">
                  <td>{{ group.value === '' ? ui['tool.dissolve.emptyValue'] : group.value }}</td>
                  <td class="mono">{{ countText(group.count) }}</td>
                  <td class="mono">{{ group.geometryType || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <button
            type="button"
            class="btn btn--primary ds__run"
            :disabled="groupCount === 0"
            @click="download"
          >
            {{ ui['tool.dissolve.download'] }}
          </button>
        </div>

        <p class="hint">{{ ui['tool.dissolve.privacy'] }}</p>
      </div>

      <div class="ds__map-col">
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
.ds {
  font-size: 13px;
}

.ds__layout {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  align-items: start;
  gap: var(--sp-4);
}

.ds__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-inline-size: 0;
}

.ds__map-col {
  min-inline-size: 0;
  position: sticky;
  top: var(--sp-3);
}

.ds__map-col :deep(.map-shell) {
  min-inline-size: 0;
}

.ds .hint {
  font-size: 12px;
  margin: 0;
}

.ds__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg-sub);
}

.ds__card .result-title {
  margin: 0;
  font-size: 13px;
}

.ds__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}

.ds__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.ds__choose {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.ds__name {
  margin: 0;
  overflow-wrap: anywhere;
}

.ds__field {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.ds__field > span {
  flex: 0 0 auto;
  white-space: nowrap;
}

.ds__field select {
  flex: 1 1 auto;
  min-inline-size: 0;
  font-size: 13px;
}

.ds__run {
  inline-size: 100%;
}

.ds__count {
  margin: 0;
}

.ds__table-wrap {
  max-block-size: 320px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
}

.ds__table {
  inline-size: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.ds__table th,
.ds__table td {
  padding: 4px 8px;
  border-block-end: 1px solid var(--line);
  text-align: start;
  white-space: nowrap;
}

.ds__table th {
  position: sticky;
  top: 0;
  background: var(--bg-sub);
  color: var(--ink-3);
  font-weight: 600;
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
  .ds__layout {
    grid-template-columns: 1fr;
  }

  .ds__map-col {
    position: static;
    order: -1;
  }
}
</style>