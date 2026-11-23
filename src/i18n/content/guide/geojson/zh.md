---
title: GeoJSON 格式详解：结构、坐标顺序与限制 | 地理工具箱
description: GeoJSON 的 FeatureCollection、Feature 与 Geometry 结构，经纬度顺序、WGS84 约定、多边形环规则，以及它在体积、属性和坐标系上的限制。
heading: GeoJSON 格式详解：结构、坐标顺序与限制
group: vector
order: 4
readingMinutes: 1
updated: 2026-11-09
---

GeoJSON 是 Web 地理数据的事实标准。它用 JSON 表达点、线、面和属性，任何语言都能读写，浏览器可以直接解析，几乎所有 GIS 和地图库都支持。

## 基本结构

顶层通常是 `FeatureCollection`，里面是 `Feature` 数组。每个要素包含一个 `geometry` 和一个 `properties`。

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [116.3974, 39.9088] },
      "properties": { "name": "天安门", "category": "landmark" }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[116.39, 39.90], [116.41, 39.90], [116.41, 39.92], [116.39, 39.90]]]
      },
      "properties": { "name": "示例范围" }
    }
  ]
}
```

也允许单独一个 `Feature` 或一个 Geometry 作为顶层对象，但批量数据用 `FeatureCollection` 最常见。

## 坐标规则

- **顺序是经度、纬度**：`[lng, lat]`。这是 GeoJSON 最容易出错的地方，写反不会报错，只会把点放到地球另一侧。
- **固定 WGS84 经纬度**，单位为度。RFC 7946 取消了 `crs` 成员；带 `crs` 的旧文件要按其声明处理。
- **多边形用嵌套数组**：最外层是环的列表，内层是一个环的坐标。
- **环必须闭合**：首尾坐标相同；外环与洞的绕向是约定，不是所有软件都校验。
- **坐标可以有第三维**（海拔），但很多工具会忽略。

## 支持的类型

Point、MultiPoint、LineString、MultiLineString、Polygon、MultiPolygon、GeometryCollection。一个要素的 `geometry` 允许为 `null`，表示只有属性没有位置。

## 限制

- **体积大**：每个坐标都带方括号和逗号，几十万个点很容易达到几十 MB。
- **没有拓扑**：相邻多边形的公共边会重复存储。
- **没有样式**：颜色、图标、线宽需要应用层自己约定。
- **默认不支持投影坐标**：行业数据要先转换到 WGS84，或者改用 GeoPackage / Shapefile。

## 转换时注意

从 KML 转 GeoJSON 会丢失样式和气泡描述；从 Shapefile 转过来时字段名会保留，但 `.prj` 声明的投影不会自动保留，需要先做坐标转换。需要实际互转时，用 [矢量格式转换](/zh/tools/format-convert/)；也可以回到 [15 种格式总览](/zh/guide/vector-formats/) 对比其他选择。