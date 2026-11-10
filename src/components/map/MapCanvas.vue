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

/**
 * 三个免密钥底图源（SR-09）。
 * 均有请求量限制，因此切换只换图层、不预加载，失败统一走 FR-06 降级提示。
 */
const BASEMAPS: Record<
  BasemapKey,
  { url: string; attribution: string; maxZoom: number; subdomains?: string }
> = {
  street: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19
  },
  terrain: {
    // OpenTopoMap 在部分网络环境不可达，地形图改用同为免密钥的 Esri World Topographic Map
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS User Community',
    maxZoom: 19
  }
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

/** 切换底图：只替换瓦片图层，保留中心、缩放与叠加要素 */
function setBasemap(key: BasemapKey): void {
  basemap.value = key
  if (!map || !L) return

  if (tiles) {
    map.removeLayer(tiles)
    tiles = null
  }
  failed.value = false
  tileErrorEmitted = false

  const source = BASEMAPS[key]
  tiles = L.tileLayer(source.url, {
    maxZoom: source.maxZoom,
    attribution: source.attribution,
    ...(source.subdomains ? { subdomains: source.subdomains } : {})
  })
  tiles.on('tileerror', () => {
    failed.value = true
    if (!tileErrorEmitted) {
      tileErrorEmitted = true
      emit('tile-error')
    }
  })
  tiles.addTo(map)
  // 地形图最高 17 级；切换时避免停在不存在的层级
  if (map.getZoom() > source.maxZoom) map.setZoom(source.maxZoom)
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
  map?.remove()
  map = null
  overlay = null
})
</script>

<template>
  <div class="map-shell">
    <div ref="container" class="map-canvas" :class="{ 'map-canvas--pick': pick }"></div>

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

.map-canvas--pick {
  cursor: crosshair;
}

.map-canvas--pick :deep(.leaflet-container) {
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