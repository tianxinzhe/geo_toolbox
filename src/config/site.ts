/**
 * 站点级常量
 *
 * 域名待定（PRD OQ-01）。M0~M13 全部在 *.pages.dev 上开发验证，
 * 域名确定后只需改 `site.url` 与 astro.config.mjs 的 `site` 字段。
 */

export const site = {
  /** 站点主域名，用于 canonical / hreflang / sitemap / JSON-LD */
  url: 'https://geo-toolbox.pages.dev',

  /** 站名，各语言自称。`<title>` 模板：{核心关键词} - {补充说明} | {站名} */
  name: {
    zh: '地理工具箱',
    en: 'GeoToolbox',
    ja: 'ジオツールボックス'
  },

  /** 一句话定位，用于首页与 og:description */
  tagline: {
    zh: '9 个地理信息小工具，全部在浏览器本地计算，数据不上传',
    en: '9 geospatial utilities. Everything runs locally in your browser.',
    ja: '9 の地理情報ツール。すべてブラウザ内で計算、データは送信されません'
  },

  /**
   * Google AdSense 发布者 ID（FR-09）
   * 空字符串表示尚未开通 —— 此时 AdSlot 不渲染 <ins>，也不注入脚本。
   * 开通后填入 'ca-pub-XXXXXXXXXXXXXXXX'。
   */
  adsenseClient: '',

  /** 联系邮箱（FR-10 联系方式页要求至少一个可直达渠道） */
  contactEmail: 'tianxinzhe032@gmail.com',

  /** 版权起始年 */
  since: 2026
} as const

/**
 * 广告位 ID 映射（FR-09 投放位置表）
 * A：工具区与文档区之间，响应式展示广告
 * B：文档区第 2 个 H2 之后，in-article（正文 ≥800 字时）
 * C：页脚展示 + 移动端 Anchor（<768px）
 *
 * 申请到广告位后填入真实 slot ID；为空则该位置不渲染。
 */
export const AD_SLOTS: Record<'A' | 'B' | 'C' | 'anchor', string> = {
  A: '',
  B: '',
  C: '',
  anchor: ''
}
