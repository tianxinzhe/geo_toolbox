/**
 * Astro Content Collections（技术方案 3 / 5.3）
 *
 * 目录约定：
 *   src/i18n/content/tools/{slug}/{lang}.md   → id = `{slug}/{lang}`
 *   src/i18n/content/legal/{slug}/{lang}.md   → id = `{slug}/{lang}`
 *
 * 这样组织的理由是「译文缺失即不生成页面」（PRD FR-08）：
 * `getStaticPaths` 会先用 hasDoc() 检查文件是否存在，
 * **不存在的语言 × 工具组合根本不会产出 HTML**，物理上排除半翻译页面。
 *
 * frontmatter 只放 SEO 元数据；界面上可见的文案在 src/i18n/ui/{lang}.ts。
 * 两者分工的原因是：SEO 文案由内容作者按语言逐页打磨，
 * UI 文案需要编译期完整性校验。
 */
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

import { GUIDE_GROUP_IDS } from './i18n/guideGroups'

/** 单篇文档的 frontmatter */
const docSchema = z.object({
  /** 完整 <title>，套用模板：{核心关键词} - {补充说明} | {站名} */
  title: z.string().min(10),
  /** meta description，建议 120~160 字符 */
  description: z.string().min(40),
  /** 最后更新日期，用于 JSON-LD 与页脚展示 */
  updated: z.coerce.date().optional(),
  /**
   * 常见问题问答对 → FAQPage JSON-LD（SR-12 硬规则 7）。
   *
   * 放在 frontmatter 而不是从正文的 <details> 里解析：
   * 结构化数据必须与正文语义一致且格式可靠，靠正则抓 Markdown 太脆弱。
   * 写文档时两处内容保持一致即可，check-i18n.ts 会校验条目非空。
   */
  faq: z.array(z.object({ q: z.string().min(1), a: z.string().min(1) })).optional()
})

/** 工具页文档（FR-03 文档区正文） */
const tools = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/i18n/content/tools' }),
  schema: docSchema
})

/** 合规页与科普文章（FR-10 / guide P1） */
const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/i18n/content/legal' }),
  schema: docSchema
})

/**
 * 分类级说明文档（FR-01：分类页「承载分类级科普正文与内链权重」）
 * 可选 —— 缺失时分类页只渲染工具聚合，不会构建失败。
 */
const categories = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/i18n/content/categories' }),
  schema: docSchema
})

/**
 * 科普文章（P1 `/guide/`）。
 *
 * 与工具文档共用 SEO frontmatter，额外要求：
 *   - heading：正文 H1（title 是完整 <title>，不适合直接当 H1）
 *   - group：列表页分组（见 src/i18n/guideGroups.ts），必填以免文章漏归类
 *   - order / readingMinutes：组内排序与阅读时长
 */
const guide = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/i18n/content/guide' }),
  schema: docSchema.extend({
    heading: z.string().min(4),
    group: z.enum(GUIDE_GROUP_IDS),
    order: z.number().int().nonnegative().default(0),
    readingMinutes: z.number().int().positive().default(6)
  })
})

export const collections = { tools, legal, categories, guide }

export type DocCollection = keyof typeof collections
