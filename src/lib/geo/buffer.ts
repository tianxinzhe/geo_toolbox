/**
 * T10 缓冲区（buffer）模式。
 *
 * 单独成文件并静态依赖 @turf/buffer 的原因：圆模式不需要 JSTS，
 * 组件只在用户切到「缓冲区」时动态 import 本模块，避免把 buffer
 * 依赖打进等距圈首屏（技术方案 2 章体积预算）。
 */

import buffer from '@turf/buffer'

import type {
  VectorFeature,
  VectorFeatureCollection
} from '../convert/types'
import type { GeoJsonGeometry } from '../convert/wkt'

interface BufferedFeature {
  geometry?: GeoJsonGeometry | null
}

export interface BufferOptions {
  radiiM: readonly number[]
  steps: number
}

/**
 * 对要素集合逐要素、逐半径生成外扩缓冲区。
 *
 * ⚠️ turf.buffer 是平面近似缓冲，不是椭球大地缓冲；结果适合示意与
 * 覆盖分析，不用于法定测量。PRD 6.3 把「缓冲算法」放在高级选项，
 * 这里采用社区标准实现（JSTS）。
 */
export function bufferCollection(
  fc: VectorFeatureCollection,
  opts: BufferOptions
): VectorFeatureCollection {
  const features: VectorFeature[] = []
  for (const f of fc.features) {
    if (!f.geometry) continue
    for (const radiusM of opts.radiiM) {
      if (!(radiusM > 0)) continue
      const buffered = buffer(f as never, radiusM / 1000, {
        units: 'kilometers',
        steps: opts.steps
      })
      if (!buffered) continue
      const asObject = buffered as unknown as {
        type: string
        features?: BufferedFeature[]
        geometry?: GeoJsonGeometry | null
      }
      const list: BufferedFeature[] =
        asObject.type === 'FeatureCollection' ? (asObject.features ?? []) : [asObject]
      for (const b of list) {
        if (!b.geometry) continue
        features.push({
          type: 'Feature',
          geometry: b.geometry,
          properties: {
            ...f.properties,
            source_type: f.geometry.type,
            radius_m: radiusM
          }
        })
      }
    }
  }
  return { type: 'FeatureCollection', features }
}