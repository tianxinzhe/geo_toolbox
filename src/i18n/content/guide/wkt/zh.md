---
title: WKT 格式详解：几何文本、SRID 与 EWKT | 地理工具箱
description: WKT 的 POINT、LINESTRING、POLYGON、MULTIPOLYGON 写法，Z/M 维度、环闭合规则，以及标准 WKT 与 PostGIS EWKT 的 SRID 区别。
heading: WKT 格式详解：几何文本、SRID 与 EWKT
group: vector
order: 10
readingMinutes: 1
updated: 2026-11-09
---

WKT（Well-Known Text）是 OGC 定义的几何文本表示法。它只描述几何，不带属性，非常适合数据库字段、日志和单条几何交换。

## 五种常用写法

```text
POINT (116.3974 39.9088)
LINESTRING (116.39 39.90, 116.40 39.91, 116.41 39.92)
POLYGON ((116.39 39.90, 116.41 39.90, 116.41 39.92, 116.39 39.90))
MULTIPOLYGON (((116.39 39.90, 116.41 39.90, 116.41 39.92, 116.39 39.90)))
GEOMETRYCOLLECTION (POINT (116.3974 39.9088), LINESTRING (116.39 39.90, 116.40 39.91))
```

- **坐标顺序是 x y**，地理场景通常就是经度、纬度。
- **多边形双层括号**：外层是环列表，内层是一个环；第一个是外环，其余是洞。
- **环必须闭合**，首尾坐标相同。
- **支持 Z / M**：`POINT Z (116.3974 39.9088 44)`。

## SRID 与 EWKT

标准 WKT 不包含坐标系。数据库里常见的：

```text
SRID=4326;POINT (116.3974 39.9088)
```

是 PostGIS 的 EWKT 扩展。看到 SRID 前缀时，要确认目标工具是否支持；不支持的解析器会直接把整串判为非法。

## 限制

- **只能表达一条几何**：多个要素需要多行或多条记录。
- **没有属性**：业务字段必须另存。
- **没有样式与时间**。
- **坐标精度完全依赖写出的字符串**，不要用固定小数位截断测量数据。

## 转换时注意

WKT 转 GeoJSON 时，SRID 会被丢弃或按 WGS84 解释；如果原始 SRID 不是 4326，要先做投影转换。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)，XML 形式的几何见 [GML](/zh/guide/gml/)。