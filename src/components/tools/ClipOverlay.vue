<script setup lang="ts">
/**
 * T16 图层裁切与叠加
 *
 * 两个输入图层 A / B，四种操作：
 *   - 裁切 Clip / 相交 Intersect：A ∩ B
 *   - 擦除 Difference：A − B
 *   - 简化 Simplify：对 A 做 Douglas–Peucker 抽稀（容差按米）
 *
 * 解析复用 T06 的格式层（16 种矢量格式），布尔运算在 lib/geo/overlay.ts。
 * 全客户端计算，文件不上传；底图由 MapCanvas 懒加载。
 */

import { computed, nextTick, ref, watch } from 'vue'

import { DEFAULT_VIEW, type Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import { fmt } from '../../lib/coord/format'
import { FILE_LIMIT_BYTES, FEATURE_LIMIT } from '../../lib/convert/format'
import type { VectorFeatureCollection } from '../../lib/convert/types'
import {
  overlayCollections,
  simplifyCollection,
  type OverlayOperation,
  type OverlayOutcome
} from '../../lib/geo/overlay'
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

const OPS: OverlayOperation[] = ['clip', 'intersect', 'difference', 'simplify']

const mapCanvas = ref<InstanceType<typeof MapCanvas> | null>(null)

const inputA = ref<VectorFeatureCollection | null>(null)
const inputB = ref<VectorFeatureCollection | null>(null)
const nameA = ref('')
const nameB = ref('')
const loadingA = ref(false)
const loadingB = ref(false)
const operation = ref<OverlayOperation>('clip')
const tolerance = ref(10)
const busy = ref(false)
const outcome = ref<OverlayOutcome | null>(null)
const errorKey = ref('')

const inputARef = ref<HTMLInputElement | null>(null)
const inputBRef = ref<HTMLInputElement | null>(null)

let map: import('leaflet').Map | null = null
let leaflet: typeof import('leaflet') | null = null
let layerA: import('leaflet').LayerGroup | null = null
let layerB: import('leaflet').LayerGroup | null = null
let layerResult: import('leaflet').LayerGroup | null = null

const mapCenter = computed<[number, number]>(() => {
  const view = DEFAULT_VIEW[props.lang]
  return [view.center[1], view.center[0]]
})

const mapZoom = computed(() => DEFAULT_VIEW[props.lang].zoom)

const needsLayerB = computed(() => operation.value !== 'simplify')

const canRun = computed(() => {
  if (!inputA.value || busy.value) return false
  if (needsLayerB.value && !inputB.value) return false
  if (operation.value === 'simplify' && !(tolerance.value > 0)) return false
  return true
})

const opHint = computed(() => props.ui[`tool.clip-overlay.op.${operation.value}Hint`] ?? '')

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

function featuresText(collection: VectorFeatureCollection | null): string {
  return collection
    ? msg('tool.clip-overlay.featuresCount', { n: countText(collection.features.length) })
    : props.ui['tool.clip-overlay.noLayer']
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

async function parseLayer(file: File): Promise<VectorFeatureCollection> {
  const mod = await import('../../lib/convert/format')

  if (file.size === 0) throw new Error('empty-file')
  if (file.size > FILE_LIMIT_BYTES) throw new Error('too-large')

  const bytes = new Uint8Array(await file.arrayBuffer())
  const binary = BINARY_EXT.has(extOf(file.name))
  const text = binary ? '' : mod.decodeBytes(bytes)

  if (!binary && text.trim() === '') throw new Error('empty-file')
  if (!binary && !mod.detectFormat(text, file.name)) throw new Error('unknown-format')

  const outcome = await mod.parseFileInput(text, {
    fileName: file.name,
    bytes: binary ? bytes : undefined,
    source: binary ? mod.detectFormat('', file.name) || 'auto' : 'auto'
  })

  if (outcome.collection.features.length === 0) throw new Error('empty-file')
  if (outcome.collection.features.length > FEATURE_LIMIT) throw new Error('too-many')
  return outcome.collection
}

async function onFilePicked(event: Event, slot: 'a' | 'b'): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  errorKey.value = ''
  outcome.value = null

  const loading = slot === 'a' ? loadingA : loadingB
  const target = slot === 'a' ? inputA : inputB
  const name = slot === 'a' ? nameA : nameB

  loading.value = true
  try {
    const collection = await parseLayer(file)
    target.value = collection
    name.value = file.name
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'too-large') setError('tool.clip-overlay.errTooLarge')
    else if (code === 'unknown-format') setError('tool.clip-overlay.errUnknownFormat')
    else if (code === 'too-many') setError('tool.clip-overlay.errTooMany')
    else if (code === 'empty-file') setError('tool.clip-overlay.errEmpty')
    else setError('tool.clip-overlay.errParse')
    target.value = null
    name.value = ''
    input.value = ''
  } finally {
    loading.value = false
  }
}

function openPicker(slot: 'a' | 'b'): void {
  if (slot === 'a') inputARef.value?.click()
  else inputBRef.value?.click()
}

function clearAll(): void {
  inputA.value = null
  inputB.value = null
  nameA.value = ''
  nameB.value = ''
  outcome.value = null
  errorKey.value = ''
  if (inputARef.value) inputARef.value.value = ''
  if (inputBRef.value) inputBRef.value.value = ''
  renderMap()
}

/* ------------------------------------------------------------------ *
 * 运算
 * ------------------------------------------------------------------ */

async function run(): Promise<void> {
  const a = inputA.value
  if (!a || !canRun.value) {
    if (!a) setError('tool.clip-overlay.errNeedA')
    else if (needsLayerB.value && !inputB.value) setError('tool.clip-overlay.errNeedBoth')
    return
  }

  errorKey.value = ''
  busy.value = true
  outcome.value = null
  await nextTick()

  try {
    const result =
      operation.value === 'simplify'
        ? simplifyCollection(a, tolerance.value)
        : overlayCollections(a, inputB.value as VectorFeatureCollection, operation.value)

    outcome.value = result
    if (result.outputCount === 0) setError('tool.clip-overlay.errNoResult')
  } catch {
    setError('tool.clip-overlay.errGeneric')
  } finally {
    busy.value = false
  }
}

/* ------------------------------------------------------------------ *
 * 地图
 * ------------------------------------------------------------------ */

function layerOptions(color: string, fill: number): import('leaflet').PathOptions {
  return {
    color,
    weight: 2,
    fillColor: color,
    fillOpacity: fill,
    interactive: false
  }
}

function drawLayer(
  group: import('leaflet').LayerGroup,
  collection: VectorFeatureCollection | null,
  color: string,
  fill: number
): void {
  if (!leaflet || !collection) return
  leaflet
    .geoJSON(collection as never, {
      style: layerOptions(color, fill),
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
  layerA?.clearLayers()
  layerB?.clearLayers()
  layerResult?.clearLayers()

  drawLayer(layerA!, inputA.value, '#1d4ed8', 0.05)
  drawLayer(layerB!, needsLayerB.value ? inputB.value : null, '#d97706', 0.05)
  drawLayer(layerResult!, outcome.value?.collection ?? null, '#15803d', 0.28)

  const bounds = leaflet.latLngBounds([])
  const extend = (collection: VectorFeatureCollection | null): void => {
    if (!collection) return
    const layer = leaflet!.geoJSON(collection as never)
    const b = layer.getBounds()
    if (b.isValid()) bounds.extend(b)
  }
  extend(inputA.value)
  extend(inputB.value)
  if (outcome.value) extend(outcome.value.collection)
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16], maxZoom: 16 })
}

function onMapReady(): void {
  map = mapCanvas.value?.getMap() ?? null
  leaflet = mapCanvas.value?.getLeaflet() ?? null
  if (!map || !leaflet) return

  layerA = leaflet.layerGroup().addTo(map)
  layerB = leaflet.layerGroup().addTo(map)
  layerResult = leaflet.layerGroup().addTo(map)
  renderMap()
}

watch([inputA, inputB, operation, outcome], () => renderMap())

/* ------------------------------------------------------------------ *
 * 导出
 * ------------------------------------------------------------------ */

function download(): void {
  const collection = outcome.value?.collection
  if (!collection) return
  const blob = new Blob([JSON.stringify(collection)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `overlay-${operation.value}.geojson`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <form class="ov" @submit.prevent>
    <div class="ov__layout">
      <div class="ov__panel">
        <div class="ov__card">
          <p class="result-title">{{ ui['tool.clip-overlay.layerA'] }}</p>
          <div class="ov__row">
            <button type="button" class="btn btn--primary ov__choose" @click="openPicker('a')">
              {{ inputA ? ui['tool.clip-overlay.changeFile'] : ui['tool.clip-overlay.chooseFile'] }}
            </button>
            <input
              ref="inputARef"
              class="visually-hidden"
              type="file"
              :accept="ACCEPT"
              :disabled="loadingA"
              @change="onFilePicked($event, 'a')"
            />
          </div>
          <p v-if="nameA" class="ov__name mono">{{ nameA }}</p>
          <p class="hint">{{ loadingA ? ui['tool.clip-overlay.parsing'] : featuresText(inputA) }}</p>
        </div>

        <div class="ov__card" :class="{ 'ov__card--muted': !needsLayerB }">
          <p class="result-title">{{ ui['tool.clip-overlay.layerB'] }}</p>
          <div class="ov__row">
            <button
              type="button"
              class="btn btn--primary ov__choose"
              :disabled="!needsLayerB"
              @click="openPicker('b')"
            >
              {{ inputB ? ui['tool.clip-overlay.changeFile'] : ui['tool.clip-overlay.chooseFile'] }}
            </button>
            <input
              ref="inputBRef"
              class="visually-hidden"
              type="file"
              :accept="ACCEPT"
              :disabled="!needsLayerB || loadingB"
              @change="onFilePicked($event, 'b')"
            />
          </div>
          <p v-if="nameB" class="ov__name mono">{{ nameB }}</p>
          <p class="hint">
            {{
              !needsLayerB
                ? ui['tool.clip-overlay.layerBSkip']
                : loadingB
                  ? ui['tool.clip-overlay.parsing']
                  : featuresText(inputB)
            }}
          </p>
        </div>

        <div class="ov__card">
          <p class="result-title">{{ ui['tool.clip-overlay.operation'] }}</p>
          <div class="ov__ops" role="radiogroup" :aria-label="ui['tool.clip-overlay.operation']">
            <button
              v-for="op in OPS"
              :key="op"
              type="button"
              role="radio"
              :aria-checked="operation === op"
              class="ov__op"
              :class="{ 'ov__op--active': operation === op }"
              @click="operation = op"
            >
              {{ ui[`tool.clip-overlay.op.${op}`] }}
            </button>
          </div>
          <p class="hint">{{ opHint }}</p>

          <label v-if="operation === 'simplify'" class="ov__field">
            <span>{{ ui['tool.clip-overlay.tolerance'] }}</span>
            <input v-model.number="tolerance" type="number" min="0.1" step="1" />
          </label>

          <button type="button" class="btn btn--primary ov__run" :disabled="!canRun" @click="run">
            {{ busy ? ui['tool.clip-overlay.running'] : ui['tool.clip-overlay.run'] }}
          </button>
          <p v-if="errorKey" class="note note--danger" role="alert">
            {{ ui[errorKey] ?? errorKey }}
          </p>
        </div>

        <div v-if="outcome" class="ov__card">
          <div class="ov__head">
            <p class="result-title">{{ ui['tool.clip-overlay.resultTitle'] }}</p>
            <button type="button" class="btn btn--ghost" @click="clearAll">
              {{ ui['tool.clip-overlay.clear'] }}
            </button>
          </div>
          <dl class="ov__stats">
            <div>
              <dt>{{ ui['tool.clip-overlay.resultFeatures'] }}</dt>
              <dd class="mono">{{ countText(outcome.outputCount) }}</dd>
            </div>
            <div v-if="outcome.areaM2 > 0">
              <dt>{{ ui['tool.clip-overlay.resultArea'] }}</dt>
              <dd class="mono">{{ fmt(outcome.areaM2, lang, 'measure', 0) }} m²</dd>
            </div>
            <div v-if="outcome.skipped > 0">
              <dt>{{ ui['tool.clip-overlay.resultSkipped'] }}</dt>
              <dd class="mono">{{ countText(outcome.skipped) }}</dd>
            </div>
          </dl>
          <button
            type="button"
            class="btn btn--primary ov__run"
            :disabled="outcome.outputCount === 0"
            @click="download"
          >
            {{ ui['tool.clip-overlay.download'] }}
          </button>
        </div>

        <p class="hint">{{ ui['tool.clip-overlay.privacy'] }}</p>
      </div>

      <div class="ov__map-col">
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
.ov {
  font-size: 13px;
}

.ov__layout {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  align-items: start;
  gap: var(--sp-4);
}

.ov__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-inline-size: 0;
}

.ov__map-col {
  min-inline-size: 0;
  position: sticky;
  top: var(--sp-3);
}

.ov__map-col :deep(.map-shell) {
  min-inline-size: 0;
}

.ov .hint {
  font-size: 12px;
  margin: 0;
}

.ov__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg-sub);
}

.ov__card--muted {
  opacity: 0.6;
}

.ov__card .result-title {
  margin: 0;
  font-size: 13px;
}

.ov__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}

.ov__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.ov__choose {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.ov__name {
  margin: 0;
  overflow-wrap: anywhere;
}

.ov__ops {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2);
}

.ov__op {
  padding: 6px 8px;
  font-size: 13px;
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg);
  color: var(--ink);
  cursor: pointer;
}

.ov__op--active {
  border-color: var(--acc);
  color: var(--acc);
  font-weight: 600;
}

.ov__field {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.ov__field input {
  inline-size: 96px;
  min-inline-size: 0;
  font-size: 13px;
}

.ov__run {
  inline-size: 100%;
}

.ov__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--sp-2);
  margin: 0;
}

.ov__stats div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.ov__stats dt {
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.ov__stats dd {
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
  .ov__layout {
    grid-template-columns: 1fr;
  }

  .ov__map-col {
    position: static;
    order: -1;
  }
}
</style>