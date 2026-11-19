<script setup lang="ts">
/**
 * T09 要素列表（桌面右侧面板与移动端底部抽屉共用）。
 *
 * 抽出组件的唯一目的：同一份列表在两种布局里行为必须完全一致，
 * 避免「桌面能删、抽屉不能删」这类分叉。
 */

import type { Lang } from '../../config/i18n'
import type { DrawFeature } from '../../lib/draw/state'
import { measureFeature } from '../../lib/draw/state'
import { fmtUnit, std } from '../../lib/coord/format'

interface Props {
  lang: Lang
  ui: Record<string, string>
  features: DrawFeature[]
  selectedId: string | null
  confirmDeleteId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [id: string]
  requestDelete: [id: string]
  remove: [id: string]
  cancelDelete: []
}>()

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

function typeLabel(t: string): string {
  return props.ui[typeKey(t)] ?? t
}

function featureLabel(f: DrawFeature): string {
  // 导入数据常用 Name（大写）表示名称，展示时按 name → Name 回退
  const raw = f.properties.name ?? f.properties.Name
  const name = typeof raw === 'string' ? raw.trim() : ''
  return name !== ''
    ? name
    : props.ui['tool.map-draw.unnamed'].replace('{type}', typeLabel(f.geometry?.type ?? ''))
}

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

function measureText(f: DrawFeature): string {
  const m = measureFeature(f)
  if (m.kind === 'point' && m.point) {
    return `${std(m.point[0], 6)}, ${std(m.point[1], 6)}`
  }
  if (m.kind === 'line') return lengthText(m.lengthM)
  if (m.kind === 'polygon') return `${areaText(m.areaM2)} · ${lengthText(m.perimeterM)}`
  return '—'
}
</script>

<template>
  <p v-if="features.length === 0" class="empty">{{ ui['tool.map-draw.featuresEmpty'] }}</p>
  <ul v-else class="feature-list">
    <li
      v-for="f in features"
      :key="f.id"
      class="feature-item"
      :class="{ 'feature-item--active': f.id === selectedId }"
    >
      <button type="button" class="feature-main" @click="emit('select', f.id)">
        <span class="feature-type">{{ typeLabel(f.geometry?.type ?? '') }}</span>
        <span class="feature-name">{{ featureLabel(f) }}</span>
        <span class="feature-measure mono">{{ measureText(f) }}</span>
      </button>

      <button
        v-if="confirmDeleteId !== f.id"
        type="button"
        class="feature-del"
        @click="emit('requestDelete', f.id)"
      >
        {{ ui['tool.map-draw.delete'] }}
      </button>
      <span v-else class="confirm-inline">
        <button type="button" class="mini mini--danger" @click="emit('remove', f.id)">
          {{ ui['tool.map-draw.confirmYes'] }}
        </button>
        <button type="button" class="mini" @click="emit('cancelDelete')">
          {{ ui['tool.map-draw.confirmNo'] }}
        </button>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.empty {
  margin: 0;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.feature-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-block-size: 320px;
  overflow: auto;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  border-block-end: 1px solid var(--line);
}

.feature-item--active {
  background: var(--bg-sub);
}

.feature-main {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0 var(--sp-2);
  flex: 1;
  min-inline-size: 0;
  padding: var(--sp-1) var(--sp-2);
  border: 0;
  background: transparent;
  color: var(--ink);
  text-align: start;
  cursor: pointer;
}

.feature-type {
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.feature-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feature-measure {
  grid-column: 1 / -1;
  font-size: var(--fs-label);
  color: var(--ink-2);
}

.mono {
  font-family: var(--mono);
}

.feature-del {
  border: 0;
  background: transparent;
  color: var(--warn);
  font-size: var(--fs-label);
  cursor: pointer;
  padding: var(--sp-1);
  min-block-size: 44px;
}

.confirm-inline {
  display: flex;
  gap: var(--sp-1);
}

.mini {
  min-block-size: 36px;
  padding: var(--sp-1) var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg);
  color: var(--ink);
  font-size: var(--fs-label);
  cursor: pointer;
}

.mini--danger {
  border-color: var(--warn);
  color: var(--warn);
}
</style>