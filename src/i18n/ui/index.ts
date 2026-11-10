/**
 * 文案取值入口（技术方案 6.2）
 *
 * `Record<Lang, Record<UiKey, string>>` 是关键：任一语言缺任一键 →
 * **编译失败**，不是运行时才发现。这就是 PRD「禁止半翻译页面」的机制化落地。
 *
 * 用法分工：
 *   - `.astro` 文件与 `scripts/`：直接调 `t(lang, key, params)`，构建期求值，
 *     产出的 HTML 里已是最终文案，客户端不需要加载字典。
 *   - Vue 岛屿：**不要** import 整个字典（会把三语言文案都塞进客户端 bundle）。
 *     改为在 `.astro` 里用 `pick(lang, [...])` 取出该组件需要的少量键，
 *     以 props 形式传入。
 */

import { DEFAULT_LANG, type Lang } from '../../config/i18n'
import en, { type UiKey } from './en'
import ja from './ja'
import zh from './zh'

export type Key = UiKey
export type { UiKey }

/** 三语言字典。缺键即 TS 编译错误 */
const DICT: Record<Lang, Record<UiKey, string>> = { en, zh, ja }

/** 插值参数：`{name}` 形式的字面替换 */
export type Params = Record<string, string | number>

/**
 * 取文案。
 *
 * 回退顺序：目标语言 → DEFAULT_LANG。
 * 正常情况下回退不会触发（类型已保证键齐全），保留它是为了
 * 运行期动态拼键（如 `tool.${slug}.h1`）时不至于渲染出 undefined。
 */
export function t(lang: Lang, key: Key, p?: Params): string {
  let s: string = DICT[lang][key] ?? DICT[DEFAULT_LANG][key] ?? key
  if (p) {
    for (const k in p) {
      // 同一占位符可能出现多次，用 split/join 做全量替换而非 String.replace（只替换第一个）
      s = s.split(`{${k}}`).join(String(p[k]))
    }
  }
  return s
}

/**
 * 动态键取值：键名由变量拼出，无法在编译期校验。
 * 返回 `undefined` 表示该键不存在，调用方需自行兜底。
 * 典型场景：`toolKey(lang, slug, 'h1')`。
 */
export function tDynamic(lang: Lang, key: string, p?: Params): string | undefined {
  const dict = DICT[lang] as Record<string, string | undefined>
  let s = dict[key] ?? (DICT[DEFAULT_LANG] as Record<string, string | undefined>)[key]
  if (s === undefined) return undefined
  if (p) {
    for (const k in p) s = s.split(`{${k}}`).join(String(p[k]))
  }
  return s
}

/** 工具专属文案键：`tool.{slug}.{field}` */
export function toolKey(lang: Lang, slug: string, field: string, p?: Params): string | undefined {
  return tDynamic(lang, `tool.${slug}.${field}`, p)
}

/**
 * 取出一个键子集，用于以 props 形式交给 Vue 岛屿。
 * 这样客户端 bundle 里只包含该组件真正用到的文案。
 */
export function pick<K extends Key>(lang: Lang, keys: readonly K[], p?: Params): Record<K, string> {
  const out = {} as Record<K, string>
  for (const k of keys) out[k] = t(lang, k, p)
  return out
}

/** 某语言的全部文案（仅构建期/脚本使用，禁止传入 Vue props） */
export function all(lang: Lang): Readonly<Record<UiKey, string>> {
  return DICT[lang]
}

/** 全部键名，供 scripts/check-i18n.ts 校验其他语言的完整性 */
export const KEYS: readonly Key[] = Object.keys(en) as Key[]
