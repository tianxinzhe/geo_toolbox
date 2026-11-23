---
title: GML 格式详解：OGC XML 要素与轴序 | 地理工具箱
description: GML 的 FeatureCollection、featureMember、gml:pos 与 srsName 结构，命名空间规则，以及 EPSG:4326 轴序歧义和体积问题。
heading: GML 格式详解：OGC XML 要素与轴序
group: vector
order: 11
readingMinutes: 1
updated: 2026-11-09
---

GML（Geography Markup Language）是 OGC 的 XML 编码标准。在 GeoJSON 普及之前，它是 Web 地理数据交换的主力，至今仍广泛出现在 OGC 服务、行业平台和政务数据中。

## 基本结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gml:FeatureCollection
    xmlns:gml="http://www.opengis.net/gml/3.2"
    xmlns:app="https://example.com/app">
  <gml:featureMember>
    <app:station>
      <app:name>天安门</app:name>
      <app:location>
        <gml:Point srsName="EPSG:4326">
          <gml:pos>116.3974 39.9088</gml:pos>
        </gml:Point>
      </app:location>
    </app:station>
  </gml:featureMember>
</gml:FeatureCollection>
```

- **要素与几何分离**：业务属性放在自定义命名空间（`app:`），几何放在 `gml:` 元素里。
- **`srsName` 声明坐标系**，可写 EPSG 代码或 URI。
- **`gml:pos` 写坐标**，多点线面用 `gml:posList`。
- **`featureMember`** 在新版 GML 中也写作 `featureMembers`，读取时要兼容。

## 轴序歧义

EPSG:4326 的官方轴序是**纬度在前**，但大量实际文件按经度在前书写。仅凭 `srsName` 无法判断，必须结合数值范围（经度通常 -180~180，纬度 -90~90）和数据提供方说明。

## 限制

- **体积冗长**：同样的点数据，GML 常比 GeoJSON 大数倍。
- **命名空间严格**：漏掉 `xmlns` 或前缀不匹配会直接解析失败。
- **结构自由度高**：不同行业的 GML 应用模式差异很大，通用解析器只能处理常见几何。
- **不是为浏览器设计的**：前端直接解析成本高。

## 转换时注意

GML 转 GeoJSON 时，属性名可能带命名空间前缀，需要清理；`srsName` 若不等于 EPSG:4326，坐标不会自动转换。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)，文本几何写法见 [WKT](/zh/guide/wkt/)。