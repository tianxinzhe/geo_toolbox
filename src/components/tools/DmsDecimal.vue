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
import { EXAMPLE_POINT } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import type { DmsFormat } from '../../lib/coord/dms'
import { DEFAULT_COORD_DIGITS, std } from '../../lib/coord/format'
import {
  formatAxisValue,
  formatPairValue,
  parseCoordinatePair,
  type SourceFormat,
  type TargetFormat
} from '../../lib/coord/pairFormat'
import { buildShareUrl, readShareState, T02_PARAMS, type ShareState } from '../../lib/share'
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

/** 精度选项 0~12（SR-02） */
const PRECISION_OPTIONS = Array.from({ length: 13 }, (_, i) => i)

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

/** 经纬度合并成一个输入框，方便直接粘贴 `116.3974, 39.9088` */
const coordInput = ref('')
const sourceFormat = ref<SourceFormat>('auto')
const targetFormat = ref<TargetFormat>('decimal')
const precision = ref(DEFAULT_COORD_DIGITS)
/** SR-01 规则 ⑤：逗号含义手动覆盖，记忆在 localStorage */
const commaAs = ref<CommaAs>('auto')

const shareNote = ref('')

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
  p: DEFAULT_COORD_DIGITS,
  comma: 'auto'
})

/**
 * 把当前输入一次性拷进快照。
 * 程序化写入输入（示例、清空、URL 恢复）后必须立即调用，
 * 否则结果会滞后 300ms 或显示旧值。
 */
function settleNow(): void {
  settled.value = {
    coord: coordInput.value,
    src: sourceFormat.value,
    dst: targetFormat.value,
    p: precision.value,
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

/** 结果区用的解析：只读快照 */
const parsed = computed(() => parse(settled.value.coord, settled.value.src, settled.value.comma))

/** 即时解析：只服务于 aria-invalid 与分享链接，不参与结果渲染 */
const liveParsed = computed(() => parse(coordInput.value, sourceFormat.value, commaAs.value))

/** 输入是否为空。空 → 显示空状态引导，而不是报错（SR-06） */
const isEmpty = computed(() => coordInput.value.trim() === '')

/**
 * aria-invalid 用非防抖状态：读屏用户按下键就要知道输入不对，
 * 等 300ms 会让其以为已经输对了。
 */
const invalid = computed(() => liveParsed.value !== null && !liveParsed.value.ok)

function formatName(f: DmsFormat): string {
  return props.ui[FORMAT_NAME_KEY[f]]
}

/** 归一化提示：两轴任意一个发生进位就提示（文案按进位去向区分） */
function normalizedNote(
  lng: { normalized: 'none' | 'seconds' | 'minutes' },
  lat: { normalized: 'none' | 'seconds' | 'minutes' }
): string {
  const mark = lng.normalized !== 'none' ? lng.normalized : lat.normalized
  if (mark === 'seconds') return props.ui['tool.dms-decimal.normalized.seconds']
  if (mark === 'minutes') return props.ui['tool.dms-decimal.normalized.minutes']
  return ''
}

/** 自动模式下的格式歧义：并列给出另一种解读，让用户自行确认 */
function alternativeNotes(r: Extract<NonNullable<ReturnType<typeof parse>>, { ok: true }>): string[] {
  if (settled.value.src !== 'auto') return []
  const notes: string[] = []
  const axes = [
    { axis: 'lng' as const, p: r.lngParsed, label: props.ui['coord.lng'] },
    { axis: 'lat' as const, p: r.latParsed, label: props.ui['coord.lat'] }
  ]
  for (const { axis, p, label } of axes) {
    if (!p.alternative) continue
    const alt = p.alternative.decimal
    const value = `${formatAxisValue(alt, axis, 'decimal', settled.value.p)} · ${formatAxisValue(
      alt,
      axis,
      'dms-symbolic',
      settled.value.p
    )}`
    notes.push(
      `${label}：${props.ui['tool.dms-decimal.alternative']
        .replace('{name}', formatName(p.alternative.interpretation))
        .replace('{value}', value)}`
    )
  }
  return notes
}

/** 交给模板的平铺视图：模板只负责摆放 */
interface View {
  kind: 'none' | 'error' | 'ok'
  title: string
  hint: string
  example: string
  output: string
  detected: string
  normalizedNote: string
  alternativeNotes: string[]
}

function errorView(r: NonNullable<ReturnType<typeof parse>>): View {
  const base: View = {
    kind: 'error',
    title: '',
    hint: '',
    example: FORMAT_EXAMPLE[settled.value.src],
    output: '',
    detected: '',
    normalizedNote: '',
    alternativeNotes: []
  }

  if (!r.ok && r.kind === 'format') {
    return {
      ...base,
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
        ...base,
        title: `${isLat ? props.ui['err.lat.range'] : props.ui['err.lng.range']} (${e.value})`,
        hint: isLat ? props.ui['err.lat.range.hint'] : props.ui['err.lng.range.hint']
      }
    }
    return {
      ...base,
      title: e.kind === 'singleValue' ? props.ui['tool.dms-decimal.needBoth'] : props.ui['err.parse.title'],
      hint: e.kind === 'singleValue' ? props.ui['tool.dms-decimal.needBothHint'] : props.ui['err.parse.hint']
    }
  }

  return base
}

/** 只依赖 settled 的视图 —— 输入停顿 300ms 后才更新 */
const view = computed<View>(() => {
  const r = parsed.value
  if (!r) {
    return {
      kind: 'none',
      title: '',
      hint: '',
      example: FORMAT_EXAMPLE[settled.value.src],
      output: '',
      detected: '',
      normalizedNote: '',
      alternativeNotes: []
    }
  }
  if (!r.ok) return errorView(r)

  return {
    kind: 'ok',
    title: '',
    hint: '',
    example: '',
    output: formatPairValue(
      r.lng,
      r.lat,
      settled.value.dst,
      settled.value.p,
      props.lang
    ),
    detected:
      r.lngFormat === r.latFormat
        ? formatName(r.lngFormat)
        : `${formatName(r.lngFormat)} / ${formatName(r.latFormat)}`,
    normalizedNote: normalizedNote(r.lngParsed, r.latParsed),
    alternativeNotes: alternativeNotes(r)
  }
})

/* ------------------------------------------------------------------ *
 * 交互
 * ------------------------------------------------------------------ */

/** SR-06 空状态引导：点一下填入该地区用户熟悉的地点（SR-11） */
function fillExample(): void {
  const [lng, lat] = EXAMPLE_POINT[props.lang]
  coordInput.value = `${std(lng, DEFAULT_COORD_DIGITS)}, ${std(lat, DEFAULT_COORD_DIGITS)}`
  settleNow()
}

/** 清空输入：立即同步快照，空状态与结果都不该滞后 300ms */
function clearAll(): void {
  coordInput.value = ''
  settleNow()
}

/** FR-05：点「分享」才生成链接，不改写浏览历史 */
async function onShare(): Promise<void> {
  const state: ShareState = { p: precision.value, comma: commaAs.value }

  // 分享必须拿输入框里的最新值，不能读 300ms 前的快照
  const live = liveParsed.value
  if (live?.ok) {
    state.lng = Number(std(live.lng, 8))
    state.lat = Number(std(live.lat, 8))
  }

  const link = await buildShareUrl(globalThis.location.pathname, state, T02_PARAMS)

  if (link.mode === 'tooLarge') {
    shareNote.value = props.ui['common.shareTooLarge']
    return
  }

  const abs = new URL(link.url, globalThis.location.origin).href
  try {
    await navigator.clipboard.writeText(abs)
    shareNote.value = props.ui['common.shared']
  } catch {
    // 剪贴板不可用时把链接显示出来让用户手动复制，而不是静默失败
    shareNote.value = abs
  }
  setTimeout(() => {
    if (shareNote.value === props.ui['common.shared']) shareNote.value = ''
  }, 2500)
}

/* ------------------------------------------------------------------ *
 * 偏好记忆与 URL 状态恢复
 * ------------------------------------------------------------------ */

onMounted(async () => {
  // 偏好：精度、逗号含义、格式选择（PRD 8.1「工具偏好」）。
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>
      if (typeof saved.p === 'number' && saved.p >= 0 && saved.p <= 12) precision.value = saved.p
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

  // FR-05：打开带参链接时自动回填并立即计算，用户无需再点一次按钮
  const restored = await readShareState(
    { search: globalThis.location.search, hash: globalThis.location.hash },
    T02_PARAMS
  )
  if (restored.hadProblems) {
    shareNote.value = props.ui['common.shareReset']
  }
  const s = restored.state
  // 分享链接仍按 lng / lat 两个数值参数编码，这里重新拼成合并输入框的一串
  if (typeof s.lng === 'number' && typeof s.lat === 'number') {
    coordInput.value = `${std(s.lng, 8)}, ${std(s.lat, 8)}`
  }
  if (typeof s.p === 'number') precision.value = s.p
  if (typeof s.comma === 'string') commaAs.value = s.comma as typeof commaAs.value

  // 带参打开要求「回填并立即计算」：直接把快照对齐到当前输入。
  settleNow()
})

// 偏好写入本地存储。防抖，避免每次改动都写
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch([sourceFormat, targetFormat, precision, commaAs], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          src: sourceFormat.value,
          dst: targetFormat.value,
          p: precision.value,
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
watch([coordInput, sourceFormat, targetFormat, precision, commaAs], () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(settleNow, 300)
})
</script>

<template>
  <!-- 用 form 语义，不是 div（SR-12 骨架硬要求） -->
  <form class="t02" @submit.prevent>
    <div class="field">
      <label for="t02-coord">{{ ui['coord.lngLat'] }}</label>
      <!-- ⚠️ type="text" + inputmode="decimal"，禁止 type="number"（FR-11 必踩坑）：
           number 会拒绝 ° ' " 与「度分秒」汉字、截断前导零，还显示占空间的上下箭头 -->
      <input
        id="t02-coord"
        v-model="coordInput"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        spellcheck="false"
        :placeholder="ui['coord.pairPlaceholder']"
        :aria-invalid="invalid ? 'true' : undefined"
      />
      <span class="field__hint">{{ ui['tool.dms-decimal.coordHint'] }}</span>
    </div>

    <div class="row">
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

    <!-- 高级选项：优先用原生 <details>（爬虫可读、无需 JS） -->
    <details class="advanced">
      <summary>{{ ui['common.advanced'] }}</summary>

      <div class="field">
        <label for="t02-p">{{ ui['coord.precision'] }}</label>
        <select id="t02-p" v-model.number="precision">
          <option v-for="d in PRECISION_OPTIONS" :key="d" :value="d">{{ d }}</option>
        </select>
        <span class="field__hint">0 ~ 12</span>
      </div>

      <div class="field">
        <label for="t02-comma">{{ ui['coord.commaMeaning'] }}</label>
        <select id="t02-comma" v-model="commaAs">
          <option value="auto">{{ ui['coord.comma.auto'] }}</option>
          <option value="separator">{{ ui['coord.comma.separator'] }}</option>
          <option value="decimal">{{ ui['coord.comma.decimal'] }}</option>
        </select>
        <span class="field__hint">{{ ui['coord.comma.hint'] }}</span>
      </div>
    </details>

    <!-- 结果区：用 <output> + aria-live="polite"（SR-12 骨架 / 硬规则 10） -->
    <output id="t02-result" class="result-stack" aria-live="polite">
      <!-- 空状态即引导（SR-06）：不显示空白，而给一个可点击的示例 -->
      <div v-if="isEmpty" class="empty-state">
        <p>{{ ui['err.empty.title'] }}</p>
        <p>{{ ui['err.empty.hint'] }}</p>
        <button type="button" class="btn btn--secondary" @click="fillExample">
          {{ ui['common.tryExample'] }}
        </button>
      </div>

      <template v-else>
        <!-- 错误就地显示（SR-06 三段式：原因 / 正确写法 / 示例） -->
        <div v-if="view.kind === 'error'" class="error-box" role="alert">
          <p class="error-box__title">{{ view.title }}</p>
          <p class="error-box__hint">{{ view.hint }}</p>
          <p class="error-box__example">{{ view.example }}</p>
        </div>

        <div v-else-if="view.kind === 'ok'" class="result">
          <!-- SR-01 规则 ④：回显识别出的原始格式，使任何误判对用户可见 -->
          <p class="echo">
            <span class="echo__label">{{ ui['tool.dms-decimal.detected'] }}</span>
            <span class="num">{{ view.detected }}</span>
          </p>

          <div class="result__row">
            <span class="result__label">{{ ui['coord.lngLat'] }}</span>
            <span class="result__value">{{ view.output }}</span>
            <span class="result__extra">
              <CopyButton
                :text="view.output"
                :label="ui['common.copy']"
                :success-label="ui['common.copied']"
                :fail-label="ui['common.copyFailed']"
                variant="ghost"
              />
            </span>
          </div>

          <!-- 进位归一化必须如实提示，不能悄悄发生（PRD T02） -->
          <p v-if="view.normalizedNote" class="note note--warn">{{ view.normalizedNote }}</p>

          <!-- 格式歧义：按十进制度处理，另一种解读一并给出让用户确认（PRD T02 专属异常①） -->
          <p v-for="(n, i) in view.alternativeNotes" :key="i" class="note note--warn">{{ n }}</p>

          <div class="btn-row">
            <button type="button" class="btn btn--primary" @click="onShare">
              {{ ui['common.share'] }}
            </button>
            <button type="button" class="btn btn--ghost" @click="clearAll">
              {{ ui['common.clear'] }}
            </button>
          </div>

          <!-- FR-05：分享按钮旁常驻提示 -->
          <p class="hint">{{ ui['common.shareWarning'] }}</p>
        </div>

        <!-- 分享提示放在条件分支之外：链接参数解析失败时也要能看到提示 -->
        <p v-if="shareNote" class="note note--dim share-note">{{ shareNote }}</p>
      </template>
    </output>

    <!-- SR-03：精度声明常驻，不藏在文档里 -->
    <p class="hint precision-note">{{ ui['tool.dms-decimal.precisionNote'] }}</p>
  </form>
</template>

<style scoped>
.t02 {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.result-stack {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

/* 回显：SR-01 规则 ④，让用户看见系统是怎么理解输入的 */
.echo {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-2);
  font-size: var(--fs-label);
  color: var(--ink-2);
  margin: 0;
  padding-block: var(--sp-2);
}

.echo__label {
  font-size: var(--fs-label);
}

.echo .num {
  font-size: var(--fs-num);
  color: var(--ink);
  background: none;
  border: 0;
  padding: 0;
}

.note {
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
  margin: 0;
  padding: var(--sp-2) var(--sp-3) 0;
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

.precision-note {
  border-block-start: 1px solid var(--line);
  padding-block-start: var(--sp-3);
}

.share-note {
  /* 长 URL 不能撑破容器 */
  overflow-wrap: anywhere;
  font-family: var(--mono);
}

.advanced {
  display: flex;
  flex-direction: column;
}

.advanced .field + .field {
  margin-block-start: var(--sp-3);
}

@media (min-width: 768px) {
  .advanced .field + .field {
    margin-block-start: 0;
  }

  .advanced > .field {
    display: inline-flex;
    flex-direction: column;
    margin-inline-end: var(--sp-6);
  }
}
</style>