<script setup lang="ts">
/**
 * T03 投影坐标转换（PRD 6.1 T03 / 6.4 详规）
 *
 * 三层分工：
 *   ① lib/crs/*      纯数据与 proj4 引擎（无 UI 依赖，100% 可单测）
 *   ② 本组件         把选择、输入、警告与结果排版成表单
 *   ③ 文案           构建期由 ToolPage 以 props 传入，客户端只带本页字符串
 *
 * 必须写清楚的取舍：
 *   ① **X / Y 轴序**：地理坐标用经度 / 纬度，投影坐标用东方向 / 北方向。
 *      字段标签由 `CrsInfo.kind` 决定，组件里没有一处硬编码。
 *   ② **负坐标合法**：投影坐标系没有 false easting/northing 时，
 *      原点西南方全是负值。本组件不做「必须为正」的校验。
 *   ③ **无基准变换不静默执行**：datumShift='missing' 时必须由用户
 *      勾选确认后才出结果（PRD 6.4 异常表）。
 *   ④ **完整 EPSG 表异步**：常用列表内置；用户输入其他代码时
 *      `resolveCrs` 才动态加载，加载期间显示提示并自动重试。
 *   ⑤ **两语言常用列表不同**：列表来自 shortlist.ts，顺序体现
 *      zh / en 的高频场景；本组件不写任何语言分支。
 *
 * ⛔ 不直接调用 toFixed / 手工拼数字：显示走 fmt / fmtUnit / stdFixed。
 */

import { computed, reactive, ref, watch } from 'vue'

import type { Lang } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import { fmtUnit, std, stdFixed } from '../../lib/coord/format'
import { normalizeFullWidth } from '../../lib/coord/parse'
import {
  checkCoord,
  createTransform,
  crsDisplayName,
  crsZoneInfo,
  geoComponents,
  hasBuiltinCrs,
  isFullEpsgLoaded,
  isValidEpsgCode,
  normalizeTowgs84,
  parseEpsgId,
  peekCrs,
  resolveCrsId
} from '../../lib/crs/engine'
import { CrsError, type CrsInfo, type DatumShift } from '../../lib/crs/model'
import type { CrsOption } from '../../lib/crs/model'
import {
  crsGroups,
  defaultPair,
  defaultPoint,
  CUSTOM_ID
} from '../../lib/crs/shortlist'
import CopyButton from '../ui/CopyButton.vue'

interface Props {
  lang: Lang
  ui: ToolUi & Record<string, string>
  toolId: string
}

const props = defineProps<Props>()

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

const groups = crsGroups(props.lang)

const defaults = defaultPair(props.lang)
const example = defaultPoint(props.lang)

/** datumShift → 文案键。四个键都必须登记进 registry */
const SHIFT_KEY: Record<DatumShift, string> = {
  none: 'tool.epsg-convert.shift.none',
  '7param': 'tool.epsg-convert.shift.7param',
  missing: 'tool.epsg-convert.shift.missing',
  custom: 'tool.epsg-convert.shift.custom'
}

const CUSTOM7_FIELDS = [
  ['dx', 'tool.epsg-convert.dx'],
  ['dy', 'tool.epsg-convert.dy'],
  ['dz', 'tool.epsg-convert.dz'],
  ['rx', 'tool.epsg-convert.rx'],
  ['ry', 'tool.epsg-convert.ry'],
  ['rz', 'tool.epsg-convert.rz'],
  ['s', 'tool.epsg-convert.scale']
] as const

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

const fromId = ref(defaults.from)
const toId = ref(defaults.to)
const xInput = ref('')
const yInput = ref('')
const fromCode = ref('')
const toCode = ref('')
const allowMissing = ref(false)
const custom7Enabled = ref(false)
const custom7 = reactive<Record<string, string>>({
  dx: '',
  dy: '',
  dz: '',
  rx: '',
  ry: '',
  rz: '',
  s: ''
})
const busy = ref(false)
const loadNote = ref('')

/**
 * 防抖快照。结果只读 settled —— 与其它工具的防抖模式一致，
 * 避免 computed 直接依赖输入框导致每次击键都重算投影。
 */
interface Settled {
  fromId: string
  toId: string
  fromCode: string
  toCode: string
  x: string
  y: string
  allowMissing: boolean
  custom7Enabled: boolean
  custom7: Record<string, string>
}

const settled = ref<Settled>({
  fromId: fromId.value,
  toId: toId.value,
  fromCode: '',
  toCode: '',
  x: '',
  y: '',
  allowMissing: false,
  custom7Enabled: false,
  custom7: { ...custom7 }
})

const fromInfo = ref<CrsInfo | null>(peekCrs(Number(defaults.from.replace('epsg:', ''))) ?? null)

interface View {
  fromName: string
  fromCodeText: string
  toName: string
  toCodeText: string
  outX: string
  outY: string
  labelX: string
  labelY: string
  copyText: string
  zoneNote: string
  shift: DatumShift
  pendingMissing: boolean
}

const view = ref<View | null>(null)
const errorKey = ref('')
const warnings = ref<string[]>([])

/* ------------------------------------------------------------------ *
 * 选择项详情
 * ------------------------------------------------------------------ */

function optionById(id: string): CrsOption | undefined {
  return groups.flatMap((g) => g.options).find((o) => o.id === id)
}

const fromDetail = computed(() => optionById(fromId.value)?.detail ?? '')
const toDetail = computed(() => optionById(toId.value)?.detail ?? '')

/** 当前生效的 id（自定义代码折叠成 epsg:NNNN） */
function effectiveId(id: string, code: string): string {
  if (id !== CUSTOM_ID) return id
  const n = Number(normalizeFullWidth(code).text.trim())
  return isValidEpsgCode(n) ? `epsg:${n}` : ''
}

/* ------------------------------------------------------------------ *
 * 数值解析（只接受十进制；带千分位的写法先剥掉分组逗号）
 * ------------------------------------------------------------------ */

function parseNum(raw: string): number | null {
  let t = normalizeFullWidth(raw).text.trim()
  if (t === '') return null
  t = t.replace(/\u2212/g, '-').replace(/\u00A0|\u202F|\s/g, '')
  // 形如 4,420,000 或 1,234.5 的分组逗号剥掉；其他逗号写法一律不猜
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const liveX = computed(() => parseNum(xInput.value))
const liveY = computed(() => parseNum(yInput.value))

const bothEmpty = computed(() => xInput.value.trim() === '' && yInput.value.trim() === '')
const oneEmpty = computed(
  () => (xInput.value.trim() === '') !== (yInput.value.trim() === '')
)
const invalid = computed(() => ({
  x: xInput.value.trim() !== '' && liveX.value === null,
  y: yInput.value.trim() !== '' && liveY.value === null
}))

/** 源坐标系的字段标签。由 kind 决定，绝不硬编码 */
function axisLabels(info: CrsInfo | null): [string, string] {
  if (!info) return [props.ui['tool.epsg-convert.eastX'], props.ui['tool.epsg-convert.northY']]
  if (info.kind === 'geographic') {
    return [
      props.ui['tool.epsg-convert.xLongitude'],
      props.ui['tool.epsg-convert.yLatitude']
    ]
  }
  return [props.ui['tool.epsg-convert.eastX'], props.ui['tool.epsg-convert.northY']]
}

const sourceLabels = computed(() => axisLabels(fromInfo.value))

/* ------------------------------------------------------------------ *
 * 计算
 * ------------------------------------------------------------------ */

let seq = 0

function customTowgs84(): string | undefined {
  const s = settled.value
  if (!s.custom7Enabled) return undefined
  const raw = CUSTOM7_FIELDS.map(([k]) => s.custom7[k]).join(',')
  return normalizeTowgs84(raw)
}

async function recompute(): Promise<void> {
  const token = ++seq
  view.value = null
  errorKey.value = ''
  warnings.value = []
  fromInfo.value = null

  const s = settled.value
  const from = effectiveId(s.fromId, s.fromCode)
  const to = effectiveId(s.toId, s.toCode)
  if (from === '' || to === '') {
    errorKey.value = 'tool.epsg-convert.invalidCode'
    return
  }

  busy.value = true
  loadNote.value = needsFullTable(from) ? props.ui['tool.epsg-convert.loadingFull'] : ''

  try {
    // 先把源 CRS 解析出来：即使坐标还没填，字段标签也要立刻
    // 从「X / Y」切换成「经度 / 纬度」或「北方向 / 東方向」。
    const fInfo = await resolveCrsId(from, { role: 'from' })
    if (token !== seq) return
    fromInfo.value = fInfo

    const x = parseNum(s.x)
    const y = parseNum(s.y)
    if (x === null || y === null) return

    const issues = checkCoord(fInfo, x, y)
    if (issues.includes('nan')) {
      errorKey.value = 'tool.epsg-convert.errNumber'
      return
    }
    if (issues.includes('geo-range')) {
      errorKey.value = 'tool.epsg-convert.errGeoRange'
      return
    }
    warnings.value = issues.filter((i) => i !== 'nan' && i !== 'geo-range')

    // 自动带号需要一个参考经纬度：源是地理坐标就直接用，
    // 否则先把输入反算到 WGS84 再取经度。
    let anchor: { lng: number; lat: number } | undefined
    if (fInfo.kind === 'geographic') {
      anchor = geoComponents(fInfo, x, y)
    } else {
      const toWgs = await createTransform(`epsg:${fInfo.code}`, 'epsg:4326')
      const [lng, lat] = toWgs.forward(x, y)
      anchor = { lng, lat }
    }

    const tr = await createTransform(from, to, {
      anchor,
      customTowgs84: customTowgs84()
    })
    if (token !== seq) return

    const missing = tr.datumShift === 'missing'
    if (missing && !s.allowMissing) {
      view.value = {
        fromName: crsDisplayName(tr.from, props.lang),
        fromCodeText: `EPSG:${tr.from.code}`,
        toName: crsDisplayName(tr.to, props.lang),
        toCodeText: `EPSG:${tr.to.code}`,
        outX: '',
        outY: '',
        labelX: '',
        labelY: '',
        copyText: '',
        zoneNote: '',
        shift: tr.datumShift,
        pendingMissing: true
      }
      return
    }

    const [ox, oy] = tr.forward(x, y)
    const digits = tr.to.kind === 'geographic' ? 8 : 3
    const unit = tr.to.kind === 'geographic' ? '°' : 'm'
    const labels = axisLabels(tr.to)
    const zone = crsZoneInfo(tr.to)
    const zoneNote =
      zone === null
        ? ''
        : zone.kind === 'utm'
          ? props.ui['tool.epsg-convert.utmZone'].replace(
              '{value}',
              `${zone.zone}${zone.south ? 'S' : 'N'}`
            )
          : props.ui['tool.epsg-convert.centralMeridian'].replace(
              '{value}',
              `${std(zone.value, 4)}°E`
            )

    view.value = {
      fromName: crsDisplayName(tr.from, props.lang),
      fromCodeText: `EPSG:${tr.from.code}`,
      toName: crsDisplayName(tr.to, props.lang),
      toCodeText: `EPSG:${tr.to.code}`,
      outX: fmtUnit(ox, props.lang, 'coord', unit, digits),
      outY: fmtUnit(oy, props.lang, 'coord', unit, digits),
      labelX: labels[0],
      labelY: labels[1],
      copyText: `${stdFixed(ox, digits)}, ${stdFixed(oy, digits)}`,
      zoneNote,
      shift: tr.datumShift,
      pendingMissing: false
    }
  } catch (e) {
    if (token !== seq) return
    errorKey.value = mapError(e)
  } finally {
    if (token === seq) {
      busy.value = false
      loadNote.value = ''
    }
  }
}

function mapError(e: unknown): string {
  if (e instanceof CrsError) {
    if (e.code === 'not-found') return 'tool.epsg-convert.errNotFound'
    if (e.code === 'auto-needs-location' || e.code === 'auto-source-unsupported') {
      return 'tool.epsg-convert.autoNeedGeo'
    }
    if (e.code === 'load-failed') return 'tool.epsg-convert.loadFailed'
    return 'tool.epsg-convert.loadFailed'
  }
  return 'tool.epsg-convert.errGeneric'
}

/** 只有代码不在内置表时，才需要提示「完整 EPSG 表加载中」 */
function needsFullTable(id: string): boolean {
  if (!id.startsWith('epsg:') || isFullEpsgLoaded()) return false
  try {
    return !hasBuiltinCrs(parseEpsgId(id))
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ *
 * 交互
 * ------------------------------------------------------------------ */

function swapXY(): void {
  const x = xInput.value
  xInput.value = yInput.value
  yInput.value = x
}

function fillExample(): void {
  xInput.value = example.x
  yInput.value = example.y
}

function clearAll(): void {
  xInput.value = ''
  yInput.value = ''
}

const custom7Incomplete = computed(() => {
  if (!custom7Enabled.value) return false
  return normalizeTowgs84(CUSTOM7_FIELDS.map(([k]) => custom7[k]).join(',')) === undefined
})

/** source / target 选择的互相排斥：同一 CRS 允许，只提示无需转换 */
const sameCrs = computed(() => effectiveId(fromId.value, fromCode.value) === effectiveId(toId.value, toCode.value))

/* ------------------------------------------------------------------ *
 * 防抖
 * ------------------------------------------------------------------ */

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  [fromId, toId, fromCode, toCode, xInput, yInput, allowMissing, custom7Enabled, () => ({ ...custom7 })],
  () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      settled.value = {
        fromId: fromId.value,
        toId: toId.value,
        fromCode: fromCode.value,
        toCode: toCode.value,
        x: xInput.value,
        y: yInput.value,
        allowMissing: allowMissing.value,
        custom7Enabled: custom7Enabled.value,
        custom7: { ...custom7 }
      }
      void recompute()
    }, 300)
  }
)

// 只由用户操作重置确认状态。
// 不能在 watch(fromId, toId) 里重置：从分享链接恢复时 refs 会被程序化赋值，
// 那样 rev=1 的分享链接会立刻被清掉，用户还得再勾一次。
</script>

<template>
  <form class="t03" @submit.prevent>
    <div class="row">
      <div class="field">
        <label for="t03-from">{{ ui['coord.source'] }}</label>
        <select id="t03-from" v-model="fromId" @change="allowMissing = false">
          <optgroup v-for="g in groups" :key="g.id" :label="g.label">
            <option v-for="o in g.options" :key="o.id" :value="o.id">{{ o.label }}</option>
          </optgroup>
        </select>
        <span v-if="fromDetail" class="field__hint">{{ fromDetail }}</span>
        <div v-if="fromId === CUSTOM_ID" class="custom-code">
          <label for="t03-from-code">{{ ui['tool.epsg-convert.customCode'] }}</label>
          <input
            id="t03-from-code"
            v-model="fromCode"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="4548"
            @input="allowMissing = false"
          />
          <span class="field__hint">{{ ui['tool.epsg-convert.customCodeHint'] }}</span>
        </div>
      </div>

      <div class="field">
        <label for="t03-to">{{ ui['coord.target'] }}</label>
        <select id="t03-to" v-model="toId" @change="allowMissing = false">
          <optgroup v-for="g in groups" :key="g.id" :label="g.label">
            <option v-for="o in g.options" :key="o.id" :value="o.id">{{ o.label }}</option>
          </optgroup>
        </select>
        <span v-if="toDetail" class="field__hint">{{ toDetail }}</span>
        <div v-if="toId === CUSTOM_ID" class="custom-code">
          <label for="t03-to-code">{{ ui['tool.epsg-convert.customCode'] }}</label>
          <input
            id="t03-to-code"
            v-model="toCode"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="4548"
            @input="allowMissing = false"
          />
          <span class="field__hint">{{ ui['tool.epsg-convert.customCodeHint'] }}</span>
        </div>
      </div>
    </div>

    <!-- 投影坐标的轴序提示：填反不会报错，只会得到错位的坐标 -->
    <p v-if="fromInfo && fromInfo.kind === 'projected'" class="hint">
      {{ ui['tool.epsg-convert.axisNoteXY'] }}
    </p>

    <div class="t03__io">
      <div class="t03__inputs">
        <div class="row">
          <div class="field">
            <label for="t03-x">{{ sourceLabels[0] }}</label>
            <input
              id="t03-x"
              v-model="xInput"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              :placeholder="example.x"
              :aria-invalid="invalid.x ? 'true' : undefined"
            />
            <span v-if="invalid.x" class="field__error" role="alert">
              {{ ui['tool.epsg-convert.errNumber'] }}
            </span>
          </div>

          <div class="field">
            <label for="t03-y">{{ sourceLabels[1] }}</label>
            <input
              id="t03-y"
              v-model="yInput"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              :placeholder="example.y"
              :aria-invalid="invalid.y ? 'true' : undefined"
            />
            <span v-if="invalid.y" class="field__error" role="alert">
              {{ ui['tool.epsg-convert.errNumber'] }}
            </span>
          </div>
        </div>

        <p class="hint">{{ ui['tool.epsg-convert.coordHint'] }}</p>

        <div class="btn-row">
          <button type="button" class="btn btn--ghost" @click="swapXY">
            {{ ui['tool.epsg-convert.swapXY'] }}
          </button>
        </div>

        <!-- 自定义 7 参数：内联展开，不再藏进「高级选项」 -->
        <div class="custom7-block">
          <label class="check">
            <input v-model="custom7Enabled" type="checkbox" />
            <span>{{ ui['tool.epsg-convert.custom7'] }}</span>
          </label>
          <span class="field__hint">{{ ui['tool.epsg-convert.custom7Hint'] }}</span>

          <div v-if="custom7Enabled" class="custom7">
            <div v-for="[key, labelKey] in CUSTOM7_FIELDS" :key="key" class="field field--small">
              <label :for="`t03-${key}`">{{ ui[labelKey] }}</label>
              <input
                :id="`t03-${key}`"
                v-model="custom7[key]"
                type="text"
                inputmode="decimal"
                autocomplete="off"
              />
            </div>
            <p v-if="custom7Incomplete" class="note note--warn">
              {{ ui['tool.epsg-convert.custom7Incomplete'] }}
            </p>
          </div>
        </div>
      </div>

    <output class="t03__result" aria-live="polite">
      <div v-if="bothEmpty" class="empty-state">
        <p>{{ ui['tool.epsg-convert.emptyTitle'] }}</p>
        <p>{{ ui['tool.epsg-convert.emptyBody'] }}</p>
        <button type="button" class="btn btn--secondary" @click="fillExample">
          {{ ui['common.tryExample'] }}
        </button>
      </div>

      <p v-else-if="oneEmpty" class="note note--inline">
        {{ ui['tool.epsg-convert.errNeedBoth'] }}
      </p>

      <p v-else-if="busy && !view" class="note note--inline">
        {{ loadNote || ui['common.loading'] }}
      </p>

      <p v-else-if="errorKey" class="note note--warn" role="alert">
        {{ ui[errorKey] }}
      </p>

      <template v-else-if="view">
        <p class="result-title">{{ ui['tool.epsg-convert.resultTitle'] }}</p>

        <div class="result">
          <div class="result__row">
            <span class="result__label">{{ ui['tool.epsg-convert.colSource'] }}</span>
            <span class="result__value">{{ view.fromName }}</span>
            <span class="result__extra">{{ view.fromCodeText }}</span>
          </div>
          <div class="result__row">
            <span class="result__label">{{ ui['tool.epsg-convert.colTarget'] }}</span>
            <span class="result__value">{{ view.toName }}</span>
            <span class="result__extra">{{ view.toCodeText }}</span>
          </div>

          <template v-if="view.pendingMissing">
            <p class="note note--warn">{{ ui['tool.epsg-convert.missingWarning'] }}</p>
            <label class="check">
              <input v-model="allowMissing" type="checkbox" />
              <span>{{ ui['tool.epsg-convert.allowMissing'] }}</span>
            </label>
          </template>

          <template v-else>
            <p v-if="sameCrs" class="note note--inline">
              {{ ui['tool.epsg-convert.identity'] }}
            </p>

            <div class="result__row">
              <span class="result__label">{{ view.labelX }}</span>
              <span class="result__value">{{ view.outX }}</span>
              <span class="result__extra">
                <CopyButton
                  :text="view.outX"
                  :label="ui['common.copy']"
                  :success-label="ui['common.copied']"
                  :fail-label="ui['common.copyFailed']"
                  variant="ghost"
                />
              </span>
            </div>
            <div class="result__row">
              <span class="result__label">{{ view.labelY }}</span>
              <span class="result__value">{{ view.outY }}</span>
              <span class="result__extra">
                <CopyButton
                  :text="view.outY"
                  :label="ui['common.copy']"
                  :success-label="ui['common.copied']"
                  :fail-label="ui['common.copyFailed']"
                  variant="ghost"
                />
              </span>
            </div>

            <div class="result__row">
              <span class="result__label">{{ ui['tool.epsg-convert.datumShift'] }}</span>
              <span class="result__value">{{ ui[SHIFT_KEY[view.shift]] }}</span>
            </div>

            <p v-if="view.zoneNote" class="note note--inline">{{ view.zoneNote }}</p>
            <p v-if="view.shift === 'missing'" class="note note--warn">
              {{ ui['tool.epsg-convert.missingWarning'] }}
            </p>
          </template>
        </div>

        <p v-for="w in warnings" :key="w" class="note note--warn">
          {{ ui[w === 'axis-swap' ? 'tool.epsg-convert.swapWarning' : 'tool.epsg-convert.magnitudeWarning'] }}
        </p>

        <div class="btn-row">
          <CopyButton
            v-if="view.copyText"
            :text="view.copyText"
            :label="ui['tool.epsg-convert.copyPair']"
            :success-label="ui['common.copied']"
            :fail-label="ui['common.copyFailed']"
            variant="secondary"
          />
          <button type="button" class="btn btn--ghost" @click="clearAll">
            {{ ui['common.clear'] }}
          </button>
        </div>
      </template>
    </output>
    </div>

    <!-- PRD 6.4：三条精度声明必须常驻、不可折叠 -->
    <div class="disclaimer">
      <p>{{ ui['tool.epsg-convert.precisionNote1'] }}</p>
      <p>{{ ui['tool.epsg-convert.precisionNote2'] }}</p>
      <p>{{ ui['tool.epsg-convert.precisionNote3'] }}</p>
    </div>
  </form>
</template>

<style scoped>
.t03 {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

/* 输入在左、结果在右，两栏等高 */
.t03__io {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: stretch;
}

/* 输入与结果共用同一套面板样式，左右两栏外观一致 */
.t03__inputs,
.t03__result {
  background: var(--bg-sub);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  padding: var(--sp-3);
}

.t03__inputs {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.t03__result {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

@media (max-width: 720px) {
  .t03__io {
    grid-template-columns: minmax(0, 1fr);
  }
}

.result-title {
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
  margin: 0;
  padding-block-end: var(--sp-1);
  border-block-end: 1px solid var(--line);
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

.custom-code {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  margin-block-start: var(--sp-2);
}

.custom7-block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.custom7 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--sp-3);
  margin-block-start: var(--sp-2);
}

.field--small label {
  font-size: var(--fs-label);
}

.check {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.disclaimer {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  border-block-start: 1px solid var(--line);
  padding-block-start: var(--sp-3);
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

.disclaimer p {
  margin: 0;
}
</style>