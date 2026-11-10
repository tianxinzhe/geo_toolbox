<script setup lang="ts">
/**
 * T08 GeoHash 编解码（PRD 6.1 规格表）
 *
 * 两个互斥方向，状态各自保留（切回来不丢已输入的内容）：
 *   ① 坐标 → GeoHash：经度、纬度、1~12 位精度（默认 7 位，约 150 m 见方）
 *   ② GeoHash → 坐标：中心点、边界框（西南 / 东北角）、近似地面尺寸
 * 两个方向都会给出 8 个方向邻居的 3×3 九宫格与 1~12 位精度对照表。
 *
 * 处理规则：
 *   - 编解码、邻居、精度表全部走 lib/coord/geohash，组件只做输入校验与格式化
 *   - 坐标输入是**经纬度合并的单框**（`116.3974, 39.9088`），解析统一走
 *     lib/coord/parse：全角归一化、逗号含义、半球符号与度分秒都在那里处理，
 *     否则从日文输入法或欧洲数据源粘来的值会整串判为不可解析（SR-01）
 *   - 经度方向的地面尺寸按赤道计算，结果区与精度表都必须说明它会随纬度收缩
 *     （SR-12：近似不得冒充精确）
 *
 * 专属异常：
 *   ① 非法字符 → 指出**第 N 个字符**、字符本身与合法字符集（库已返回 position）
 *   ② 精度超 1~12 → 夹取并提示：解码输入超过 12 位时只取前 12 位；
 *      分享链接带来的越界 p 也会被夹取（见 onMounted）
 *
 * SR-06：错误就地显示、不清空输入、不弹窗
 * SR-12：渲染防抖 300ms；aria-invalid 用非防抖状态，读屏用户即时得到反馈
 * FR-05：点「复制分享链接」才生成 URL，且只编码输入与选项，不含结果
 * FR-12：本工具 map='none' 且 gps=false，没有地图与定位入口
 *
 * ⛔ 组件层不出现 toFixed() / 手工拼数字串：数值走 lib/coord/format 的
 *    fmt / fmtUnit / std / distanceParts（SR-02 / SR-11 双出口收口）。
 */
import { computed, onMounted, ref, watch } from 'vue'

import type { Lang } from '../../config/i18n'
import { EXAMPLE_POINT } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import {
  DEFAULT_COORD_DIGITS,
  distanceParts,
  fmt,
  fmtUnit,
  std
} from '../../lib/coord/format'
import {
  BASE32,
  DEFAULT_PRECISION,
  MAX_PRECISION,
  MIN_PRECISION,
  PRECISION_TABLE,
  clampPrecision,
  decode,
  encode,
  type DecodeOk,
  type Direction
} from '../../lib/coord/geohash'
import { parseCoord, DEFAULT_CTX, type ParseError } from '../../lib/coord/parse'
import { buildShareUrl, readShareState, T08_PARAMS, type ShareState } from '../../lib/share'
import CopyButton from '../ui/CopyButton.vue'

interface Props {
  lang: Lang
  /** 构建期由 ToolPage 用 pick(lang, keys) 取出的文案子集 */
  ui: ToolUi & Record<string, string>
  /**
   * 工具编号（'T08'）。
   *
   * 与 T01 / T02 / T04 同理：刻意**不**把整个 ToolMeta 传进来 ——
   * Astro 会把 props 序列化进 `astro-island` 属性，三语言的 names / desc /
   * keywords 会白白多出几 KB HTML。
   */
  toolId: string
}

const props = defineProps<Props>()

/* ------------------------------------------------------------------ *
 * 常量表（键名与选项集中在这里，模板中不出现字符串拼接）
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'geo.t08.prefs'

type Mode = 'encode' | 'decode'

const MODES: readonly Mode[] = ['encode', 'decode']

const MODE_KEY: Record<Mode, string> = {
  encode: 'tool.geohash.mode.encode',
  decode: 'tool.geohash.mode.decode'
}

/** 方向 → 文案键。8 个键必须全部列进 registry.ts 的 TOOL_KEYS['geohash'] */
const DIR_KEY: Record<Direction, string> = {
  n: 'tool.geohash.dir.n',
  ne: 'tool.geohash.dir.ne',
  e: 'tool.geohash.dir.e',
  se: 'tool.geohash.dir.se',
  s: 'tool.geohash.dir.s',
  sw: 'tool.geohash.dir.sw',
  w: 'tool.geohash.dir.w',
  nw: 'tool.geohash.dir.nw'
}

/** 精度下拉的候选：1~12（T08 没有 0 位这种精度） */
const PRECISION_OPTIONS = Array.from(
  { length: MAX_PRECISION - MIN_PRECISION + 1 },
  (_, i) => MIN_PRECISION + i
)

/**
 * 九宫格的排列顺序：与地图方位一致（上北下南）。
 * null 是中心格 —— 它显示当前 hash，不可点击。
 */
const GRID_ORDER: ReadonlyArray<ReadonlyArray<Direction | null>> = [
  ['nw', 'n', 'ne'],
  ['w', null, 'e'],
  ['sw', 's', 'se']
]

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

const mode = ref<Mode>('encode')

/** 编码方向的输入。经纬度合并成一个输入框，方便直接粘贴 `116.3974, 39.9088` */
const coordInput = ref('')
const precision = ref(DEFAULT_PRECISION)

/** 解码方向的输入 */
const hashInput = ref('')

/** SR-01 规则 ⑤：逗号含义手动覆盖，记忆在 localStorage */
const commaAs = ref<'auto' | 'decimal' | 'separator'>('auto')

/** 分享链接里的 p 越界时，夹取后提示一次；用户手动改精度即消失 */
const precisionClamped = ref(false)

const shareNote = ref('')

type CommaAs = 'auto' | 'decimal' | 'separator'

/**
 * 防抖后的输入快照。结果区只读这份快照，**不**直接读输入 ref，
 * 否则 computed 会立即依赖输入框，300ms 防抖形同虚设（每次击键都重渲染
 * 六行结果 + 9 个邻居格 + 12 行精度表）。
 */
interface Settled {
  mode: Mode
  coord: string
  p: number
  hash: string
  comma: CommaAs
}

const settled = ref<Settled>({
  mode: 'encode',
  coord: '',
  p: DEFAULT_PRECISION,
  hash: '',
  comma: 'auto'
})

/**
 * 把当前输入一次性拷进快照。
 * 程序化写入输入（示例、点击邻居、清空、URL 恢复）后必须立即调用，
 * 否则结果会滞后 300ms 或显示旧值。
 */
function settleNow(): void {
  settled.value = {
    mode: mode.value,
    coord: coordInput.value,
    p: precision.value,
    hash: hashInput.value,
    comma: commaAs.value
  }
}

/** 本语言的示例地点，同时用于占位符与「试试示例」 */
const example = computed(() => {
  const [lng, lat] = EXAMPLE_POINT[props.lang]
  return {
    coord: `${std(lng, DEFAULT_COORD_DIGITS)}, ${std(lat, DEFAULT_COORD_DIGITS)}`,
    lng: std(lng, DEFAULT_COORD_DIGITS),
    lat: std(lat, DEFAULT_COORD_DIGITS),
    hash: encode(lng, lat, DEFAULT_PRECISION)
  }
})

const effectivePrecision = computed(() => clampPrecision(precision.value))

/** 结果区用的精度：只读快照（分享 / 示例等程序化场景仍用当前输入） */
const settledPrecision = computed(() => clampPrecision(settled.value.p))

/* ------------------------------------------------------------------ *
 * 编码方向：经纬度解析
 * ------------------------------------------------------------------ */

type CoordState =
  | { kind: 'empty' }
  | { kind: 'error'; error: ParseError }
  | { kind: 'ok'; lng: number; lat: number }

/**
 * 解析合并后的经纬度输入（经度在前、纬度在后）。
 *
 * 统一交给 lib/coord/parse：全角归一化、逗号含义、半球符号与度分秒都在那里处理，
 * 本组件不再自己写十进制解析，避免两套规则给出不同结论（SR-01）。
 * 参数化而不是直接读输入 ref：结果区吃 settled 快照，
 * aria-invalid 与分享链接吃当前输入，两处共用同一套解析。
 */
function parseCoords(raw: string, comma: CommaAs): CoordState {
  if (raw.trim() === '') return { kind: 'empty' }
  const r = parseCoord(raw, { ...DEFAULT_CTX, commaAs: comma })
  if (!r.ok) return { kind: 'error', error: r }
  return { kind: 'ok', lng: r.lng, lat: r.lat }
}

/* ------------------------------------------------------------------ *
 * 解码方向：GeoHash 解析
 * ------------------------------------------------------------------ */

interface HashError {
  /** 0 起的位置（来自 lib），展示时 +1 */
  position: number
  char: string
  alphabet: string
  before: string
  after: string
}

type HashState =
  | { kind: 'empty' }
  | { kind: 'error'; error: HashError }
  | { kind: 'ok'; hash: string; truncated: boolean }

/** 参数化：结果区吃 settled 快照，aria-invalid 与分享链接吃当前输入 */
function parseHash(rawInput: string): HashState {
  const raw = rawInput.trim()
  if (raw === '') return { kind: 'empty' }

  // 先对**整串**校验：超过 12 位时，第 13 位之后若还有非法字符也要指出来，
  // 不能因为「反正要截断」就把它藏起来（SR-01 不静默改写）
  const d = decode(raw)
  if (!d.ok) {
    if (d.reason === 'empty') return { kind: 'empty' }
    const position = d.position ?? 0
    const lower = raw.toLowerCase()
    return {
      kind: 'error',
      error: {
        position,
        char: d.char ?? '',
        alphabet: d.alphabet ?? BASE32,
        before: lower.slice(0, position),
        after: lower.slice(position + 1)
      }
    }
  }

  const truncated = d.hash.length > MAX_PRECISION
  return {
    kind: 'ok',
    hash: truncated ? d.hash.slice(0, MAX_PRECISION) : d.hash,
    truncated
  }
}

/* ------------------------------------------------------------------ *
 * 结果视图
 * ------------------------------------------------------------------ */

interface GridCell {
  dir: Direction | null
  label: string
  hash: string
  current: boolean
  /** 极点之外没有相邻格子；库在这种情况下返回原 hash */
  available: boolean
}

interface GeoView {
  hash: string
  precision: number
  center: string
  sw: string
  ne: string
  size: string
  grid: GridCell[]
}

function coordText(p: { lng: number; lat: number }): string {
  return `${fmt(p.lng, props.lang, 'coord', DEFAULT_COORD_DIGITS)}, ${fmt(
    p.lat,
    props.lang,
    'coord',
    DEFAULT_COORD_DIGITS
  )}`
}

/**
 * 长度显示按量级自动切换米 / 千米（复用 lib 的 distanceParts）。
 *
 * 1 位精度的格子宽约 5000 km，硬按米写会得到 `4,998,760 m` 这种读数；
 * 12 位又只有几厘米，按千米写则是 0.000 km。distanceParts 的两个分支
 * 正好覆盖这两端。
 */
function lengthText(meters: number): string {
  const p = distanceParts(meters).primary
  return fmtUnit(p.value, props.lang, 'measure', p.unit, p.digits)
}

function sizeText(lngMeters: number, latMeters: number): string {
  return `${lengthText(lngMeters)} × ${lengthText(latMeters)}`
}

function gridOf(d: DecodeOk): GridCell[] {
  const cells: GridCell[] = []
  for (const row of GRID_ORDER) {
    for (const dir of row) {
      if (dir === null) {
        cells.push({
          dir: null,
          label: props.ui['tool.geohash.gridCenter'],
          hash: d.hash,
          current: true,
          available: true
        })
        continue
      }
      const hash = d.neighbors[dir]
      cells.push({
        dir,
        label: props.ui[DIR_KEY[dir]],
        hash,
        current: false,
        // 纬度越过极点时邻居还是自己：显示成「—」，不给一个点了没反应的按钮
        available: hash !== d.hash
      })
    }
  }
  return cells
}

function geoView(hash: string): GeoView | null {
  const d = decode(hash)
  if (!d.ok) return null
  return {
    hash: d.hash,
    precision: d.precision,
    center: coordText(d.center),
    sw: coordText(d.box.sw),
    ne: coordText(d.box.ne),
    size: sizeText(d.size.lng, d.size.lat),
    grid: gridOf(d)
  }
}

interface View {
  empty: boolean
  coordError: ParseError | null
  hashError: HashError | null
  tooLong: boolean
  geo: GeoView | null
}

function computeView(s: Settled): View {
  // 结果只认快照：输入框里的当前值由 invalid / 分享链接即时读取
  if (s.mode === 'encode') {
    const c = parseCoords(s.coord, s.comma)
    if (c.kind === 'empty') {
      return { empty: true, coordError: null, hashError: null, tooLong: false, geo: null }
    }
    if (c.kind === 'error') {
      return { empty: false, coordError: c.error, hashError: null, tooLong: false, geo: null }
    }

    const hash = encode(c.lng, c.lat, clampPrecision(s.p))
    return {
      empty: false,
      coordError: null,
      hashError: null,
      tooLong: false,
      geo: geoView(hash)
    }
  }

  const h = parseHash(s.hash)
  return {
    empty: h.kind === 'empty',
    coordError: null,
    hashError: h.kind === 'error' ? h.error : null,
    tooLong: h.kind === 'ok' && h.truncated,
    geo: h.kind === 'ok' ? geoView(h.hash) : null
  }
}

/* ------------------------------------------------------------------ *
 * 即时校验（不防抖）
 * ------------------------------------------------------------------ */

/**
 * aria-invalid 必须即时反映输入合法性：读屏用户按下键就要知道这一格不对，
 * 等 300ms 才更新会让他以为已经输对了。结果区的渲染才需要防抖。
 */
const invalid = computed(() => {
  const raw = hashInput.value.trim()
  return {
    coord: parseCoords(coordInput.value, commaAs.value).kind === 'error',
    hash: raw !== '' && !decode(raw).ok
  }
})

/** 当前精度：解码成功时按字符串长度，否则按编码方向选中的长度（结果区只读快照） */
const currentPrecision = computed(() => {
  if (settled.value.mode === 'decode') {
    const h = parseHash(settled.value.hash)
    if (h.kind === 'ok') return h.hash.length
  }
  return settledPrecision.value
})

/** 精度对照表的显示值。误差用坐标格式（不加千分位），尺寸按量级换单位 */
const precisionRows = computed(() =>
  PRECISION_TABLE.map((r) => ({
    precision: r.precision,
    lngError: fmt(r.lngError, props.lang, 'coord', 10),
    latError: fmt(r.latError, props.lang, 'coord', 10),
    size: sizeText(r.lngSize, r.latSize)
  }))
)

/* ------------------------------------------------------------------ *
 * 交互
 * ------------------------------------------------------------------ */

/** 空状态引导：编码方向填示例坐标，解码方向填示例坐标的 GeoHash */
function fillExample(): void {
  const [lng, lat] = EXAMPLE_POINT[props.lang]
  if (mode.value === 'encode') {
    coordInput.value = `${std(lng, DEFAULT_COORD_DIGITS)}, ${std(lat, DEFAULT_COORD_DIGITS)}`
  } else {
    hashInput.value = encode(lng, lat, effectivePrecision.value)
  }
  // 示例是程序化写入：立即同步快照，别让用户点完还要等 300ms 才看到结果
  settleNow()
}

/**
 * 点击邻居 → 填入解码输入框，并切到解码方向。
 *
 * 只填不切的话，用户看不见任何反应（编码方向不显示解码输入框），
 * 会以为按钮坏了。切换模式后两种输入各自保留，切回来仍在。
 */
function pickNeighbor(hash: string): void {
  if (hash === '') return
  hashInput.value = hash
  mode.value = 'decode'
  // 按钮回填是程序化写入：立即同步快照，否则新解码结果要等 300ms 才出现
  settleNow()
}

function clearAll(): void {
  coordInput.value = ''
  hashInput.value = ''
  shareNote.value = ''
  settleNow()
}

/** FR-05：点「分享」才生成链接，不改写浏览历史 */
async function onShare(): Promise<void> {
  const state: ShareState = {
    mode: mode.value,
    p: effectivePrecision.value,
    comma: commaAs.value
  }

  // 分享必须拿输入框里的最新值，不能读 300ms 前的快照
  if (mode.value === 'encode') {
    const c = parseCoords(coordInput.value, commaAs.value)
    if (c.kind === 'ok') {
      state.lng = Number(std(c.lng, DEFAULT_COORD_DIGITS))
      state.lat = Number(std(c.lat, DEFAULT_COORD_DIGITS))
    }
  } else {
    const h = parseHash(hashInput.value)
    if (h.kind === 'ok') state.q = h.hash
  }

  const link = await buildShareUrl(globalThis.location.pathname, state, T08_PARAMS)

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
  // 偏好只存模式 / 精度 / 逗号含义这类非敏感选项。
  // 坐标与 GeoHash 输入**不进** localStorage（PRD 8.1 隐私约束）。
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>
      if (saved.mode === 'encode' || saved.mode === 'decode') mode.value = saved.mode
      if (typeof saved.p === 'number') precision.value = clampPrecision(saved.p)
      if (saved.comma === 'auto' || saved.comma === 'decimal' || saved.comma === 'separator') {
        commaAs.value = saved.comma
      }
    }
  } catch {
    // 隐私模式下 localStorage 可能抛异常，忽略即可，不影响功能
  }

  // FR-05：打开带参链接时自动回填并立即计算
  const restored = await readShareState(
    { search: globalThis.location.search, hash: globalThis.location.hash },
    T08_PARAMS
  )
  if (restored.hadProblems) {
    shareNote.value = props.ui['common.shareReset']
  }

  const s = restored.state
  if (s.mode === 'encode' || s.mode === 'decode') mode.value = s.mode
  // 分享链接仍按 lng / lat 两个数值参数编码，这里重新拼成合并输入框的一串
  if (typeof s.lng === 'number' && typeof s.lat === 'number') {
    coordInput.value = `${std(s.lng, DEFAULT_COORD_DIGITS)}, ${std(s.lat, DEFAULT_COORD_DIGITS)}`
  }
  if (typeof s.p === 'number') {
    // T08 的精度是 1~12。参数表放宽到 0~99 只是为了把越界链接
    // 「夹取并提示」，而不是整条重置 —— PRD T08 专属异常② 要求夹取，不是丢弃
    const p = clampPrecision(s.p)
    if (p !== s.p) precisionClamped.value = true
    precision.value = p
  }
  if (typeof s.q === 'string') hashInput.value = s.q
  if (s.comma === 'auto' || s.comma === 'decimal' || s.comma === 'separator') {
    commaAs.value = s.comma
  }

  // 带参打开要求「回填并立即计算」：直接把快照对齐到当前输入，
  // 不额外等 300ms 防抖（用户此时并没有在连续打字）。
  // 无参数时这一步只是把恢复出的偏好（模式 / 精度 / 逗号）同步进快照。
  settleNow()
})

// 偏好写入本地存储。防抖，避免每次改动都写
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch([mode, precision, commaAs], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode: mode.value, p: precision.value, comma: commaAs.value })
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
 * 编解码与邻居都是微秒级，但一次输入停顿要重渲染：
 * 六行结果 + 9 个网格 + 12 行精度表（每行都要格式化），
 * 每次击键都重渲染在低端手机上会掉帧。300ms 后把输入整体快照到 settled。
 *
 * 注意：不能像早期实现那样在 computed 里「void tick.value」再直接读输入框 ——
 * computed 会同时依赖输入框本身，防抖等于没写。这里结果只读 settled。
 */
let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch([mode, coordInput, precision, hashInput, commaAs], () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(settleNow, 300)
})

/** 只依赖 settled 的视图 —— 输入停顿后才更新 */
const shown = computed<View>(() => computeView(settled.value))
</script>

<template>
  <!-- 用 form 语义，不是 div（SR-12 骨架硬要求） -->
  <form class="t08" @submit.prevent>
    <!-- 模式选择：用 radio 而不是 select —— 这是本工具最顶层的分岔，
         藏进下拉框会让用户以为只有一个功能 -->
    <fieldset class="field modes">
      <legend>{{ ui['tool.geohash.mode'] }}</legend>
      <label v-for="m in MODES" :key="m" class="check" :for="`t08-mode-${m}`">
        <input :id="`t08-mode-${m}`" v-model="mode" type="radio" name="t08-mode" :value="m" />
        <span>{{ ui[MODE_KEY[m]] }}</span>
      </label>
    </fieldset>

    <!-- 编码方向：经纬度（合并输入）/ 精度 -->
    <div v-if="mode === 'encode'" class="row">
      <div class="field">
        <label for="t08-coord">{{ ui['coord.lngLat'] }}</label>
        <!-- ⚠️ type="text" + inputmode="decimal"，禁止 type="number"（FR-11 必踩坑）：
             number 会拒绝前导零、吞掉逗号，并显示占空间的上下箭头 -->
        <input
          id="t08-coord"
          v-model="coordInput"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          :placeholder="example.coord"
          :aria-invalid="invalid.coord ? 'true' : undefined"
        />
      </div>

      <div class="field">
        <label for="t08-p">{{ ui['tool.geohash.precision'] }}</label>
        <select id="t08-p" v-model.number="precision" @change="precisionClamped = false">
          <option v-for="p in PRECISION_OPTIONS" :key="p" :value="p">{{ p }}</option>
        </select>
        <span class="field__hint">{{ ui['tool.geohash.precisionHint'] }}</span>
      </div>
    </div>

    <!-- 解码方向：GeoHash 字符串 -->
    <div v-else class="field">
      <label for="t08-hash">{{ ui['tool.geohash.hash'] }}</label>
      <input
        id="t08-hash"
        v-model="hashInput"
        type="text"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        :placeholder="example.hash"
        :aria-invalid="invalid.hash ? 'true' : undefined"
      />
      <span class="field__hint">{{ ui['tool.geohash.hashHint'] }}</span>
    </div>

    <p class="hint">
      {{ mode === 'encode' ? ui['tool.geohash.encodeHint'] : ui['tool.geohash.decodeHint'] }}
    </p>

    <!-- 高级选项：逗号含义只影响编码方向的坐标解析。
         用原生 <details>（爬虫可读、无需 JS） -->
    <details v-if="mode === 'encode'" class="advanced">
      <summary>{{ ui['common.advanced'] }}</summary>

      <div class="field">
        <label for="t08-comma">{{ ui['coord.commaMeaning'] }}</label>
        <select id="t08-comma" v-model="commaAs">
          <option value="auto">{{ ui['coord.comma.auto'] }}</option>
          <option value="separator">{{ ui['coord.comma.separator'] }}</option>
          <option value="decimal">{{ ui['coord.comma.decimal'] }}</option>
        </select>
        <span class="field__hint">{{ ui['coord.comma.hint'] }}</span>
      </div>
    </details>

    <!-- 结果区：用 <output> + aria-live="polite"（SR-12 骨架 / 硬规则 10） -->
    <output id="t08-result" class="result-stack" aria-live="polite">
      <!-- 空状态即引导（SR-06）：不显示空白，而给一个可点击的示例 -->
      <div v-if="shown.empty" class="empty-state">
        <p>{{ ui['err.empty.title'] }}</p>
        <p>{{ ui['err.empty.hint'] }}</p>
        <button type="button" class="btn btn--secondary" @click="fillExample">
          {{ ui['common.tryExample'] }}
        </button>
      </div>

      <template v-else>
        <!-- 编码方向的坐标错误：就地三段式（原因 / 正确写法 / 示例），不清空输入 -->
        <div v-if="shown.coordError" class="error-box" role="alert">
          <p class="error-box__title">
            {{
              shown.coordError.kind === 'range'
                ? ui[shown.coordError.field === 'lat' ? 'err.lat.range' : 'err.lng.range']
                : ui['tool.geohash.errNumber']
            }}
            <span class="num">{{ shown.coordError.value }}</span>
          </p>
          <p class="error-box__hint">
            {{
              shown.coordError.kind === 'range'
                ? ui[shown.coordError.field === 'lat' ? 'err.lat.range.hint' : 'err.lng.range.hint']
                : ui['tool.geohash.errNumberHint']
            }}
          </p>
          <p class="error-box__example">{{ example.coord }}</p>
        </div>

        <!-- 解码方向的非法字符：指出第 N 个字符、字符本身与合法字符集 -->
        <div v-if="shown.hashError" class="error-box" role="alert">
          <p class="error-box__title">
            {{
              ui['tool.geohash.errIllegal']
                .replace('{n}', String(shown.hashError.position + 1))
                .replace('{char}', shown.hashError.char)
            }}
          </p>
          <p class="error-box__hint">{{ ui['tool.geohash.errIllegalHint'] }}</p>
          <p class="error-box__example">
            {{ ui['tool.geohash.errAlphabet'].replace('{alphabet}', shown.hashError.alphabet) }}
          </p>
          <!-- 把出错字符在原串里标出来：只给「第 N 个」在长串里仍然难找 -->
          <p class="hash-echo" aria-hidden="true">
            <span>{{ shown.hashError.before }}</span><mark>{{ shown.hashError.char }}</mark><span>{{
              shown.hashError.after
            }}</span>
          </p>
        </div>

        <!-- 解码输入超过 12 位：夹取并提示（PRD T08 专属异常②） -->
        <p v-if="shown.tooLong" class="note note--warn">
          {{ ui['tool.geohash.hashTooLong'] }}
        </p>

        <!-- 分享链接里的 p 越界：夹取后提示一次 -->
        <p v-if="precisionClamped" class="note note--warn">
          {{ ui['tool.geohash.precisionClamped'].replace('{p}', String(effectivePrecision)) }}
        </p>

        <template v-if="shown.geo">
          <div class="result">
            <div class="result__row">
              <span class="result__label">{{ ui['tool.geohash.result.hash'] }}</span>
              <span class="result__value hash-value">{{ shown.geo.hash }}</span>
              <span class="result__extra">
                <CopyButton
                  :text="shown.geo.hash"
                  :label="ui['common.copy']"
                  :success-label="ui['common.copied']"
                  :fail-label="ui['common.copyFailed']"
                  variant="ghost"
                />
              </span>
            </div>

            <div class="result__row">
              <span class="result__label">{{ ui['tool.geohash.result.center'] }}</span>
              <span class="result__value">{{ shown.geo.center }}</span>
            </div>

            <div class="result__row">
              <span class="result__label">{{ ui['tool.geohash.result.sw'] }}</span>
              <span class="result__value">{{ shown.geo.sw }}</span>
            </div>

            <div class="result__row">
              <span class="result__label">{{ ui['tool.geohash.result.ne'] }}</span>
              <span class="result__value">{{ shown.geo.ne }}</span>
            </div>

            <div class="result__row">
              <span class="result__label">{{ ui['tool.geohash.result.size'] }}</span>
              <span class="result__value">{{ shown.geo.size }}</span>
            </div>

            <div class="result__row">
              <span class="result__label">{{ ui['tool.geohash.result.precision'] }}</span>
              <span class="result__value">{{ shown.geo.precision }}</span>
            </div>
          </div>

          <p class="hint">{{ ui['tool.geohash.sizeNote'] }}</p>

          <!-- 3×3 邻居九宫格：中心是当前 hash，其余可点击填入解码框 -->
          <section class="neighbors" :aria-label="ui['tool.geohash.result.neighbors']">
            <p class="result__title">{{ ui['tool.geohash.result.neighbors'] }}</p>
            <div class="grid" role="group" :aria-label="ui['tool.geohash.result.neighbors']">
              <div
                v-for="cell in shown.geo.grid"
                :key="cell.dir ?? 'center'"
                class="grid__cell"
                :class="{ 'grid__cell--current': cell.current }"
              >
                <span class="grid__dir">{{ cell.label }}</span>
                <button
                  v-if="!cell.current && cell.available"
                  type="button"
                  class="grid__hash"
                  :aria-label="`${cell.label} ${cell.hash}`"
                  @click="pickNeighbor(cell.hash)"
                >
                  {{ cell.hash }}
                </button>
                <span v-else class="grid__hash grid__hash--static">
                  {{ cell.available ? cell.hash : '—' }}
                </span>
              </div>
            </div>
            <p class="hint">{{ ui['tool.geohash.gridHint'] }}</p>
          </section>
        </template>

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
      </template>

      <!-- 分享提示放在条件分支之外：链接解析失败时输入可能仍为空，
           若藏在结果分支里，用户就看不到「已重置」这条提示 -->
      <p v-if="shareNote" class="note note--dim share-note">{{ shareNote }}</p>
    </output>

    <!-- 精度对照表：常驻结果区（PRD T08 要求 1~12 位可随时查阅） -->
    <details class="precision-table">
      <summary>{{ ui['tool.geohash.precisionTable'] }}</summary>
      <div class="precision-table__wrap">
        <table>
          <thead>
            <tr>
              <th class="num">{{ ui['tool.geohash.col.precision'] }}</th>
              <th class="num">{{ ui['tool.geohash.col.lngError'] }}</th>
              <th class="num">{{ ui['tool.geohash.col.latError'] }}</th>
              <th>{{ ui['tool.geohash.col.size'] }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in precisionRows"
              :key="row.precision"
              :class="{ 'is-current': row.precision === currentPrecision }"
              :aria-current="row.precision === currentPrecision ? 'true' : undefined"
            >
              <td class="num">
                {{ row.precision }}
                <span v-if="row.precision === currentPrecision" class="tag">
                  {{ ui['tool.geohash.current'] }}
                </span>
              </td>
              <td class="num">{{ row.lngError }}</td>
              <td class="num">{{ row.latError }}</td>
              <td>{{ row.size }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>

    <!-- SR-03：精度声明常驻，不藏在文档里 -->
    <p class="hint precision-note">{{ ui['tool.geohash.precisionNote'] }}</p>
  </form>
</template>

<style scoped>
.t08 {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.result-stack {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.result__title {
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
  margin: 0;
  padding-block-end: var(--sp-1);
  border-block-end: 1px solid var(--line);
}

/* 结果里的 GeoHash 串是主角：比普通数值再大一点，并允许任意断行 */
.hash-value {
  font-size: var(--fs-body);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.neighbors {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-1);
}

.grid__cell {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-inline-size: 0;
  padding: var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--bg);
}

.grid__cell--current {
  background: var(--bg-sub);
  border-color: var(--acc);
}

.grid__dir {
  font-size: var(--fs-ad);
  line-height: var(--lh-label);
  color: var(--ink-2);
}

/* 邻居 hash 是按钮：去掉按钮外观，只保留可点击的等宽文本 */
.grid__hash {
  padding: 0;
  border: 0;
  background: none;
  color: var(--acc);
  font-family: var(--mono);
  font-size: var(--fs-num);
  font-variant-numeric: tabular-nums;
  text-align: start;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.grid__hash:hover {
  text-decoration: underline;
}

.grid__hash--static {
  color: var(--ink);
  cursor: default;
}

.hash-echo {
  margin: var(--sp-2) 0 0;
  padding: var(--sp-1) var(--sp-2);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-tag);
  font-family: var(--mono);
  font-size: var(--fs-num);
  overflow-wrap: anywhere;
}

.hash-echo mark {
  background: color-mix(in srgb, var(--err) 18%, transparent);
  color: var(--err);
  border-radius: 2px;
}

.tag {
  display: inline-block;
  margin-inline-start: var(--sp-1);
  padding: 0 var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  font-size: var(--fs-label);
  color: var(--ink-2);
  white-space: nowrap;
}

/* 精度表列多，窄屏横向滚动而不是压扁列宽 */
.precision-table__wrap {
  overflow-x: auto;
  margin-block-start: var(--sp-2);
}

.precision-table table {
  min-inline-size: 34rem;
}

.precision-table tr.is-current {
  background: var(--acc-soft);
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

/* 模式选择组：与 T01 的目标坐标系同一套写法 */
.modes {
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
  margin: 0;
  min-inline-size: 0;
}

.modes legend {
  font-size: var(--fs-label);
  color: var(--ink-2);
  padding-inline: var(--sp-1);
}

.check {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  /* 触控目标 ≥44px（FR-11） */
  min-block-size: var(--ctl-h-touch);
  font-size: var(--fs-body);
  color: var(--ink);
  cursor: pointer;
  margin: 0;
}

.check input {
  inline-size: 18px;
  block-size: 18px;
  min-block-size: 0;
  flex: 0 0 auto;
  accent-color: var(--acc);
}

@media (min-width: 480px) {
  .modes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-4);
    align-items: center;
  }

  .check {
    min-block-size: 0;
  }
}

@media (min-width: 768px) {
  .advanced > .field {
    display: inline-flex;
    flex-direction: column;
  }
}
</style>