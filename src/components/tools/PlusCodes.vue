<script setup lang="ts">
/**
 * T21 Plus Codes（Open Location Code）
 *
 * 交互与本站其它坐标工具一致：
 *   - 左输入、右结果，输入变化后自动重算，另提供「转换」按钮立即计算
 *   - 不做分享链接、不写 URL，结果只在本页展示
 *   - 结果区只放结果值与复制按钮
 *
 * 处理规则：
 *   - 编码：接受「经度, 纬度」以及度分秒写法，复用 lib/coord/parse
 *   - 解码：只接受完整编码（10 或 11 位数字 + 「+」）。短码需要参考地点，
 *     本站没有地理编码服务，明确报错而不是猜测
 *   - 显示 10 位（约 14 m）或 11 位（约 3 m）两档精度
 *
 * ⛔ 不在组件里手写编解码算法：全部走 lib/coord/plusCode，便于单测与复用。
 */
import { computed, ref, watch } from 'vue'

import type { Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import { fmtUnit, std } from '../../lib/coord/format'
import { DEFAULT_CTX, parseCoord } from '../../lib/coord/parse'
import {
  PLUS_CODE_SPANS,
  decodePlusCode,
  encodePlusCode,
  type PlusCodeLength
} from '../../lib/coord/plusCode'
import CopyButton from '../ui/CopyButton.vue'

interface Props {
  lang: Lang
  ui: ToolUi & Record<string, string>
  toolId: string
}

const props = defineProps<Props>()

type Mode = 'encode' | 'decode'

const mode = ref<Mode>('encode')
const length = ref<PlusCodeLength>(10)
const input = ref('')

/** 防抖快照：结果只读这份快照，避免每次击键都重算并重渲染 */
interface Settled {
  mode: Mode
  input: string
  length: PlusCodeLength
}

const settled = ref<Settled>({ mode: 'encode', input: '', length: 10 })

function settleNow(): void {
  settled.value = { mode: mode.value, input: input.value, length: length.value }
}

interface ViewOk {
  primary: string
  meta: string
  copy: string
}

interface ViewError {
  title: string
  hint: string
  example: string
}

type View =
  | { kind: 'none' }
  | ({ kind: 'ok' } & ViewOk)
  | ({ kind: 'error' } & ViewError)

/** 把格子边长由「度」换算成地面米数，仅用于提示数量级 */
function sizeText(latSpan: number, lngSpan: number, lat: number, digits: number): string {
  const latMeters = latSpan * 111320
  const lngMeters = lngSpan * 111320 * Math.cos((lat * Math.PI) / 180)
  return props.ui['tool.plus-codes.size']
    .replace('{length}', String(digits))
    .replace('{lat}', fmtUnit(latMeters, props.lang, 'measure', 'm', latMeters < 10 ? 1 : 0))
    .replace('{lng}', fmtUnit(lngMeters, props.lang, 'measure', 'm', lngMeters < 10 ? 1 : 0))
}

function coordError(): View {
  return {
    kind: 'error',
    title: props.ui['tool.plus-codes.errCoordTitle'],
    hint: props.ui['tool.plus-codes.errCoordHint'],
    example: props.ui['tool.plus-codes.errCoordExample']
  }
}

function codeError(): View {
  return {
    kind: 'error',
    title: props.ui['tool.plus-codes.errCodeTitle'],
    hint: props.ui['tool.plus-codes.errCodeHint'],
    example: props.ui['tool.plus-codes.errCodeExample']
  }
}

const view = computed<View>(() => {
  const s = settled.value
  if (s.input.trim() === '') return { kind: 'none' }

  if (s.mode === 'encode') {
    const parsed = parseCoord(s.input, DEFAULT_CTX)
    if (!parsed?.ok) return coordError()

    const code = encodePlusCode(parsed.lat, parsed.lng, s.length)
    const span = PLUS_CODE_SPANS[s.length]
    return {
      kind: 'ok',
      primary: code,
      copy: code,
      meta: sizeText(span.lat, span.lng, parsed.lat, s.length)
    }
  }

  const decoded = decodePlusCode(s.input)
  if (!decoded.ok) return codeError()

  const text = `${std(decoded.lng, 8)}, ${std(decoded.lat, 8)}`
  return {
    kind: 'ok',
    primary: text,
    copy: text,
    meta: sizeText(decoded.latSpan, decoded.lngSpan, decoded.lat, decoded.code.replace('+', '').length)
  }
})

/** 即时校验只服务于无障碍状态，不参与结果渲染 */
const invalid = computed(() => {
  if (input.value.trim() === '') return false
  if (mode.value === 'encode') {
    const parsed = parseCoord(input.value, DEFAULT_CTX)
    return !parsed?.ok
  }
  return !decodePlusCode(input.value).ok
})

let timer: ReturnType<typeof setTimeout> | undefined
watch([input, mode, length], () => {
  clearTimeout(timer)
  timer = setTimeout(settleNow, 300)
})
</script>

<template>
  <form class="t21" @submit.prevent>
    <div class="t21__row">
      <div class="field">
        <label for="t21-mode">{{ ui['tool.plus-codes.mode'] }}</label>
        <select id="t21-mode" v-model="mode">
          <option value="encode">{{ ui['tool.plus-codes.mode.encode'] }}</option>
          <option value="decode">{{ ui['tool.plus-codes.mode.decode'] }}</option>
        </select>
      </div>

      <div v-if="mode === 'encode'" class="field">
        <label for="t21-length">{{ ui['tool.plus-codes.length'] }}</label>
        <select id="t21-length" v-model.number="length">
          <option :value="10">{{ ui['tool.plus-codes.length.10'] }}</option>
          <option :value="11">{{ ui['tool.plus-codes.length.11'] }}</option>
        </select>
      </div>
    </div>

    <div class="t21__io">
      <div class="field">
        <label for="t21-input">
          {{ mode === 'encode' ? ui['coord.lngLat'] : ui['tool.plus-codes.codeLabel'] }}
        </label>
        <input
          id="t21-input"
          v-model="input"
          class="code-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="
            mode === 'encode'
              ? ui['coord.pairPlaceholder']
              : ui['tool.plus-codes.codePlaceholder']
          "
          :aria-invalid="invalid ? 'true' : undefined"
        />
        <span class="field__hint">
          {{ mode === 'encode' ? ui['tool.plus-codes.coordHint'] : ui['tool.plus-codes.codeHint'] }}
        </span>
      </div>

      <output id="t21-result" class="t21__result" aria-live="polite">
        <template v-if="view.kind === 'ok'">
          <div class="t21__copy">
            <CopyButton
              :text="view.copy"
              :label="ui['common.copy']"
              :success-label="ui['common.copied']"
              :fail-label="ui['common.copyFailed']"
              variant="ghost"
            />
          </div>
          <p class="t21__value">{{ view.primary }}</p>
          <p class="t21__meta">{{ view.meta }}</p>
        </template>

        <div v-else-if="view.kind === 'error'" class="error-box" role="alert">
          <p class="error-box__title">{{ view.title }}</p>
          <p class="error-box__hint">{{ view.hint }}</p>
          <p class="error-box__example">{{ view.example }}</p>
        </div>
      </output>
    </div>

    <div class="t21__actions">
      <button
        type="button"
        class="btn btn--primary"
        :disabled="input.trim() === ''"
        @click="settleNow"
      >
        {{ ui['common.convert'] }}
      </button>
    </div>

    <p class="t21__note">{{ ui['tool.plus-codes.note'] }}</p>
  </form>
</template>

<style scoped>
.t21 {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.t21__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
}

.t21__io {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: stretch;
}

/* 输入与结果共用同一套面板样式，左右两栏外观一致 */
.t21__io > .field,
.t21__result {
  background: var(--bg-sub);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  padding: var(--sp-3);
}

/* 输入面板本身就是编辑区，内部不再套一层边框 */
.t21__io > .field .code-input {
  background: transparent;
  border: 0;
  padding: 0;
  min-block-size: 44px;
  font-family: var(--mono);
}

.t21__io > .field:focus-within {
  border-color: var(--acc);
}

.t21__result {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.t21__copy {
  display: flex;
  justify-content: flex-end;
}

.t21__value {
  margin: 0;
  font-family: var(--mono);
  font-size: 1.05rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.t21__meta {
  margin: 0;
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.t21__actions {
  display: flex;
  justify-content: flex-end;
}

.t21__note {
  margin: 0;
  padding-block-start: var(--sp-3);
  border-block-start: 1px solid var(--line);
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

@media (max-width: 720px) {
  .t21__row,
  .t21__io {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>