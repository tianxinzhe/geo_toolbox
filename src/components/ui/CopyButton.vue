<script setup lang="ts">
/**
 * 复制按钮（FR-04 结果导出）
 *
 * 三级降级，因为「复制失败」是工具站最伤体验的故障：
 *   ① navigator.clipboard.writeText —— 现代浏览器，但**要求安全上下文**
 *      （https 或 localhost）。http 下这个对象直接不存在
 *   ② document.execCommand('copy') —— 已废弃但全线浏览器仍支持，
 *      是非安全上下文下的唯一选择
 *   ③ 都失败 → 如实告知「请手动选中复制」，不假装成功
 *
 * ⚠️ 绝不能在失败时显示「已复制」：用户会以为剪贴板里有内容，
 * 粘贴到别处才发现是空的，比直接报错更糟。
 *
 * 成功反馈用 --ok（绿色），SR-12 规定绿色**仅**用于「已复制」「转换成功」。
 */
import { onBeforeUnmount, ref } from 'vue'

interface Props {
  /** 要复制的文本。由父组件用 std() 生成，本组件不做任何格式化 */
  text: string
  /** 按钮文案 */
  label: string
  /** 成功后的文案 */
  successLabel: string
  /** 失败后的文案 */
  failLabel: string
  /** 视觉变体 */
  variant?: 'primary' | 'secondary' | 'ghost'
  /** 无内容可复制时禁用 */
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { variant: 'secondary', disabled: false })

const emit = defineEmits<{ copied: [ok: boolean] }>()

const state = ref<'idle' | 'ok' | 'fail'>('idle')
let timer: ReturnType<typeof setTimeout> | undefined

function flash(next: 'ok' | 'fail'): void {
  state.value = next
  emit('copied', next === 'ok')
  clearTimeout(timer)
  // 2 秒后回到常态。「已复制」是瞬时反馈，不该永久占据按钮
  timer = setTimeout(() => {
    state.value = 'idle'
  }, 2000)
}

onBeforeUnmount(() => clearTimeout(timer))

/** ② execCommand 降级路径：需要先把文本放进一个可选中的临时元素 */
function copyViaExecCommand(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  // 移出视口而不是 display:none —— 后者会让 select() 失效
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-1000px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  ta.setSelectionRange(0, ta.value.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
}

async function onClick(): Promise<void> {
  const text = props.text
  if (!text) {
    flash('fail')
    return
  }

  // ① 现代 API
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      flash('ok')
      return
    } catch {
      // 权限被拒或页面失焦，继续走降级
    }
  }

  // ② execCommand 降级
  if (copyViaExecCommand(text)) {
    flash('ok')
    return
  }

  // ③ 如实告知失败
  flash('fail')
}
</script>

<template>
  <button
    type="button"
    class="btn"
    :class="[`btn--${variant}`, { 'is-success': state === 'ok' }]"
    :disabled="disabled"
    :aria-label="label"
    @click="onClick"
  >
    <!-- 内联 SVG，不引图标库（SR-12 组件规范） -->
    <svg
      v-if="state === 'ok'"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <path d="m3 8.5 3.2 3.2L13 5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg
      v-else
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      aria-hidden="true"
    >
      <rect x="5.5" y="5.5" width="8" height="9" rx="1.5" />
      <path d="M11 3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v7A1.5 1.5 0 0 0 3.5 12" />
    </svg>

    <span>{{ state === 'ok' ? successLabel : state === 'fail' ? failLabel : label }}</span>
  </button>
</template>

<style scoped>
.btn svg {
  inline-size: 15px;
  block-size: 15px;
  flex: 0 0 auto;
}
</style>
