# ARB 差距清单（Tool / SaaS 口径）

- 日期：2026-11-23
- 站点：https://www.soulscop.com
- 依据：[ARB v4.0](https://github.com/huifer/AdSense-Readiness-Benchmark/blob/main/ARB-benchmark.md)，取 Core 79 + Tool/SaaS 扩展项 + 多语言触发项
- 说明：ARB 是第三方风险清单，不是 Google 官方标准；本清单只采纳与本站相关的条目，英文中心的阈值不照搬
- 粗估：未触发任何否决项，缺口集中在 TD 与 TH 的少数条目，对应 ARB 的 **Minor Fixes–Ready** 区间（85–92）。该分数为框架自算，不代表审核结果

---

## 1. 建议直接处理（代码内可完成，低风险）

| # | ARB | 项目 | 现状 / 证据 | 建议动作 |
|---|---|---|---|---|
| A1 | TH19 | 图片格式 | 工具截图已按需求移除（2026-11-23）；当前只剩 9 张指南配图，合计约 1.6 MB | 已不适用。剩余配图可按需转 WebP，收益有限 |
| A2 | TD12 | 编辑标准 | about 说明了站点目的与维护者，但没有内容生产与纠错流程 | 在 about 增加一节：选题来源、事实核对方式、更新与纠错渠道、AI 辅助与人工审校的边界 |
| A3 | TD20 | 隐私深度 | privacy 已覆盖 AdSense Cookie 与退出方式；未写数据保留、处理依据、同意撤回（目前无 analytics） | 补三小段：保留期限（无账号即“不存储”）、处理依据、如何撤回 Cookie 同意 |
| A4 | TD07 | 使用条款 | 只有 disclaimer，无独立 ToS | 在 disclaimer 内增加「使用条款」小节：免费、无担保、责任限制、条款变更方式，不必新建页面 |
| A5 | CI11 / CI12 | 英文页元数据 | 45 个英文页中 29 个标题 >60 字符、28 个描述 >158 字符 | 只修剪最长的 7 个标题与 6 个描述（见下方清单），中文页不动 |
| A6 | UX13 | 触控目标 | 全站 token 为 44×44px，ARB 要求 48×48px | 可选：把 `--ctl-h-touch` 提到 48px 并回归导航与表单；优先级低于 A2–A4 |

**A5 的具体页面**

- 标题 >70 字符：`/en/tools/format-convert/`（78）、`/en/`（78）、`/en/guide/projections-epsg/`（73）、`/en/guide/gmt/`（72）、`/en/guide/`（71）、`/en/tools/clip-overlay/`（71）、`/en/guide/dxf/`（71）
- 描述 >185 字符：`/en/privacy/`（198）、`/en/tools/merge-layers/`（194）、`/en/contact/`（190）、`/en/tools/dissolve/`（190）、`/en/tools/plus-codes/`（189）、`/en/tools/attribute-join/`（187）

> 这些只影响搜索结果摘要的展示，不影响 AdSense 审核。建议顺手改，不值得为它做全站重写。

---

## 2. 需要线上确认或平台配置（代码仓库内无法完成）

| # | ARB | 项目 | 现状 / 证据 | 需要确认什么 |
|---|---|---|---|---|
| B1 | TH01 / TH02 | HTTPS 与证书 | 线上已返回 200，Cloudflare 托管，`http://` 301 到 `https://` | Cloudflare 后台确认证书有效期与自动续期已开启 |
| B2 | TH06 / TH11 / TH12 | 性能与 CWV | 静态站、Brotli 已开启、首页无外部脚本 | 用 PageSpeed Insights 跑首页 + 1 个工具页，记录 LCP / CLS / **INP**（ARB 写的 FID 已过时） |
| B3 | TH13 | 结构化数据 | 工具页输出 Breadcrumb / SoftwareApplication / FAQPage JSON-LD | 用 Rich Results Test 抽查 2 个工具页，确认无错误 |
| B4 | TH15 | 可用性监控 | 无监控配置 | Cloudflare Notifications 或外部 uptime 服务，配一条宕机告警即可 |
| B5 | TH20 | 第三方脚本 | 首页初始 HTML 无外部 script；隐私页声明无 analytics | 上线后抽查 1 个工具页（Leaflet / 底图瓦片按需加载），确认没有新增统计脚本 |
| B6 | SI15 | 重定向链 | `/en/tools/geohash` → 308 → 带斜杠版本，单跳 | 抽查旧链接或外链，确认无 >3 跳的链 |
| B7 | UX14 / UX15 | 200% 缩放与键盘 | 未做手动测试 | 抽查首页与一个工具页：Tab 顺序、焦点可见、200% 文字不截断 |
| B8 | TD14 | 域名年龄 | 代码里看不到 | 确认域名注册已满 6 个月（ARB 的 Pre 建议，不是 Google 硬规则） |

---

## 3. 可选，成本较高或收益不确定

| # | ARB | 项目 | 判断 |
|---|---|---|---|
| C1 | TD09 / TD11 | 作者署名与资质 | **已完成（2026-11-23）**：about 补充 alex.yuan 的背景与动机，指南页增加署名行，Article JSON-LD 的 author 改为 Person |
| C2 | TD16 | 社交账号 | 没有就不必新建；已有真实账号时在页脚补链接即可 |
| C3 | CI15 | 更新节奏 | 建议每季度复核一次高流量指南的日期与外部链接，不需要代码改动 |
| C4 | TD17 | 业务实体验证 | 个人站，无公司实体，N/A |
| C5 | UX16 | 分页 | 指南索引一次列出 20 篇，无分页，N/A |

---

## 4. 明确不采纳（阈值不适合本站或已过时）

| ARB | 条目 | 不采纳原因 |
|---|---|---|
| CI01 | 每页 ≥300 词 | 本站最低页为英文工具文档 1,011 词、中文 1,334 字，远超门槛 |
| CI11 | 描述 120–158 字符 | 英文中心。中文描述 60–80 字正常，按字符数硬套会破坏可读性 |
| CI12 | 标题 50–60 字符 | 同上。中文标题 20–30 字是常态 |
| PC12 | 每页 ≤3 个广告单元 | 不是 Google 明文规则；本站 3 个广告位，保持内容优先即可 |
| TH11 | FID <100ms | 已被 INP 取代，按 B2 用 INP 检查 |
| UX13 | 触控目标 48px | WCAG 2.2 AA 要求 24px、推荐 44px；48px 是 ARB 自定目标，可作为优化项而非阻塞项 |
| CI18 / PC11 / TD10 / TD18 / TD19 | 音视频字幕、数据删除、COPPA、退款、物流 | 本站无音视频、无账号、不面向儿童、不卖货，全部 N/A |
| SI14 | nofollow 规范 | 无付费链接与联盟链接，N/A |

---

## 5. 已通过（抽样证据）

| ARB | 项目 | 证据 |
|---|---|---|
| TD01 | 隐私政策 | `/zh/privacy/`、`/en/privacy/`，全站页脚链接 |
| TD02 | 联系方式 | contact 页展示邮箱 |
| TD03 | 关于页 | about 含站点目的与维护者 |
| TD04 | Cookie 同意 | 全站 Cookie 偏好组件，可接受 / 仅必要 |
| TH03 / TH04 | robots 与 sitemap | robots 允许抓取并声明 sitemap；sitemap 91 条 |
| TH05 | ads.txt | `google.com, pub-5015170324086200, DIRECT, f08c47fec0942fa0` |
| TH09 | canonical | 每页自引用 canonical |
| TH14 | 404 | 自定义 404，含 25 个导航链接 |
| TH18 | 压缩 | 线上 `Content-Encoding: br` |
| TH17 | CDN | Cloudflare |
| UX01 / UX10 | 导航与搜索 | 全站导航 + 站内搜索（页面数 >30） |
| UX12 | 图片 alt | 指南配图 7 张，缺失 alt 为 0 |
| UX18 | 多语言 | zh / en / x-default hreflang，语言切换可用 |
| CI06 | 薄页面 | 无 <200 词页面 |
| CI13 | 标题层级 | 91 个页面 H1 均为 1 个 |
| SI01 / SI03 / SI04 |  cloaking / 关键词堆砌 / 隐藏文本 | 纯静态输出，无差异返回、无隐藏内容 |
| SI12 | 孤立页面 | 工具 / 指南均有索引页与内链入口 |
| SI16 | URL 结构 | 语义化 slug、连字符、无参数 |

---

## 6. 建议执行顺序

1. **A2 + A3 + A4**（纯文本，半天内可完成，直接补信任信号）
2. **B2 + B3 + B6**（线上验证，拿到数据再决定是否继续优化）
3. **A5**（只改列出的 13 个页面，不做全站）
4. **A6 / C2**（有余力再做，不做也不影响提交；C1 已完成）

不建议为了 ARB 分数去改中文标题、描述或正文长度；也不要在没有新增实质内容时重复提交 AdSense 审核。