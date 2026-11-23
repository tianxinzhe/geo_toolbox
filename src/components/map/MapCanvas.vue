<script setup lang="ts">
/**
 * 共享地图画布（FR-06 / T10 / T09）。
 *
 * 关键设计：
 *   ① 容器始终存在于 DOM 并写死宽高比 → 不产生 CLS；
 *   ② 地图实例由 IntersectionObserver 懒初始化 → 不在视口就不请求瓦片；
 *   ③ 底图瓦片失败只提示，不影响工具的计算与结果（FR-06 降级）；
 *   ④ 移动端默认不接管单指拖动，点「点击启用拖动」后才接管。
 *
 * Leaflet 通过动态 import 加载，未进入视口时不会下载地图运行时。
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'

import type { VectorFeatureCollection } from '../../lib/convert/types'

interface Props {
  center: [number, number]
  zoom?: number
  pick?: boolean
  geojson?: VectorFeatureCollection | null
  /** 移动端覆盖层文案 */
  dragPrompt?: string
  loadingText?: string
  tileErrorText?: string
  /** 是否有数据时自动缩放到数据范围 */
  fit?: boolean
  /** 底图切换文案（全部为可选项，缺省英文） */
  basemapLabel?: string
  basemapStreet?: string
  basemapSatellite?: string
  basemapTerrain?: string
}

const props = withDefaults(defineProps<Props>(), {
  zoom: 3,
  pick: false,
  geojson: null,
  dragPrompt: '',
  loadingText: '',
  tileErrorText: '',
  fit: true,
  basemapLabel: 'Basemap',
  basemapStreet: 'Street',
  basemapSatellite: 'Satellite',
  basemapTerrain: 'Terrain'
})

const emit = defineEmits<{
  ready: []
  pick: [lat: number, lng: number]
  'tile-error': []
}>()

const container = ref<HTMLDivElement | null>(null)
const failed = ref(false)
const isCoarse = ref(false)
const dragEnabled = ref(true)
const loading = ref(true)

type LeafletModule = typeof import('leaflet')
type BasemapKey = 'street' | 'satellite' | 'terrain'

interface TileSource {
  url: string
  attribution: string
  maxZoom: number
  /** 源本身的最大可用层级；超过后由 Leaflet 放大上一级瓦片，避免出现「无数据」灰块 */
  maxNativeZoom?: number
  subdomains?: string
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/**
 * 免密钥底图源（SR-09），按可用性排序：首个源失败时自动尝试下一个。
 *
 * 全部使用 Web Mercator 坐标、不做 GCJ-02 加偏——国内商业底图（高德/腾讯/GeoQ）
 * 虽然访问快，但会让 WGS84 点位整体偏移数百米，与本站坐标工具的口径冲突。
 *
 * 街道图默认走 Esri：tile.openstreetmap.org 在中国大陆不可达。Esri 的中国街道数据
 * 只到 13 级，因此标注 maxNativeZoom——放大时由 Leaflet 拉伸 13 级瓦片，而不是显示
 * 「Map data not yet available」灰块；需要细节时可切到卫星影像。
 */
const BASEMAPS: Record<BasemapKey, TileSource[]> = {
  street: [
    {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      attribution:
        'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS User Community',
      maxZoom: 19,
      maxNativeZoom: 13
    },
    {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19
    }
  ],
  satellite: [
    {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution:
        'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19
    }
  ],
  terrain: [
    // OpenTopoMap 在部分网络环境不可达，地形图改用同为免密钥的 Esri World Topographic Map；
    // 中国区数据同样只到 13 级
    {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      attribution:
        'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS User Community',
      maxZoom: 19,
      maxNativeZoom: 13
    }
  ]
}

const basemap = ref<BasemapKey>('street')
const basemapOptions = computed(() => [
  { key: 'street' as const, label: props.basemapStreet },
  { key: 'satellite' as const, label: props.basemapSatellite },
  { key: 'terrain' as const, label: props.basemapTerrain }
])

let L: LeafletModule | null = null
let map: import('leaflet').Map | null = null
let tiles: import('leaflet').TileLayer | null = null
let overlay: import('leaflet').GeoJSON | null = null
let observer: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
let observerDone = false
let tileErrorEmitted = false
let sourceIndex = 0
let tileErrorCount = 0
let tileLoaded = false
let fallbackTimer: ReturnType<typeof setTimeout> | null = null

/** 单源失败阈值：连续的 tileerror 达到该数量才切换备用源，避免个别瓦片重试造成误判 */
const TILE_ERROR_THRESHOLD = 3
/** 连接被静默丢弃时既不成功也不报错，超过此时长仍无瓦片加载即切换备用源 */
const TILE_TIMEOUT_MS = 8000

function colorOf(properties: Record<string, unknown> | null | undefined, fallback: string): string {
  const c = properties?.color
  return typeof c === 'string' ? c : fallback
}

function renderOverlay(): void {
  if (!map || !L) return
  if (overlay) {
    map.removeLayer(overlay)
    overlay = null
  }
  const data = props.geojson
  if (!data || data.features.length === 0) return

  overlay = L.geoJSON(data as never, {
    style: (feature) => {
      const color = colorOf(feature?.properties as Record<string, unknown>, '#1f6feb')
      return { color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.15 }
    },
    pointToLayer: (feature, latlng) => {
      const color = colorOf(feature?.properties as Record<string, unknown>, '#1f6feb')
      const marker = L!.circleMarker(latlng, { radius: 5, color, weight: 2, fillOpacity: 0.6 })
      const label = feature?.properties?.label
      if (typeof label === 'string' && label !== '') marker.bindTooltip(label)
      return marker
    },
    onEachFeature: (feature, layer) => {
      const label = feature?.properties?.label
      if (typeof label === 'string' && label !== '' && !(layer instanceof L!.CircleMarker)) {
        layer.bindTooltip(label)
      }
    }
  }).addTo(map)

  if (props.fit) {
    const bounds = overlay.getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 })
  }
}

function onMapClick(e: import('leaflet').LeafletMouseEvent): void {
  if (!props.pick) return
  emit('pick', e.latlng.lat, e.latlng.lng)
}

function clearFallbackTimer(): void {
  if (fallbackTimer !== null) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }
}

function removeTiles(): void {
  clearFallbackTimer()
  if (tiles && map) map.removeLayer(tiles)
  tiles = null
}

/** 全部源均失败：移除图层，保留灰底与提示，工具的计算与导出不受影响（FR-06） */
function reportTileFailure(): void {
  removeTiles()
  failed.value = true
  if (!tileErrorEmitted) {
    tileErrorEmitted = true
    emit('tile-error')
  }
}

function tryNextSource(): void {
  if (!map || !L) return
  if (sourceIndex + 1 < BASEMAPS[basemap.value].length) {
    loadSource(sourceIndex + 1)
  } else {
    reportTileFailure()
  }
}

/** 加载指定序号的底图源；切换只替换瓦片图层，保留中心、缩放与叠加要素 */
function loadSource(index: number): void {
  if (!map || !L) return
  const source = BASEMAPS[basemap.value][index]
  if (!source) {
    reportTileFailure()
    return
  }

  removeTiles()
  sourceIndex = index
  tileErrorCount = 0
  tileLoaded = false
  failed.value = false

  const layer = L.tileLayer(source.url, {
    maxZoom: source.maxZoom,
    ...(source.maxNativeZoom !== undefined ? { maxNativeZoom: source.maxNativeZoom } : {}),
    attribution: source.attribution,
    ...(source.subdomains ? { subdomains: source.subdomains } : {})
  })
  tiles = layer
  // 已被替换的旧图层仍可能抛出在途错误，用实例比对忽略它们
  layer.on('tileload', () => {
    if (tiles !== layer) return
    tileLoaded = true
    clearFallbackTimer()
  })
  layer.on('tileerror', () => {
    if (tiles !== layer) return
    tileErrorCount += 1
    if (tileErrorCount >= TILE_ERROR_THRESHOLD) tryNextSource()
  })
  layer.addTo(map)
  // 地形图最高 17 级；切换时避免停在不存在的层级
  if (map.getZoom() > source.maxZoom) map.setZoom(source.maxZoom)

  fallbackTimer = setTimeout(() => {
    if (!tileLoaded) tryNextSource()
  }, TILE_TIMEOUT_MS)
}

/** 用户切换底图类型：从该类型的首选源重新开始 */
function setBasemap(key: BasemapKey): void {
  basemap.value = key
  if (!map || !L) return
  tileErrorEmitted = false
  failed.value = false
  loadSource(0)
}

async function init(): Promise<void> {
  if (map || !container.value) return
  const mod = (await import('leaflet')) as unknown as { default?: LeafletModule } & LeafletModule
  L = (mod.default ?? mod) as LeafletModule

  isCoarse.value =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  dragEnabled.value = !isCoarse.value

  map = L.map(container.value, {
    center: props.center,
    zoom: props.zoom,
    dragging: dragEnabled.value,
    scrollWheelZoom: true,
    attributionControl: true
  })

  setBasemap(basemap.value)
  map.on('click', onMapClick)

  loading.value = false
  renderOverlay()
  emit('ready')

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => map?.invalidateSize())
    resizeObserver.observe(container.value)
  }
}

function enableDrag(): void {
  dragEnabled.value = true
  map?.dragging.enable()
}

function setView(lat: number, lng: number, zoom?: number): void {
  if (!map) return
  map.setView([lat, lng], zoom ?? map.getZoom())
}

/** 供需要自定义交互的工具（T09）接管地图实例与 Leaflet 运行时 */
function getMap(): import('leaflet').Map | null {
  return map
}

function getLeaflet(): LeafletModule | null {
  return L
}

defineExpose({ setView, enableDrag, getMap, getLeaflet })

onMounted(() => {
  if (!container.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting) && !observerDone) {
        observerDone = true
        observer?.disconnect()
        void init()
      }
    },
    { rootMargin: '200px' }
  )
  observer.observe(container.value)
})

watch(
  () => props.center,
  (c) => {
    if (map && c) map.setView(c, props.zoom)
  }
)

watch(() => props.geojson, renderOverlay, { deep: false })

onBeforeUnmount(() => {
  observer?.disconnect()
  resizeObserver?.disconnect()
  clearFallbackTimer()
  map?.remove()
  map = null
  overlay = null
})
</script>

<template>
  <div class="map-shell" :class="{ 'map-shell--pick': pick }">
    <div ref="container" class="map-canvas"></div>

    <p v-if="loading" class="map-note">{{ loadingText }}</p>
    <p v-else-if="failed" class="map-note">{{ tileErrorText }}</p>

    <div class="map-basemaps" role="group" :aria-label="basemapLabel">
      <button
        v-for="option in basemapOptions"
        :key="option.key"
        type="button"
        class="map-basemaps__btn"
        :class="{ 'map-basemaps__btn--active': basemap === option.key }"
        :aria-pressed="basemap === option.key"
        @click="setBasemap(option.key)"
      >
        {{ option.label }}
      </button>
    </div>

    <button
      v-if="!dragEnabled"
      type="button"
      class="map-drag"
      @click="enableDrag"
    >
      {{ dragPrompt }}
    </button>
  </div>
</template>

<style scoped>
.map-shell {
  position: relative;
  inline-size: 100%;
  aspect-ratio: 16 / 10;
  min-block-size: 260px;
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  overflow: hidden;
  background: var(--bg-sub);
  z-index: 0;
}

.map-canvas {
  inline-size: 100%;
  block-size: 100%;
}

/* 拾取态样式挂在 shell 上：
   Leaflet 会给 .map-canvas 动态加 leaflet-container 等类，
   若把 :class 绑在同一个元素上，Vue 重渲染时会把这些外部类抹掉，地图直接失效 */
.map-shell--pick,
.map-shell--pick .map-canvas,
.map-shell--pick :deep(.leaflet-container) {
  cursor: crosshair;
}

.map-note {
  position: absolute;
  inset-block-start: var(--sp-2);
  inset-inline-start: var(--sp-2);
  max-inline-size: calc(100% - 210px);
  margin: 0;
  padding: var(--sp-1) var(--sp-2);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
  z-index: 500;
}

/* 底图切换：3 个免密钥源，位于右上角，避免与移动端拖动按钮重叠 */
.map-basemaps {
  position: absolute;
  inset-block-start: var(--sp-2);
  inset-inline-end: var(--sp-2);
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  z-index: 500;
}

.map-basemaps__btn {
  min-block-size: 40px;
  padding: 0 var(--sp-2);
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ink-2);
  font-family: inherit;
  font-size: var(--fs-label);
  cursor: pointer;
}

.map-basemaps__btn--active {
  background: var(--bg);
  color: var(--ink);
  box-shadow: 0 0 0 1px var(--line);
}

.map-basemaps__btn:focus-visible {
  outline: 2px solid var(--acc);
  outline-offset: 1px;
}

.map-drag {
  position: absolute;
  inset-block-end: var(--sp-3);
  inset-inline-start: 50%;
  transform: translateX(-50%);
  min-block-size: 44px;
  padding: var(--sp-2) var(--sp-4);
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg);
  color: var(--ink);
  font-size: var(--fs-label);
  cursor: pointer;
  z-index: 500;
}

/* Leaflet 内部控件的层级不能压过页面导航 */
:deep(.leaflet-container) {
  font-family: var(--sans, inherit);
  background: var(--bg-sub);
}
</style>