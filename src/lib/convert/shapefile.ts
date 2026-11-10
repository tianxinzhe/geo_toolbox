/**
 * Shapefile 导入（P1 / FR-07）。
 *
 * 为什么只接受 ZIP：
 *   - Shapefile 是 .shp/.dbf/.shx/.prj 多文件集合，浏览器一次只能选一个文件；
 *   - ZIP 是行业通用的打包方式，也让「单次一个文件」的规则继续成立。
 *
 * 坐标系：shpjs 会读取 .prj 并用 proj4 重投影到 WGS84。没有 .prj 时按
 * WGS84 原样处理，由调用方在摘要区给出警告（与 FR-07 规则一致）。
 *
 * shpjs 与 proj4 都通过动态 import 加载，不进入任何工具的首屏包。
 */

import { unzipSync, zipSync } from 'fflate'

export interface ShapefileLayerResult {
  /** shpjs 返回的原始 GeoJSON 要素，由 format.ts 统一规范化 */
  features: unknown[]
  /** ZIP 内 .shp 的数量（>1 时只读第一个图层） */
  layerCount: number
  /** 是否存在 .prj，存在即表示已按声明坐标系重投影到 WGS84 */
  hasPrj: boolean
}

function entryMap(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes)
  } catch {
    throw new Error('invalid-shapefile-zip')
  }
}

function layerNames(files: Record<string, Uint8Array>): string[] {
  return Object.keys(files)
    .filter((n) => !n.includes('__MACOSX') && /\.shp$/i.test(n))
    .sort((a, b) => a.localeCompare(b))
}

/** 列出 ZIP 内的图层名，不依赖 shpjs，便于先做明确错误提示 */
export function shapefileLayers(bytes: Uint8Array): string[] {
  return layerNames(entryMap(bytes))
}

export async function parseShapefileZIP(
  bytes: Uint8Array,
  layerName?: string
): Promise<ShapefileLayerResult> {
  const files = entryMap(bytes)
  const layers = layerNames(files)
  if (layers.length === 0) throw new Error('shapefile-no-shp')

  const chosen = layerName && layers.includes(layerName) ? layerName : layers[0]
  const lower = new Set(Object.keys(files).map((n) => n.toLowerCase()))
  const base = chosen.replace(/\.shp$/i, '').toLowerCase()
  const hasPrj = lower.has(`${base}.prj`)

  // 选择非首个图层时，只把该图层的 .shp/.dbf/.shx/.prj 等重新打包，
  // 交给 shpjs 解析。shpjs 对多图层 zip 的返回顺序没有明确保证，
  // 过滤后重新打包比按索引取数组更可靠。
  let source = bytes
  if (layerName && chosen !== layers[0]) {
    const subset: Record<string, Uint8Array> = {}
    for (const [name, data] of Object.entries(files)) {
      const lowerName = name.toLowerCase()
      if (!lowerName.startsWith(`${base}.`)) continue
      if (!/\.(shp|shx|dbf|prj|cpg|qix)$/.test(lowerName)) continue
      subset[name] = data
    }
    source = zipSync(subset)
  }

  let mod: typeof import('shpjs')
  try {
    mod = await import('shpjs')
  } catch {
    throw new Error('shapefile-load-failed')
  }

  let result: Awaited<ReturnType<typeof mod.getShapefile>>
  try {
    result = await mod.getShapefile(source)
  } catch {
    throw new Error('shapefile-parse-failed')
  }

  const fc = Array.isArray(result) ? result[0] : result
  if (!fc || !Array.isArray(fc.features)) throw new Error('shapefile-parse-failed')

  return { features: fc.features, layerCount: layers.length, hasPrj }
}