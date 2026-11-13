import { describe, expect, it } from 'vitest'

import type { VectorFeatureCollection } from '../../src/lib/convert/types'
import { joinAttributes } from '../../src/lib/geo/join'

function collection(
  properties: Array<Record<string, unknown>>
): VectorFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: properties.map((props, index) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [index, index] },
      properties: props
    }))
  }
}

describe('joinAttributes', () => {
  it('按字段值精确匹配并并入属性表字段', () => {
    const input = collection([
      { id: 1, name: '甲' },
      { id: 2, name: '乙' }
    ])
    const result = joinAttributes(
      input,
      [
        { code: '1', category: '公园' },
        { code: '2', category: '学校' }
      ],
      { vectorField: 'id', tableField: 'code' }
    )

    expect(result.matched).toBe(2)
    expect(result.unmatched).toBe(0)
    expect(result.collection.features[0].properties).toMatchObject({
      id: 1,
      name: '甲',
      code: '1',
      category: '公园'
    })
    expect(result.collection.features[1].properties.category).toBe('学校')
  })

  it('数值 1 与字符串 " 1 " 视为同一个键', () => {
    const input = collection([{ id: 1 }])
    const result = joinAttributes(input, [{ code: ' 1 ', label: '命中' }], {
      vectorField: 'id',
      tableField: 'code'
    })

    expect(result.matched).toBe(1)
    expect(result.collection.features[0].properties.label).toBe('命中')
  })

  it('未匹配要素按 keepUnmatched 决定保留或剔除', () => {
    const input = collection([{ id: 1 }, { id: 9 }])
    const rows = [{ code: '1', label: '命中' }]

    const kept = joinAttributes(input, rows, {
      vectorField: 'id',
      tableField: 'code',
      keepUnmatched: true
    })
    expect(kept.unmatched).toBe(1)
    expect(kept.collection.features).toHaveLength(2)

    const dropped = joinAttributes(input, rows, {
      vectorField: 'id',
      tableField: 'code',
      keepUnmatched: false
    })
    expect(dropped.unmatched).toBe(1)
    expect(dropped.collection.features).toHaveLength(1)
    expect(dropped.collection.features[0].properties.id).toBe(1)
  })

  it('同名字段由属性表覆盖并计入冲突，连接字段本身不算冲突', () => {
    const input = collection([{ id: 1, name: '矢量' }])
    const result = joinAttributes(
      input,
      [{ code: '1', id: '1', name: '属性表' }],
      { vectorField: 'id', tableField: 'code' }
    )

    expect(result.conflicts).toBe(1)
    expect(result.collection.features[0].properties.name).toBe('属性表')
  })

  it('重复键只采用首次出现并统计重复行', () => {
    const input = collection([{ id: 1 }])
    const result = joinAttributes(
      input,
      [
        { code: '1', label: '第一次' },
        { code: '1', label: '第二次' }
      ],
      { vectorField: 'id', tableField: 'code' }
    )

    expect(result.duplicates).toBe(1)
    expect(result.collection.features[0].properties.label).toBe('第一次')
  })

  it('空键不参与匹配', () => {
    const input = collection([{ id: '' }])
    const result = joinAttributes(input, [{ code: '', label: '不应命中' }], {
      vectorField: 'id',
      tableField: 'code'
    })

    expect(result.matched).toBe(0)
    expect(result.unmatched).toBe(1)
    expect(result.collection.features[0].properties.label).toBeUndefined()
  })

  it('不修改输入集合', () => {
    const input = collection([{ id: 1 }])
    joinAttributes(input, [{ code: '1', label: 'x' }], {
      vectorField: 'id',
      tableField: 'code'
    })

    expect(input.features[0].properties).toEqual({ id: 1 })
  })
})