/**
 * i18n 完整性门禁（技术方案 6.6 / PRD FR-08）
 *
 * 在 prebuild 阶段运行，**任一检查失败即构建失败** ——
 * 把 PRD 的软约束变成硬门禁。
 *
 * 检查项：
 *   ① UI 字典键完整性：LAUNCHED 语言不得缺键、不得留占位、不得直接复制英文
 *   ② 工具元数据完整性：names / desc 齐全，related 数量与自引用合规
 *   ③ **禁止半翻译页面**：某工具若在任一 LAUNCHED 语言下有文档，
 *      则在全部 LAUNCHED 语言下都必须有（否则 getStaticPaths 会产出
 *      「界面已翻译、正文是另一种语言」的页面）
 *   ④ 合规页齐备：4 个合规页 × LAUNCHED 语言必须全部存在（FR-10，AdSense 审核前提）
 *   ⑤ frontmatter 完整：title / description 非空
 *
 * 运行：pnpm run check:i18n（经 tsx，因为源码用的是无扩展名 import）
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { LAUNCHED, LABEL, type Lang } from '../src/config/i18n'
import en, { type UiKey } from '../src/i18n/ui/en'
import { CATEGORIES, CATEGORY_META, TOOLS } from '../src/i18n/tools'

const ROOT = process.cwd()
const CONTENT = join(ROOT, 'src', 'i18n', 'content')

/** 占位值特征：明显是还没写的东西 */
const PLACEHOLDER = /^(TODO|TBD|FIXME|__|lorem)/i

let failures = 0
let warnings = 0

function fail(scope: string, msg: string): void {
  failures++
  console.error(`  ✗ [${scope}] ${msg}`)
}

function warn(scope: string, msg: string): void {
  warnings++
  console.warn(`  ! [${scope}] ${msg}`)
}

function section(title: string): void {
  console.log(`\n${title}`)
}

/**
 * 视觉宽度：CJK 全角字符记 1，其余记 0.5。
 *
 * SR-11 指出「中/日字符数更少但字宽更大，整行视觉宽度接近」——
 * 所以文案长度的验收标准必须是视觉宽度，不是 `.length`。
 * 用 .length 判会把 `WGS84 / GCJ-02 / BD-09 互转` 这类正常文案误报为超长。
 */
function visualWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    // CJK 统一表意文字、假名、谚文、全角标点与全角形
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x20000 && cp <= 0x3fffd)
    w += wide ? 1 : 0.5
  }
  return w
}

/* ------------------------------------------------------------------ *
 * ① UI 字典键完整性
 * ------------------------------------------------------------------ */
async function checkUiDicts(): Promise<void> {
  section('① UI 字典键完整性')

  const KEYS = Object.keys(en) as UiKey[]
  console.log(`  基准语言 en：${KEYS.length} 个键`)

  for (const lang of LAUNCHED) {
    const dict = (await import(`../src/i18n/ui/${lang}.ts`)).default as Record<string, string>

    const missing = KEYS.filter((k) => !(k in dict) || dict[k] === undefined || dict[k] === '')
    const placeholder = KEYS.filter((k) => dict[k] && PLACEHOLDER.test(dict[k]))

    // 抓「直接复制英文当译文」—— 批量机翻最常见的漏网形态。
    // 只对含 4 个以上连续拉丁字母的值做判断，避免把 GCJ-02、GeoJSON
    // 这类本就是英文的专有名词误判为未翻译。
    const looksLatin = (s: string) => /[a-z]{4}/i.test(s)
    const copiedFromEn =
      lang === 'en'
        ? []
        : KEYS.filter((k) => dict[k] && dict[k] === en[k] && looksLatin(en[k]))

    if (missing.length) fail(lang, `缺 ${missing.length} 个键：${missing.slice(0, 8).join(', ')}`)
    if (placeholder.length) fail(lang, `占位未替换 ${placeholder.length} 个：${placeholder.slice(0, 8).join(', ')}`)
    if (copiedFromEn.length) {
      fail(lang, `疑似未翻译（与英文完全相同）${copiedFromEn.length} 个：${copiedFromEn.slice(0, 8).join(', ')}`)
    }

    // 反向检查：字典里出现了 en 中不存在的键 → 拼写错误或废弃键
    const extra = Object.keys(dict).filter((k) => !(KEYS as string[]).includes(k))
    if (extra.length) fail(lang, `多出 ${extra.length} 个 en 中不存在的键：${extra.slice(0, 8).join(', ')}`)

    if (!missing.length && !placeholder.length && !copiedFromEn.length && !extra.length) {
      console.log(`  ✓ ${lang}（${LABEL[lang]}）键完整`)
    }
  }
}

/* ------------------------------------------------------------------ *
 * ② 工具元数据完整性
 * ------------------------------------------------------------------ */
function checkToolMeta(): void {
  section('② 工具元数据完整性')

  const slugs = new Set(TOOLS.map((t) => t.slug))
  if (slugs.size !== TOOLS.length) fail('tools', 'slug 存在重复')

  for (const tool of TOOLS) {
    const id = tool.id

    // slug 规范：全小写、连字符分隔（SR-12 硬规则 8）
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tool.slug)) {
      fail(id, `slug "${tool.slug}" 不符合「全小写 + 连字符」规范`)
    }

    if (!CATEGORIES.includes(tool.category)) fail(id, `未知分类 "${tool.category}"`)

    // LAUNCHED 语言的名称与说明必须齐全且非占位
    for (const lang of LAUNCHED) {
      const name = tool.names[lang]
      const desc = tool.desc[lang]
      if (!name || PLACEHOLDER.test(name)) fail(id, `${lang} 名称缺失或为占位`)
      if (!desc || PLACEHOLDER.test(desc)) fail(id, `${lang} 说明缺失或为占位`)
      // FR-01：卡片说明 ≤24 字。
      // 「字」指视觉宽度而不是字符数 —— CJK 全角占 1，拉丁/数字半角占 0.5。
      // `WGS84 / GCJ-02 / BD-09 互转` 有 26 个字符但视觉宽度只有约 17，
      // 按字符数判会把这类正常文案误报为超长。
      if (desc && visualWidth(desc) > 24) {
        warn(id, `${lang} 说明视觉宽度 ${visualWidth(desc).toFixed(1)}，超过卡片建议上限 24`)
      }
    }

    // 关键词：跨语言通用术语至少要有，否则搜索命中率会很差
    if (tool.keywords.all.length < 3) warn(id, 'keywords.all 少于 3 个，长尾搜索命中率可能偏低')

    // FR-03：相关工具 8~12 个，不含自身，全部真实存在，至少 2 个跨分类
    const rel = tool.related
    if (rel.length < 8 || rel.length > 12) fail(id, `related 有 ${rel.length} 个，要求 8~12 个`)
    if (rel.includes(tool.slug)) fail(id, 'related 包含自身')
    for (const r of rel) {
      if (!slugs.has(r)) fail(id, `related 引用了不存在的 slug "${r}"`)
    }
    const cross = rel.filter((r) => TOOLS.find((t) => t.slug === r)?.category !== tool.category)
    if (cross.length < 2) fail(id, `related 中跨分类工具只有 ${cross.length} 个，要求至少 2 个`)
  }

  for (const cat of CATEGORIES) {
    for (const lang of LAUNCHED) {
      if (!CATEGORY_META[cat].names[lang]) fail('category', `${cat} 缺 ${lang} 名称`)
      if (!CATEGORY_META[cat].desc[lang]) fail('category', `${cat} 缺 ${lang} 说明`)
    }
  }

  console.log(`  检查 ${TOOLS.length} 个工具 × ${LAUNCHED.length} 种语言`)
}

/* ------------------------------------------------------------------ *
 * ③ 禁止半翻译页面
 * ------------------------------------------------------------------ */
function checkToolDocs(): void {
  section('③ 工具文档：禁止半翻译页面')

  let generated = 0

  for (const tool of TOOLS) {
    const present = LAUNCHED.filter((lang) =>
      existsSync(join(CONTENT, 'tools', tool.slug, `${lang}.md`))
    )

    if (present.length === 0) {
      // 一篇都没有 → 不会生成任何页面，属于「尚未开发」，不是错误
      continue
    }

    if (present.length !== LAUNCHED.length) {
      const absent = LAUNCHED.filter((l) => !present.includes(l))
      fail(
        tool.id,
        `半翻译风险：已有 [${present.join(', ')}]，缺 [${absent.join(', ')}]。` +
          `要么补齐，要么先全部移除 —— getStaticPaths 只会为已存在的组合产出页面`
      )
      continue
    }

    generated += present.length
    console.log(`  ✓ ${tool.id} ${tool.slug}：${present.length} 个语言版本齐备`)
  }

  console.log(`  → 将生成 ${generated} 个工具页`)
}

/* ------------------------------------------------------------------ *
 * ④ 合规页齐备（FR-10）
 * ------------------------------------------------------------------ */
function checkLegalDocs(): void {
  section('④ 合规页齐备（AdSense 审核前提）')

  const LEGAL = ['about', 'privacy', 'contact', 'disclaimer'] as const

  for (const slug of LEGAL) {
    for (const lang of LAUNCHED) {
      const p = join(CONTENT, 'legal', slug, `${lang}.md`)
      if (!existsSync(p)) {
        fail('legal', `缺 ${slug}/${lang}.md —— 某语言版本上线前四个合规页必须齐备`)
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * ⑤ frontmatter 完整性与内容量
 * ------------------------------------------------------------------ */
function checkFrontmatter(): void {
  section('⑤ 文档 frontmatter 与内容量（FR-03 门槛）')

  const files: Array<{ kind: string; slug: string; lang: Lang; path: string }> = []

  for (const lang of LAUNCHED) {
    for (const tool of TOOLS) {
      const p = join(CONTENT, 'tools', tool.slug, `${lang}.md`)
      if (existsSync(p)) files.push({ kind: 'tool', slug: tool.slug, lang, path: p })
    }
    for (const slug of ['about', 'privacy', 'contact', 'disclaimer']) {
      const p = join(CONTENT, 'legal', slug, `${lang}.md`)
      if (existsSync(p)) files.push({ kind: 'legal', slug, lang, path: p })
    }
  }

  for (const f of files) {
    const raw = readFileSync(f.path, 'utf8')

    // 拆 frontmatter 与正文
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
    if (!m) {
      fail(f.slug, `${f.lang}.md 缺少 frontmatter 块`)
      continue
    }
    const [, fm, body] = m

    const title = /^title:\s*['"]?(.+?)['"]?\s*$/m.exec(fm)?.[1] ?? ''
    const desc = /^description:\s*['"]?(.+?)['"]?\s*$/m.exec(fm)?.[1] ?? ''

    if (!title) fail(f.slug, `${f.lang}.md frontmatter 缺 title`)
    if (!desc) fail(f.slug, `${f.lang}.md frontmatter 缺 description`)

    // SEO 实践区间：<title> 过短没信息量，过长被搜索引擎截断
    if (title && (title.length < 10 || title.length > 70)) {
      warn(f.slug, `${f.lang} title 长度 ${title.length}，建议在 10~70 之间`)
    }
    if (desc && (desc.length < 40 || desc.length > 200)) {
      warn(f.slug, `${f.lang} description 长度 ${desc.length}，建议在 40~200 之间`)
    }

    // 内容量门槛只对**工具页**生效（FR-03）；合规页有自身的完整性要求，
    // 长度不是它的验收标准。
    if (f.kind !== 'tool') continue

    // 去掉 Markdown 语法后统计有效字符：
    //   zh 按字符数 ≥500；en 按词数 ≥350
    const text = body
      .replace(/```[\s\S]*?```/g, ' ') // 代码块不计入正文量
      .replace(/^\s*\|.*\|\s*$/gm, ' ') // 表格行不计入
      .replace(/[#>*_`\-[\]()!]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (f.lang === 'en') {
      const words = text.split(/\s+/).filter(Boolean).length
      if (words < 350) fail(f.slug, `en 正文 ${words} 词，低于 FR-03 门槛 350 词`)
    } else {
      // CJK：非空白字符数即字数
      const chars = text.replace(/\s/g, '').length
      if (chars < 500) fail(f.slug, `${f.lang} 正文 ${chars} 字，低于 FR-03 门槛 500 字`)
    }
  }

  console.log(`  检查 ${files.length} 个文档`)
}

/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log('check-i18n：语言与内容完整性门禁')
  console.log(`LAUNCHED = [${LAUNCHED.join(', ')}]`)

  await checkUiDicts()
  checkToolMeta()
  checkToolDocs()
  checkLegalDocs()
  checkFrontmatter()

  console.log('')
  if (failures > 0) {
    console.error(`✗ check-i18n 失败：${failures} 项错误，${warnings} 项警告`)
    console.error('  错误必须修完才能构建 —— 这是 PRD 软约束的硬门禁化。')
    process.exit(1)
  }
  console.log(`✓ check-i18n 通过（${warnings} 项警告）`)
}

main().catch((err) => {
  console.error('check-i18n 自身执行失败：', err)
  process.exit(1)
})
