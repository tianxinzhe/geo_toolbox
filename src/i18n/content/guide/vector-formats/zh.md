---
title: 15 种矢量数据格式总览与选型 | 地理工具箱
description: GeoJSON、KML、GPX、Shapefile、GeoPackage、FlatGeobuf、DXF 等 15 种矢量格式的分组、适用场景、文本与二进制差异，以及转换时最容易丢失的内容。
heading: 15 种矢量数据格式总览与选型
group: vector
order: 3
readingMinutes: 2
updated: 2026-11-09
---

同样一份点线面数据，可以存成 GeoJSON、KML、GPX、Shapefile、GeoPackage、FlatGeobuf 等十几种格式。选错格式通常不会立刻报错，而是在交付、导入或换一个软件打开时才暴露问题。

这篇是总览。每种格式的字段结构、代码示例与转换陷阱，放在对应的详解页里。

## 按数据家族分组

| 家族 | 格式 | 本质 | 典型用途 |
|---|---|---|---|
| JSON | GeoJSON、TopoJSON | 纯文本 | Web 开发、接口传输、程序处理 |
| XML | KML、KMZ、GPX、GML | 文本 / 压缩包 | Google Earth、GPS 轨迹、OGC 服务 |
| 表格 | CSV、TSV、Excel（XLSX/XLS） | 纯文本 / 压缩包 | Excel 协作、批量计算、报表 |
| 文本几何 | WKT | 纯文本 | 数据库、日志、单条几何 |
| GIS 二进制 | Shapefile、GeoPackage、FlatGeobuf | 多文件 / SQLite / 二进制 | GIS 软件交换、大数据、移动端 |
| CAD 与制图 | DXF、GMT、MIF/MID | 文本（DXF 也可为二进制） | CAD、GMT 绘图、MapInfo |

## 文本格式与二进制格式

**文本格式**可以直接打开阅读、用 Git 比较差异、用脚本生成：GeoJSON、TopoJSON、KML、GPX、GML、CSV、TSV、WKT、GMT、MIF/MID，以及大多数 DXF。

**二进制或容器格式**体积更小、读写更快，但必须用对应软件或库处理：KMZ（ZIP 包）、Excel（ZIP 包）、Shapefile（多文件组合）、GeoPackage（SQLite 数据库）、FlatGeobuf（FlatBuffers 二进制）。

一个常见的误判是：KMZ 和 Excel 的扩展名看起来是「一种格式」，实际都是 ZIP 容器，改后缀解压后能看到里面的 XML 文件。

## 快速选型

- **要发给程序员或放进接口**：GeoJSON。需要压缩体积、且边界大量共用时用 TopoJSON。
- **要发给不用 GIS 软件的人看**：KML；需要附带图标、图片时打包成 KMZ。
- **只记录轨迹、航点、路线**：GPX。它不表达面。
- **要和 Excel 打交道**：CSV / TSV。Excel 文件适合人看，不适合作为程序交换格式。
- **只要一条几何**：WKT，例如 `POINT (116.3974 39.9088)`。
- **要交给传统 GIS 或行业流程**：Shapefile，但先处理字段名和分层；能选新格式时优先 GeoPackage。
- **数据量大、要快速读取**：FlatGeobuf 或 GeoPackage。
- **要进 CAD**：DXF。**要用 GMT 画图**：GMT。**要对接 MapInfo**：MIF/MID。

## 逐个格式详解

- [GeoJSON](/zh/guide/geojson/)：JSON 结构、坐标顺序与 Web 场景。
- [TopoJSON](/zh/guide/topojson/)：共享边界、弧段与量化。
- [KML 与 KMZ](/zh/guide/kml/)：样式、描述气泡与 ZIP 容器。
- [GPX](/zh/guide/gpx/)：航点、轨迹与路线，以及它为什么不能存面。
- [CSV 与 TSV](/zh/guide/csv-tsv/)：经纬度列布局、分隔符与编码。
- [Excel（XLSX / XLS）](/zh/guide/excel/)：ZIP 容器与五种会改坏坐标的操作。
- [WKT](/zh/guide/wkt/)：单条几何、环闭合与 SRID。
- [GML](/zh/guide/gml/)：OGC XML 要素与轴序歧义。
- [Shapefile](/zh/guide/shapefile/)：多文件组成、2GB 上限与 10 字符字段名。
- [GeoPackage](/zh/guide/geopackage/)：SQLite 容器、系统表与几何 blob。
- [FlatGeobuf](/zh/guide/flatgeobuf/)：FlatBuffers、打包 R-tree 与流式读取。
- [DXF](/zh/guide/dxf/)：组码、实体与坐标限制。
- [GMT](/zh/guide/gmt/)：多段 ASCII 与绘图参数。
- [MIF/MID](/zh/guide/mif-mid/)：几何与属性双文件及编码问题。

## 转换时最容易丢的四类内容

1. **坐标系声明**：GeoJSON 按规范固定 WGS84；Shapefile 依赖 `.prj`；GPKG 在数据库里记录 EPSG。转换前确认源坐标系，不要靠猜。
2. **属性字段**：Shapefile 字段名最多 10 个字符、一个图层只能一种几何；Excel 会把长数字转成科学计数法；CSV 缺少编码声明时中文容易乱码。
3. **几何细节**：GPX 不能存面；KML 不支持多部件面的所有写法；DXF 的圆弧、块参照在转换后可能变成折线。
4. **样式与附件**：KML 的图标、颜色、图片描述在转成 GeoJSON 后会丢失；KMZ 解包后附件需要单独处理。

转换本身不复杂，难的是提前知道哪些东西会消失。需要实际互转时，用 [矢量格式转换](/zh/tools/format-convert/)。