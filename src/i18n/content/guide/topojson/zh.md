---
title: TopoJSON 格式详解：拓扑、arcs 与量化 | 地理工具箱
description: TopoJSON 如何用 arcs 共享边界、transform 量化坐标、objects 组织图层，以及它不能直接打开、转换会产生微小偏移等限制。
heading: TopoJSON 格式详解：拓扑、arcs 与量化
group: vector
order: 5
readingMinutes: 6
updated: 2026-11-09
---

TopoJSON 是 GeoJSON 的压缩与拓扑化版本。同样是 JSON 文本，但它不直接存每个多边形的完整轮廓，而是把共享边界抽成 `arcs`，几何只引用弧段编号。

## 为什么需要它

行政区划、地块、流域这类数据，相邻多边形共享大量边界。GeoJSON 会把公共边存两遍甚至多遍，TopoJSON 只存一次。再配合整数化和共享字符串，文件可以缩小到原来的几分之一。

## 基本结构

```json
{
  "type": "Topology",
  "transform": { "scale": [0.0001, 0.0001], "translate": [116.3, 39.8] },
  "objects": {
    "districts": {
      "type": "GeometryCollection",
      "geometries": [
        { "type": "Polygon", "arcs": [[0]], "properties": { "name": "A" } },
        { "type": "Polygon", "arcs": [[1]], "properties": { "name": "B" } }
      ]
    }
  },
  "arcs": [
    [[0, 0], [1000, 0], [1000, 1000], [0, 0]],
    [[1000, 0], [2000, 0], [2000, 1000], [1000, 0]]
  ]
}
```

- `objects` 相当于图层容器，可以放多个几何集合。
- `arcs` 是去重后的路径，坐标是相对于 `transform` 的整数。
- `transform.scale` 与 `translate` 决定还原后的真实坐标。
- 负的弧段编号表示反向引用同一条弧。

## 量化与精度

TopoJSON 常用整数坐标压缩浮点数。`scale` 越小，压缩越狠，坐标偏移越大。对于厘米级或测量级数据，量化误差可能不可接受，应先评估精度要求。

## 使用限制

- **不能直接打开**：浏览器、QGIS 和大多数 GIS 软件都需要先转回 GeoJSON 或 Shapefile。
- **生态比 GeoJSON 小**：JavaScript 有 `topojson-client`，其他语言的支持参差不齐。
- **只适合矢量拓扑**：点数据用它没有收益，反而多一层转换。
- **属性仍在 `properties`** 里，结构与 GeoJSON 一致，通常不会丢失。

## 转换时注意

TopoJSON ↔ GeoJSON 会改变坐标的数值精度，但几何形状保持一致；共享边在转换后不保证逐位相同。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)，更多格式对比见 [15 种格式总览](/zh/guide/vector-formats/)。