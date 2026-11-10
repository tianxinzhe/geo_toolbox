<script setup lang="ts">
/**
 * FR-06 通用地图预览。
 *
 * 只负责把调用方给的「点 / 折线」画出来并可选拾取坐标；
 * 不做任何换算，避免和工具自身的计算逻辑产生第二个真相来源。
 *
 * 默认折叠（T01），打开后才触发 IntersectionObserver → Leaflet 懒加载，
 * 因此未使用地图的工具页不会下载地图运行时。
 */

import { computed, ref } from 'vue'

import MapCanvas from '../map/MapCanvas.vue'
import type { VectorFeature, VectorFeatureCollection } from '../../lib/convert/types'

export interface PreviewPoint {
  lat: number
  lng: number
  label?: string
  color?: string
}

export interface PreviewLine {
  coords: [number, number][]
  label?: string
  color?: string
}

interface Props {
  title: string
  hint?: string
  points: PreviewPoint[]
  lines?: PreviewLine[]
  open?: boolean
  allowPick?: boolean
  pickLabel?: string
  pickingLabel?: string
  fit?: boolean
  dragPrompt?: string
  loadingText?: string
  tileErrorText?: string
  basemapLabel?: string
  basemapStreet?: string
  basemapSatellite?: string
  basemapTerrain?: string
}

const props = withDefaults(defineProps<Props>(), {
  hint: '',
  lines: () => [],
  open: false,
  allowPick: false,
  pickLabel: '',
  pickingLabel: '',
  fit: true,
  dragPrompt: '',
  loadingText: '',
  tileErrorText: '',
  basemapLabel: 'Basemap',
  basemapStreet: 'Street',
  basemapSatellite: 'Satellite',
  basemapTerrain: 'Terrain'
})

const emit = defineEmits<{ pick: [lat: number, lng: number] }>()

const pickMode = ref(false)

const collection = computed<VectorFeatureCollection>(() => {
  const features: VectorFeature[] = []
  for (const p of props.points) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { color: p.color, label: p.label }
    })
  }
  for (const l of props.lines) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: l.coords },
      properties: { color: l.color, label: l.label }
    })
  }
  return { type: 'FeatureCollection', features }
})

const center = computed<[number, number]>(() => {
  const first = props.points[0]
  return first ? [first.lat, first.lng] : [20, 0]
})

function onPick(lat: number, lng: number): void {
  emit('pick', lat, lng)
  pickMode.value = false
}
</script>

<template>
  <details class="map-preview" :open="open">
    <summary class="map-preview__summary">{{ title }}</summary>

    <div class="map-preview__body">
      <div v-if="allowPick" class="btn-row">
        <button
          type="button"
          class="btn"
          :class="pickMode ? 'btn--primary' : 'btn--ghost'"
          @click="pickMode = !pickMode"
        >
          {{ pickMode ? pickingLabel : pickLabel }}
        </button>
      </div>

      <MapCanvas
        :center="center"
        :zoom="12"
        :pick="pickMode"
        :geojson="collection"
        :fit="fit"
        :drag-prompt="dragPrompt"
        :loading-text="loadingText"
        :tile-error-text="tileErrorText"
        :basemap-label="basemapLabel"
        :basemap-street="basemapStreet"
        :basemap-satellite="basemapSatellite"
        :basemap-terrain="basemapTerrain"
        @pick="onPick"
      />

      <p v-if="hint" class="hint">{{ hint }}</p>
    </div>
  </details>
</template>

<style scoped>
.map-preview {
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  padding: var(--sp-2) var(--sp-3);
}

.map-preview__summary {
  cursor: pointer;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.map-preview__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-block-start: var(--sp-2);
}

.hint {
  margin: 0;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}
</style>