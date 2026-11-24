import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'
import { fileURLToPath } from 'node:url'

/**
 * 给 Markdown 正文图片补 loading="lazy" 与 decoding="async"。
 * 正文配图都在首屏之后，懒加载可以少阻塞主线程；Astro 默认不加这两个属性。
 */
function rehypeLazyImages() {
  return (tree) => {
    const walk = (node) => {
      if (node.type === 'element' && node.tagName === 'img') {
        node.properties = { ...node.properties, loading: 'lazy', decoding: 'async' }
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
  }
}

// 站点主域名：https://www.soulscop.com
// 影响 canonical / hreflang / sitemap / robots（与 src/config/site.ts 保持一致）
export default defineConfig({
  site: 'https://www.soulscop.com',
  output: 'static',

  markdown: {
    rehypePlugins: [rehypeLazyImages]
  },

  // 两语言统一为 /{lang}/…，根路径 / 完全由 src/pages/index.astro 自己控制
  i18n: {
    locales: ['en', 'zh'],
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
