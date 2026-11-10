/**
 * 语言开关 —— 全站唯一的语言配置点（技术方案 6.1）
 *
 * 新增语言 = 改 LANGS + 补 i18n/ui/{lang}.ts + 补 i18n/content/**\/{lang}.md + 改 LAUNCHED。
 * **零业务代码改动。**
 *
 * 分期上线时未启用的语言仍必须键齐全（可暂填英文占位），
 * 由 scripts/check-i18n.ts 校验 LAUNCHED 中的语言不得有占位值。
 */

/** 全部支持的语言。顺序即语言切换器的显示顺序 */
export const LANGS = ['zh', 'en', 'ja'] as const

export type Lang = (typeof LANGS)[number]

/** 默认语言，用于文案回退与 Astro 的 defaultLocale（OQ-08 决定后改这一行） */
export const DEFAULT_LANG: Lang = 'en'

/** 已上线语言。**第 2 批改这一行即可上线日语版**（OQ-09） */
export const LAUNCHED: readonly Lang[] = ['zh', 'en']

/**
 * 投放广告的语言（FR-09）
 * zh 简体中文**不加载**任何广告脚本，且**不预留广告位高度** ——
 * 因为 `ADS_ENABLED.includes(lang)` 在构建期求值，zh 页面的 HTML 里
 * 完全不含 `<ins>` 标签，也不含 adsbygoogle.js。
 */
export const ADS_ENABLED: readonly Lang[] = ['en', 'ja']

/** 需要 Cookie 同意横幅的语言（FR-10）：仅在会加载广告脚本的版本显示 */
export const CONSENT_REQUIRED: readonly Lang[] = ADS_ENABLED

/** BCP 47 完整标签，用于 <html lang> 与 Intl 构造 */
export const LOCALE: Record<Lang, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP'
}

/** 语言切换器显示各语言的自称，不翻译成当前界面语言 */
export const LABEL: Record<Lang, string> = {
  zh: '简体中文',
  en: 'English',
  ja: '日本語'
}

/**
 * 「试试这个例子」的示例地点（SR-06 / SR-11）
 * 用该地区用户熟悉的地点，让新手一眼确认工具工作正常。
 * 格式 [经度, 纬度]。
 */
export const EXAMPLE_POINT: Record<Lang, [number, number]> = {
  zh: [116.3974, 39.9088], // 北京
  en: [-0.1276, 51.5072], // 伦敦
  ja: [139.7671, 35.6812] // 东京
}

/**
 * 默认地图视野（SR-11「默认地图视野」）
 * zh / ja 默认定位到东亚区域，en 显示世界全图。
 * 均允许用户任意平移，且记住上次视野。
 */
export const DEFAULT_VIEW: Record<Lang, { center: [number, number]; zoom: number }> = {
  zh: { center: [104.0, 35.5], zoom: 4 }, // 中国全境
  en: { center: [20.0, 20.0], zoom: 2 }, // 世界全图
  ja: { center: [138.5, 36.5], zoom: 5 } // 日本全境
}

/** 一周起始日（SR-11）：en 周日起始，zh / ja 周一起始 */
export const WEEK_STARTS_ON: Record<Lang, 0 | 1> = {
  zh: 1,
  en: 0,
  ja: 1
}

/**
 * 英文数字与单位之间是否留一个不换行空格（SR-11）
 * en：`1 234.56 km`  /  zh、ja：`1234.56km`
 */
export const SPACE_BEFORE_UNIT: Record<Lang, boolean> = {
  zh: false,
  en: true,
  ja: false
}

/** 类型守卫：任意字符串是否为受支持的语言 */
export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v)
}

/** 类型守卫：是否为已上线语言（用于路由生成） */
export function isLaunched(v: unknown): v is Lang {
  return isLang(v) && LAUNCHED.includes(v)
}

/*
 * 语言检测逻辑没有抽成共享函数，原因是它唯一的调用点是
 * `src/pages/index.astro` 里的 `is:inline` 同步脚本 —— 内联脚本在 <head>
 * 最前原样输出，不能被打包进模块图，因此无法 import 本文件。
 *
 * 那里能拿到的只有两个构建期注入的常量：LAUNCHED 与 DEFAULT_LANG。
 * 匹配策略（localStorage > navigator.languages 的主语言子标签 > DEFAULT_LANG）
 * 属于 FR-08 的产品规则，改规则时两处都要改，已在该脚本顶部注明。
 */
