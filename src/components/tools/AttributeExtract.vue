<script setup lang="ts">
/**
 * T17 按属性提取要素
 *
 * 单个图层 + 一个筛选条件：选字段、选运算符、填值，结果上地图并导出 GeoJSON。
 * 解析复用 T06 的格式层；比较逻辑在 lib/geo/attribute.ts。
 * 全客户端处理，文件不上传。
 */

import { computed, nextTick, ref, shallowRef, watch } from 'vue'

import { DEFAULT_VIEW, type Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import { fmt } from '../../lib/coord/format'
import { FILE_LIMIT_BYTES, FEATURE_LIMIT } from '../../lib/convert/format'
import {
  listFileLayers,
  splitGeoJsonLayers,
  type GeoLayerGroup
} from '../../lib/convert/layers'
import type { VectorFeatureCollection, VectorFormat } from '../../lib/convert/types'
import {
  distinctValues,
  extractByAttribute,
  listFields,
  type AttributeExtractResult,
  type AttributeField,
  type AttributeOperator
} from '../../lib/geo/attribute'
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

const OPERATORS: AttributeOperator[] = [
  'eq',
  'neq',
  'contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'empty',
  'notEmpty'
]

const NUMERIC_OPERATORS: AttributeOperator[] = ['gt', 'gte', 'lt', 'lte']

const mapCanvas = ref<InstanceType<typeof MapCanvas> | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const collection = ref<VectorFeatureCollection | null>(null)
/** 解析出的完整要素集合；GeoJSON 按几何类型分组时，collection 只是其中一个分组 */
const fullCollection = ref<VectorFeatureCollection | null>(null)
const fileName = ref('')
const loading = ref(false)
const busy = ref(false)

/** 多图层容器（GeoPackage / Shapefile ZIP）的原始字节与图层列表 */
const fileBytes = shallowRef<Uint8Array | null>(null)
const fileSource = ref<VectorFormat | 'auto'>('auto')
const layerNames = ref<string[]>([])
/** GeoJSON 的逻辑图层（按图层字段或几何类型拆分） */
const geoGroups = ref<GeoLayerGroup[]>([])
/** 当前选择：容器图层名、几何类型 key，或 'all' */
const selection = ref('')

const fields = ref<AttributeField[]>([])
const fieldName = ref('')
const operator = ref<AttributeOperator>('eq')
const value = ref('')
const result = ref<AttributeExtractResult | null>(null)
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

const selectedField = computed(() => fields.value.find((item) => item.name === fieldName.value))

/** 图层下拉项：容器图层用原始名称，GeoJSON 用「全部 / 点 / 线 / 面」 */
const layerOptions = computed<Array<{ value: string; label: string }>>(() => {
  if (layerNames.value.length > 1) {
    return layerNames.value.map((name) => ({ value: name, label: name }))
  }
  if (geoGroups.value.length > 1) {
    return [
      { value: 'all', label: props.ui['tool.attribute-extract.layerAll'] },
      ...geoGroups.value.map((group) => ({
        value: group.key,
        label: group.label || props.ui[`tool.attribute-extract.layer.${group.key}`]
      }))
    ]
  }
  return []
})

const showLayerPicker = computed(() => layerOptions.value.length > 1)

const needsValue = computed(() => operator.value !== 'empty' && operator.value !== 'notEmpty')

const sampleHint = computed(() => {
  const field = selectedField.value
  if (!field) return ''
  return props.ui['tool.attribute-extract.sampleHint']
    .replaceAll('{field}', field.name)
    .replaceAll('{values}', field.samples.length > 0 ? field.samples.join('、') : '—')
})

/** 当前字段的现有取值，供输入框下拉选择（仍允许直接输入） */
const valueOptions = computed(() => {
  const data = collection.value
  if (!data || !fieldName.value) return []
  return distinctValues(data, fieldName.value)
})

const valueHint = computed(() =>
  valueOptions.value.length > 0
    ? props.ui['tool.attribute-extract.valueHint'].replaceAll(
        '{n}',
        countText(valueOptions.value.length)
      )
    : ''
)

const canRun = computed(() => {
  if (!collection.value || !fieldName.value || busy.value) return false
  if (needsValue.value && value.value.trim() === '') return false
  return true
})

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

/* ------------------------------------------------------------------ *
 * 文件解析
 * ------------------------------------------------------------------ */

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

async function readFile(file: File): Promise<void> {
  const mod = await import('../../lib/convert/format')

  if (file.size === 0) throw new Error('empty-file')
  if (file.size > FILE_LIMIT_BYTES) throw new Error('too-large')

  const bytes = new Uint8Array(await file.arrayBuffer())
  const binary = BINARY_EXT.has(extOf(file.name))
  const text = binary ? '' : mod.decodeBytes(bytes)

  if (!binary && text.trim() === '') throw new Error('empty-file')
  if (!binary && !mod.detectFormat(text, file.name)) throw new Error('unknown-format')

  fileBytes.value = bytes
  fileName.value = file.name
  fileSource.value = binary ? mod.detectFormat('', file.name) || 'auto' : 'auto'

  // GeoPackage / Shapefile ZIP 可能包含多个图层；其余格式返回空数组
  const { layers } = await listFileLayers({
    fileName: file.name,
    bytes,
    source: fileSource.value
  })
  layerNames.value = layers
  geoGroups.value = []
  selection.value = layers[0] ?? 'all'
}

/** 按当前选择切换 collection 与字段，不重新读文件 */
function applyActive(): void {
  const full = fullCollection.value
  if (!full) {
    collection.value = null
    fields.value = []
    fieldName.value = ''
    result.value = null
    return
  }

  const group = geoGroups.value.find((item) => item.key === selection.value)
  const active = group ? group.collection : full
  const nextFields = listFields(active)

  collection.value = active
  fields.value = nextFields
  fieldName.value = nextFields[0]?.name ?? ''
  operator.value = 'eq'
  value.value = ''
  result.value = null
}

async function parseCurrent(): Promise<void> {
  const bytes = fileBytes.value
  if (!bytes) return

  const mod = await import('../../lib/convert/format')
  const binary = BINARY_EXT.has(extOf(fileName.value))
  const text = binary ? '' : mod.decodeBytes(bytes)
  const outcome = await mod.parseFileInput(text, {
    fileName: fileName.value,
    bytes: binary ? bytes : undefined,
    source: fileSource.value,
    layer: layerNames.value.length > 0 ? selection.value || undefined : undefined
  })

  if (outcome.collection.features.length === 0) throw new Error('empty-file')
  if (outcome.collection.features.length > FEATURE_LIMIT) throw new Error('too-many')

  fullCollection.value = outcome.collection

  // GeoJSON 没有原生图层：优先按图层字段、否则按几何类型拆成可选逻辑图层
  if (outcome.format === 'geojson') {
    geoGroups.value = splitGeoJsonLayers(outcome.collection)
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
  value.value = ''
  result.value = null
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
    if (code === 'too-large') setError('tool.attribute-extract.errTooLarge')
    else if (code === 'unknown-format') setError('tool.attribute-extract.errUnknownFormat')
    else if (code === 'too-many') setError('tool.attribute-extract.errTooMany')
    else if (code === 'empty-file') setError('tool.attribute-extract.errEmpty')
    else setError('tool.attribute-extract.errParse')
    resetFile()
    input.value = ''
    renderMap()
  } finally {
    loading.value = false
  }
}

async function onSelectionChange(): Promise<void> {
  if (!fileBytes.value) return
  errorKey.value = ''

  // 容器图层需要重新解析；GeoJSON 只是在已解析结果里切分组
  if (layerNames.value.length > 0) {
    loading.value = true
    try {
      await parseCurrent()
    } catch {
      setError('tool.attribute-extract.errParse')
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

function openPicker(): void {
  inputRef.value?.click()
}

function clearAll(): void {
  resetFile()
  errorKey.value = ''
  if (inputRef.value) inputRef.value.value = ''
  renderMap()
}

/* ------------------------------------------------------------------ *
 * 提取
 * ------------------------------------------------------------------ */

async function run(): Promise<void> {
  const data = collection.value
  if (!data) {
    setError('tool.attribute-extract.errNeedFile')
    return
  }
  if (!fieldName.value) {
    setError('tool.attribute-extract.errNeedField')
    return
  }
  if (needsValue.value && value.value.trim() === '') {
    setError('tool.attribute-extract.errNeedValue')
    return
  }

  errorKey.value = ''
  busy.value = true
  result.value = null
  await nextTick()

  try {
    result.value = extractByAttribute(
      data,
      fieldName.value,
      operator.value,
      value.value,
      selectedField.value
    )
    if (result.value.matched === 0) setError('tool.attribute-extract.errNoMatch')
  } catch {
    setError('tool.attribute-extract.errGeneric')
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

  drawLayer(layerSource!, collection.value, '#1d4ed8', 0.03)
  drawLayer(layerResult!, result.value?.collection ?? null, '#15803d', 0.35)

  const bounds = leaflet.latLngBounds([])
  const extend = (data: VectorFeatureCollection | null): void => {
    if (!data) return
    const box = leaflet!.geoJSON(data as never).getBounds()
    if (box.isValid()) bounds.extend(box)
  }
  extend(result.value?.collection ?? null)
  if (!result.value) extend(collection.value)
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

watch([collection, result], () => renderMap())

watch([fieldName, operator], () => {
  result.value = null
  errorKey.value = ''
})

/* ------------------------------------------------------------------ *
 * 导出
 * ------------------------------------------------------------------ */

function download(): void {
  const data = result.value?.collection
  if (!data) return
  const blob = new Blob([JSON.stringify(data)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'attribute-extract.geojson'
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <form class="ae" @submit.prevent>
    <div class="ae__layout">
      <div class="ae__panel">
        <div class="ae__card">
          <p class="result-title">{{ ui['tool.attribute-extract.fileTitle'] }}</p>
          <div class="ae__row">
            <button type="button" class="btn btn--primary ae__choose" @click="openPicker">
              {{
                collection
                  ? ui['tool.attribute-extract.changeFile']
                  : ui['tool.attribute-extract.chooseFile']
              }}
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
          <p v-if="fileName" class="ae__name mono">{{ fileName }}</p>
          <label v-if="showLayerPicker" class="ae__field">
            <span>{{ ui['tool.attribute-extract.layerLabel'] }}</span>
            <select v-model="selection" :disabled="loading" @change="onSelectionChange">
              <option v-for="option in layerOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <p class="hint">
            {{
              loading
                ? ui['tool.attribute-extract.parsing']
                : collection
                  ? msg('tool.attribute-extract.featuresCount', {
                      n: countText(collection.features.length)
                    })
                  : ui['tool.attribute-extract.noLayer']
            }}
          </p>
        </div>

        <div class="ae__card">
          <p class="result-title">{{ ui['tool.attribute-extract.conditionTitle'] }}</p>
          <label class="ae__field">
            <span>{{ ui['tool.attribute-extract.fieldLabel'] }}</span>
            <select v-model="fieldName" :disabled="fields.length === 0">
              <option v-if="fields.length === 0" value="">
                {{ ui['tool.attribute-extract.fieldPlaceholder'] }}
              </option>
              <option v-for="field in fields" :key="field.name" :value="field.name">
                {{ field.name }}
              </option>
            </select>
          </label>
          <p v-if="sampleHint" class="hint">{{ sampleHint }}</p>

          <label class="ae__field">
            <span>{{ ui['tool.attribute-extract.operatorLabel'] }}</span>
            <select v-model="operator" :disabled="fields.length === 0">
              <option v-for="op in OPERATORS" :key="op" :value="op">
                {{ ui[`tool.attribute-extract.op.${op}`] }}
              </option>
            </select>
          </label>

          <label v-if="needsValue" class="ae__field">
            <span>{{ ui['tool.attribute-extract.valueLabel'] }}</span>
            <input
              v-model="value"
              type="text"
              list="ae-value-options"
              :placeholder="ui['tool.attribute-extract.valuePlaceholder']"
            />
            <datalist id="ae-value-options">
              <option v-for="option in valueOptions" :key="option" :value="option" />
            </datalist>
          </label>
          <p v-if="needsValue && valueHint" class="hint">{{ valueHint }}</p>

          <p
            v-if="selectedField && !selectedField.numeric && NUMERIC_OPERATORS.includes(operator)"
            class="hint"
          >
            {{ ui['tool.attribute-extract.numericHint'] }}
          </p>

          <button type="button" class="btn btn--primary ae__run" :disabled="!canRun" @click="run">
            {{ busy ? ui['tool.attribute-extract.running'] : ui['tool.attribute-extract.run'] }}
          </button>
          <p v-if="errorKey" class="note note--danger" role="alert">
            {{ ui[errorKey] ?? errorKey }}
          </p>
        </div>

        <div v-if="result" class="ae__card">
          <div class="ae__head">
            <p class="result-title">{{ ui['tool.attribute-extract.resultTitle'] }}</p>
            <button type="button" class="btn btn--ghost" @click="clearAll">
              {{ ui['tool.attribute-extract.clear'] }}
            </button>
          </div>
          <p class="ae__count mono">
            {{ msg('tool.attribute-extract.resultCount', {
              matched: countText(result.matched),
              total: countText(result.total)
            }) }}
          </p>
          <button
            type="button"
            class="btn btn--primary ae__run"
            :disabled="result.matched === 0"
            @click="download"
          >
            {{ ui['tool.attribute-extract.download'] }}
          </button>
        </div>

        <p class="hint">{{ ui['tool.attribute-extract.privacy'] }}</p>
      </div>

      <div class="ae__map-col">
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
.ae {
  font-size: 13px;
}

.ae__layout {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  align-items: start;
  gap: var(--sp-4);
}

.ae__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-inline-size: 0;
}

.ae__map-col {
  min-inline-size: 0;
  position: sticky;
  top: var(--sp-3);
}

.ae__map-col :deep(.map-shell) {
  min-inline-size: 0;
}

.ae .hint {
  font-size: 12px;
  margin: 0;
}

.ae__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg-sub);
}

.ae__card .result-title {
  margin: 0;
  font-size: 13px;
}

.ae__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}

.ae__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.ae__choose {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.ae__name {
  margin: 0;
  overflow-wrap: anywhere;
}

.ae__field {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-label);
  color: var(--ink-2);
}

/* 标签不换行，避免「字 / 段」被下拉框挤成两行 */
.ae__field > span {
  flex: 0 0 auto;
  white-space: nowrap;
}

.ae__field select,
.ae__field input {
  flex: 1 1 auto;
  min-inline-size: 0;
  font-size: 13px;
}

.ae__run {
  inline-size: 100%;
}

.ae__count {
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
  .ae__layout {
    grid-template-columns: 1fr;
  }

  .ae__map-col {
    position: static;
    order: -1;
  }
}
</style>