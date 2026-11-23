---
title: GPX 格式详解：航点、轨迹与路线 | 地理工具箱
description: GPX 的 wpt、trk、rte 三类核心元素，lat/lon 属性写法、时间与海拔字段，以及它不能表达面、属性能力弱的限制。
heading: GPX 格式详解：航点、轨迹与路线
group: vector
order: 7
readingMinutes: 1
updated: 2026-11-09
---

GPX 是 GPS 设备、运动手表和轨迹应用的事实标准。它用 XML 记录航点、轨迹和路线，结构简单，几乎所有户外软件都能导入。

## 三类核心元素

- `<wpt>`：航点，一个独立坐标。
- `<trk>`：轨迹，由若干 `<trkseg>` 段组成，每段包含若干 `<trkpt>`。
- `<rte>`：路线，由若干 `<rtept>` 组成，通常表示规划路径而非实际记录。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoToolbox"
     xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="39.9088" lon="116.3974">
    <name>天安门</name>
    <ele>44.0</ele>
  </wpt>
  <trk>
    <name>晨跑</name>
    <trkseg>
      <trkpt lat="39.9088" lon="116.3974"><time>2026-11-09T06:00:00Z</time></trkpt>
      <trkpt lat="39.9095" lon="116.3981"><time>2026-11-09T06:00:30Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>
```

## 坐标与字段

- **经纬度写在 `lat` / `lon` 属性里**，顺序与 KML 的 `<coordinates>` 相反。
- **固定 WGS84**。
- **常用子元素**：`<ele>` 海拔、`<time>` 时间、`<name>` 名称、`<desc>` 描述、`<sym>` 符号。
- **时间用 UTC**，带 `Z` 后缀，本地时区要自行换算。

## 限制

- **没有面**：地块、边界、行政区无法表达，强行写入只能得到闭合线。
- **属性固定**：除名称、描述、时间、海拔外，没有通用的业务字段位置。
- **扩展命名空间兼容性差**：厂商自定义字段在其他软件里常被忽略。
- **不适合大数据**：逐点 XML 体积大，十万个点会非常臃肿。

## 转换时注意

GPX 转 GeoJSON 后，轨迹会变成 LineString，航点变成 Point，时间和海拔通常进入属性；反过来，面数据无法写入 GPX，只能取边界或降级为线。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)。