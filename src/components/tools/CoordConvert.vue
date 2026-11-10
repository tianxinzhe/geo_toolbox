<script setup lang="ts">
/**
 * T01 坐标系转换（PRD 6.1 规格表）
 *
 * 处理规则：
 *   - 本期只支持 WGS84 与 CGCS2000 两个坐标系
 *   - 二者在实用精度内等价，转换只做数值校验与回显，不产生人为偏移
 *   - 目标坐标系**可多选，一次输出全部**
 *   - CGCS2000 按与 WGS84 等值处理，界面明确标注
 *
 * 专属异常：
 *   - 坐标超范围 → 明确指出超限的具体数值与合法范围
 *   - 源与目标相同 → 直接回显原值并提示，**不报错**
 *
 * SR-06：错误就地显示在结果区，不清空用户已输入内容，不弹窗打断。
 * SR-12：计算防抖 300ms，避免每次击键都重渲染结果（INP < 200ms）。
 * FR-05：点「分享」才生成链接，**不在每次输入时改写 URL**（避免污染浏览历史）。
 */
import { computed, onMounted, ref, watch } from 'vue'

import type { Lang } from '../../config/i18n'
import { EXAMPLE_POINT } from '../../config/i18n'
import type { ToolUi } from '../../i18n/uiKeys'
import { convertCoord, T01_CRS_LIST, type T01Crs } from '../../lib/coord/convert'
import { fmt, std, stdFixed, DEFAULT_COORD_DIGITS } from '../../lib/coord/format'
import { parseCoord, DEFAULT_CTX } from '../../lib/coord/parse'
import { buildShareUrl, readShareState, T01_PARAMS, type ShareState } from '../../lib/share'
import CoordMapPreview from '../map/CoordMapPreview.vue'
import CopyButton from '../ui/CopyButton.vue'

interface Props {
  lang: Lang
  /** 构建期由 ToolPage 用 pick(lang, keys) 取出的文案子集 */
  ui: ToolUi & Record<string, string>
  /**
   * 工具编号（'T01'）。
   *
   * ⚠️ 刻意**不**把整个 ToolMeta 当 prop 传进来：Astro 会把 props 序列化进
   * `astro-island` 属性，而 ToolMeta 含三语言的 names / desc / keywords，
   * 一个工具页会白白多出几 KB 的 HTML，且把用户当前语言之外的文案也发下去。
   * 岛屿需要什么就传什么，其余留在构建期。
   */
  toolId: string
}

const props = defineProps<Props>()

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

const CRS_LABELS: Record<T01Crs, string> = {
  WGS84: 'WGS84',
  CGCS2000: 'CGCS2000'
}

type CommaAs = 'auto' | 'decimal' | 'separator'

/** 经纬度合并成一个输入框，方便直接粘贴 `116.3974, 39.9088`（全站统一） */
const coordInput = ref('')
const from = ref<T01Crs>('WGS84')
/** 目标可多选，默认 CGCS2000（等值标注） */
const targets = ref<T01Crs[]>(['CGCS2000'])
const precision = ref(DEFAULT_COORD_DIGITS)
/** SR-01 规则 ⑤：逗号含义手动覆盖，记忆在 localStorage */
const commaAs = ref<CommaAs>('auto')

const shareNote = ref('')

const STORAGE_KEY = 'geo.t01.prefs'

/**
 * 防抖后的输入快照。结果区只读这份快照，**不**直接读输入 ref，
 * 否则 computed 会立即依赖输入框，300ms 防抖形同虚设（每次击键都重渲染）。
 * 快照只在定时器触发时整体替换，一次停顿只产生一次结果渲染。
 */
interface Settled {
  coord: string
  from: T01Crs
  targets: T01Crs[]
  p: number
  comma: CommaAs
}

const settled = ref<Settled>({
  coord: '',
  from: 'WGS84',
  targets: ['CGCS2000'],
  p: DEFAULT_COORD_DIGITS,
  comma: 'auto'
})

/**
 * 把当前输入一次性拷进快照。
 * 程序化写入输入（示例、交换、清空、URL 恢复、GPS）后必须立即调用，
 * 否则结果会滞后 300ms 或显示旧值。
 */
function settleNow(): void {
  settled.value = {
    coord: coordInput.value,
    from: from.value,
    // 数组必须拷贝：toggleTarget 会原地 splice / push
    targets: [...targets.value],
    p: precision.value,
    comma: commaAs.value
  }
}

/* ------------------------------------------------------------------ *
 * 计算
 * ------------------------------------------------------------------ */

/** 输入是否为空。空 → 显示空状态引导，而不是报错（SR-06） */
const isEmpty = computed(() => coordInput.value.trim() === '')

/**
 * 解析合并后的经纬度输入。
 *
 * 经度在前、纬度在后，与「经度, 纬度」标签一致；同时接受带半球符号的写法
 * （`N39.9088 E116.3974`）与度分秒，都交给 lib/coord/parse 统一处理。
 * 单一输入框也意味着用户可以直接把数据源里的一整串坐标粘进来。
 *
 * 参数化而不是直接读输入 ref：结果区要吃 settled 快照，
 * aria-invalid 与分享链接要吃当前输入，同一套解析必须能被两处复用。
 */
function parseInput(raw: string, comma: CommaAs) {
  if (raw.trim() === '') return null
  return parseCoord(raw, { ...DEFAULT_CTX, commaAs: comma })
}

/** 结果区用的解析：只读快照，输入停顿 300ms 后才重算 */
const parsed = computed(() => parseInput(settled.value.coord, settled.value.comma))

/**
 * 即时解析：只服务于 aria-invalid 与分享链接，不参与结果渲染。
 * 无障碍状态必须即时反映输入合法性，等 300ms 才更新会让读屏用户以为已经输对了。
 */
const liveParsed = computed(() => parseInput(coordInput.value, commaAs.value))

/** 转换结果。每个选中的目标坐标系一条 */
const results = computed(() => {
  const p = parsed.value
  if (!p || !p.ok) return []
  return settled.value.targets.map((to) => convertCoord(p.lng, p.lat, settled.value.from, to))
})

/** 成功结果（过滤掉校验失败的） */
const okResults = computed(() => results.value.filter((r) => r.ok))

/** 第一条错误，用于就地展示（SR-06：不清空输入、不弹窗） */
const firstError = computed(() => {
  const p = parsed.value
  if (p && !p.ok) return p
  for (const r of results.value) if (!r.ok) return r
  return null
})

/** 输入解析层的错误（范围 / 不可解析），与转换层的错误分开处理 */
const inputError = computed(() => (liveParsed.value && !liveParsed.value.ok ? liveParsed.value : null))

/* ------------------------------------------------------------------ *
 * 显示
 * ------------------------------------------------------------------ */

function coord(v: number): string {
  // 结果区只用快照精度：直接读 precision 会让渲染在选精度时立即重算，绕过防抖
  return fmt(v, props.lang, 'coord', settled.value.p)
}

/** 一行结果的可复制文本：`lng, lat`，标准格式（SR-11 规则 ⑥） */
function copyText(lng: number, lat: number): string {
  return `${stdFixed(lng, settled.value.p)}, ${stdFixed(lat, settled.value.p)}`
}

/** 全部结果的可复制文本，每行一个目标坐标系 */
const copyAllText = computed(() =>
  okResults.value
    .map((r) => {
      if (!r.ok) return ''
      return `${CRS_LABELS[r.to]}\t${stdFixed(r.output[0], settled.value.p)}\t${stdFixed(r.output[1], settled.value.p)}`
    })
    .filter(Boolean)
    .join('\n')
)

/** 精度选项 0~12（SR-02） */
const PRECISION_OPTIONS = Array.from({ length: 13 }, (_, i) => i)

/* ------------------------------------------------------------------ *
 * 交互
 * ------------------------------------------------------------------ */

function toggleTarget(crs: T01Crs): void {
  const i = targets.value.indexOf(crs)
  if (i >= 0) {
    // 至少保留一个目标，否则结果区永远空白，用户不知道为什么
    if (targets.value.length > 1) targets.value.splice(i, 1)
  } else {
    targets.value.push(crs)
  }
  // 勾选是离散操作，不是连续打字：立即同步快照，别让用户等 300ms
  settleNow()
}

/** SR-06 空状态引导：点一下填入该地区用户熟悉的地点（SR-11） */
function fillExample(): void {
  const [lng, lat] = EXAMPLE_POINT[props.lang]
  coordInput.value = `${std(lng, 8)}, ${std(lat, 8)}`
  settleNow()
}

/** SR-01：轴序歧义时提供一键交换入口 */
function swapLngLat(): void {
  const p = liveParsed.value
  if (!p?.ok) return
  coordInput.value = `${std(p.lat, 8)}, ${std(p.lng, 8)}`
  settleNow()
}

/** 清空输入：立即同步快照，空状态与结果都不该滞后 300ms */
function clearAll(): void {
  coordInput.value = ''
  settleNow()
}

/** FR-05：点「分享」才生成链接，不改写浏览历史 */
async function onShare(): Promise<void> {
  const state: ShareState = {
    from: from.value,
    to: [...targets.value],
    p: precision.value,
    comma: commaAs.value
  }
  // 分享必须拿到输入框里的最新值，不能读 300ms 前的快照
  const p = liveParsed.value
  if (p?.ok) {
    state.lng = Number(std(p.lng, 8))
    state.lat = Number(std(p.lat, 8))
  }

  const link = await buildShareUrl(globalThis.location.pathname, state, T01_PARAMS)

  if (link.mode === 'tooLarge') {
    shareNote.value = props.ui['common.shareTooLarge']
    return
  }

  const abs = new URL(link.url, globalThis.location.origin).href
  try {
    await navigator.clipboard.writeText(abs)
    shareNote.value = props.ui['common.shared']
  } catch {
    // 剪贴板不可用时把链接显示出来，让用户手动复制，而不是静默失败
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
  // 偏好：语言、精度、逗号含义、折叠状态（PRD 8.1「工具偏好」）。
  // GPS 定位结果不写入本地存储 —— T01 没有定位入口，此约束天然满足。
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>
      if (typeof saved.p === 'number' && saved.p >= 0 && saved.p <= 12) precision.value = saved.p
      if (saved.comma === 'auto' || saved.comma === 'decimal' || saved.comma === 'separator') {
        commaAs.value = saved.comma
      }
      if (typeof saved.from === 'string' && (T01_CRS_LIST as readonly string[]).includes(saved.from)) {
        from.value = saved.from as T01Crs
      }
    }
  } catch {
    // 隐私模式下 localStorage 可能抛异常，忽略即可，不影响功能
  }

  // FR-05：打开带参链接时自动回填并立即计算，用户无需再点一次按钮
  const restored = await readShareState(
    { search: globalThis.location.search, hash: globalThis.location.hash },
    T01_PARAMS
  )
  if (restored.hadProblems) {
    // 解析失败 → 忽略参数、以默认状态加载，并提示（FR-05）
    shareNote.value = props.ui['common.shareReset']
  }
  const s = restored.state
  // 分享链接仍按 lng / lat 两个数值参数编码，这里重新拼成合并输入框的一串
  if (typeof s.lng === 'number' && typeof s.lat === 'number') {
    coordInput.value = `${std(s.lng, 8)}, ${std(s.lat, 8)}`
  }
  if (typeof s.from === 'string' && (T01_CRS_LIST as readonly string[]).includes(s.from)) {
    from.value = s.from as T01Crs
  }
  if (typeof s.p === 'number') precision.value = s.p
  if (typeof s.comma === 'string') commaAs.value = s.comma as typeof commaAs.value
  // `to` 是 strings 类型，decodeState 已经拆成数组并逐个校验过 oneOf
  if (Array.isArray(s.to) && s.to.length > 0) {
    targets.value = s.to.filter((v): v is T01Crs => (T01_CRS_LIST as readonly string[]).includes(v as string))
  }

  // 带参打开要求「回填并立即计算」：直接把快照对齐到当前输入，
  // 不额外等 300ms 防抖（用户此时并没有在连续打字）。
  // 无参数时这一步只是把恢复出的偏好（源坐标系 / 精度 / 逗号）同步进快照。
  settleNow()
})

// 偏好写入本地存储。防抖，避免每次击键都写
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch([precision, commaAs, from], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ p: precision.value, comma: commaAs.value, from: from.value })
      )
    } catch {
      /* 隐私模式下静默失败 */
    }
  }, 400)
})

/* ------------------------------------------------------------------ *
 * 防抖计算（SR-12：INP < 200ms）
 * ------------------------------------------------------------------ */

/**
 * 计算是同步且常数级的（只做范围校验与等值回显）。
 * 但**渲染**需要：每次击键都重渲染结果 + 格式化字符串，
 * 在低端手机上会掉帧。300ms 后把输入整体快照到 settled，
 * 连续输入只触发一次结果渲染。
 *
 * 注意：不能像早期实现那样在 computed 里「void tick.value」再直接读输入框 ——
 * computed 会同时依赖输入框本身，防抖等于没写。这里结果只读 settled。
 */
let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch([coordInput, from, targets, precision, commaAs], () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(settleNow, 300)
}, { deep: true })

/** 只依赖 settled 的视图 —— 输入停顿后才更新 */
const shown = computed(() => ({
  results: okResults.value,
  error: firstError.value,
  parsed: parsed.value
}))

/* ------------------------------------------------------------------ *
 * FR-06 地图预览：WGS84 真位置 + 目标坐标系结果
 * ------------------------------------------------------------------ */

const MAP_COLORS: Record<T01Crs, string> = {
  WGS84: '#1f6feb',
  CGCS2000: '#059669'
}

const mapPoints = computed(() => {
  const p = shown.value.parsed
  if (!p?.ok) return []
  const out: { lat: number; lng: number; label: string; color: string }[] = []
  const seen = new Set<string>()
  const push = (lng: number, lat: number, label: string, color: string): void => {
    const key = `${lng.toFixed(6)},${lat.toFixed(6)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ lat, lng, label, color })
  }

  const wgs = convertCoord(p.lng, p.lat, settled.value.from, 'WGS84')
  if (wgs.ok) push(wgs.output[0], wgs.output[1], 'WGS84', MAP_COLORS.WGS84)
  for (const r of shown.value.results) {
    push(r.output[0], r.output[1], CRS_LABELS[r.to], MAP_COLORS[r.to])
  }
  return out
})

/** WGS84 与 CGCS2000 等值，不存在需要连线的偏移，因此不画线 */
const mapLines: { coords: [number, number][]; label: string; color: string }[] = []

function onMapPick(lat: number, lng: number): void {
  coordInput.value = `${std(lng, 8)}, ${std(lat, 8)}`
  settleNow()
}
</script>

<template>
  <!-- 用 form 语义，不是 div（SR-12 骨架硬要求） -->
  <form class="t01" @submit.prevent>
    <div class="field">
      <label for="t01-coord">{{ ui['coord.lngLat'] }}</label>
      <!-- ⚠️ type="text" + inputmode="decimal"，禁止 type="number"（FR-11 必踩坑）：
           number 会截断前导零、拒绝 ° ' " 符号、并显示占空间的上下箭头 -->
      <input
        id="t01-coord"
        v-model="coordInput"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        spellcheck="false"
        :placeholder="ui['coord.pairPlaceholder']"
        :aria-invalid="inputError ? 'true' : undefined"
      />
      <span class="field__hint">116.3974, 39.9088 / 116°23'50.64"E, 39°54'31.68"N</span>
    </div>

    <!-- SR-01 轴序歧义时的一键交换入口 -->
    <div v-if="shown.parsed?.ok && shown.parsed.confidence === 'mid'" class="btn-row">
      <button type="button" class="btn btn--ghost" @click="swapLngLat">{{ ui['common.swap'] }}</button>
      <span class="hint">{{ ui['coord.lngLat'] }}</span>
    </div>

    <div class="row">
      <div class="field">
        <label for="t01-from">{{ ui['coord.source'] }}</label>
        <select id="t01-from" v-model="from">
          <option v-for="c in T01_CRS_LIST" :key="c" :value="c">{{ CRS_LABELS[c] }}</option>
        </select>
      </div>

      <fieldset class="field targets">
        <legend>{{ ui['tool.coord-convert.allTargets'] }}</legend>
        <label v-for="c in T01_CRS_LIST" :key="c" class="check" :for="`t01-to-${c}`">
          <!-- 显式 id：label 包裹虽然已经建立了关联，但没有 id 时
               自动化测试与部分读屏只能靠 label 文本定位，脆弱且不利于回归 -->
          <input
            :id="`t01-to-${c}`"
            type="checkbox"
            :checked="targets.includes(c)"
            :disabled="c === from && targets.length === 1"
            @change="toggleTarget(c)"
          />
          <span>{{ CRS_LABELS[c] }}</span>
        </label>
      </fieldset>
    </div>

    <!-- 高级选项：优先用原生 <details>（爬虫可读、无需 JS） -->
    <details class="advanced">
      <summary>{{ ui['common.advanced'] }}</summary>

      <div class="field">
        <label for="t01-p">{{ ui['coord.precision'] }}</label>
        <select id="t01-p" v-model.number="precision">
          <option v-for="d in PRECISION_OPTIONS" :key="d" :value="d">{{ d }}</option>
        </select>
        <span class="field__hint">0 ~ 12</span>
      </div>

      <div class="field">
        <label for="t01-comma">{{ ui['coord.commaMeaning'] }}</label>
        <select id="t01-comma" v-model="commaAs">
          <option value="auto">{{ ui['coord.comma.auto'] }}</option>
          <option value="separator">{{ ui['coord.comma.separator'] }}</option>
          <option value="decimal">{{ ui['coord.comma.decimal'] }}</option>
        </select>
        <span class="field__hint">{{ ui['coord.comma.hint'] }}</span>
      </div>
    </details>

    <!-- 结果区：用 <output> + aria-live="polite"（SR-12 骨架 / 硬规则 10） -->
    <output id="t01-result" class="result-stack" aria-live="polite">
      <!-- 空状态即引导（SR-06）：不显示空白，而给一个可点击的示例。
           用即时状态判断，清空输入后引导立即回来，不跟着 300ms 防抖迟到 -->
      <div v-if="isEmpty" class="empty-state">
        <p>{{ ui['err.empty.title'] }}</p>
        <p>{{ ui['err.empty.hint'] }}</p>
        <button type="button" class="btn btn--secondary" @click="fillExample">
          {{ ui['common.tryExample'] }}
        </button>
      </div>

      <!-- 错误就地显示（SR-06 三段式：原因 / 正确写法 / 示例），不清空输入、不弹窗 -->
      <div v-else-if="shown.error" class="error-box">
        <p class="error-box__title">
          <template v-if="shown.error.kind === 'range'">
            {{ shown.error.field === 'lat' ? ui['err.lat.range'] : ui['err.lng.range'] }}
            <span class="num">{{ shown.error.value }}</span>
          </template>
          <template v-else-if="shown.error.kind === 'geohash'">
            {{ ui['err.parse.title'] }}
          </template>
          <template v-else>
            {{ ui['err.parse.title'] }}
          </template>
        </p>
        <p class="error-box__hint">
          <template v-if="shown.error.kind === 'range'">
            {{ shown.error.field === 'lat' ? ui['err.lat.range.hint'] : ui['err.lng.range.hint'] }}
          </template>
          <template v-else>{{ shown.error.hint }}</template>
        </p>
        <p class="error-box__example">116.3974, 39.9088</p>
      </div>

      <!-- 正常结果 -->
      <template v-else>
        <!-- SR-01 规则 ④：强制回显解析结论，使任何误判对用户可见 -->
        <p v-if="shown.parsed?.ok" class="echo">
          <span class="echo__label">{{ ui['coord.lngLat'] }}</span>
          <span class="num">{{ coord(shown.parsed.lng) }}, {{ coord(shown.parsed.lat) }}</span>
        </p>

        <div v-for="r in shown.results" :key="r.to" class="result">
          <div class="result__row">
            <span class="result__label">{{ CRS_LABELS[r.to] }}</span>
            <span class="result__value">{{ coord(r.output[0]) }}, {{ coord(r.output[1]) }}</span>
            <span class="result__extra">
              <CopyButton
                :text="copyText(r.output[0], r.output[1])"
                :label="ui['common.copy']"
                :success-label="ui['common.copied']"
                :fail-label="ui['common.copyFailed']"
                variant="ghost"
              />
            </span>
          </div>

          <!-- 源与目标相同：回显原值并提示，**不报错**（PRD T01 专属异常） -->
          <p v-if="r.identity" class="note">{{ ui['tool.coord-convert.identity'] }}</p>

          <!-- CGCS2000 等值假定必须显式标注（SR-03） -->
          <p v-if="r.cgcs2000Assumed" class="note">{{ ui['tool.coord-convert.cgcs2000'] }}</p>
        </div>

        <div class="btn-row">
          <CopyButton
            :text="copyAllText"
            :label="ui['common.copy']"
            :success-label="ui['common.copied']"
            :fail-label="ui['common.copyFailed']"
            variant="secondary"
            :disabled="copyAllText === ''"
          />
          <button type="button" class="btn btn--primary" @click="onShare">
            {{ ui['common.share'] }}
          </button>
          <button
            type="button"
            class="btn btn--ghost"
            @click="clearAll"
          >
            {{ ui['common.clear'] }}
          </button>
        </div>

        <!-- FR-05：分享按钮旁常驻提示 -->
        <p class="hint">{{ ui['common.shareWarning'] }}</p>
        <p v-if="shareNote" class="note note--dim share-note">{{ shareNote }}</p>
      </template>
    </output>

    <!-- FR-06：默认折叠；打开后才懒加载地图，不增加首屏体积 -->
    <CoordMapPreview
      v-if="mapPoints.length"
      :title="ui['common.mapPreview']"
      :hint="ui['common.mapPreviewHint']"
      :points="mapPoints"
      :lines="mapLines"
      allow-pick
      :pick-label="ui['common.pickFromMap']"
      :picking-label="ui['common.pickingMap']"
      :drag-prompt="ui['common.mapDragPrompt']"
      :loading-text="ui['common.mapLoading']"
      :tile-error-text="ui['common.mapTileError']"
      :basemap-label="ui['common.basemap']"
      :basemap-street="ui['common.basemapStreet']"
      :basemap-satellite="ui['common.basemapSatellite']"
      :basemap-terrain="ui['common.basemapTerrain']"
      @pick="onMapPick"
    />

    <!-- SR-03：精度声明常驻，不藏在文档里 -->
    <p class="hint precision-note">{{ ui['tool.coord-convert.precisionNote'] }}</p>
  </form>
</template>

<style scoped>
.t01 {
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

.result {
  display: flex;
  flex-direction: column;
}

.note {
  font-size: var(--fs-label);
  line-height: var(--lh-label);
  color: var(--ink-2);
  margin: 0;
  padding: var(--sp-2) var(--sp-3) 0;
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

.targets {
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
  margin: 0;
  min-inline-size: 0;
}

.targets legend {
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
}

.check input {
  inline-size: 18px;
  block-size: 18px;
  min-block-size: 0;
  flex: 0 0 auto;
  accent-color: var(--acc);
}

@media (min-width: 480px) {
  .targets {
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
