/**
 * URL 路径构造（PRD 4 信息架构）
 *
 * 三语言统一为 `/{lang}/…`，根路径 `/` 单独处理（技术方案 5.2）。
 * slug 三语言共用同一套英文标识，**不翻译** ——
 * 这样内链关系、结构化数据、分享链接解析逻辑只需维护一套。
 *
 * 全部路径以 `/` 结尾（与 astro.config.mjs 的 build.format: 'directory'
 * 以及 Cloudflare Pages 的默认行为一致）。
 */

import type { Lang } from '../config/i18n'
import type { CategoryKey } from '../i18n/tools'

/** 语言首页 `/{lang}/` */
export function homePath(lang: Lang): string {
  return `/${lang}/`
}

/** 工具页 `/{lang}/tools/{slug}/` */
export function toolPath(lang: Lang, slug: string): string {
  return `/${lang}/tools/${slug}/`
}

/** 分类页 `/{lang}/category/{cat}/` */
export function categoryPath(lang: Lang, cat: CategoryKey): string {
  return `/${lang}/category/${cat}/`
}

/** 科普文章列表页 `/{lang}/guide/`（P1） */
export function guideIndexPath(lang: Lang): string {
  return `/${lang}/guide/`
}

/** 科普文章页 `/{lang}/guide/{slug}/`（P1） */
export function guidePath(lang: Lang, slug: string): string {
  return `/${lang}/guide/${slug}/`
}

/** 合规页 `/{lang}/{about|privacy|contact|disclaimer}/`（FR-10） */
export type LegalSlug = 'about' | 'privacy' | 'contact' | 'disclaimer'

export function legalPath(lang: Lang, slug: LegalSlug): string {
  return `/${lang}/${slug}/`
}

/**
 * 把一个语言前缀路径换成另一种语言，其余部分保持不变。
 * 用于语言切换器（FR-08：切换到同一工具的另一语言版本）。
 *
 * `/zh/tools/geohash/?a=1` → en → `/en/tools/geohash/`
 * 查询参数由调用方决定是否透传（FR-08 要求保留当前输入值与全部选项）。
 */
export function swapLang(path: string, to: Lang): string {
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(path)
  if (!m) return `/${to}/`
  return `/${to}${m[2] ?? '/'}`
}

/** 拼接站点绝对 URL，用于 canonical / hreflang / og:url / JSON-LD */
export function absolute(siteUrl: string, path: string): string {
  const base = siteUrl.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}
