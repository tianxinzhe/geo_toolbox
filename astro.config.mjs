import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'
import { fileURLToPath } from 'node:url'

// 站点域名待定（PRD OQ-01）。M0~M13 全部在 *.pages.dev 上开发验证，
// 域名确定后只需改这一行以及 src/config/site.ts。
export default defineConfig({
  site: 'https://geo-toolbox.pages.dev',
  output: 'static',

  // 三语言统一为 /{lang}/…，根路径 / 完全由 src/pages/index.astro 自己控制
  i18n: {
    locales: ['en', 'zh', 'ja'],
    defaultLocale: 'en', // ← OQ-08 决定后改这一行
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false // 不用 Astro 自动跳转，改为可控的内联脚本
    }
  },

  integrations: [vue()],

  build: {
    inlineStylesheets: 'auto', // 小样式内联，减少请求
    format: 'directory' // URL 以 / 结尾，与 Cloudflare Pages 默认行为一致
  },

  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    build: {
      assetsInlineLimit: 2048
    }
  }
})
