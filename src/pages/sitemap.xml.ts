/**
 * sitemap.xml —— 按 LAUNCHED 生成，分语言分组（技术方案 3 章）
 *
 * 用 <xhtml:link rel="alternate" hreflang> 把同一页面的各语言版本绑成一组，
 * 这是 Google 识别多语言关系的官方方式，与 <head> 里的 hreflang 互为印证。
 *
 * 只收录**真实生成**的页面：工具页经 hasDoc() 过滤，
 * 因此不会出现死链（check-hreflang.ts 会在 postbuild 再校验一遍）。
 *
 * 不用 @astrojs/sitemap 集成的原因：它按 dist 目录扫描，
 * 无法把「同一工具的三语言版本」聚成 alternate 组，
 * 而这正是多语言站最需要的一条。自己生成约 60 行，可控性更高。
 */
import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { LAUNCHED } from '../config/i18n'
import { site } from '../config/site'
import { CATEGORIES, getToolsByCategory, TOOLS } from '../i18n/tools'
import type { LegalSlug } from '../lib/paths'
import { absolute, categoryPath, guideIndexPath, guidePath, homePath, legalPath, toolPath } from '../lib/paths'
import { hasDoc } from '../lib/docs'

const LEGAL_SLUGS: LegalSlug[] = ['about', 'privacy', 'contact', 'disclaimer']

interface PageGroup {
  /** 各语言下的路径；只包含真实存在的语言版本 */
  byLang: Partial<Record<(typeof LAUNCHED)[number], string>>
  /** 更新频率 */
  changefreq: 'weekly' | 'monthly' | 'yearly'
  priority: string
}

export const GET: APIRoute = async () => {
  const groups: PageGroup[] = []

  // 根路径：hreflang 中枢，x-default 指向它自己，不参与语言分组
  // ① 首页（每语言一个）
  for (const lang of LAUNCHED) {
    groups.push({ byLang: { [lang]: homePath(lang) }, changefreq: 'weekly', priority: '1.0' })
  }

  // ② 工具页：同一 slug 的各语言版本绑成一组
  for (const tool of TOOLS) {
    const byLang: PageGroup['byLang'] = {}
    for (const lang of LAUNCHED) {
      if (await hasDoc('tools', tool.slug, lang)) byLang[lang] = toolPath(lang, tool.slug)
    }
    if (Object.keys(byLang).length > 0) {
      groups.push({ byLang, changefreq: 'monthly', priority: '0.9' })
    }
  }

  // ③ 分类页
  for (const cat of CATEGORIES) {
    if (getToolsByCategory(cat).length === 0) continue
    const byLang: PageGroup['byLang'] = {}
    for (const lang of LAUNCHED) byLang[lang] = categoryPath(lang, cat)
    groups.push({ byLang, changefreq: 'monthly', priority: '0.7' })
  }

  // ④ 科普文章：索引页与文章页分别按真实语言版本分组
  const guideEntries = await getCollection('guide')
  const guideIndexByLang: PageGroup['byLang'] = {}
  for (const lang of LAUNCHED) {
    if (guideEntries.some((entry) => entry.id.endsWith(`/${lang}`))) {
      guideIndexByLang[lang] = guideIndexPath(lang)
    }
  }
  if (Object.keys(guideIndexByLang).length > 0) {
    groups.push({ byLang: guideIndexByLang, changefreq: 'monthly', priority: '0.7' })
  }

  const guideSlugs = [...new Set(guideEntries.map((entry) => entry.id.slice(0, -3)))]
  for (const slug of guideSlugs) {
    const byLang: PageGroup['byLang'] = {}
    for (const lang of LAUNCHED) {
      if (guideEntries.some((entry) => entry.id === `${slug}/${lang}`)) {
        byLang[lang] = guidePath(lang, slug)
      }
    }
    if (Object.keys(byLang).length > 0) {
      groups.push({ byLang, changefreq: 'monthly', priority: '0.6' })
    }
  }

  // ⑤ 合规页：只有正文存在的语言才收录
  for (const slug of LEGAL_SLUGS) {
    const byLang: PageGroup['byLang'] = {}
    for (const lang of LAUNCHED) {
      if (await hasDoc('legal', slug, lang)) byLang[lang] = legalPath(lang, slug)
    }
    if (Object.keys(byLang).length > 0) {
      groups.push({ byLang, changefreq: 'yearly', priority: '0.3' })
    }
  }

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const urls = groups
    .flatMap((g) => {
      const entries = Object.entries(g.byLang) as Array<[string, string]>
      // 组内语言多于一个时才输出 x-default，指向根路径（语言检测中枢）
      const links = entries.map(
        ([l, p]) =>
          `    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(absolute(site.url, p))}" />`
      )
      if (entries.length > 1) {
        links.push(
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(absolute(site.url, '/'))}" />`
        )
      }
      return entries.map(([, p]) =>
        [
          '  <url>',
          `    <loc>${esc(absolute(site.url, p))}</loc>`,
          ...links,
          `    <changefreq>${g.changefreq}</changefreq>`,
          `    <priority>${g.priority}</priority>`,
          '  </url>'
        ].join('\n')
      )
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Cloudflare Pages 会按静态资源缓存
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
