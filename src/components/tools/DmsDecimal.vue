<script setup lang="ts">
/**
 * T02 经纬度格式转换（PRD 6.1 规格表）
 *
 * 交互：
 *   - 经纬度放在**一个输入框**里（`116.3974, 39.9088`），整串粘贴即可
 *   - 用户显式选择「原格式」与「目标格式」，不再自动罗列所有格式
 *   - 批量模式（FR-13）使用同一套解析与格式化规则（lib/coord/pairFormat）
 *
 * 处理规则：
 *   - **符号约定**：西经与南纬为负值；带 W/S 符号时输入值取绝对值后再置负
 *   - 秒值 ≥60 或分值 ≥60 时执行进位归一化，并在结果中提示「输入已归一化」
 *   - 度分秒输出两种写法：符号式（`39°54'31.7"`）与文本式（`39度54分31.7秒`，按语言本地化）
 *
 * 专属异常：
 *   - 原文与所选原格式不符 → 就地提示，并给出所选格式的写法示例（SR-06）
 *   - 自动模式下 `39.54` 这类歧义 → 按十进制度处理，同时给出另一种解读
 *
 * SR-06：错误就地显示，不清空输入、不弹窗。
 * SR-12：渲染防抖 300ms（结果只读 settled 快照，与 T01 同一套写法）。
 * FR-05：点「分享」才生成链接，不在每次输入时改写 URL。
 *
 * ⛔ 组件层不出现 toFixed() 与手工拼数字串：全部走 lib/coord/pairFormat
 *    与 lib/coord/dms、lib/coord/format 的格式化出口（SR-11 双出口收口）。
 */
import { computed, onMounted, ref, watch } from 'vue'

import type { Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import type { DmsFormat } from '../../lib/coord/dms'
import { DEFAULT_COORD_DIGITS } from '../../lib/coord/format'
import {
  formatPairValue,
  parseCoordinatePair,
  type SourceFormat,
  type TargetFormat
} from '../../lib/coord/pairFormat'
import CopyButton from '../ui/CopyButton.vue'

interface Props {
  lang: Lang
  /** 构建期由 ToolPage 用 pick(lang, keys) 取出的文案子集 */
  ui: ToolUi & Record<string, string>
  /**
   * 工具编号（'T02'）。
   *
   * 与 T01 同理：刻意**不**把整个 ToolMeta 传进来 —— Astro 会把 props
   * 序列化进 `astro-island` 属性，三语言的 names / desc / keywords
   * 会白白多出几 KB 的 HTML。
   */
  toolId: string
}

const props = defineProps<Props>()

/* ------------------------------------------------------------------ *
 * 常量表
 * ------------------------------------------------------------------ */

type CommaAs = 'auto' | 'decimal' | 'separator'

const STORAGE_KEY = 'geo.t02.prefs'

/** 原格式选项。'auto' 走 parseCoord 的自动识别 */
const SOURCE_OPTIONS: ReadonlyArray<{ value: SourceFormat; key: string }> = [
  { value: 'auto', key: 'tool.dms-decimal.format.auto' },
  { value: 'decimal', key: 'tool.dms-decimal.name.decimal' },
  { value: 'dm', key: 'tool.dms-decimal.name.dm' },
  { value: 'dms', key: 'tool.dms-decimal.name.dms' }
]

/** 目标格式选项 */
const TARGET_OPTIONS: ReadonlyArray<{ value: TargetFormat; key: string }> = [
  { value: 'decimal', key: 'tool.dms-decimal.name.decimal' },
  { value: 'dm', key: 'tool.dms-decimal.name.dm' },
  { value: 'dms-symbolic', key: 'tool.dms-decimal.target.dmsSymbolic' },
  { value: 'dms-textual', key: 'tool.dms-decimal.target.dmsTextual' }
]

const FORMAT_NAME_KEY: Record<DmsFormat, string> = {
  decimal: 'tool.dms-decimal.name.decimal',
  dm: 'tool.dms-decimal.name.dm',
  dms: 'tool.dms-decimal.name.dms'
}

/** 每种原格式的写法示例（错误框的第三段） */
const FORMAT_EXAMPLE: Record<SourceFormat, string> = {
  auto: '116.3974, 39.9088',
  decimal: '116.3974, 39.9088',
  dm: `116°23.844'E, 39°54.528'N`,
  dms: `116°23'50.64"E, 39°54'31.68"N`
}

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

/** 经纬度合并成一个输入框，方便直接粘贴 `116.3974, 39.9088` */
const coordInput = ref('')
const sourceFormat = ref<SourceFormat>('auto')
const targetFormat = ref<TargetFormat>('decimal')
/** SR-01 规则 ⑤：逗号含义手动覆盖，记忆在 localStorage */
const commaAs = ref<CommaAs>('auto')

/**
 * 各目标格式的小数位。
 * 十进制度保留 8 位（约 1 毫米）；度分按分、度分秒按秒保留，
 * 角秒 2 位已到 0.3 米，继续加位只会在结果里堆零。
 */
function digitsFor(target: TargetFormat): number {
  if (target === 'decimal') return DEFAULT_COORD_DIGITS
  if (target === 'dm') return 4
  return 2
}

/** 防抖后的输入快照。结果区只读这份快照，不直接读输入 ref */
interface Settled {
  coord: string
  src: SourceFormat
  dst: TargetFormat
  p: number
  comma: CommaAs
}

const settled = ref<Settled>({
  coord: '',
  src: 'auto',
  dst: 'decimal',
  p: digitsFor('decimal'),
  comma: 'auto'
})

/**
 * 把当前输入一次性拷进快照。
 * 程序化写入输入（点击转换、恢复偏好）后必须立即调用，
 * 否则结果会滞后 300ms 或显示旧值。
 */
function settleNow(): void {
  settled.value = {
    coord: coordInput.value,
    src: sourceFormat.value,
    dst: targetFormat.value,
    p: digitsFor(targetFormat.value),
    comma: commaAs.value
  }
}

/* ------------------------------------------------------------------ *
 * 解析与结果
 * ------------------------------------------------------------------ */

function parse(raw: string, src: SourceFormat, comma: CommaAs) {
  if (raw.trim() === '') return null
  return parseCoordinatePair(raw, { source: src, commaAs: comma })
}

/**
 * aria-invalid 用非防抖状态：读屏用户按下键就要知道输入不对，
 * 等 300ms 会让其以为已经输对了。
 */
const invalid = computed(() => {
  const r = parse(coordInput.value, sourceFormat.value, commaAs.value)
  return r !== null && !r.ok
})

function formatName(f: DmsFormat): string {
  return props.ui[FORMAT_NAME_KEY[f]]
}

/** 错误三段式：原因 / 正确写法 / 示例 */
interface PropError {
  title: string
  hint: string
  example: string
}

/** 交给模板的平铺视图：模板只负责摆放 */
interface View {
  kind: 'none' | 'error' | 'ok'
  /** 成功时的结果（复制按钮原样带走） */
  output: string
  error: PropError | null
}

function describeError(r: NonNullable<ReturnType<typeof parse>>): PropError {
  const example = FORMAT_EXAMPLE[settled.value.src]

  if (!r.ok && r.kind === 'format') {
    return {
      title: props.ui['tool.dms-decimal.errFormat'].replace('{name}', formatName(r.expected)),
      hint: props.ui['tool.dms-decimal.errFormatHint'],
      example: FORMAT_EXAMPLE[r.expected]
    }
  }

  if (!r.ok && r.kind === 'parse') {
    const e = r.error
    if (e.kind === 'range') {
      const isLat = e.field === 'lat'
      return {
        title: `${isLat ? props.ui['err.lat.range'] : props.ui['err.lng.range']} (${e.value})`,
        hint: isLat ? props.ui['err.lat.range.hint'] : props.ui['err.lng.range.hint'],
        example
      }
    }
    return {
      title:
        e.kind === 'singleValue' ? props.ui['tool.dms-decimal.needBoth'] : props.ui['err.parse.title'],
      hint:
        e.kind === 'singleValue'
          ? props.ui['tool.dms-decimal.needBothHint']
          : props.ui['err.parse.hint'],
      example
    }
  }

  return { title: '', hint: '', example }
}

/** 只依赖 settled 的视图 —— 输入停顿 300ms 后才更新 */
const view = computed<View>(() => {
  const r = parse(settled.value.coord, settled.value.src, settled.value.comma)
  if (!r) return { kind: 'none', output: '', error: null }
  if (!r.ok) return { kind: 'error', output: '', error: describeError(r) }
  return {
    kind: 'ok',
    output: formatPairValue(r.lng, r.lat, settled.value.dst, settled.value.p, props.lang),
    error: null
  }
})

/* ------------------------------------------------------------------ *
 * 偏好记忆
 * ------------------------------------------------------------------ */

onMounted(async () => {
  // 偏好：逗号含义、格式选择（PRD 8.1「工具偏好」）。
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>
      if (saved.comma === 'auto' || saved.comma === 'decimal' || saved.comma === 'separator') {
        commaAs.value = saved.comma
      }
      if (
        saved.src === 'auto' ||
        saved.src === 'decimal' ||
        saved.src === 'dm' ||
        saved.src === 'dms'
      ) {
        sourceFormat.value = saved.src
      }
      if (
        saved.dst === 'decimal' ||
        saved.dst === 'dm' ||
        saved.dst === 'dms-symbolic' ||
        saved.dst === 'dms-textual'
      ) {
        targetFormat.value = saved.dst
      }
    }
  } catch {
    // 隐私模式下 localStorage 可能抛异常，忽略即可，不影响功能
  }

  // 把恢复出的偏好同步进快照
  settleNow()
})

// 偏好写入本地存储。防抖，避免每次改动都写
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch([sourceFormat, targetFormat, commaAs], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          src: sourceFormat.value,
          dst: targetFormat.value,
          comma: commaAs.value
        })
      )
    } catch {
      /* 隐私模式下静默失败 */
    }
  }, 400)
})

/* ------------------------------------------------------------------ *
 * 防抖渲染（SR-12：INP < 200ms）
 * ------------------------------------------------------------------ */

/**
 * 换算是纯算术，微秒级，本不需要防抖。
 * 但**渲染**需要：每次击键都重新格式化结果在低端手机上会掉帧。
 * 300ms 后把输入整体快照到 settled，连续输入只触发一次渲染。
 */
let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch([coordInput, sourceFormat, targetFormat, commaAs], () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(settleNow, 300)
})
</script>

<template>
  <!-- 用 form 语义，不是 div（SR-12 骨架硬要求） -->
  <form class="t02" @submit.prevent>
    <div class="t02__row">
      <div class="field">
        <label for="t02-source">{{ ui['tool.dms-decimal.sourceFormat'] }}</label>
        <select id="t02-source" v-model="sourceFormat">
          <option v-for="o in SOURCE_OPTIONS" :key="o.value" :value="o.value">
            {{ ui[o.key] }}
          </option>
        </select>
      </div>

      <div class="field">
        <label for="t02-target">{{ ui['tool.dms-decimal.targetFormat'] }}</label>
        <select id="t02-target" v-model="targetFormat">
          <option v-for="o in TARGET_OPTIONS" :key="o.value" :value="o.value">
            {{ ui[o.key] }}
          </option>
        </select>
      </div>
    </div>

    <div class="t02__io">
      <div class="field">
        <label for="t02-coord">{{ ui['coord.lngLat'] }}</label>
        <!-- 一次只处理一组坐标，用单行 input 避免多行粘贴变成批量转换。
             不用 type="number"（FR-11 必踩坑）：它会拒绝 ° ' " 与「度分秒」汉字、
             截断前导零，还显示占空间的上下箭头 -->
        <input
          id="t02-coord"
          v-model="coordInput"
          class="coord-input"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          :placeholder="ui['coord.pairPlaceholder']"
          :aria-invalid="invalid ? 'true' : undefined"
        />
        <span class="field__hint">{{ ui['tool.dms-decimal.coordHint'] }}</span>
      </div>

    <!-- 结果区：只显示结果与复制；输入变化后自动重算（SR-12 骨架 / 硬规则 10） -->
    <output id="t02-result" class="t02__result" aria-live="polite">
      <template v-if="view.kind !== 'none'">
        <div v-if="view.kind === 'ok'" class="result">
          <div class="t02__copy">
            <CopyButton
              :text="view.output"
              :label="ui['common.copy']"
              :success-label="ui['common.copied']"
              :fail-label="ui['common.copyFailed']"
              variant="ghost"
            />
          </div>
          <div class="result__row">
            <span class="result__value result__value--lines">{{ view.output }}</span>
          </div>
        </div>

        <!-- 错误就地显示（SR-06 三段式：原因 / 正确写法 / 示例） -->
        <div v-if="view.error" class="error-box" role="alert">
          <p class="error-box__title">{{ view.error.title }}</p>
          <p class="error-box__hint">{{ view.error.hint }}</p>
          <p class="error-box__example">{{ view.error.example }}</p>
        </div>
      </template>
    </output>
    </div>

    <div class="t02__actions">
      <button
        type="button"
        class="btn btn--primary"
        :disabled="coordInput.trim() === ''"
        @click="settleNow"
      >
        {{ ui['common.convert'] }}
      </button>
    </div>

    <!-- SR-03：精度声明常驻，不藏在文档里 -->
    <p class="hint precision-note">{{ ui['tool.dms-decimal.precisionNote'] }}</p>
  </form>
</template>

<style scoped>
.t02 {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

/* 格式选择在输入框上方，一行两列 */
.t02__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
}

/* 输入在左、结果在右，两栏等高 */
.t02__io {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: stretch;
}

.t02__actions {
  display: flex;
  justify-content: flex-end;
}

/* 复制按钮放在结果上方，结果区只留数值 */
.t02__copy {
  display: flex;
  justify-content: flex-end;
}

/* 输入与结果共用同一套面板样式，左右两栏外观一致 */
.t02__io > .field,
.t02__result {
  background: var(--bg-sub);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  padding: var(--sp-3);
}

/* 输入面板本身就是编辑区，内部不再套一层边框 */
.t02__io > .field .coord-input {
  background: transparent;
  border: 0;
  padding: 0;
  min-block-size: 44px;
}

.t02__io > .field:focus-within {
  border-color: var(--acc);
}

.t02__result {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

@media (max-width: 720px) {
  .t02__row,
  .t02__io {
    grid-template-columns: minmax(0, 1fr);
  }
}

.hint {
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
  margin: 0;
}

.precision-note {
  border-block-start: 1px solid var(--line);
  padding-block-start: var(--sp-3);
}

/* 坐标输入框：等宽字体便于核对数字 */
.coord-input {
  font-family: var(--mono);
}

/* 多行结果原样换行显示；单行时与普通文本表现一致 */
.result__value--lines {
  white-space: pre-wrap;
}
</style>