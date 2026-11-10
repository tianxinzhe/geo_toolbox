import { describe, expect, it } from 'vitest'

import type { VectorFeatureCollection } from '../../src/lib/convert/types'
import { extractByAttribute, distinctValues, listFields } from '../../src/lib/geo/attribute'

const data: VectorFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'Alpha', pop: 10 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: { name: 'Beta', pop: '9' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [2, 2] }, properties: { name: 'Gamma', pop: null } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [3, 3] }, properties: { name: 'Delta' } }
  ]
}

describe('listFields', () => {
  it('识别数值字段与示例值', () => {
    const fields = listFields(data)
    const pop = fields.find((field) => field.name === 'pop')
    expect(pop?.numeric).toBe(true)
    expect(pop?.filled).toBe(2)
    expect(pop?.samples).toEqual(['10', '9'])
  })

  it('文本字段不标记为数值', () => {
    const name = listFields(data).find((field) => field.name === 'name')
    expect(name?.numeric).toBe(false)
    expect(name?.filled).toBe(4)
  })

  it('空图层返回空字段表', () => {
    expect(listFields({ type: 'FeatureCollection', features: [] })).toEqual([])
  })
})

describe('distinctValues', () => {
  it('去重并跳过空值', () => {
    expect(distinctValues(data, 'name')).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma'])
    expect(distinctValues(data, 'pop')).toEqual(['9', '10'])
  })

  it('数值按数字大小排序', () => {
    const values = distinctValues(data, 'pop')
    expect(values).toEqual(['9', '10'])
  })

  it('限制返回数量', () => {
    expect(distinctValues(data, 'name', 2)).toHaveLength(2)
  })

  it('不存在的字段返回空数组', () => {
    expect(distinctValues(data, 'missing')).toEqual([])
  })
})

describe('extractByAttribute', () => {
  it('等于按数值比较', () => {
    const result = extractByAttribute(data, 'pop', 'eq', '10')
    expect(result.matched).toBe(1)
    expect(result.collection.features[0].properties?.name).toBe('Alpha')
    expect(result.total).toBe(4)
  })

  it('大于不会把字符串 9 判成大于 10', () => {
    const result = extractByAttribute(data, 'pop', 'gt', '9')
    expect(result.matched).toBe(1)
    expect(result.collection.features[0].properties?.name).toBe('Alpha')
  })

  it('包含忽略大小写', () => {
    const result = extractByAttribute(data, 'name', 'contains', 'BET')
    expect(result.matched).toBe(1)
    expect(result.collection.features[0].properties?.name).toBe('Beta')
  })

  it('为空匹配 null 与缺失属性', () => {
    const result = extractByAttribute(data, 'pop', 'empty', '')
    expect(result.matched).toBe(2)
  })

  it('不为空排除空值', () => {
    const result = extractByAttribute(data, 'pop', 'notEmpty', '')
    expect(result.matched).toBe(2)
  })

  it('不存在的字段按空值处理', () => {
    expect(extractByAttribute(data, 'missing', 'eq', 'x').matched).toBe(0)
    expect(extractByAttribute(data, 'missing', 'empty', '').matched).toBe(4)
  })

  it('文本字段的大于条件不匹配任何要素', () => {
    const result = extractByAttribute(data, 'name', 'gt', 'A')
    expect(result.matched).toBe(0)
  })

  it('结果保留属性与顺序', () => {
    const result = extractByAttribute(data, 'name', 'neq', 'Alpha')
    expect(result.matched).toBe(3)
    expect(result.collection.features.map((f) => f.properties?.name)).toEqual([
      'Beta',
      'Gamma',
      'Delta'
    ])
  })
})