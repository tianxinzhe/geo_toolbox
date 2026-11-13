<script setup lang="ts">
/**
 * T09 在线地图绘制器（PRD 6.3 T09）
 *
 * 分层约束：
 *   ① 状态与逻辑层 → src/lib/draw/state.ts（纯函数，可单测）
 *   ② 交互层 → 本组件：把 Leaflet-Geoman 事件翻译成状态层调用
 *
 * 实现取舍（如实告知，不假装完成）：
 *   - 绘制与顶点编辑交给 Leaflet-Geoman：工具栏只保留绘制与编辑两组按钮，
 *     不提供拖拽/切割/删除/旋转/文字/圆点标记，删除仍走右侧要素列表。
 *   - 要素始终以 features / DrawHistory 为唯一数据源；Geoman 图层只作为
 *     交互载体，创建后立即移除，编辑结果按 __fid 静默回写。
 *   - 删除与清空使用行内二次确认，不弹 window.confirm。
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import MapCanvas from '../map/MapCanvas.vue'
// Geoman 是纯客户端插件：JS 动态加载，样式随组件一起打包
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import CopyButton from '../ui/CopyButton.vue'
import FeatureList from './FeatureList.vue'
import { fmtUnit } from '../../lib/coord/format'
import { parseFileInput, parseInput } from '../../lib/convert/format'
import { FORMAT_LABEL, type VectorFormat } from '../../lib/convert/types'
import { geodesicRing } from '../../lib/geo/circle'
import {
  DrawHistory,
  adoptFeatures,
  exportFeatures,
  measureFeature,
  newFeatureId,
  parseStored,
  serializeForStorage,
  statsOf,
  STORAGE_KEY,
  type DrawFeature
} from '../../lib/draw/state'
import { buildShareUrl, readShareState, T09_PARAMS, type ShareState } from '../../lib/share'

interface Props {
  lang: Lang
  ui: ToolUi & Record<string, string>
  toolId: string
}

const props = defineProps<Props>()

/** Geoman 会在每个要素图层上写入 __fid，用来把编辑结果映射回 features */
type PmLayer = import('leaflet').Layer & { __fid?: string }

const DEFAULT_VIEW: Record<Lang, [number, number]> = {
  zh: [39.9088, 116.3974],
  en: [51.5072, -0.1276],
  ja: [35.6812, 139.7671]
}

const EXPORT_TARGETS: VectorFormat[] = ['geojson', 'kml', 'gpx', 'wkt', 'csv', 'shapefile']

const mapCanvas = ref<InstanceType<typeof MapCanvas> | null>(null)
const history = new DrawHistory({ features: [] })
const version = ref(0)
const selectedId = ref<string | null>(null)

/* ------------------------------------------------------------------ *
 * 移动端交互层（PRD 6.3 T09）
 *   - 触屏设备从要素列表选中后自动收起底部抽屉；
 *   - 绘制与顶点编辑由 Geoman 接管，不再自绘控制点或放大镜。
 * ------------------------------------------------------------------ */

const isCoarse = ref(false)

const exportTarget = ref<VectorFormat>('geojson')
const exportText = ref('')
const exportBytes = ref<Uint8Array | null>(null)
const exportExt = ref('geojson')
const exportWarning = ref('')

const importText = ref('')
const localNotice = ref('')
const transientNotice = ref('')
const errorKey = ref('')
const shareNote = ref('')

const propName = ref('')
const propDesc = ref('')
const customRows = ref<{ k: string; v: string }[]>([])
const propsError = ref('')
const confirmDeleteId = ref<string | null>(null)
const confirmClear = ref(false)
/** 移动端要素列表底部抽屉 */
const drawerOpen = ref(false)

const features = computed(() => {
  version.value
  return history.current.features
})

const selected = computed(() => features.value.find((f) => f.id === selectedId.value) ?? null)

const stats = computed(() => statsOf(features.value))

let map: import('leaflet').Map | null = null
let L: typeof import('leaflet') | null = null
let featureLayer: import('leaflet').LayerGroup | null = null
/** 动态 import Geoman 期间组件可能已卸载，避免继续操作已销毁的地图 */
let disposed = false

/* ------------------------------------------------------------------ *
 * 格式化
 * ------------------------------------------------------------------ */

function lengthText(m?: number): string {
  if (m === undefined) return '—'
  if (m >= 1000) return fmtUnit(m / 1000, props.lang, 'measure', 'km', 3)
  return fmtUnit(m, props.lang, 'measure', 'm', 1)
}

function areaText(m2?: number): string {
  if (m2 === undefined) return '—'
  if (m2 >= 1_000_000) return fmtUnit(m2 / 1_000_000, props.lang, 'measure', 'km²', 3)
  return fmtUnit(m2, props.lang, 'measure', 'm²', 1)
}

function typeKey(t: string): string {
  const map: Record<string, string> = {
    Point: 'tool.map-draw.typePoint',
    LineString: 'tool.map-draw.typeLine',
    Polygon: 'tool.map-draw.typePolygon',
    MultiPoint: 'tool.map-draw.typePoint',
    MultiLineString: 'tool.map-draw.typeLine',
    MultiPolygon: 'tool.map-draw.typePolygon'
  }
  return map[t] ?? 'tool.map-draw.typeOther'
}

function bump(): void {
  version.value++
}

function commit(nextFeatures: DrawFeature[]): void {
  history.commit({ features: nextFeatures })
  bump()
  scheduleSave()
  renderAll()
}

/**
 * 静默提交：只更新数据与派生 UI，不重建图层。
 * Geoman 编辑期间若调用 renderAll() 会销毁正在编辑的图层。
 */
function commitQuiet(nextFeatures: DrawFeature[]): void {
  history.commit({ features: nextFeatures })
  bump()
  scheduleSave()
  renderExport()
}

/* ------------------------------------------------------------------ *
 * 地图渲染与 Geoman 对接
 * ------------------------------------------------------------------ */

/** 绘制 / 编辑进行中时，把地图点击事件交还给 Geoman，避免抢事件 */
function geomanBusy(): boolean {
  if (!map?.pm) return false
  return map.pm.globalDrawModeEnabled() || map.pm.globalEditModeEnabled()
}

async function onMapReady(): Promise<void> {
  map = mapCanvas.value?.getMap() ?? null
  L = mapCanvas.value?.getLeaflet() ?? null
  if (!map || !L) return

  featureLayer = L.layerGroup().addTo(map)

  map.on('click', onMapEmptyClick)
  // 绘制时双击用于结束图形，不能再同时缩放地图
  map.doubleClickZoom.disable()

  const center = DEFAULT_VIEW[props.lang]
  map.setView(center, 12)

  renderAll()
  await initGeoman()
}

/**
 * Leaflet 本身是懒加载的，插件也必须在客户端动态 import，避免 SSR 执行 DOM 代码。
 * 地图实例可能早于插件创建，此时 Geoman 的 init hook 不会自动挂载 pm，手动补一次。
 */
async function initGeoman(): Promise<void> {
  if (!map || !L) return
  await import('@geoman-io/leaflet-geoman-free')
  if (disposed || !map || !L) return

  // 地图实例早于插件创建，Geoman 的 init hook 不会执行，手动补挂 pm
  if (!map.pm) {
    const pmRuntime = L as unknown as { PM: { reInitLayer: (layer: unknown) => void } }
    pmRuntime.PM.reInitLayer(map)
  }
  if (!map.pm) return

  map.pm.setLang(props.lang === 'zh' ? 'zh' : props.lang === 'ja' ? 'ja' : 'en')
  map.pm.addControls({
    position: 'topleft',
    drawMarker: true,
    drawPolyline: true,
    drawPolygon: true,
    drawRectangle: true,
    drawCircle: true,
    drawCircleMarker: false,
    drawText: false,
    editMode: true,
    dragMode: false,
    cutPolygon: false,
    removalMode: false,
    rotateMode: false
  })

  map.on('pm:create', onPmCreate)

  // 插件加载后重建要素图层，Geoman 的 init hook 才会挂到每个子图层
  renderAll()
}

function featureStyle(selectedNow: boolean): import('leaflet').PathOptions {
  return selectedNow
    ? { color: '#dc2626', weight: 3, fillOpacity: 0.22, fillColor: '#dc2626' }
    : { color: '#1f6feb', weight: 2, fillOpacity: 0.12, fillColor: '#1f6feb' }
}

function renderAll(): void {
  if (!map || !L || !featureLayer) return
  featureLayer.clearLayers()

  for (const f of features.value) {
    if (!f.geometry) continue
    const selectedNow = f.id === selectedId.value
    const geo = L.geoJSON(
      {
        type: 'Feature',
        properties: { ...f.properties, __id: f.id },
        geometry: f.geometry
      } as never,
      {
        style: () => featureStyle(selectedNow),
        pointToLayer: (_feature, latlng) =>
          L!.circleMarker(latlng, {
            radius: selectedNow ? 8 : 6,
            color: selectedNow ? '#dc2626' : '#1f6feb',
            weight: 2,
            fillOpacity: 0.65
          }),
        onEachFeature: (_feature, layer) => {
          ;(layer as PmLayer).__fid = f.id
          // Geoman 的编辑事件发在图层自身与父分组上，直接挂在图层上最可靠
          layer.on('pm:update', () => syncFromLayer(layer))
          layer.on('pm:markerdragend', () => syncFromLayer(layer))
          layer.on('click', (e) => {
            // 绘制 / 编辑期间不抢点击，也不重建图层
            if (geomanBusy()) return
            L!.DomEvent.stopPropagation(e)
            selectFeature(f.id)
          })
        }
      }
    )
    featureLayer.addLayer(geo)
  }

  renderExport()
}

function selectFeature(id: string): void {
  selectedId.value = id
  syncProps()
  // 移动端从抽屉点选后收起抽屉，让地图与属性面板可见
  if (isCoarse.value && drawerOpen.value) drawerOpen.value = false
  renderAll()
}

/* ------------------------------------------------------------------ *
 * Geoman → features 同步
 * ------------------------------------------------------------------ */

/** 读取图层几何；圆按 64 边形近似，保持数据模型里只有标准 GeoJSON 几何 */
function geometryOfLayer(layer: import('leaflet').Layer): DrawFeature['geometry'] | null {
  if (!L) return null
  if (layer instanceof L.Circle) {
    const center = layer.getLatLng()
    const radius = layer.getRadius()
    if (!(radius > 0)) return null
    try {
      return {
        type: 'Polygon',
        coordinates: [geodesicRing(center.lat, center.lng, radius, 64).ring]
      }
    } catch {
      return null
    }
  }
  const toGeoJSON = (
    layer as unknown as { toGeoJSON?: () => { geometry?: DrawFeature['geometry'] } }
  ).toGeoJSON
  if (typeof toGeoJSON !== 'function') return null
  return toGeoJSON.call(layer)?.geometry ?? null
}

function onPmCreate(e: { layer: import('leaflet').Layer }): void {
  const geometry = geometryOfLayer(e.layer)
  // 先移除 Geoman 图层，避免和自绘图层重复
  map?.removeLayer(e.layer)
  if (geometry) addFeature(geometry)
}

function syncFromLayer(layer: import('leaflet').Layer): void {
  const fid = (layer as PmLayer).__fid
  if (typeof fid !== 'string') return
  const feature = features.value.find((f) => f.id === fid)
  if (!feature) return

  const geometry = geometryOfLayer(layer)
  if (!geometry) return
  // 关闭编辑模式时 Geoman 会对每个图层触发一次 pm:update，未变化的不入历史
  if (JSON.stringify(geometry) === JSON.stringify(feature.geometry)) return

  commitQuiet(features.value.map((f) => (f.id === fid ? { ...f, geometry } : f)))
}

/** 点击空白地图取消选中；绘制 / 编辑期间不处理 */
function onMapEmptyClick(): void {
  if (geomanBusy()) return
  if (selectedId.value === null) return
  selectedId.value = null
  confirmDeleteId.value = null
  renderAll()
}

/* ------------------------------------------------------------------ *
 * 属性面板
 * ------------------------------------------------------------------ */

function syncProps(): void {
  const f = selected.value
  propName.value = typeof f?.properties.name === 'string' ? f.properties.name : ''
  propDesc.value = typeof f?.properties.description === 'string' ? f.properties.description : ''
  customRows.value = Object.entries(f?.properties ?? {})
    .filter(([k]) => k !== 'name' && k !== 'description' && k !== 'Name')
    .map(([k, v]) => ({ k, v: v === null || v === undefined ? '' : String(v) }))
  propsError.value = ''
}

const RESERVED = new Set(['type', 'coordinates', 'geometry', 'properties', 'features', '__id'])

function applyProps(): void {
  const f = selected.value
  if (!f) return
  const names = customRows.value.map((r) => r.k.trim())
  if (names.some((n) => n === '')) {
    propsError.value = 'tool.map-draw.propsEmptyKey'
    return
  }
  if (new Set(names).size !== names.length) {
    propsError.value = 'tool.map-draw.propsDuplicate'
    return
  }
  if (names.some((n) => RESERVED.has(n))) {
    propsError.value = 'tool.map-draw.propsReserved'
    return
  }
  propsError.value = ''
  const properties: Record<string, unknown> = {}
  if (propName.value.trim() !== '') properties.name = propName.value.trim()
  if (propDesc.value.trim() !== '') properties.description = propDesc.value.trim()
  for (const row of customRows.value) {
    if (row.k.trim() === '') continue
    properties[row.k.trim()] = row.v
  }
  const updated = features.value.map((item) => (item.id === f.id ? { ...item, properties } : item))
  commit(updated)
}

function addCustomRow(): void {
  customRows.value.push({ k: '', v: '' })
}

function removeCustomRow(i: number): void {
  customRows.value.splice(i, 1)
  applyProps()
}

/* ------------------------------------------------------------------ *
 * 删除 / 清空
 * ------------------------------------------------------------------ */

function deleteFeature(id: string): void {
  const updated = features.value.filter((f) => f.id !== id)
  if (selectedId.value === id) selectedId.value = null
  confirmDeleteId.value = null
  commit(updated)
}

function clearAll(): void {
  selectedId.value = null
  confirmClear.value = false
  drawerOpen.value = false
  commit([])
}

const canUndo = computed(() => {
  version.value
  return history.canUndo
})

const canRedo = computed(() => {
  version.value
  return history.canRedo
})

const defaultView = computed<[number, number]>(() => DEFAULT_VIEW[props.lang])

const selectedVertexCount = computed(() => {
  const m = selected.value ? measureFeature(selected.value) : null
  return m?.vertices ?? 0
})

function typeLabel(t: string): string {
  return props.ui[typeKey(t)] ?? t
}

const exportPreview = computed(() => exportText.value.split('\n').slice(0, 30).join('\n'))
const tooManyFeatures = computed(() => features.value.length > 2000)

/* ------------------------------------------------------------------ *
 * 新增要素（Geoman 绘制完成后调用）
 * ------------------------------------------------------------------ */

function addFeature(geometry: DrawFeature['geometry']): void {
  const feature: DrawFeature = {
    type: 'Feature',
    id: newFeatureId(),
    geometry,
    properties: {}
  }
  commit([...features.value, feature])
  selectedId.value = feature.id
  syncProps()
  renderAll()
}

/* ------------------------------------------------------------------ *
 * 撤销 / 重做
 * ------------------------------------------------------------------ */

function afterHistory(): void {
  bump()
  if (selectedId.value && !features.value.some((f) => f.id === selectedId.value)) {
    selectedId.value = null
  }
  syncProps()
  renderAll()
  scheduleSave()
}

function undo(): void {
  history.undo()
  afterHistory()
}

function redo(): void {
  history.redo()
  afterHistory()
}

function onKeydown(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement | null)?.tagName ?? ''
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return

  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    undo()
    return
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    redo()
    return
  }
  if (e.key === 'Escape') {
    // 绘制中的 Esc 由 Geoman 自己处理，这里只关闭行内确认
    confirmClear.value = false
    confirmDeleteId.value = null
    return
  }
  if (e.key === 'Delete' && selectedId.value) {
    e.preventDefault()
    confirmDeleteId.value = selectedId.value
  }
}

/* ------------------------------------------------------------------ *
 * 导出
 * ------------------------------------------------------------------ */

function renderExport(): void {
  if (features.value.length === 0) {
    exportText.value = ''
    exportBytes.value = null
    exportWarning.value = ''
    return
  }
  try {
    const r = exportFeatures(features.value, exportTarget.value)
    exportText.value = r.text
    exportBytes.value = r.bytes ?? null
    exportExt.value = r.extension
    if (r.unsupported.count > 0) {
      exportWarning.value = props.ui['tool.map-draw.gpxSkipped']
        .replace('{count}', String(r.unsupported.count))
    } else {
      exportWarning.value = ''
    }
  } catch {
    exportText.value = ''
    exportBytes.value = null
    exportWarning.value = props.ui['tool.map-draw.exportFailed']
  }
}

function download(): void {
  if (!exportText.value && !exportBytes.value) return
  const now = new Date()
  const p = (n: number) => (n < 10 ? `0${n}` : String(n))
  const body = exportBytes.value
    ? ([exportBytes.value] as unknown as BlobPart[])
    : [`${exportText.value}\n`]
  const blob = new Blob(body, { type: exportBytes.value ? 'application/zip' : 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `map-draw-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.${exportExt.value}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ *
 * 导入
 * ------------------------------------------------------------------ */

function adoptParsed(parsed: ReturnType<typeof parseInput>): void {
  if (parsed.collection.features.length === 0) {
    transientNotice.value = props.ui['tool.map-draw.importEmpty']
    return
  }
  const adopted = adoptFeatures(parsed.collection.features)
  commit([...features.value, ...adopted])
  transientNotice.value = props.ui['tool.map-draw.imported'].replace(
    '{count}',
    String(adopted.length)
  )
  importText.value = ''
  fitAll()
}

function importData(raw: string, fileName?: string): void {
  if (raw.trim() === '') return
  try {
    adoptParsed(parseInput(raw, { fileName }))
  } catch {
    transientNotice.value = props.ui['tool.map-draw.importFailed']
  }
}

/** Shapefile ZIP 需要异步加载 shpjs，单独走二进制入口（P1） */
async function importBytes(bytes: Uint8Array, fileName: string): Promise<void> {
  try {
    adoptParsed(await parseFileInput('', { fileName, bytes }))
  } catch {
    transientNotice.value = props.ui['tool.map-draw.importFailed']
  }
}

function onImportPaste(): void {
  importData(importText.value)
}

function onImportFile(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    if (/\.zip$/i.test(file.name)) {
      void file.arrayBuffer().then((buf) => importBytes(new Uint8Array(buf), file.name))
    } else {
      void file.text().then((t) => importData(t, file.name))
    }
  }
  input.value = ''
}

function fitAll(): void {
  if (!L || !map || features.value.length === 0) return
  const bounds = L.latLngBounds([])
  const add = (p: number[]): void => {
    if (p.length >= 2) bounds.extend([p[1], p[0]])
  }
  for (const f of features.value) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Point') add(g.coordinates)
    else if (g.type === 'LineString' || g.type === 'MultiPoint') g.coordinates.forEach(add)
    else if (g.type === 'Polygon' || g.type === 'MultiLineString') {
      g.coordinates.forEach((ring) => ring.forEach(add))
    } else if (g.type === 'MultiPolygon') {
      g.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(add)))
    }
  }
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 })
}

/* ------------------------------------------------------------------ *
 * 本地保存
 * ------------------------------------------------------------------ */

let saveTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSave(): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeForStorage(features.value))
    } catch {
      transientNotice.value = props.ui['tool.map-draw.storageFull']
    }
  }, 1000)
}

function restoreLocal(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const stored = parseStored(raw)
    if (!stored || stored.features.length === 0) return
    history.reset({ features: stored.features })
    bump()
    localNotice.value = props.ui['tool.map-draw.restored'].replace(
      '{count}',
      String(stored.features.length)
    )
  } catch {
    // 读取失败当作没有保存
  }
}

function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  localNotice.value = ''
  transientNotice.value = props.ui['tool.map-draw.storageCleared']
}

/* ------------------------------------------------------------------ *
 * 分享
 * ------------------------------------------------------------------ */

async function onShare(): Promise<void> {
  const data =
    features.value.length === 0
      ? ''
      : JSON.stringify({
          type: 'FeatureCollection',
          features: features.value.map((f) => ({
            type: 'Feature',
            geometry: f.geometry,
            properties: f.properties
          }))
        })
  const state: ShareState = { target: exportTarget.value, data }
  const link = await buildShareUrl(globalThis.location.pathname, state, T09_PARAMS, {
    target: 'geojson'
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

/* ------------------------------------------------------------------ *
 * 生命周期
 * ------------------------------------------------------------------ */

let noticeTimer: ReturnType<typeof setTimeout> | undefined
watch(transientNotice, (v) => {
  if (v === '') return
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (transientNotice.value = ''), 4000)
})

watch(exportTarget, () => renderExport())

onMounted(async () => {
  isCoarse.value =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  restoreLocal()
  window.addEventListener('keydown', onKeydown)

  const restored = await readShareState(
    { search: globalThis.location.search, hash: globalThis.location.hash },
    T09_PARAMS
  )
  if (restored.hadProblems) shareNote.value = props.ui['common.shareReset']
  const s = restored.state
  if (typeof s.data === 'string' && s.data.trim() !== '') {
    try {
      const parsed = parseInput(s.data)
      if (parsed.collection.features.length > 0) {
        history.reset({ features: adoptFeatures(parsed.collection.features) })
        bump()
        renderAll()
      }
    } catch {
      // 分享数据损坏时保留本地恢复结果
    }
  }
  if (typeof s.target === 'string' && EXPORT_TARGETS.includes(s.target as VectorFormat)) {
    exportTarget.value = s.target as VectorFormat
  }
})

onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(saveTimer)
  clearTimeout(noticeTimer)
})
</script>

<template>
  <form class="t09" @submit.prevent>
    <p class="hint">{{ ui['tool.map-draw.lead'] }}</p>
    <p class="hint">{{ ui['tool.map-draw.hint.select'] }}</p>

    <div class="toolbar toolbar--actions">
      <button type="button" class="btn btn--ghost" :disabled="!canUndo" @click="undo">
        {{ ui['tool.map-draw.undo'] }}
      </button>
      <button type="button" class="btn btn--ghost" :disabled="!canRedo" @click="redo">
        {{ ui['tool.map-draw.redo'] }}
      </button>
      <button type="button" class="btn btn--ghost" :disabled="features.length === 0" @click="confirmClear = true">
        {{ ui['tool.map-draw.clearAll'] }}
      </button>
    </div>

    <div v-if="confirmClear" class="confirm-bar" role="alert">
      <span>{{ ui['tool.map-draw.clearConfirm'].replace('{count}', String(features.length)) }}</span>
      <button type="button" class="btn btn--danger" @click="clearAll">
        {{ ui['tool.map-draw.confirmYes'] }}
      </button>
      <button type="button" class="btn btn--ghost" @click="confirmClear = false">
        {{ ui['tool.map-draw.confirmNo'] }}
      </button>
    </div>

    <p v-if="transientNotice" class="note note--warn">{{ transientNotice }}</p>
    <p v-if="errorKey" class="note note--warn">{{ ui[errorKey] }}</p>
    <p v-if="tooManyFeatures" class="note note--warn">{{ ui['tool.map-draw.featuresWarn'] }}</p>
    <p v-if="selectedVertexCount > 30" class="note note--warn">
      {{ ui['tool.map-draw.vertexHint'].replace('{count}', String(selectedVertexCount)) }}
    </p>

    <div class="layout">
      <div class="map-col">
        <div class="map-wrap">
          <MapCanvas
            ref="mapCanvas"
            :center="defaultView"
            :zoom="12"
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

        <div class="stats">
          <span>{{ ui['tool.map-draw.statCount'].replace('{count}', String(stats.count)) }}</span>
          <span>{{ ui['tool.map-draw.statLength'] }}: {{ lengthText(stats.totalLengthM) }}</span>
          <span>{{ ui['tool.map-draw.statArea'] }}: {{ areaText(stats.totalAreaM2) }}</span>
          <span v-if="Object.keys(stats.counts).length">
            {{ ui['tool.map-draw.statTypes'] }}:
            <span class="mono">
              {{ Object.entries(stats.counts).map(([t, n]) => `${typeLabel(t)} × ${n}`).join(' · ') }}
            </span>
          </span>
        </div>
      </div>

      <aside class="side">
        <section class="panel panel--features">
          <h2 class="panel__title">
            {{ ui['tool.map-draw.featuresTitle'] }} ({{ features.length }})
          </h2>
          <FeatureList
            :lang="lang"
            :ui="ui"
            :features="features"
            :selected-id="selectedId"
            :confirm-delete-id="confirmDeleteId"
            @select="selectFeature"
            @request-delete="confirmDeleteId = $event"
            @remove="deleteFeature"
            @cancel-delete="confirmDeleteId = null"
          />
        </section>

        <section v-if="selected" class="panel">
          <h2 class="panel__title">{{ ui['tool.map-draw.propsTitle'] }}</h2>
          <div class="field field--small">
            <label :for="`md-name-${selected.id}`">{{ ui['tool.map-draw.nameLabel'] }}</label>
            <input
              :id="`md-name-${selected.id}`"
              v-model="propName"
              type="text"
              autocomplete="off"
              @blur="applyProps"
            />
          </div>
          <div class="field field--small">
            <label :for="`md-desc-${selected.id}`">{{ ui['tool.map-draw.descLabel'] }}</label>
            <textarea
              :id="`md-desc-${selected.id}`"
              v-model="propDesc"
              rows="2"
              @blur="applyProps"
            ></textarea>
          </div>

          <p class="field__hint">{{ ui['tool.map-draw.customTitle'] }}</p>
          <div v-for="(row, i) in customRows" :key="i" class="kv-row">
            <input
              v-model="row.k"
              type="text"
              :placeholder="ui['tool.map-draw.keyPlaceholder']"
              autocomplete="off"
              @blur="applyProps"
            />
            <input
              v-model="row.v"
              type="text"
              :placeholder="ui['tool.map-draw.valuePlaceholder']"
              autocomplete="off"
              @blur="applyProps"
            />
            <button type="button" class="btn btn--ghost btn--small" @click="removeCustomRow(i)">
              {{ ui['tool.map-draw.removeProperty'] }}
            </button>
          </div>
          <button type="button" class="btn btn--ghost btn--small" @click="addCustomRow">
            {{ ui['tool.map-draw.addProperty'] }}
          </button>
          <p v-if="propsError" class="note note--warn">{{ ui[propsError] }}</p>
        </section>

        <section class="panel">
          <h2 class="panel__title">{{ ui['tool.map-draw.importTitle'] }}</h2>
          <p class="hint">{{ ui['tool.map-draw.importHint'] }}</p>
          <textarea
            v-model="importText"
            class="mono"
            rows="4"
            spellcheck="false"
            :placeholder="ui['tool.map-draw.importPlaceholder']"
          ></textarea>
          <div class="btn-row">
            <button type="button" class="btn btn--secondary" @click="onImportPaste">
              {{ ui['tool.map-draw.importButton'] }}
            </button>
            <label class="btn btn--ghost">
              {{ ui['tool.map-draw.importFile'] }}
              <input
                class="sr-only"
                type="file"
                accept=".geojson,.json,.kml,.gpx,.csv,.tsv,.topojson,.wkt,.txt,.zip"
                @change="onImportFile"
              />
            </label>
          </div>
        </section>

        <section class="panel">
          <h2 class="panel__title">{{ ui['tool.map-draw.exportTitle'] }}</h2>
          <div class="row">
            <div class="field field--small">
              <label for="md-format">{{ ui['tool.map-draw.exportFormat'] }}</label>
              <select id="md-format" v-model="exportTarget">
                <option v-for="t in EXPORT_TARGETS" :key="t" :value="t">{{ FORMAT_LABEL[t] }}</option>
              </select>
            </div>
          </div>
          <p v-if="exportWarning" class="note note--warn">{{ exportWarning }}</p>

          <template v-if="exportText || exportBytes">
            <pre v-if="exportText" class="output mono">{{ exportPreview }}</pre>
            <p v-else class="note note--dim">{{ ui['tool.map-draw.shapefileBinaryNote'] }}</p>
            <div class="btn-row">
              <CopyButton
                v-if="exportText"
                :text="exportText"
                :label="ui['common.copy']"
                :success-label="ui['common.copied']"
                :fail-label="ui['common.copyFailed']"
                variant="secondary"
              />
              <button type="button" class="btn btn--primary" @click="download">
                {{ ui['common.download'] }}
              </button>
              <button type="button" class="btn btn--ghost" @click="onShare">
                {{ ui['common.share'] }}
              </button>
            </div>
            <p class="hint">{{ ui['common.shareWarning'] }}</p>
          </template>
          <p v-else class="hint">{{ ui['tool.map-draw.exportEmpty'] }}</p>
        </section>

        <section class="panel">
          <h2 class="panel__title">{{ ui['tool.map-draw.storageTitle'] }}</h2>
          <p v-if="localNotice" class="hint">{{ localNotice }}</p>
          <div class="btn-row">
            <button type="button" class="btn btn--ghost btn--small" @click="clearStorage">
              {{ ui['tool.map-draw.clearStorage'] }}
            </button>
          </div>
        </section>
      </aside>
    </div>

    <div v-if="drawerOpen" class="sheet-backdrop" @click="drawerOpen = false"></div>

    <!-- 移动端：要素列表折叠为可上滑展开的底部抽屉 -->
    <section
      class="sheet"
      :class="{ 'sheet--open': drawerOpen }"
      aria-labelledby="feature-sheet-title"
    >
      <button
        type="button"
        class="sheet__handle"
        :aria-expanded="drawerOpen"
        aria-controls="feature-sheet-body"
        @click="drawerOpen = !drawerOpen"
      >
        <span class="sheet__grab" aria-hidden="true"></span>
        <span id="feature-sheet-title" class="sheet__title">
          {{ ui['tool.map-draw.featuresTitle'] }} ({{ features.length }})
        </span>
        <span class="sheet__chevron" aria-hidden="true">{{ drawerOpen ? '▾' : '▴' }}</span>
      </button>
      <div id="feature-sheet-body" class="sheet__body" :inert="!drawerOpen">
        <FeatureList
          :lang="lang"
          :ui="ui"
          :features="features"
          :selected-id="selectedId"
          :confirm-delete-id="confirmDeleteId"
          @select="selectFeature"
          @request-delete="confirmDeleteId = $event"
          @remove="deleteFeature"
          @cancel-delete="confirmDeleteId = null"
        />
      </div>
    </section>

    <p v-if="shareNote" class="note note--dim share-note">{{ shareNote }}</p>
  </form>
</template>

<style scoped>
.t09 {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.toolbar--actions {
  padding-block-start: var(--sp-1);
  border-block-start: 1px solid var(--line);
}

.map-wrap {
  position: relative;
}

/* 绘制页以地图为主：画布高度固定为视口比例，不再沿用 16:10 的默认比例，
   否则在 1080px 容器里地图只有 ~400px 高 */
.map-wrap :deep(.map-shell) {
  aspect-ratio: auto;
  block-size: clamp(460px, 64vh, 720px);
  min-block-size: 0;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(240px, 320px);
  gap: var(--sp-4);
  align-items: start;
}

.map-col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-inline-size: 0;
}

.side {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-inline-size: 0;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
}

.panel__title {
  margin: 0;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1) var(--sp-3);
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.kv-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--sp-1);
}

.output {
  margin: 0;
  padding: var(--sp-2);
  max-block-size: 200px;
  overflow: auto;
  background: var(--bg-sub);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  white-space: pre;
  font-size: var(--fs-label);
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

.btn--small {
  padding: var(--sp-1) var(--sp-2);
  font-size: var(--fs-label);
}

.btn--danger {
  border-color: var(--warn);
  color: var(--warn);
}

.confirm-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--warn);
  border-radius: var(--r-ctl);
  font-size: var(--fs-label);
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

.share-note {
  overflow-wrap: anywhere;
  font-family: var(--mono);
}

/* 底部抽屉默认不存在于桌面布局 */
.sheet,
.sheet-backdrop {
  display: none;
}

@media (max-width: 760px) {
  /* 桌面右栏的要素列表在移动端由抽屉承载 */
  .panel--features {
    display: none;
  }

  .t09 {
    padding-block-end: 72px;
  }

  .sheet-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 35%);
    z-index: 940;
    touch-action: none;
  }

  .sheet {
    display: flex;
    flex-direction: column;
    position: fixed;
    inset-inline: 0;
    inset-block-end: 0;
    z-index: 950;
    background: var(--bg);
    border-block-start: 1px solid var(--line);
    border-start-start-radius: var(--r-ctl);
    border-start-end-radius: var(--r-ctl);
    box-shadow: 0 -8px 24px rgb(0 0 0 / 12%);
    padding-block-end: env(safe-area-inset-bottom, 0px);
  }

  .sheet__handle {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    min-block-size: 56px;
    padding: 14px var(--sp-3) 8px;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-label);
    text-align: start;
    cursor: pointer;
  }

  .sheet__grab {
    position: absolute;
    inset-block-start: 6px;
    inset-inline-start: 50%;
    transform: translateX(-50%);
    inline-size: 40px;
    block-size: 4px;
    border-radius: 999px;
    background: var(--line);
  }

  .sheet__title {
    padding-inline-start: var(--sp-1);
  }

  .sheet__chevron {
    color: var(--ink-2);
  }

  .sheet__body {
    max-block-size: 0;
    overflow: hidden;
    padding-inline: var(--sp-3);
    transition: max-block-size 180ms ease;
  }

  .sheet--open .sheet__body {
    max-block-size: 55vh;
    overflow: auto;
    padding-block-end: var(--sp-3);
  }
}

@media (max-width: 760px) {
  .layout {
    grid-template-columns: 1fr;
  }

  /* 移动端没有 Ctrl+Z：撤销/重做常驻并保证 44px 触控高度 */
  .toolbar--actions {
    position: sticky;
    inset-block-start: 0;
    z-index: 30;
    background: var(--bg);
    padding-block: var(--sp-1);
    border-block-end: 1px solid var(--line);
  }

  .toolbar--actions .btn {
    min-block-size: 44px;
  }
}

/* 横屏手机：地图优先，属性面板回到侧栏 */
@media (orientation: landscape) and (max-height: 520px) {
  .layout {
    grid-template-columns: minmax(0, 1.9fr) minmax(220px, 1fr);
  }
}
</style>