<script setup lang="ts">
/**
 * T10 等距圈与缓冲区（PRD 6.3 T10）
 *
 * 两种模式共用同一套「半径 → 生成面 → 地图 → 指标 → 导出」管线：
 *   - 等距圈：椭球大地正算逐方位生成边界（lib/geo/circle.ts）；
 *   - 缓冲区：动态加载 @turf/buffer，对粘贴/导入的要素做外扩。
 *
 * 地图是主结果区，但不是计算的必要条件：瓦片失败时仍能导出结果。
 */

import { computed, onMounted, ref, watch } from 'vue'

import type { Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import MapCanvas from '../map/MapCanvas.vue'
import CopyButton from '../ui/CopyButton.vue'
import { fmtUnit, std } from '../../lib/coord/format'
import { parseCoord, DEFAULT_CTX } from '../../lib/coord/parse'
import {
  buildCircleCollection,
  circleMetrics,
  CIRCLE_COLORS,
  MAX_RADIUS_M,
  parseRadiusList,
  radiusToMeters,
  type RadiusUnit
} from '../../lib/geo/circle'
import { polygonSummary } from '../../lib/geo/polygon'
import { parseInput, serializeCollection } from '../../lib/convert/format'
import type {
  SerializeOutcome,
  VectorFeatureCollection,
  VectorFormat,
  VectorFeature
} from '../../lib/convert/types'
import { buildShareUrl, readShareState, T10_PARAMS, type ShareState } from '../../lib/share'

interface Props {
  lang: Lang
  ui: ToolUi & Record<string, string>
  toolId: string
}

const props = defineProps<Props>()

type Mode = 'circle' | 'buffer'

const DEFAULT_CENTER: Record<Lang, [number, number]> = {
  zh: [39.9088, 116.3974],
  en: [51.5072, -0.1276],
  ja: [35.6812, 139.7671]
}

const mode = ref<Mode>('circle')
/** 中心点经纬度合并成一个输入框，方便直接粘贴 `116.3974, 39.9088` */
const coordInput = ref('')
const radiiInput = ref('1, 3, 5')
const unit = ref<RadiusUnit>('km')
const segments = ref(128)
const pickMode = ref(false)
const bufferText = ref('')
const exportTarget = ref<VectorFormat>('geojson')

const collection = ref<VectorFeatureCollection | null>(null)
const rows = ref<
  { radiusM: number; areaM2: number; perimeterM: number; points: number; color: string }[]
>([])
const exportResult = ref<SerializeOutcome | null>(null)
const errorKey = ref('')
const errorVars = ref('')
const noticeKey = ref('')
const noticeVars = ref('')
const shareNote = ref('')
const busy = ref(false)

const mapCenter = computed<[number, number]>(() => {
  const c = parseCenter(coordInput.value)
  if (c) return [c.lat, c.lng]
  // 缓冲区模式不填中心点时，跟随缓冲结果的范围，避免停在默认城市
  const fromData = collection.value ? collectionCenter(collection.value) : null
  return fromData ?? DEFAULT_CENTER[props.lang]
})

/** 集合包围盒中心（只用于地图视角，不参与计算） */
function collectionCenter(fc: VectorFeatureCollection): [number, number] | null {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [lng, lat] = coords as [number, number]
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
      return
    }
    for (const child of coords) walk(child)
  }

  for (const f of fc.features) if (f.geometry) walk(f.geometry.coordinates)
  if (!Number.isFinite(minLng)) return null
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2]
}

/**
 * 点也可以不写 GeoJSON：整段输入全是「经度, 纬度」行时，每行当作一个点。
 * 与全站一致，经度在前、纬度在后；全角、度分秒交给 lib/coord/parse。
 */
function parsePointLines(text: string): VectorFeatureCollection | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  if (lines.length === 0) return null

  const features: VectorFeature[] = []
  for (const line of lines) {
    const r = parseCoord(line, DEFAULT_CTX)
    if (!r.ok) return null
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: {}
    })
  }
  return { type: 'FeatureCollection', features }
}

/**
 * 解析中心点。经度在前、纬度在后（与全站「经度, 纬度」一致），
 * 全角归一化、逗号含义、半球符号与度分秒都交给 lib/coord/parse。
 * 空输入返回 null；越界与不可解析同样返回 null，由 recompute 决定是否报错。
 */
function parseCenter(raw: string): { lng: number; lat: number } | null {
  if (raw.trim() === '') return null
  const r = parseCoord(raw, DEFAULT_CTX)
  return r.ok ? { lng: r.lng, lat: r.lat } : null
}

function setError(key: string, vars = ''): void {
  errorKey.value = key
  errorVars.value = vars
}

function setNotice(key: string, vars = ''): void {
  noticeKey.value = key
  noticeVars.value = vars
}

function areaText(m2: number): string {
  if (m2 >= 1_000_000) return fmtUnit(m2 / 1_000_000, props.lang, 'measure', 'km²', 2)
  return fmtUnit(m2, props.lang, 'measure', 'm²', 0)
}

function lengthText(m: number): string {
  if (m >= 1000) return fmtUnit(m / 1000, props.lang, 'measure', 'km', 3)
  return fmtUnit(m, props.lang, 'measure', 'm', 1)
}

/** 面几何的面积/周长（仅取外环；缓冲区可能是 MultiPolygon） */
function geometryMetrics(g: VectorFeature['geometry']): { areaM2: number; perimeterM: number } {
  if (!g) return { areaM2: 0, perimeterM: 0 }
  if (g.type === 'Polygon') {
    const s = polygonSummary(g.coordinates[0].map((p) => ({ lng: p[0], lat: p[1] })), true)
    return { areaM2: s.areaM2, perimeterM: s.perimeterM }
  }
  if (g.type === 'MultiPolygon') {
    let areaM2 = 0
    let perimeterM = 0
    for (const poly of g.coordinates) {
      const s = polygonSummary(poly[0].map((p) => ({ lng: p[0], lat: p[1] })), true)
      areaM2 += s.areaM2
      perimeterM += s.perimeterM
    }
    return { areaM2, perimeterM }
  }
  return { areaM2: 0, perimeterM: 0 }
}

function exportNow(): void {
  if (!collection.value || collection.value.features.length === 0) {
    exportResult.value = null
    return
  }
  try {
    exportResult.value = serializeCollection(collection.value, {
      target: exportTarget.value,
      indent: true,
      digits: 8,
      removeEmpty: true,
      gpxAttrs: 'name-desc',
      skipUnsupported: true
    })
  } catch {
    exportResult.value = null
  }
}

async function recompute(): Promise<void> {
  errorKey.value = ''
  noticeKey.value = ''
  rows.value = []
  collection.value = null
  exportResult.value = null

  const isCircle = mode.value === 'circle'

  // 等距圈必须有合法圆心；缓冲区模式不看中心点，只把地图视角对准数据
  let center: { lng: number; lat: number } | null = null
  if (isCircle) {
    if (coordInput.value.trim() === '') return
    center = parseCenter(coordInput.value)
    if (!center) {
      setError('tool.buffer-circle.errCenter')
      return
    }
  }

  const values = parseRadiusList(radiiInput.value)
  if (values.length === 0) {
    setError('tool.buffer-circle.errRadiusNumber')
    return
  }
  if (values.some((v) => !(v > 0))) {
    setError('tool.buffer-circle.errRadiusPositive')
    return
  }

  const radiiM = values.map((v) => radiusToMeters(v, unit.value))
  if (radiiM.some((r) => r > MAX_RADIUS_M)) {
    setError('tool.buffer-circle.errRadiusLimit')
    return
  }

  let seg = Math.round(Number(segments.value))
  if (!Number.isFinite(seg)) seg = 128
  seg = Math.min(1024, Math.max(8, seg))
  const totalPoints = seg * values.length
  if (totalPoints > 8192) {
    seg = Math.max(8, Math.floor(8192 / values.length))
    setNotice('tool.buffer-circle.precisionReduced', String(seg))
  }

  if (mode.value === 'circle') {
    const { lat, lng } = center!
    const metrics = values.map((v, i) => ({
      value: v,
      unit: unit.value,
      ...circleMetrics(lat, lng, radiiM[i], seg),
      color: CIRCLE_COLORS[i % CIRCLE_COLORS.length]
    }))
    collection.value = buildCircleCollection(
      lat,
      lng,
      values.map((v) => ({ value: v, unit: unit.value })),
      seg
    )
    rows.value = metrics.map((m) => ({
      radiusM: m.radiusM,
      areaM2: m.areaM2,
      perimeterM: m.perimeterM,
      points: m.points,
      color: m.color
    }))
    if (metrics.some((m) => m.fellBack)) setNotice('tool.buffer-circle.sphereFallback')
    exportNow()
    return
  }

  // 缓冲区模式
  if (bufferText.value.trim() === '') {
    setError('tool.buffer-circle.errBufferEmpty')
    return
  }
  busy.value = true
  try {
    let parsedCollection: VectorFeatureCollection
    try {
      parsedCollection = parseInput(bufferText.value).collection
    } catch {
      // 不是已知矢量格式时，再按「每行一组经纬度」当作点来缓冲
      const points = parsePointLines(bufferText.value)
      if (!points) {
        setError('tool.buffer-circle.errBufferParse')
        return
      }
      parsedCollection = points
    }
    if (parsedCollection.features.length === 0) {
      setError('tool.buffer-circle.errBufferEmpty')
      return
    }
    const { bufferCollection } = await import('../../lib/geo/buffer')
    const buffered = bufferCollection(parsedCollection, { radiiM, steps: seg })
    if (buffered.features.length === 0) {
      setError('tool.buffer-circle.errBufferEmpty')
      return
    }
    collection.value = buffered

    // 按半径聚合面积/周长
    const byRadius = new Map<number, { areaM2: number; perimeterM: number; count: number }>()
    for (const f of buffered.features) {
      const r = Number(f.properties.radius_m)
      const m = geometryMetrics(f.geometry)
      const cur = byRadius.get(r) ?? { areaM2: 0, perimeterM: 0, count: 0 }
      cur.areaM2 += m.areaM2
      cur.perimeterM += m.perimeterM
      cur.count++
      byRadius.set(r, cur)
    }
    rows.value = [...byRadius.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r], i) => {
        const agg = byRadius.get(r)!
        return {
          radiusM: r,
          areaM2: agg.areaM2,
          perimeterM: agg.perimeterM,
          points: agg.count,
          color: CIRCLE_COLORS[i % CIRCLE_COLORS.length]
        }
      })
    exportNow()
  } finally {
    busy.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  [mode, coordInput, radiiInput, unit, segments, bufferText, exportTarget],
  () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (collection.value && exportTarget.value) {
        // 导出目标变化时只重序列化，避免重新生成几何
      }
      void recompute()
    }, 300)
  }
)

function onPick(lat: number, lng: number): void {
  coordInput.value = `${std(lng, 8)}, ${std(lat, 8)}`
  pickMode.value = false
}

function download(): void {
  if (!exportResult.value) return
  const now = new Date()
  const p = (n: number) => (n < 10 ? `0${n}` : String(n))
  const blob = new Blob([`${exportResult.value.text}\n`], { type: exportResult.value.mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `buffer-circle-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.${exportResult.value.extension}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function onShare(): Promise<void> {
  const state: ShareState = {
    lat: Number(std(mapCenter.value[0], 8)),
    lng: Number(std(mapCenter.value[1], 8)),
    r: radiiInput.value,
    unit: unit.value,
    seg: segments.value,
    mode: mode.value,
    buf: bufferText.value
  }
  const link = await buildShareUrl(globalThis.location.pathname, state, T10_PARAMS, {
    r: '1, 3, 5',
    unit: 'km',
    seg: 128,
    mode: 'circle'
  })
  if (link.mode === 'tooLarge') {
    shareNote.value = props.ui['common.shareTooLarge']
    return
  }
  const abs = new URL(link.url, globalThis.location.origin).href
  try {
    await navigator.clipboard.writeText(abs)
    shareNote.value = props.ui['common.shared']
  } catch {
    shareNote.value = abs
  }
  setTimeout(() => {
    if (shareNote.value === props.ui['common.shared']) shareNote.value = ''
  }, 2500)
}

onMounted(async () => {
  const restored = await readShareState(
    { search: globalThis.location.search, hash: globalThis.location.hash },
    T10_PARAMS
  )
  if (restored.hadProblems) shareNote.value = props.ui['common.shareReset']
  const s = restored.state
  // 分享链接仍按 lng / lat 两个数值参数编码，这里重新拼成合并输入框的一串
  const lat = typeof s.lat === 'number' ? s.lat : DEFAULT_CENTER[props.lang][0]
  const lng = typeof s.lng === 'number' ? s.lng : DEFAULT_CENTER[props.lang][1]
  coordInput.value = `${std(lng, 8)}, ${std(lat, 8)}`
  if (typeof s.r === 'string') radiiInput.value = s.r
  if (s.unit === 'm' || s.unit === 'km' || s.unit === 'mi' || s.unit === 'nmi') unit.value = s.unit
  if (typeof s.seg === 'number') segments.value = s.seg
  if (s.mode === 'circle' || s.mode === 'buffer') mode.value = s.mode
  if (typeof s.buf === 'string') bufferText.value = s.buf
  await recompute()
})
</script>

<template>
  <form class="t10" @submit.prevent>
    <div class="mode-row">
      <button
        type="button"
        class="btn"
        :class="mode === 'circle' ? 'btn--primary' : 'btn--ghost'"
        @click="mode = 'circle'"
      >
        {{ ui['tool.buffer-circle.modeCircle'] }}
      </button>
      <button
        type="button"
        class="btn"
        :class="mode === 'buffer' ? 'btn--primary' : 'btn--ghost'"
        @click="mode = 'buffer'"
      >
        {{ ui['tool.buffer-circle.modeBuffer'] }}
      </button>
    </div>

    <!-- 圆心与拾取只属于等距圈；缓冲区用地要素自身的范围定位地图 -->
    <template v-if="mode === 'circle'">
      <div class="row">
        <div class="field">
          <label for="t10-coord">{{ ui['coord.lngLat'] }}</label>
          <input
            id="t10-coord"
            v-model="coordInput"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            spellcheck="false"
            :placeholder="ui['coord.pairPlaceholder']"
          />
        </div>
      </div>

      <div class="btn-row">
        <button
          type="button"
          class="btn"
          :class="pickMode ? 'btn--primary' : 'btn--ghost'"
          @click="pickMode = !pickMode"
        >
          {{ pickMode ? ui['tool.buffer-circle.pickOn'] : ui['tool.buffer-circle.pickOff'] }}
        </button>
      </div>
    </template>

    <div class="row">
      <div class="field">
        <label for="t10-radii">{{ ui['tool.buffer-circle.radii'] }}</label>
        <input id="t10-radii" v-model="radiiInput" type="text" inputmode="decimal" autocomplete="off" />
        <span class="field__hint">{{ ui['tool.buffer-circle.radiiHint'] }}</span>
      </div>
      <div class="field field--small">
        <label for="t10-unit">{{ ui['tool.buffer-circle.unit'] }}</label>
        <select id="t10-unit" v-model="unit">
          <option value="m">{{ ui['tool.buffer-circle.unit.m'] }}</option>
          <option value="km">{{ ui['tool.buffer-circle.unit.km'] }}</option>
          <option value="mi">{{ ui['tool.buffer-circle.unit.mi'] }}</option>
          <option value="nmi">{{ ui['tool.buffer-circle.unit.nmi'] }}</option>
        </select>
      </div>
    </div>

    <details class="advanced">
      <summary>{{ ui['common.advanced'] }}</summary>
      <div class="field field--small">
        <label for="t10-seg">{{ ui['tool.buffer-circle.segments'] }}</label>
        <input id="t10-seg" v-model.number="segments" type="number" min="8" max="1024" step="8" />
      </div>
      <p class="hint">{{ ui['tool.buffer-circle.segmentsHint'] }}</p>
    </details>

    <div v-if="mode === 'buffer'" class="field">
      <label for="t10-buffer">{{ ui['tool.buffer-circle.bufferInput'] }}</label>
      <textarea
        id="t10-buffer"
        v-model="bufferText"
        class="mono"
        rows="6"
        spellcheck="false"
        :placeholder="ui['tool.buffer-circle.bufferPlaceholder']"
      ></textarea>
      <span class="field__hint">{{ ui['tool.buffer-circle.bufferHint'] }}</span>
    </div>

    <MapCanvas
      :center="mapCenter"
      :zoom="10"
      :pick="pickMode"
      :geojson="collection"
      :drag-prompt="ui['common.mapDragPrompt']"
      :loading-text="ui['common.mapLoading']"
      :tile-error-text="ui['common.mapTileError']"
      :basemap-label="ui['common.basemap']"
      :basemap-street="ui['common.basemapStreet']"
      :basemap-satellite="ui['common.basemapSatellite']"
      :basemap-terrain="ui['common.basemapTerrain']"
      @pick="onPick"
    />

    <p v-if="errorKey" class="note note--warn" role="alert">
      {{ ui[errorKey].replace('{vars}', errorVars) }}
    </p>
    <p v-if="noticeKey" class="note note--inline">
      {{ ui[noticeKey].replace('{segments}', noticeVars) }}
    </p>

    <template v-if="rows.length">
      <p class="result-title">{{ ui['tool.buffer-circle.resultTitle'] }}</p>

      <div class="legend">
        <span v-for="(r, i) in rows" :key="i" class="legend__item">
          <i class="legend__dot" :style="{ background: r.color }"></i>
          {{ lengthText(r.radiusM) }}
        </span>
      </div>

      <table class="result-table">
        <thead>
          <tr>
            <th>{{ ui['tool.buffer-circle.colRadius'] }}</th>
            <th>{{ ui['tool.buffer-circle.colArea'] }}</th>
            <th>{{ ui['tool.buffer-circle.colPerimeter'] }}</th>
            <th>{{ ui['tool.buffer-circle.colPoints'] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td>
              <i class="legend__dot" :style="{ background: r.color }"></i>
              {{ lengthText(r.radiusM) }}
            </td>
            <td>{{ areaText(r.areaM2) }}</td>
            <td>{{ lengthText(r.perimeterM) }}</td>
            <td>{{ r.points }}</td>
          </tr>
        </tbody>
      </table>

      <div class="field field--small">
        <label for="t10-export">{{ ui['tool.buffer-circle.exportLabel'] }}</label>
        <select id="t10-export" v-model="exportTarget">
          <option value="geojson">GeoJSON</option>
          <option value="kml">KML</option>
          <option value="wkt">WKT</option>
        </select>
      </div>

      <pre v-if="exportResult" class="output mono">{{ exportResult.text.split('\n').slice(0, 40).join('\n') }}</pre>

      <div class="btn-row">
        <CopyButton
          v-if="exportResult"
          :text="exportResult.text"
          :label="ui['common.copy']"
          :success-label="ui['common.copied']"
          :fail-label="ui['common.copyFailed']"
          variant="secondary"
        />
        <button type="button" class="btn btn--primary" :disabled="!exportResult" @click="download">
          {{ ui['common.download'] }}
        </button>
        <button type="button" class="btn btn--ghost" @click="onShare">
          {{ ui['common.share'] }}
        </button>
      </div>
      <p class="hint">{{ ui['common.shareWarning'] }}</p>
    </template>

    <p v-if="busy" class="hint">{{ ui['common.loading'] }}</p>
    <p v-if="shareNote" class="note note--dim share-note">{{ shareNote }}</p>
  </form>
</template>

<style scoped>
.t10 {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.mode-row {
  display: flex;
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

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-4);
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.legend__item {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
}

.legend__dot {
  display: inline-block;
  inline-size: 10px;
  block-size: 10px;
  border-radius: 50%;
  margin-inline-end: var(--sp-1);
}

.result-table {
  inline-size: 100%;
  border-collapse: collapse;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
}

.result-table th,
.result-table td {
  text-align: start;
  padding: var(--sp-1) var(--sp-2);
  border-block-end: 1px solid var(--line);
}

.output {
  margin: 0;
  padding: var(--sp-3);
  max-block-size: 300px;
  overflow: auto;
  background: var(--bg-sub);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  white-space: pre;
}

.mono {
  font-family: var(--mono);
}

.advanced {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.note {
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
  margin: 0;
}

.note--inline {
  padding-inline: 0;
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

.share-note {
  overflow-wrap: anywhere;
  font-family: var(--mono);
}
</style>