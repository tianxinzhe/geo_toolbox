---
title: KML 与 KMZ 格式详解：结构、样式与打包 | 地理工具箱
description: KML 的 Document、Placemark、coordinates 与样式结构，KMZ 作为 ZIP 容器的组成，以及它们在坐标系、属性与附件上的限制。
heading: KML 与 KMZ 格式详解：结构、样式与打包
group: vector
order: 6
readingMinutes: 6
updated: 2026-11-09
---

KML 是 OGC 标准，也是 Google Earth 的原生格式。它用 XML 描述地标、线、面、样式和时间轴；KMZ 则是把 KML 与图片、图标一起打包成 ZIP。

## KML 结构

顶层是 `<kml>`，常用容器是 `<Document>`、`<Folder>` 和 `<Placemark>`。坐标写在 `<coordinates>` 中，顺序为**经度,纬度[,海拔]**。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>示例</name>
    <Placemark>
      <name>天安门</name>
      <Point>
        <coordinates>116.3974,39.9088,0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>示例范围</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              116.39,39.90,0 116.41,39.90,0 116.41,39.92,0 116.39,39.90,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>
```

多个点之间用空格分隔；面同样要求环闭合。

## 样式能力

KML 最强的地方是展示：`<Style>` 可以定义图标、颜色、线宽、填充透明度；`<description>` 支持 HTML 气泡；`<TimeStamp>` 和 `<TimeSpan>` 可以做时间轴动画。这些在转成 GeoJSON 后都会丢失。

## KMZ

KMZ 不是新语法，而是 ZIP：

```text
example.kmz
├─ doc.kml
├─ images/
│  └─ icon.png
└─ files/
   └─ photo.jpg
```

KML 里的相对路径指向包内附件。解压后如果只取 `doc.kml`，图片和图标就会失效。KMZ 适合分发和展示，不适合程序间交换。

## 限制

- **固定 WGS84**，不声明 EPSG 代码。
- **属性能力弱**：业务字段只能塞进 `<ExtendedData>`，不同软件支持程度不一。
- **手写容易破坏 `<coordinates>`** 的空格与换行。
- **不是数据库格式**：几十万要素时体积和解析速度都不理想。

## 转换时注意

KML / KMZ 转 GeoJSON 会保留几何与名称，但样式、气泡和附件会丢失；反向转换则能生成基础地标，但不会自动补全样式。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)，其他格式见 [总览](/zh/guide/vector-formats/)。