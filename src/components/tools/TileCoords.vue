<script setup lang="ts">
/**
 * T14 Google 瓦片坐标生成
 *
 * 交互分两条输入路径，最后汇入同一套瓦片枚举与导出：
 *   ① 地图框选：先进入框选模式（暂停地图拖动），再拖拽矩形或点击两个对角；
 *   ② 导入 GeoJSON / CSV / TSV / XLSX，取全部坐标的最小包围盒。
 *
 * 瓦片数学在 lib/geo/tiles.ts 中，组件只负责选区、校验与展示。
 * 全客户端计算，不发起任何网络请求；底图瓦片由 MapCanvas 懒加载。
 */

import { computed, ref, watch } from 'vue'

import { DEFAULT_VIEW, type Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import { fmt, std } from '../../lib/coord/format'
import {
  bboxOfPoints,
  countTilesForBbox,
  iterateTilesForBbox,
  iterateTilesForGeometries,
  MAX_ZOOM,
  MIN_ZOOM,
  type BBox,
  type Tile
} from '../../lib/geo/tiles'
import type { GeoJsonGeometry } from '../../lib/convert/wkt'
import MapCanvas from '../map/MapCanvas.vue'

interface Props {
  lang: Lang
  ui: ToolUi & Record<string, string>
  toolId: string
}

const props = defineProps<Props>()

/** 与 lib/convert/format.ts 的 FILE_LIMIT_BYTES 保持一致；动态导入前先做体积检查 */
const MAX_IMPORT_BYTES = 20 * 1024 * 1024

const mapCanvas = ref<InstanceType<typeof MapCanvas> | null>(null)

const bbox = ref<BBox | null>(null)
const zMin = ref(12)
const zMax = ref(14)
const featureCount = ref(0)
const importName = ref('')
/** 导入的原始几何：地图上直接画边界，瓦片计算也按它过滤 */
const importedGeometries = ref<GeoJsonGeometry[]>([])
const importing = ref(false)
const errorKey = ref('')
const errorVars = ref<Record<string, string | number>>({})
const pendingCorner = ref<[number, number] | null>(null)

let map: import('leaflet').Map | null = null
let L: typeof import('leaflet') | null = null
let selectionLayer: import('leaflet').LayerGroup | null = null
let previewLayer: import('leaflet').LayerGroup | null = null
let boundaryLayer: import('leaflet').LayerGroup | null = null
let dragStart: [number, number] | null = null
let draggingRect = false
let movedDuringDrag = false
let suppressClick = false
/** 进入框选前地图是否可拖动，退出时恢复原状态 */
let draggingBeforeDraw = true
const drawMode = ref(false)

/* ------------------------------------------------------------------ *
 * 文案与格式
 * ------------------------------------------------------------------ */

function msg(key: string, vars: Record<string, string | number> = {}): string {
  let text = props.ui[key] ?? key
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

function setError(key: string, vars: Record<string, string | number> = {}): void {
  errorKey.value = key
  errorVars.value = vars
}

function clearError(): void {
  errorKey.value = ''
  errorVars.value = {}
}

function coordText(v: number): string {
  return std(v, 6)
}

function countText(v: number): string {
  return fmt(v, props.lang, 'measure', 0)
}

const mapCenter = computed<[number, number]>(() => {
  const view = DEFAULT_VIEW[props.lang]
  return [view.center[1], view.center[0]]
})

const mapZoom = computed(() => DEFAULT_VIEW[props.lang].zoom)

/* ------------------------------------------------------------------ *
 * 地图选区
 * ------------------------------------------------------------------ */

/** 把 Leaflet 可能给出的世界副本经度折回 -180~180 */
function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

function bboxFromCorners(a: [number, number], b: [number, number]): BBox | null {
  if (Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9) return null

  // 先按原始经度确定左右，再分别折回；跨 180° 时自然得到 west > east
  const west = wrapLng(Math.min(a[0], b[0]))
  const east = wrapLng(Math.max(a[0], b[0]))
  const south = Math.max(-90, Math.min(a[1], b[1]))
  const north = Math.min(90, Math.max(a[1], b[1]))
  if (south >= north) return null
  return { west, south, east, north }
}

function rectLayerOptions(): import('leaflet').PathOptions {
  return {
    color: '#1d4ed8',
    weight: 2.5,
    fillColor: '#1d4ed8',
    fillOpacity: 0.18,
    interactive: false
  }
}

function addRect(
  layer: import('leaflet').LayerGroup,
  west: number,
  east: number,
  south: number,
  north: number
): void {
  if (!L) return
  layer.addLayer(L.rectangle([[south, west], [north, east]], rectLayerOptions()))
}

function renderSelection(): void {
  if (!L || !selectionLayer) return
  selectionLayer.clearLayers()

  if (bbox.value && importedGeometries.value.length === 0) {
    const b = bbox.value
    if (b.west > b.east) {
      // 跨 180° 经线：拆成东西两瓣，避免 Leaflet 把包围盒画成绕全球一圈
      addRect(selectionLayer, b.west, 180, b.south, b.north)
      addRect(selectionLayer, -180, b.east, b.south, b.north)
    } else {
      addRect(selectionLayer, b.west, b.east, b.south, b.north)
    }
  }

  if (pendingCorner.value) {
    selectionLayer.addLayer(
      L.circleMarker(pendingCorner.value, {
        radius: 5,
        color: '#d97706',
        fillColor: '#d97706',
        fillOpacity: 1,
        interactive: false
      })
    )
  }
}

function clearPreview(): void {
  previewLayer?.clearLayers()
}

function clearBoundary(): void {
  boundaryLayer?.clearLayers()
}

function clearImportedBoundary(): void {
  importedGeometries.value = []
  clearBoundary()
}

/** 导入后在地图上直接绘制原始边界（点、线、面都支持） */
function renderBoundary(): void {
  if (!L || !boundaryLayer) return
  const leaflet = L
  boundaryLayer.clearLayers()
  for (const geometry of importedGeometries.value) {
    leaflet
      .geoJSON({ type: 'Feature', properties: {}, geometry } as never, {
        style: {
          color: '#d97706',
          weight: 2,
          fillColor: '#d97706',
          fillOpacity: 0.08,
          interactive: false
        },
        pointToLayer: (_feature, latlng) =>
          leaflet.circleMarker(latlng, {
            radius: 4,
            color: '#d97706',
            fillColor: '#d97706',
            fillOpacity: 1,
            interactive: false
          })
      })
      .addTo(boundaryLayer)
  }
}

function resetSelectionState(): void {
  bbox.value = null
  featureCount.value = 0
  importName.value = ''
  importedGeometries.value = []
  pendingCorner.value = null
  dragStart = null
  draggingRect = false
  clearPreview()
  clearBoundary()
  renderSelection()
}

function clearSelection(): void {
  clearError()
  setDrawMode(false)
  resetSelectionState()
}

/**
 * 框选需要独占鼠标：先禁用 Leaflet 拖动再开始画，
 * 避免「想移动地图」和「想拉框」抢同一个 mousedown。
 */
function setDrawMode(on: boolean): void {
  drawMode.value = on
  pendingCorner.value = null
  dragStart = null
  draggingRect = false
  clearPreview()

  const instance = map
  if (instance) {
    const el = instance.getContainer()
    if (on) {
      draggingBeforeDraw = instance.dragging.enabled()
      instance.dragging.disable()
      el.classList.add('t14-drawing')
    } else {
      if (draggingBeforeDraw) instance.dragging.enable()
      el.classList.remove('t14-drawing')
    }
  }

  renderSelection()
}

function onMapReady(): void {
  map = mapCanvas.value?.getMap() ?? null
  L = mapCanvas.value?.getLeaflet() ?? null
  if (!map || !L) return

  selectionLayer = L.layerGroup().addTo(map)
  previewLayer = L.layerGroup().addTo(map)
  boundaryLayer = L.layerGroup().addTo(map)

  map.on('mousedown', onMouseDown)
  map.on('mousemove', onMouseMove)
  map.on('mouseup', onMouseUp)
  map.on('click', onMapClick)

  if (drawMode.value) setDrawMode(true)
}

function onMouseDown(e: import('leaflet').LeafletMouseEvent): void {
  if (!drawMode.value) return
  if (e.originalEvent.button !== 0) return
  dragStart = [e.latlng.lng, e.latlng.lat]
  draggingRect = true
  movedDuringDrag = false
}

function onMouseMove(e: import('leaflet').LeafletMouseEvent): void {
  if (!drawMode.value) return
  if (!draggingRect || !dragStart || !L || !previewLayer) return
  const end: [number, number] = [e.latlng.lng, e.latlng.lat]
  if (Math.abs(end[0] - dragStart[0]) > 1e-9 || Math.abs(end[1] - dragStart[1]) > 1e-9) {
    movedDuringDrag = true
  }
  const next = bboxFromCorners(dragStart, end)
  previewLayer.clearLayers()
  if (next) {
    const west = Math.min(next.west, next.east)
    const east = Math.max(next.west, next.east)
    addRect(previewLayer, west, east, next.south, next.north)
  }
}

function onMouseUp(e: import('leaflet').LeafletMouseEvent): void {
  if (!draggingRect) return
  const start = dragStart
  const end: [number, number] = [e.latlng.lng, e.latlng.lat]
  draggingRect = false
  dragStart = null
  clearPreview()

  if (movedDuringDrag && start) {
    const next = bboxFromCorners(start, end)
    if (next) {
      bbox.value = next
      pendingCorner.value = null
      featureCount.value = 0
      importName.value = ''
      clearImportedBoundary()
      clearError()
      setDrawMode(false)
    } else {
      renderSelection()
    }
    // 拖动结束后的 click 不应再被当作「两次点击」的第一下
    suppressClick = true
    window.setTimeout(() => {
      suppressClick = false
    }, 0)
  }
}

function onMapClick(e: import('leaflet').LeafletMouseEvent): void {
  if (!drawMode.value || suppressClick || draggingRect) return
  const point: [number, number] = [e.latlng.lng, e.latlng.lat]

  // 手动框选开始即放弃导入边界，避免两种来源混在一起
  if (importedGeometries.value.length > 0) clearImportedBoundary()

  if (!pendingCorner.value) {
    bbox.value = null
    featureCount.value = 0
    importName.value = ''
    clearError()
    pendingCorner.value = point
    renderSelection()
    return
  }

  const next = bboxFromCorners(pendingCorner.value, point)
  pendingCorner.value = null
  if (!next) {
    renderSelection()
    return
  }
  bbox.value = next
  featureCount.value = 0
  importName.value = ''
  clearError()
  setDrawMode(false)
}

/* ------------------------------------------------------------------ *
 * 导入数据
 * ------------------------------------------------------------------ */

function collectPositions(geometry: GeoJsonGeometry | null, out: [number, number][]): void {
  if (!geometry) return
  switch (geometry.type) {
    case 'Point':
      out.push([geometry.coordinates[0], geometry.coordinates[1]])
      break
    case 'MultiPoint':
    case 'LineString':
      for (const p of geometry.coordinates) out.push([p[0], p[1]])
      break
    case 'Polygon':
    case 'MultiLineString':
      for (const line of geometry.coordinates) {
        for (const p of line) out.push([p[0], p[1]])
      }
      break
    case 'MultiPolygon':
      for (const polygon of geometry.coordinates) {
        for (const ring of polygon) {
          for (const p of ring) out.push([p[0], p[1]])
        }
      }
      break
    case 'GeometryCollection':
      for (const child of geometry.geometries) collectPositions(child, out)
      break
  }
}

function fitToBBox(b: BBox): void {
  if (!map) return
  if (b.west <= b.east) {
    map.fitBounds([[b.south, b.west], [b.north, b.east]], {
      padding: [24, 24],
      maxZoom: 14
    })
    return
  }
  const centerLng = wrapLng((b.west + (b.east + 360)) / 2)
  map.setView([(b.south + b.north) / 2, centerLng], 5)
}

async function onFilePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  clearError()
  importing.value = true
  try {
    if (file.size > MAX_IMPORT_BYTES) {
      setError('err.file.tooLarge', {
        actual: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        limit: `${MAX_IMPORT_BYTES / 1024 / 1024} MB`
      })
      return
    }

    // 只接受 GeoJSON；其他格式引导到格式转换工具
    if (!/\.(geojson|json)$/i.test(file.name)) {
      setError('tool.tile-coords.errGeojsonOnly')
      return
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.length === 0) {
      setError('tool.tile-coords.errEmptyFile')
      return
    }
    const text = new TextDecoder('utf-8').decode(bytes)
    if (text.trim() === '') {
      setError('tool.tile-coords.errEmptyFile')
      return
    }

    const { parseFileInput } = await import('../../lib/convert/format')
    const parsed = await parseFileInput(text, { fileName: file.name, bytes })

    const positions: [number, number][] = []
    for (const feature of parsed.collection.features) {
      collectPositions(feature.geometry, positions)
    }
    if (positions.length === 0) {
      setError('tool.tile-coords.errNoCoords')
      return
    }
    const invalid = positions.some(
      ([lng, lat]) =>
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        Math.abs(lng) > 180 ||
        Math.abs(lat) > 90
    )
    if (invalid) {
      setError('tool.tile-coords.errCoordRange')
      return
    }

    const next = bboxOfPoints(positions)
    if (!next) {
      setError('tool.tile-coords.errNoCoords')
      return
    }

    setDrawMode(false)
    bbox.value = next
    pendingCorner.value = null
    featureCount.value = parsed.collection.features.length
    importName.value = file.name
    importedGeometries.value = parsed.collection.features
      .map((feature) => feature.geometry)
      .filter((geometry): geometry is GeoJsonGeometry => geometry !== null)
    renderSelection()
    renderBoundary()
    fitToBBox(next)
  } catch {
    setError('tool.tile-coords.errParse')
  } finally {
    importing.value = false
  }
}

/* ------------------------------------------------------------------ *
 * 瓦片结果
 * ------------------------------------------------------------------ */

interface TileResult {
  tiles: Tile[]
  total: number
  errorKey: string
}

const zoomError = computed<string>(() => {
  const min = zMin.value
  const max = zMax.value
  if (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min < MIN_ZOOM ||
    min > MAX_ZOOM ||
    max < MIN_ZOOM ||
    max > MAX_ZOOM
  ) {
    return 'tool.tile-coords.errZoomRange'
  }
  if (min > max) return 'tool.tile-coords.errZoomOrder'
  return ''
})

/** 超过这个数量时红字提示用户：计算与下载会明显变慢，浏览器可能卡顿 */
const LARGE_WARNING = 1_000_000
/** 每批处理多少张瓦片后让出主线程，用于刷新进度 */
const BATCH_SIZE = 20_000

function countGeometryTiles(): number {
  const iterator = iterateTilesForGeometries(
    importedGeometries.value,
    zMin.value,
    zMax.value
  )
  let count = 0
  while (!iterator.next().done) count++
  return count
}

/** 只算数量，不建数组：拖动选区或改缩放时不会因为数量大而卡住 */
const estimate = computed<{ total: number; errorKey: string }>(() => {
  if (!bbox.value) return { total: 0, errorKey: '' }
  if (zoomError.value) return { total: 0, errorKey: zoomError.value }
  try {
    if (importedGeometries.value.length > 0) {
      return { total: countGeometryTiles(), errorKey: '' }
    }
    return { total: countTilesForBbox(bbox.value, zMin.value, zMax.value), errorKey: '' }
  } catch {
    return { total: 0, errorKey: 'tool.tile-coords.errGeneric' }
  }
})

const isLarge = computed(() => estimate.value.total > LARGE_WARNING)

/**
 * 生成是一次显式动作：把当前参数快照记下来，
 * 框选或缩放级别一变，快照失配，旧结果自动隐藏。
 */
const generatedFor = ref('')
const signature = computed(() => JSON.stringify([bbox.value, zMin.value, zMax.value]))
const showResult = computed(
  () => generatedFor.value !== '' && generatedFor.value === signature.value
)

const resultTiles = ref<Tile[]>([])
const generationError = ref('')
const generating = ref(false)
const packing = ref(false)
const progressDone = ref(0)
const progressTotal = ref(0)
let runId = 0

const progressPercent = computed(() =>
  progressTotal.value > 0
    ? Math.min(100, Math.floor((progressDone.value / progressTotal.value) * 100))
    : 0
)
const progressPhase = computed(() =>
  packing.value
    ? props.ui['tool.tile-coords.packing']
    : props.ui['tool.tile-coords.generating']
)

// 参数一变就作废旧结果，并中止仍在跑的生成
watch(signature, () => {
  runId++
  generating.value = false
  packing.value = false
  resultTiles.value = []
  generationError.value = ''
  progressDone.value = 0
  progressTotal.value = 0
})

const result = computed<TileResult>(() => {
  if (!bbox.value) return { tiles: [], total: 0, errorKey: '' }
  if (estimate.value.errorKey) {
    return { tiles: [], total: 0, errorKey: estimate.value.errorKey }
  }
  if (generationError.value) {
    return { tiles: [], total: 0, errorKey: generationError.value }
  }
  // 未点击生成前只返回数量，避免大范围一画完就分配海量对象
  if (!showResult.value) return { tiles: [], total: estimate.value.total, errorKey: '' }
  return { tiles: resultTiles.value, total: resultTiles.value.length, errorKey: '' }
})

/** 决定导出单个 CSV 还是按层分包 */
const zoomLevelCount = computed(() =>
  result.value.total > 0 ? zMax.value - zMin.value + 1 : 0
)
const downloadLabel = computed(() =>
  zoomLevelCount.value > 1
    ? props.ui['tool.tile-coords.downloadZip']
    : props.ui['tool.tile-coords.downloadCsv']
)

const canGenerate = computed(
  () => Boolean(bbox.value) && !zoomError.value && estimate.value.total > 0
)

/** 让浏览器有机会绘制进度条，再继续下一批 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    // 后台标签页会暂停 rAF，退化到 setTimeout 以免生成卡死
    const canUseRaf =
      typeof requestAnimationFrame === 'function' &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible'
    if (canUseRaf) {
      requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })
}

function cancelGenerate(): void {
  runId++
  generating.value = false
  progressDone.value = 0
  progressTotal.value = 0
  resultTiles.value = []
}

async function generate(): Promise<void> {
  if (generating.value) {
    cancelGenerate()
    return
  }
  if (!canGenerate.value) return

  const run = ++runId
  generating.value = true
  generationError.value = ''
  resultTiles.value = []
  generatedFor.value = ''
  progressDone.value = 0
  progressTotal.value = estimate.value.total

  const tiles: Tile[] = []
  const source =
    importedGeometries.value.length > 0
      ? iterateTilesForGeometries(importedGeometries.value, zMin.value, zMax.value)
      : iterateTilesForBbox(bbox.value!, zMin.value, zMax.value)

  try {
    for (const tile of source) {
      if (run !== runId) return
      tiles.push(tile)
      if (tiles.length % BATCH_SIZE === 0) {
        progressDone.value = tiles.length
        await nextFrame()
      }
    }
    if (run !== runId) return
    resultTiles.value = tiles
    progressDone.value = tiles.length
    progressTotal.value = tiles.length
    generatedFor.value = signature.value
  } catch {
    if (run === runId) generationError.value = 'tool.tile-coords.errGeneric'
  } finally {
    if (run === runId) generating.value = false
  }
}

/** 分批拼 CSV，期间刷新进度，避免几百万行一次性阻塞主线程 */
async function buildCsv(tiles: readonly Tile[], base: number): Promise<string> {
  const lines: string[] = ['x,y,z']
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]
    lines.push(`${tile.x},${tile.y},${tile.z}`)
    if ((i + 1) % BATCH_SIZE === 0) {
      progressDone.value = base + i + 1
      await nextFrame()
    }
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * 导出 CSV：所有缩放级别合并成一个大表容易让解析变慢，
 * 因此每个级别单独一个文件；多个级别时打包为 ZIP。
 */
async function download(): Promise<void> {
  if (resultTiles.value.length === 0 || packing.value) return

  const byZoom = new Map<number, Tile[]>()
  for (const tile of resultTiles.value) {
    const list = byZoom.get(tile.z)
    if (list) list.push(tile)
    else byZoom.set(tile.z, [tile])
  }
  const levels = [...byZoom.keys()].sort((a, b) => a - b)

  packing.value = true
  progressDone.value = 0
  progressTotal.value = resultTiles.value.length

  try {
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`

    if (levels.length === 1) {
      const z = levels[0]
      const csv = await buildCsv(byZoom.get(z) ?? [], 0)
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `tile-coords-z${z}-${stamp}.csv`)
      return
    }

    const { strToU8, zip } = await import('fflate')
    const files: Record<string, Uint8Array> = {}
    let base = 0
    for (const z of levels) {
      const levelTiles = byZoom.get(z) ?? []
      const csv = await buildCsv(levelTiles, base)
      files[`tile-coords-z${z}.csv`] = strToU8(csv)
      base += levelTiles.length
      progressDone.value = base
    }
    const zipped = await new Promise<Uint8Array>((resolve, reject) => {
      zip(files, { level: 6 }, (error, data) => {
        if (error) reject(error)
        else resolve(data)
      })
    })
    saveBlob(new Blob([zipped], { type: 'application/zip' }), `tile-coords-${stamp}.zip`)
  } finally {
    packing.value = false
    progressDone.value = 0
    progressTotal.value = 0
  }
}
</script>

<template>
  <form class="t14" @submit.prevent>
    <div class="t14__layout">
      <div class="t14__panel">
        <div class="t14__card t14__controls">
          <div class="t14__controls-row">
            <button
              type="button"
              class="btn btn--primary t14__draw-btn"
              :aria-pressed="drawMode"
              @click="setDrawMode(!drawMode)"
            >
              {{
                drawMode
                  ? ui['tool.tile-coords.stopDraw']
                  : ui['tool.tile-coords.startDraw']
              }}
            </button>
            <label
              class="t14__upload"
              :class="{ 't14__upload--busy': importing }"
              :title="importing ? ui['tool.tile-coords.importing'] : ui['tool.tile-coords.importTitle']"
              :aria-label="importing ? ui['tool.tile-coords.importing'] : ui['tool.tile-coords.importTitle']"
            >
              <input
                class="visually-hidden"
                type="file"
                accept=".geojson,.json"
                :disabled="importing"
                @change="onFilePicked"
              />
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </label>
          </div>
          <p class="hint">{{ ui['tool.tile-coords.drawHint'] }}</p>
        </div>

        <div class="t14__card">
          <div class="t14__head">
            <p class="result-title">{{ ui['tool.tile-coords.bboxTitle'] }}</p>
            <button
              v-if="bbox"
              type="button"
              class="btn btn--ghost"
              @click="clearSelection"
            >
              {{ ui['tool.tile-coords.clearSelection'] }}
            </button>
          </div>

      <dl v-if="bbox" class="t14__bbox">
        <div>
          <dt>{{ ui['tool.tile-coords.west'] }}</dt>
          <dd class="mono">{{ coordText(bbox.west) }}°</dd>
        </div>
        <div>
          <dt>{{ ui['tool.tile-coords.south'] }}</dt>
          <dd class="mono">{{ coordText(bbox.south) }}°</dd>
        </div>
        <div>
          <dt>{{ ui['tool.tile-coords.east'] }}</dt>
          <dd class="mono">{{ coordText(bbox.east) }}°</dd>
        </div>
        <div>
          <dt>{{ ui['tool.tile-coords.north'] }}</dt>
          <dd class="mono">{{ coordText(bbox.north) }}°</dd>
        </div>
      </dl>
      <p v-else class="hint">{{ ui['tool.tile-coords.selectEmpty'] }}</p>

      <p v-if="bbox && bbox.west > bbox.east" class="note note--dim">
        {{ ui['tool.tile-coords.crossAntimeridian'] }}
      </p>
    </div>

    <div class="t14__card t14__card--row">
      <span class="result-title">{{ ui['tool.tile-coords.zoomTitle'] }}</span>
      <input
        id="t14-zmin"
        v-model.number="zMin"
        class="t14__zoom-input"
        type="number"
        inputmode="numeric"
        :min="MIN_ZOOM"
        :max="MAX_ZOOM"
        step="1"
        :aria-label="ui['tool.tile-coords.zoomMin']"
      />
      <span class="t14__zoom-sep" aria-hidden="true">–</span>
      <input
        id="t14-zmax"
        v-model.number="zMax"
        class="t14__zoom-input"
        type="number"
        inputmode="numeric"
        :min="MIN_ZOOM"
        :max="MAX_ZOOM"
        step="1"
        :aria-label="ui['tool.tile-coords.zoomMax']"
      />
      <span class="hint">{{ ui['tool.tile-coords.zoomRange'] }}</span>
    </div>

    <p v-if="errorKey" class="note note--warn" role="alert">
      {{ msg(errorKey, errorVars) }}
    </p>
    <p v-if="result.errorKey" class="note note--danger" role="alert">
      {{ msg(result.errorKey) }}
    </p>

    <p v-if="isLarge" class="note note--danger">
      {{
        msg('tool.tile-coords.warnLarge', {
          count: countText(estimate.total)
        })
      }}
    </p>

    <div class="t14__actions">
      <button
        type="button"
        class="btn btn--primary"
        :disabled="!generating && !canGenerate"
        @click="generating ? cancelGenerate() : generate()"
      >
        {{
          generating
            ? ui['tool.tile-coords.cancelGenerate']
            : ui['tool.tile-coords.generate']
        }}
      </button>
    </div>

    <div
      v-if="generating || packing"
      class="t14__progress"
      role="status"
      aria-live="polite"
    >
      <div class="t14__progress-head">
        <span>{{ progressPhase }}</span>
        <span class="t14__progress-percent mono">{{ progressPercent }}%</span>
      </div>
      <div
        class="t14__progress-track"
        role="progressbar"
        :aria-valuenow="progressPercent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="t14__progress-fill" :style="{ width: `${progressPercent}%` }" />
      </div>
      <p class="hint">
        {{
          msg('tool.tile-coords.progress', {
            done: countText(progressDone),
            total: countText(progressTotal)
          })
        }}
      </p>
    </div>

    <p class="hint">{{ ui['tool.tile-coords.generateHint'] }}</p>

        <div v-if="showResult && result.total > 0" class="t14__card">
          <p class="note note--inline">
            {{ msg('tool.tile-coords.total', { total: countText(result.total) }) }}
          </p>
          <div class="btn-row">
            <button
              type="button"
              class="btn btn--primary"
              :disabled="packing"
              @click="download"
            >
              {{ downloadLabel }}
            </button>
          </div>
          <p class="hint">{{ ui['tool.tile-coords.downloadHint'] }}</p>
        </div>
      </div>

      <div class="t14__map-col">
        <p v-if="importName" class="note note--inline">
          {{
            msg('tool.tile-coords.imported', {
              name: importName,
              count: countText(featureCount)
            })
          }}
        </p>
        <p v-if="importName" class="hint">
          {{ ui['tool.tile-coords.boundaryNote'] }}
        </p>
        <p class="hint">
          {{ ui['tool.tile-coords.otherFormatHint'] }}
          <a :href="`/${lang}/tools/format-convert/`">
            {{ ui['tool.tile-coords.formatConvert'] }}
          </a>
        </p>

        <MapCanvas
          ref="mapCanvas"
          :center="mapCenter"
          :zoom="mapZoom"
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
.t14 {
  font-size: 13px;
}

/* 参数在左、地图在右：桌面端不用滚动就能框选 */
.t14__layout {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  align-items: start;
  gap: var(--sp-4);
}

.t14__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-inline-size: 0;
}

.t14__map-col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-inline-size: 0;
  position: sticky;
  top: var(--sp-3);
}

/* 地图的 aspect-ratio + min-height 会反推出最小宽度，移动端需要允许收缩 */
.t14__map-col :deep(.map-shell) {
  min-inline-size: 0;
}

.t14 .hint,
.t14 .field__hint {
  font-size: 12px;
}

.t14 input:not(.visually-hidden) {
  inline-size: 100%;
  min-inline-size: 0;
  font-size: 13px;
}

.t14 .field--small {
  flex: 1 1 120px;
  min-inline-size: 0;
}

.t14__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg-sub);
}

.t14__card .result-title {
  font-size: 13px;
}

@media (max-width: 900px) {
  .t14__layout {
    grid-template-columns: 1fr;
  }

  /* 单列时把「框选 / 导入」提到地图上方，其余参数留在下方 */
  .t14__panel {
    display: contents;
  }

  .t14__controls {
    order: -2;
  }

  .t14__map-col {
    position: static;
    order: -1;
  }
}

.t14__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}

.t14__head .result-title {
  margin: 0;
}

.t14__bbox {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--sp-2);
  margin: 0;
}

.t14__bbox div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.t14__bbox dt {
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.t14__bbox dd {
  margin: 0;
}

.t14__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
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

/* 超大数量用红字：允许继续生成，但明确提示可能很慢或内存不足 */
.note--danger {
  color: var(--err);
  font-weight: 600;
}

.t14__progress {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.t14__progress-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.t14__progress-percent {
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.t14__progress-track {
  block-size: 6px;
  border-radius: 3px;
  background: var(--line);
  overflow: hidden;
}

.t14__progress-fill {
  block-size: 100%;
  background: var(--acc);
  transition: inline-size 0.15s linear;
}

.t14__controls-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.t14__controls .hint {
  margin: 0;
}

.t14__draw-btn {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.t14__upload {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  inline-size: 40px;
  block-size: 40px;
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg-sub);
  color: var(--ink-2);
  cursor: pointer;
}

.t14__upload:hover {
  border-color: var(--ink-2);
  color: var(--ink);
}

.t14__upload--busy {
  opacity: 0.5;
  cursor: progress;
}

.t14__upload svg {
  inline-size: 20px;
  block-size: 20px;
}

/* 缩放级别压成一行：标签 + 最小 Z – 最大 Z + 范围提示 */
.t14__card--row {
  flex-direction: row;
  align-items: center;
  flex-wrap: nowrap;
  gap: var(--sp-2);
  padding: 0;
  border: 0;
  background: transparent;
}

.t14__card--row .result-title {
  white-space: nowrap;
}

.t14 input.t14__zoom-input {
  inline-size: 56px;
  min-inline-size: 0;
  flex: 0 0 auto;
  padding-inline: 6px;
  text-align: center;
}

.t14__zoom-sep {
  color: var(--ink-2);
}

/* 框选期间给出明确的十字光标，也让用户知道地图暂时不能拖动 */
:global(.t14-drawing),
:global(.t14-drawing .leaflet-grab),
:global(.t14-drawing .leaflet-interactive) {
  cursor: crosshair !important;
}

.t14__table-wrap .result-table {
  margin-block-start: var(--sp-2);
}
</style>