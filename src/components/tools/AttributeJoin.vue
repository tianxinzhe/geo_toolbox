<script setup lang="ts">
/**
 * T18 属性连接
 *
 * 主矢量文件 + 属性表（CSV / TSV / Excel）：选两个连接字段，
 * 按值匹配后把属性表列并入要素，结果上地图并可导出 GeoJSON。
 * 匹配与覆盖规则在 lib/geo/join.ts，全客户端处理，文件不上传。
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
import {
  joinAttributes,
  parseTableText,
  parseXlsxTable,
  type AttributeTable,
  type JoinOutcome
} from '../../lib/geo/join'
import MapCanvas from '../map/MapCanvas.vue'

interface Props {
  lang: Lang
  ui: ToolUi & Record<string, string>
  toolId: string
}

const props = defineProps<Props>()

const VECTOR_ACCEPT =
  '.geojson,.json,.topojson,.kml,.kmz,.gpx,.csv,.tsv,.txt,.xlsx,.xls,.gml,.dxf,.gmt,.mif,.mid,.wkt,.zip,.shp,.fgb,.gpkg'
const TABLE_ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls'

const BINARY_EXT = new Set(['kmz', 'xlsx', 'xls', 'zip', 'shp', 'fgb', 'gpkg'])
const TABLE_BINARY = new Set(['xlsx', 'xls'])

const mapCanvas = ref<InstanceType<typeof MapCanvas> | null>(null)
const vectorInput = ref<HTMLInputElement | null>(null)
const tableInput = ref<HTMLInputElement | null>(null)

const collection = ref<VectorFeatureCollection | null>(null)
const fullCollection = ref<VectorFeatureCollection | null>(null)
const vectorName = ref('')
const vectorLoading = ref(false)

const vectorBytes = shallowRef<Uint8Array | null>(null)
const vectorSource = ref<VectorFormat | 'auto'>('auto')
const layerNames = ref<string[]>([])
const geoGroups = ref<GeoLayerGroup[]>([])
const selection = ref('')

const fields = ref<AttributeField[]>([])
const vectorField = ref('')

const tableName = ref('')
const tableLoading = ref(false)
const table = ref<AttributeTable | null>(null)
const tableField = ref('')

const keepUnmatched = ref(true)
const outcome = ref<JoinOutcome | null>(null)
const errorKey = ref('')
const busy = ref(false)

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
      { value: 'all', label: props.ui['tool.attribute-join.layerAll'] },
      ...geoGroups.value.map((group) => ({
        value: group.key,
        label: group.label || props.ui[`tool.attribute-join.layer.${group.key}`]
      }))
    ]
  }
  return []
})

const showLayerPicker = computed(() => layerOptions.value.length > 1)

const canRun = computed(
  () =>
    collection.value !== null &&
    vectorField.value !== '' &&
    table.value !== null &&
    tableField.value !== '' &&
    !busy.value
)

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

function setError(key: string): void {
  errorKey.value = key
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

/* ------------------------------------------------------------------ *
 * 矢量文件
 * ------------------------------------------------------------------ */

async function readVectorFile(file: File): Promise<void> {
  const mod = await import('../../lib/convert/format')

  if (file.size === 0) throw new Error('empty-file')
  if (file.size > FILE_LIMIT_BYTES) throw new Error('too-large')

  const bytes = new Uint8Array(await file.arrayBuffer())
  const binary = BINARY_EXT.has(extOf(file.name))
  const text = binary ? '' : decodeBytes(bytes)

  if (!binary && text.trim() === '') throw new Error('empty-file')
  if (!binary && !mod.detectFormat(text, file.name)) throw new Error('unknown-format')

  vectorBytes.value = bytes
  vectorName.value = file.name
  vectorSource.value = binary ? mod.detectFormat('', file.name) || 'auto' : 'auto'

  const { layers } = await listFileLayers({
    fileName: file.name,
    bytes,
    source: vectorSource.value
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
    vectorField.value = ''
    outcome.value = null
    return
  }

  const group = geoGroups.value.find((item) => item.key === selection.value)
  const active = group ? group.collection : full
  const nextFields = listFields(active)

  collection.value = active
  fields.value = nextFields
  vectorField.value = nextFields[0]?.name ?? ''
  outcome.value = null
}

async function parseVector(): Promise<void> {
  const bytes = vectorBytes.value
  if (!bytes) return

  const mod = await import('../../lib/convert/format')
  const binary = BINARY_EXT.has(extOf(vectorName.value))
  const text = binary ? '' : decodeBytes(bytes)
  const result = await mod.parseFileInput(text, {
    fileName: vectorName.value,
    bytes: binary ? bytes : undefined,
    source: vectorSource.value,
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

function resetVector(): void {
  collection.value = null
  fullCollection.value = null
  vectorName.value = ''
  vectorBytes.value = null
  vectorSource.value = 'auto'
  layerNames.value = []
  geoGroups.value = []
  selection.value = ''
  fields.value = []
  vectorField.value = ''
  outcome.value = null
}

async function onVectorPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  errorKey.value = ''
  resetVector()
  vectorLoading.value = true

  try {
    await readVectorFile(file)
    await parseVector()
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'too-large') setError('tool.attribute-join.errTooLarge')
    else if (code === 'unknown-format') setError('tool.attribute-join.errUnknownFormat')
    else if (code === 'too-many') setError('tool.attribute-join.errTooMany')
    else if (code === 'empty-file') setError('tool.attribute-join.errEmpty')
    else setError('tool.attribute-join.errParse')
    resetVector()
    input.value = ''
  } finally {
    vectorLoading.value = false
    renderMap()
  }
}

async function onSelectionChange(): Promise<void> {
  if (!vectorBytes.value) return
  errorKey.value = ''

  if (layerNames.value.length > 0) {
    vectorLoading.value = true
    try {
      await parseVector()
    } catch {
      setError('tool.attribute-join.errParse')
      collection.value = null
      fields.value = []
      vectorField.value = ''
    } finally {
      vectorLoading.value = false
    }
  } else {
    applyActive()
  }

  renderMap()
}

/* ------------------------------------------------------------------ *
 * 属性表
 * ------------------------------------------------------------------ */

function resetTable(): void {
  table.value = null
  tableName.value = ''
  tableField.value = ''
  outcome.value = null
}

async function onTablePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  errorKey.value = ''
  resetTable()
  tableLoading.value = true

  try {
    if (file.size === 0) throw new Error('empty')
    if (file.size > FILE_LIMIT_BYTES) throw new Error('too-large')

    const bytes = new Uint8Array(await file.arrayBuffer())
    const ext = extOf(file.name)
    const parsed = TABLE_BINARY.has(ext)
      ? await parseXlsxTable(bytes)
      : parseTableText(decodeBytes(bytes), ext === 'tsv' ? '\t' : undefined)

    if (parsed.headers.length === 0 || parsed.rows.length === 0) throw new Error('empty')

    table.value = parsed
    tableName.value = file.name
    tableField.value = parsed.headers[0] ?? ''
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'too-large') setError('tool.attribute-join.errTooLarge')
    else if (code === 'empty') setError('tool.attribute-join.errTableEmpty')
    else setError('tool.attribute-join.errTableParse')
    resetTable()
    input.value = ''
  } finally {
    tableLoading.value = false
  }
}

/* ------------------------------------------------------------------ *
 * 连接
 * ------------------------------------------------------------------ */

async function run(): Promise<void> {
  const data = collection.value
  if (!data) {
    setError('tool.attribute-join.errNeedVector')
    return
  }
  if (!table.value) {
    setError('tool.attribute-join.errNeedTable')
    return
  }
  if (!vectorField.value) {
    setError('tool.attribute-join.errNeedVectorField')
    return
  }
  if (!tableField.value) {
    setError('tool.attribute-join.errNeedTableField')
    return
  }

  errorKey.value = ''
  busy.value = true
  outcome.value = null
  await nextTick()

  try {
    outcome.value = joinAttributes(data, table.value.rows, {
      vectorField: vectorField.value,
      tableField: tableField.value,
      keepUnmatched: keepUnmatched.value
    })
    if (outcome.value.matched === 0) setError('tool.attribute-join.errNoMatch')
  } catch {
    setError('tool.attribute-join.errGeneric')
  } finally {
    busy.value = false
  }
}

/* ------------------------------------------------------------------ *
 * 地图
 * ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function popupHtml(properties: Record<string, unknown> | null | undefined): string {
  const rows = Object.entries(properties ?? {})
    .map(([key, value]) => {
      const text =
        value === null || value === undefined
          ? ''
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value)
      return `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(text)}</td></tr>`
    })
    .join('')
  return `<div><strong>${escapeHtml(
    props.ui['tool.attribute-join.popupTitle']
  )}</strong><table>${rows}</table></div>`
}

function drawLayer(
  group: import('leaflet').LayerGroup,
  data: VectorFeatureCollection | null,
  color: string,
  fill: number
): void {
  if (!leaflet || !data) return
  leaflet
    .geoJSON(data as never, {
      style: { color, weight: 2, fillColor: color, fillOpacity: fill },
      pointToLayer: (_feature, latlng) =>
        leaflet!.circleMarker(latlng, {
          radius: 4,
          color,
          fillColor: color,
          fillOpacity: 1
        }),
      onEachFeature: (feature, layer) => {
        layer.on('click', () => {
          layer.bindPopup(popupHtml(feature.properties as Record<string, unknown>)).openPopup()
        })
      }
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

watch([vectorField, tableField, keepUnmatched], () => {
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
  link.download = 'attribute-join.geojson'
  link.click()
  URL.revokeObjectURL(url)
}

function clearAll(): void {
  resetVector()
  resetTable()
  errorKey.value = ''
  if (vectorInput.value) vectorInput.value.value = ''
  if (tableInput.value) tableInput.value.value = ''
  renderMap()
}
</script>

<template>
  <form class="aj" @submit.prevent>
    <div class="aj__layout">
      <div class="aj__panel">
        <div class="aj__card">
          <p class="result-title">{{ ui['tool.attribute-join.vectorTitle'] }}</p>
          <div class="aj__row">
            <button type="button" class="btn btn--primary aj__choose" @click="vectorInput?.click()">
              {{
                collection
                  ? ui['tool.attribute-join.changeVector']
                  : ui['tool.attribute-join.chooseVector']
              }}
            </button>
            <input
              ref="vectorInput"
              class="visually-hidden"
              type="file"
              :accept="VECTOR_ACCEPT"
              :disabled="vectorLoading"
              @change="onVectorPicked"
            />
          </div>
          <p v-if="vectorName" class="aj__name mono">{{ vectorName }}</p>
          <label v-if="showLayerPicker" class="aj__field">
            <span>{{ ui['tool.attribute-join.layerLabel'] }}</span>
            <select v-model="selection" :disabled="vectorLoading" @change="onSelectionChange">
              <option v-for="option in layerOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <p class="hint">
            {{
              vectorLoading
                ? ui['tool.attribute-join.parsing']
                : collection
                  ? msg('tool.attribute-join.featuresCount', {
                      n: countText(collection.features.length)
                    })
                  : ui['tool.attribute-join.noFile']
            }}
          </p>
        </div>

        <div class="aj__card">
          <p class="result-title">{{ ui['tool.attribute-join.tableTitle'] }}</p>
          <div class="aj__row">
            <button type="button" class="btn btn--primary aj__choose" @click="tableInput?.click()">
              {{
                table
                  ? ui['tool.attribute-join.changeTable']
                  : ui['tool.attribute-join.chooseTable']
              }}
            </button>
            <input
              ref="tableInput"
              class="visually-hidden"
              type="file"
              :accept="TABLE_ACCEPT"
              :disabled="tableLoading"
              @change="onTablePicked"
            />
          </div>
          <p v-if="tableName" class="aj__name mono">{{ tableName }}</p>
          <p class="hint">
            {{
              tableLoading
                ? ui['tool.attribute-join.parsing']
                : table
                  ? msg('tool.attribute-join.tableSummary', {
                      rows: countText(table.rows.length),
                      fields: countText(table.headers.length)
                    })
                  : ui['tool.attribute-join.noFile']
            }}
          </p>
        </div>

        <div class="aj__card">
          <p class="result-title">{{ ui['tool.attribute-join.matchTitle'] }}</p>
          <label class="aj__field">
            <span>{{ ui['tool.attribute-join.vectorFieldLabel'] }}</span>
            <select v-model="vectorField" :disabled="fields.length === 0">
              <option v-if="fields.length === 0" value="">
                {{ ui['tool.attribute-join.fieldPlaceholder'] }}
              </option>
              <option v-for="field in fields" :key="field.name" :value="field.name">
                {{ field.name }}
              </option>
            </select>
          </label>
          <label class="aj__field">
            <span>{{ ui['tool.attribute-join.tableFieldLabel'] }}</span>
            <select v-model="tableField" :disabled="!table">
              <option v-if="!table" value="">
                {{ ui['tool.attribute-join.fieldPlaceholder'] }}
              </option>
              <option v-for="header in table?.headers ?? []" :key="header" :value="header">
                {{ header }}
              </option>
            </select>
          </label>

          <label class="aj__check">
            <input v-model="keepUnmatched" type="checkbox" />
            <span>{{ ui['tool.attribute-join.keepUnmatched'] }}</span>
          </label>
          <p class="hint">{{ ui['tool.attribute-join.keepUnmatchedHint'] }}</p>

          <button type="button" class="btn btn--primary aj__run" :disabled="!canRun" @click="run">
            {{ busy ? ui['tool.attribute-join.running'] : ui['tool.attribute-join.run'] }}
          </button>
          <p v-if="errorKey" class="note note--danger" role="alert">
            {{ ui[errorKey] ?? errorKey }}
          </p>
        </div>

        <div v-if="outcome" class="aj__card">
          <div class="aj__head">
            <p class="result-title">{{ ui['tool.attribute-join.resultTitle'] }}</p>
            <button type="button" class="btn btn--ghost" @click="clearAll">
              {{ ui['tool.attribute-join.clear'] }}
            </button>
          </div>
          <dl class="aj__stats">
            <div>
              <dt>{{ ui['tool.attribute-join.matchedLabel'] }}</dt>
              <dd class="mono">{{ countText(outcome.matched) }}</dd>
            </div>
            <div>
              <dt>{{ ui['tool.attribute-join.unmatchedLabel'] }}</dt>
              <dd class="mono">{{ countText(outcome.unmatched) }}</dd>
            </div>
            <div>
              <dt>{{ ui['tool.attribute-join.conflictsLabel'] }}</dt>
              <dd class="mono">{{ countText(outcome.conflicts) }}</dd>
            </div>
          </dl>
          <p class="hint">{{ ui['tool.attribute-join.conflictHint'] }}</p>
          <p v-if="outcome.duplicates > 0" class="hint">
            {{ msg('tool.attribute-join.duplicateHint', { n: countText(outcome.duplicates) }) }}
          </p>
          <button
            type="button"
            class="btn btn--primary aj__run"
            :disabled="outcome.matched === 0"
            @click="download"
          >
            {{ ui['tool.attribute-join.download'] }}
          </button>
        </div>

        <p class="hint">{{ ui['tool.attribute-join.privacy'] }}</p>
      </div>

      <div class="aj__map-col">
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
.aj {
  font-size: 13px;
}

.aj__layout {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  align-items: start;
  gap: var(--sp-4);
}

.aj__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-inline-size: 0;
}

.aj__map-col {
  min-inline-size: 0;
  position: sticky;
  top: var(--sp-3);
}

.aj__map-col :deep(.map-shell) {
  min-inline-size: 0;
}

.aj .hint {
  font-size: 12px;
  margin: 0;
}

.aj__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg-sub);
}

.aj__card .result-title {
  margin: 0;
  font-size: 13px;
}

.aj__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}

.aj__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.aj__choose {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.aj__name {
  margin: 0;
  overflow-wrap: anywhere;
}

.aj__field {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.aj__field > span {
  flex: 0 0 auto;
  white-space: nowrap;
}

.aj__field select,
.aj__field input {
  flex: 1 1 auto;
  min-inline-size: 0;
  font-size: 13px;
}

.aj__check {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.aj__run {
  inline-size: 100%;
}

.aj__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
  margin: 0;
}

.aj__stats div {
  min-inline-size: 0;
}

.aj__stats dt {
  font-size: 12px;
  color: var(--ink-3);
}

.aj__stats dd {
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
  .aj__layout {
    grid-template-columns: 1fr;
  }

  .aj__map-col {
    position: static;
    order: -1;
  }
}
</style>