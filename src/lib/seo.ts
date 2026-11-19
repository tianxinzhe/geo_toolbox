/**
 * 结构化数据（JSON-LD）构造 —— SR-12 硬规则 7「结构化数据三件套」
 *
 *   SoftwareApplication（带 inLanguage）+ FAQPage + BreadcrumbList
 *
 * 纯函数，零依赖，构建期在 .astro 中调用后以
 * `<script type="application/ld+json">` 注入 <head>。
 *
 * 所有 URL 必须是**绝对地址**（Google 要求），由 absolute() 拼接。
 */

import type { Lang } from '../config/i18n'
import { LOCALE } from '../config/i18n'
import { site } from '../config/site'
import type { ToolMeta } from '../i18n/tools'
import { absolute } from './paths'

/** 面包屑的一级。最后一项不带 href（当前页） */
export interface Crumb {
  label: string
  /** 相对路径，如 /zh/tools/coord-convert/ */
  href?: string
}

/** BreadcrumbList */
export function breadcrumbJsonLd(crumbs: Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs
      // position 从 1 开始，且只对真实存在的层级编号
      .map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.label,
        ...(c.href ? { item: absolute(site.url, c.href) } : {})
      }))
  }
}

/**
 * SoftwareApplication —— 每个工具页一个
 *
 * `inLanguage` 必须准确：Google 用它判断页面语言与 hreflang 是否自洽。
 * applicationCategory 用工具分类，便于聚合理解站点主题。
 */
export function softwareApplicationJsonLd(
  tool: ToolMeta,
  lang: Lang,
  path: string,
  description: string
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.names[lang],
    description,
    url: absolute(site.url, path),
    inLanguage: LOCALE[lang],
    applicationCategory: 'UtilityApplication',
    applicationSubCategory: tool.category,
    operatingSystem: 'Any (web browser)',
    // 本站无账号、无上传、全本地计算 —— 免费是产品的事实属性，不是促销话术
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: tool.keywords.all.slice(0, 8)
  }
}

/** FAQPage —— 从文档区 <details> 中提取的问答对 */
export function faqJsonLd(items: Array<{ q: string; a: string }>): Record<string, unknown> | undefined {
  if (items.length === 0) return undefined
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a }
    }))
  }
}

/** Article —— 科普文章页（P1 /guide/） */
export function articleJsonLd(opts: {
  headline: string
  description: string
  lang: Lang
  path: string
  updated?: Date
}): Record<string, unknown> {
  const url = absolute(site.url, opts.path)
  const date = (opts.updated ?? new Date()).toISOString()
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.headline,
    description: opts.description,
    url,
    mainEntityOfPage: url,
    image: [absolute(site.url, '/og-default.png')],
    inLanguage: LOCALE[opts.lang],
    datePublished: date,
    dateModified: date,
    author: { '@type': 'Organization', name: site.name[opts.lang], url: absolute(site.url, '/') },
    publisher: {
      '@type': 'Organization',
      name: site.name[opts.lang],
      url: absolute(site.url, '/')
    }
  }
}

/** WebSite + SearchAction —— 只放在各语言首页，声明站内搜索入口 */
export function websiteJsonLd(lang: Lang, path: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name[lang],
    url: absolute(site.url, path),
    inLanguage: LOCALE[lang],
    description: site.tagline[lang],
    publisher: { '@type': 'Organization', name: site.name[lang], url: absolute(site.url, '/') }
  }
}
