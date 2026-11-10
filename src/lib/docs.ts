/**
 * 文档集合读取助手 —— **仅构建期可用**
 *
 * 依赖 `astro:content` 虚拟模块，因此：
 *   ✅ 可在 .astro 文件与 getStaticPaths 中使用
 *   ⛔ 不可在 Vue 组件中使用（客户端没有这个模块）
 *   ⛔ 不可在 vitest 中直接 import（tests/unit 只测 lib/coord、lib/geo 等纯函数）
 *
 * lib/ 下其余文件是零依赖纯函数，本文件是唯一的例外，单列于此。
 */
import { getCollection, getEntry, render } from 'astro:content'
import type { Lang } from '../config/i18n'
import type { DocCollection } from '../content.config'
import type { GuideGroup } from '../i18n/guideGroups'

/** 各集合共用同一份 frontmatter schema，因此 data 类型一致（guide 额外字段可选） */
export interface DocData {
  title: string
  description: string
  updated?: Date
  faq?: Array<{ q: string; a: string }>
  /** 科普文章专用字段（其它集合为 undefined） */
  heading?: string
  group?: GuideGroup
  order?: number
  readingMinutes?: number
}

/** render() 产出的 Astro 组件类型 */
type RenderedContent = Awaited<ReturnType<typeof render>>['Content']

/** 集合内文档 id 的构造规则：`{slug}/{lang}` */
function docId(slug: string, lang: Lang): string {
  return `${slug}/${lang}`
}

/**
 * 已存在的文档 id 集合，按集合名缓存。
 *
 * 用 getCollection 一次性建索引，而不是对每个 (slug, lang) 调 getEntry：
 *   - getEntry 对不存在的条目会打印 "Entry … was not found"，
 *     而 hasDoc 的本质就是探测不存在，13 工具 × 3 语言会刷出几十行噪声
 *   - 一次读全表比 39 次单条查询快
 *
 * 构建期每个集合只会读一次，缓存在模块作用域即可。
 */
const idCache = new Map<DocCollection, Set<string>>()

async function existingIds(collection: DocCollection): Promise<Set<string>> {
  let ids = idCache.get(collection)
  if (!ids) {
    const entries = await getCollection(collection)
    ids = new Set(entries.map((e) => e.id))
    idCache.set(collection, ids)
  }
  return ids
}

/**
 * 该 slug × lang 的文档是否存在（PRD FR-08 / 技术方案 5.3）
 *
 * getStaticPaths 用它过滤：**译文缺失即不生成页面**，
 * 物理上排除「界面已翻译、正文仍是英文」的半翻译页面。
 */
export async function hasDoc(collection: DocCollection, slug: string, lang: Lang): Promise<boolean> {
  return (await existingIds(collection)).has(docId(slug, lang))
}

/** 取文档条目（含 frontmatter），不存在返回 undefined */
export async function getDoc(
  collection: DocCollection,
  slug: string,
  lang: Lang
): Promise<{ id: string; data: DocData } | undefined> {
  if (!(await hasDoc(collection, slug, lang))) return undefined
  const entry = await getEntry(collection, docId(slug, lang))
  return entry as { id: string; data: DocData } | undefined
}

/**
 * 取文档并渲染为 Astro 组件。
 *
 * 返回 `{ Content, data }`；文档不存在时返回 undefined ——
 * 本项目**不做语言回退**，直接不生成页面（FR-08）。
 *
 * ⚠️ Astro 5 的 render() 返回 { Content, headings, remarkPluginFrontmatter }，
 * **不含 data**。frontmatter 要从 entry.data 取，别从 render 结果里拿。
 */
export async function renderDoc(
  collection: DocCollection,
  slug: string,
  lang: Lang
): Promise<{ Content: RenderedContent; data: DocData } | undefined> {
  // 先查索引再取条目：getEntry 对不存在的 id 会打印
  // "Entry … was not found"，而「文档可选」的调用方（分类页）
  // 每次构建都会命中十几次，日志会被噪声淹没。
  if (!(await hasDoc(collection, slug, lang))) return undefined
  const entry = await getEntry(collection, docId(slug, lang))
  if (!entry) return undefined
  const { Content } = await render(entry)
  return { Content, data: entry.data as DocData }
}
