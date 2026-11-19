<script setup lang="ts">
/**
 * T22 MVT（Mapbox Vector Tile）解析
 *
 * 交互与本站其它工具一致：
 *   - 左输入、右结果；上传 .pbf/.mvt 或粘贴 Base64，两种入口不混用
 *   - 瓦片编号 z/x/y 可选：给了就输出经纬度，没给就保留瓦片内坐标
 *   - 结果区先给图层汇总，再给 GeoJSON 预览；复制与下载在结果上方
 *
 * ⛔ 解析逻辑全部在 lib/convert/mvt，组件只负责输入输出与文案。
 */
import { computed, ref, watch } from 'vue'

import type { Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import {
  MVT_MAX_BYTES,
  MvtError,
  decodeMvt,
  isValidTile,
  mvtFromBase64,
  tileFromFileName,
  type MvtDecodeResult,
  type MvtErrorCode,
  type MvtTileId,
  type MvtWarning,
  type MvtWarningCode
} from '../../lib/convert/mvt'
import CopyButton from '../ui/CopyButton.vue'

interface Props {
  lang: Lang
  ui: ToolUi & Record<string, string>
  toolId: string
}

const props = defineProps<Props>()

type Mode = 'file' | 'paste'

const mode = ref<Mode>('file')
const fileName = ref('')
const fileBytes = ref<Uint8Array | null>(null)
const base64 = ref('')
const zText = ref<string | number>('')
const xText = ref<string | number>('')
const yText = ref<string | number>('')

const result = ref<MvtDecodeResult | null>(null)
const error = ref<{ title: string; hint: string } | null>(null)
const autoTile = ref('')

/* ------------------------------------------------------------------ *
 * 输入状态
 * ------------------------------------------------------------------ */

const hasSource = computed(() =>
  mode.value === 'file' ? fileBytes.value !== null : base64.value.trim() !== ''
)

type TileState =
  | { state: 'missing' }
  | { state: 'partial' }
  | { state: 'invalid' }
  | { state: 'ok'; tile: MvtTileId }

const tileState = computed<TileState>(() => {
  // type="number" 的输入会被 Vue 转成 number，因此统一先转回字符串再判断
  const parts = [zText.value, xText.value, yText.value].map((part) => String(part).trim())
  const filled = parts.filter((part) => part !== '').length
  if (filled === 0) return { state: 'missing' }
  if (filled < 3) return { state: 'partial' }

  const nums = parts.map((part) => Number(part))
  if (!nums.every((value) => Number.isInteger(value))) return { state: 'invalid' }

  const tile = { z: nums[0], x: nums[1], y: nums[2] }
  return isValidTile(tile) ? { state: 'ok', tile } : { state: 'invalid' }
})

const tileMissing = computed(() => tileState.value.state === 'missing')
const tileBroken = computed(
  () => tileState.value.state === 'partial' || tileState.value.state === 'invalid'
)

/* ------------------------------------------------------------------ *
 * 错误与警告文案
 * ------------------------------------------------------------------ */

const ERR_KEYS: Record<MvtErrorCode, readonly [string, string]> = {
  empty: ['tool.mvt.errEmptyTitle', 'tool.mvt.errEmptyHint'],
  'too-large': ['tool.mvt.errSizeTitle', 'tool.mvt.errSizeHint'],
  base64: ['tool.mvt.errBase64Title', 'tool.mvt.errBase64Hint'],
  gzip: ['tool.mvt.errGzipTitle', 'tool.mvt.errGzipHint'],
  protobuf: ['tool.mvt.errProtobufTitle', 'tool.mvt.errProtobufHint'],
  geometry: ['tool.mvt.errProtobufTitle', 'tool.mvt.errProtobufHint'],
  'no-layers': ['tool.mvt.errNoLayersTitle', 'tool.mvt.errNoLayersHint'],
  'tile-range': ['tool.mvt.errTileTitle', 'tool.mvt.errTileHint']
}

const WARN_KEYS: Record<MvtWarningCode, string> = {
  gzip: 'tool.mvt.warn.gzip',
  'unknown-geometry': 'tool.mvt.warn.unknown',
  'bad-geometry': 'tool.mvt.warn.badGeom',
  'tags-odd': 'tool.mvt.warn.tags',
  'no-tile': 'tool.mvt.warn.noTile',
  'missing-close': 'tool.mvt.warn.missingClose'
}

function toError(errorCode: MvtErrorCode): { title: string; hint: string } {
  const [titleKey, hintKey] = ERR_KEYS[errorCode]
  return { title: props.ui[titleKey], hint: props.ui[hintKey] }
}

function mapError(thrown: unknown): { title: string; hint: string } {
  return toError(thrown instanceof MvtError ? thrown.code : 'protobuf')
}

const visibleWarnings = computed(
  () => result.value?.warnings.filter((warning) => warning.code !== 'no-tile') ?? []
)

function warningText(warning: MvtWarning): string {
  return props.ui[WARN_KEYS[warning.code]].replace('{count}', String(warning.count))
}

/* ------------------------------------------------------------------ *
 * 解析
 * ------------------------------------------------------------------ */

function sourceBytes(): Uint8Array | null {
  if (mode.value === 'file') return fileBytes.value
  const text = base64.value.trim()
  return text === '' ? null : mvtFromBase64(text)
}

function run(): void {
  error.value = null
  result.value = null

  try {
    if (tileBroken.value) {
      error.value = toError('tile-range')
      return
    }

    const bytes = sourceBytes()
    if (!bytes || bytes.length === 0) {
      error.value = toError('empty')
      return
    }
    if (bytes.length > MVT_MAX_BYTES) {
      error.value = toError('too-large')
      return
    }

    const state = tileState.value
    result.value = decodeMvt(bytes, state.state === 'ok' ? state.tile : null)
  } catch (thrown) {
    error.value = mapError(thrown)
  }
}

/* ------------------------------------------------------------------ *
 * 输入事件
 * ------------------------------------------------------------------ */

function switchMode(next: Mode): void {
  if (next === mode.value) return
  mode.value = next
  result.value = null
  error.value = null
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  fileName.value = file.name
  fileBytes.value = null
  result.value = null
  error.value = null

  if (file.size > MVT_MAX_BYTES) {
    error.value = toError('too-large')
    return
  }

  const guess = tileFromFileName(file.name)
  if (guess) {
    zText.value = String(guess.z)
    xText.value = String(guess.x)
    yText.value = String(guess.y)
    autoTile.value = `${guess.z}/${guess.x}/${guess.y}`
  } else {
    autoTile.value = ''
  }

  void file
    .arrayBuffer()
    .then((buffer) => {
      fileBytes.value = new Uint8Array(buffer)
      run()
    })
    .catch(() => {
      error.value = toError('protobuf')
    })
}

function onPaste(): void {
  // paste 事件触发时 textarea 还没拿到新值，等一拍再解析
  setTimeout(run, 0)
}

watch(base64, () => {
  if (mode.value !== 'paste') return
  result.value = null
  error.value = null
})

watch([zText, xText, yText], () => {
  if (!hasSource.value) return
  if (result.value || error.value) run()
})

/* ------------------------------------------------------------------ *
 * 结果展示
 * ------------------------------------------------------------------ */

const geojsonText = computed(() =>
  result.value ? JSON.stringify(result.value.collection, null, 2) : ''
)

const PREVIEW_LINES = 200

const preview = computed(() => {
  if (!geojsonText.value) return ''
  const lines = geojsonText.value.split('\n')
  return lines.slice(0, PREVIEW_LINES).join('\n')
})

const truncated = computed(() => geojsonText.value.split('\n').length > PREVIEW_LINES)

const summaryText = computed(() => {
  if (!result.value) return ''
  const size =
    result.value.size < 1024
      ? `${result.value.size} B`
      : `${(result.value.size / 1024).toFixed(1)} KB`
  return props.ui['tool.mvt.summary']
    .replace('{layers}', String(result.value.layers.length))
    .replace('{features}', String(result.value.features.length))
    .replace('{size}', size)
})

const outputHint = computed(() =>
  tileMissing.value ? props.ui['tool.mvt.tileCoordHint'] : props.ui['tool.mvt.geoHint']
)

const downloadName = computed(() => {
  const tile = tileState.value.state === 'ok' ? tileState.value.tile : null
  return tile ? `mvt-${tile.z}-${tile.x}-${tile.y}.geojson` : 'mvt-tile.geojson'
})

function download(): void {
  if (!geojsonText.value) return
  const blob = new Blob([geojsonText.value], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = downloadName.value
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <form class="t22" @submit.prevent="run">
    <div class="t22__tile">
      <div class="field">
        <label for="t22-z">{{ ui['tool.mvt.tileZ'] }}</label>
        <input id="t22-z" v-model="zText" type="number" inputmode="numeric" min="0" max="22" />
      </div>
      <div class="field">
        <label for="t22-x">{{ ui['tool.mvt.tileX'] }}</label>
        <input id="t22-x" v-model="xText" type="number" inputmode="numeric" min="0" />
      </div>
      <div class="field">
        <label for="t22-y">{{ ui['tool.mvt.tileY'] }}</label>
        <input id="t22-y" v-model="yText" type="number" inputmode="numeric" min="0" />
      </div>
      <p class="t22__tilehint">
        {{ autoTile ? ui['tool.mvt.tileAuto'].replace('{tile}', autoTile) : ui['tool.mvt.tileHint'] }}
      </p>
    </div>

    <div class="t22__modes" role="tablist" :aria-label="ui['tool.mvt.h1']">
      <button
        type="button"
        class="btn"
        :class="mode === 'file' ? 'btn--primary' : 'btn--ghost'"
        role="tab"
        :aria-selected="mode === 'file'"
        @click="switchMode('file')"
      >
        {{ ui['tool.mvt.modeFile'] }}
      </button>
      <button
        type="button"
        class="btn"
        :class="mode === 'paste' ? 'btn--primary' : 'btn--ghost'"
        role="tab"
        :aria-selected="mode === 'paste'"
        @click="switchMode('paste')"
      >
        {{ ui['tool.mvt.modePaste'] }}
      </button>
    </div>

    <div class="t22__io">
      <div class="field t22__source">
        <template v-if="mode === 'file'">
          <label class="btn btn--secondary">
            {{ fileName ? ui['tool.mvt.replaceFile'] : ui['tool.mvt.chooseFile'] }}
            <input
              class="sr-only"
              type="file"
              accept=".pbf,.mvt,.pbf.gz,.mvt.gz,application/octet-stream"
              @change="onPick"
            />
          </label>
          <p v-if="fileName" class="t22__file mono">{{ fileName }}</p>
          <span class="field__hint">{{ ui['tool.mvt.fileHint'] }}</span>
        </template>

        <template v-else>
          <label for="t22-base64">{{ ui['tool.mvt.base64Label'] }}</label>
          <textarea
            id="t22-base64"
            v-model="base64"
            class="t22__base64 mono"
            rows="8"
            spellcheck="false"
            autocomplete="off"
            :placeholder="ui['tool.mvt.base64Placeholder']"
            @paste="onPaste"
          />
          <span class="field__hint">{{ ui['tool.mvt.base64Hint'] }}</span>
        </template>
      </div>

      <output class="t22__result" aria-live="polite">
        <template v-if="result">
          <div class="t22__head">
            <p class="t22__summary">{{ summaryText }}</p>
            <div class="t22__actions">
              <CopyButton
                :text="geojsonText"
                :label="ui['common.copy']"
                :success-label="ui['common.copied']"
                :fail-label="ui['common.copyFailed']"
                variant="ghost"
              />
              <button type="button" class="btn btn--ghost" @click="download">
                {{ ui['common.download'] }}
              </button>
            </div>
          </div>

          <div class="t22__tablewrap">
            <table class="t22__table">
              <thead>
                <tr>
                  <th scope="col">{{ ui['tool.mvt.colLayer'] }}</th>
                  <th scope="col">{{ ui['tool.mvt.colVersion'] }}</th>
                  <th scope="col">{{ ui['tool.mvt.colExtent'] }}</th>
                  <th scope="col">{{ ui['tool.mvt.colFeatures'] }}</th>
                  <th scope="col">{{ ui['tool.mvt.colTypes'] }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(layer, index) in result.layers" :key="`${layer.name}-${index}`">
                  <td class="mono">{{ layer.name || '—' }}</td>
                  <td>{{ layer.version }}</td>
                  <td>{{ layer.extent }}</td>
                  <td>{{ layer.features }}</td>
                  <td class="mono">
                    {{ layer.points }} / {{ layer.lines }} / {{ layer.polygons }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="t22__hint">{{ outputHint }}</p>

          <pre class="t22__code mono">{{ preview }}</pre>
          <p v-if="truncated" class="t22__hint">
            {{ ui['tool.mvt.previewTruncated'].replace('{n}', String(PREVIEW_LINES)) }}
          </p>

          <div v-if="visibleWarnings.length" class="warn-box">
            <p v-for="warning in visibleWarnings" :key="warning.code">
              {{ warningText(warning) }}
            </p>
          </div>
        </template>

        <div v-else-if="error" class="error-box" role="alert">
          <p class="error-box__title">{{ error.title }}</p>
          <p class="error-box__hint">{{ error.hint }}</p>
        </div>

        <div v-else class="t22__empty">
          <p>{{ ui['tool.mvt.emptyTitle'] }}</p>
          <p class="field__hint">{{ ui['tool.mvt.emptyHint'] }}</p>
        </div>
      </output>
    </div>

    <div class="t22__submit">
      <button type="submit" class="btn btn--primary" :disabled="!hasSource">
        {{ ui['common.convert'] }}
      </button>
    </div>

    <p class="t22__note">{{ ui['tool.mvt.note'] }}</p>
  </form>
</template>

<style scoped>
.t22 {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.t22__tile {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 120px)) minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: end;
}

.t22__tilehint {
  margin: 0;
  align-self: end;
  padding-block-end: var(--sp-1);
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.t22__modes {
  display: flex;
  gap: var(--sp-2);
}

.t22__io {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: stretch;
}

/* 输入与结果共用同一套面板样式，左右两栏外观一致 */
.t22__io > .field,
.t22__result {
  background: var(--bg-sub);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  padding: var(--sp-3);
}

.t22__io > .field:focus-within {
  border-color: var(--acc);
}

.t22__source {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.t22__file {
  margin: 0;
  font-size: var(--fs-label);
  overflow-wrap: anywhere;
}

.t22__base64 {
  inline-size: 100%;
  resize: vertical;
  background: transparent;
  border: 0;
  padding: 0;
  min-block-size: 120px;
  font-size: var(--fs-num);
  line-height: 1.5;
}

.t22__base64:focus {
  outline: none;
}

.t22__result {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-inline-size: 0;
}

.t22__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: flex-start;
  justify-content: space-between;
}

.t22__summary {
  margin: 0;
  font-weight: 600;
  line-height: var(--lh-label);
}

.t22__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.t22__tablewrap {
  overflow-x: auto;
}

.t22__table {
  inline-size: 100%;
  border-collapse: collapse;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
}

.t22__table th,
.t22__table td {
  text-align: start;
  padding: var(--sp-1) var(--sp-2);
  border-block-end: 1px solid var(--line);
  white-space: nowrap;
}

.t22__table th {
  color: var(--ink-2);
  font-weight: 500;
}

.t22__hint {
  margin: 0;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.t22__code {
  margin: 0;
  padding: var(--sp-2);
  max-block-size: 260px;
  overflow: auto;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  font-size: var(--fs-num);
  line-height: 1.45;
}

.t22__empty {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  justify-content: center;
  min-block-size: 120px;
  color: var(--ink-2);
}

.t22__empty p {
  margin: 0;
}

.t22__submit {
  display: flex;
  justify-content: flex-end;
}

.t22__note {
  margin: 0;
  padding-block-start: var(--sp-3);
  border-block-start: 1px solid var(--line);
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
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

@media (max-width: 720px) {
  .t22__tile {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .t22__tilehint {
    grid-column: 1 / -1;
  }

  .t22__io {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>