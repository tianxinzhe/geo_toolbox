import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * 单元测试配置。
 *
 * 只测 `src/lib/**` 下的零依赖纯函数 —— 这些文件禁止 import 任何
 * Vue / DOM API（技术方案 3 章「架构要点」），因此 environment 用 'node'
 * 而不是 jsdom：跑得更快，也能在环境层面阻止「不小心引入 DOM 依赖」。
 *
 * ⛔ `src/lib/docs.ts` 是唯一例外（依赖 astro:content 虚拟模块），
 * 它不在测试范围内。
 *
 * Node 必须 ≥20：完整 ICU 才能保证 Intl 行为与浏览器一致，
 * 否则 format.spec.ts 里的千分位断言会与线上不符。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
    // SR-03：GCJ-02 逆变换要求覆盖率 98%（PRD 风险对策表）
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/docs.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90
      }
    }
  }
})
