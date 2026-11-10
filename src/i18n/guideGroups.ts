/**
 * 科普文章分组（`/guide/` 列表页）
 *
 * 分组只影响列表页的区块划分与文章面包屑，不生成独立列表页：
 * 当前每组文章数量还不足以支撑独立索引页，避免产出内容稀薄的页面。
 * 新增分组时同步修改三份 UI 字典中的 `guide.group.*` 文案。
 */
import type { UiKey } from './ui'

export const GUIDE_GROUP_IDS = ['projection', 'vector', 'tile'] as const

export type GuideGroup = (typeof GUIDE_GROUP_IDS)[number]

/** 列表页的区块顺序即数组顺序 */
export const GUIDE_GROUPS: readonly { id: GuideGroup; labelKey: UiKey; descKey: UiKey }[] = [
  {
    id: 'projection',
    labelKey: 'guide.group.projection',
    descKey: 'guide.group.projection.desc'
  },
  { id: 'vector', labelKey: 'guide.group.vector', descKey: 'guide.group.vector.desc' },
  { id: 'tile', labelKey: 'guide.group.tile', descKey: 'guide.group.tile.desc' }
]