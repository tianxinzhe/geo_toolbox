---
title: Shapefile 格式详解：多文件结构与限制 | 地理工具箱
description: Shapefile 的 .shp、.shx、.dbf、.prj、.cpg 各文件作用，2GB 上限、10 字符字段名、单几何类型等历史限制，以及正确的打包交付方式。
heading: Shapefile 格式详解：多文件结构与限制
group: vector
order: 12
readingMinutes: 6
updated: 2026-11-09
---

Shapefile 是 GIS 领域使用最广的矢量格式，由 Esri 在 1990 年代定义。它不是单个文件，而是一组同名文件；很多「打不开」的问题，其实是漏了其中某一个。

## 文件组成

| 文件 | 作用 | 是否必需 |
|---|---|---|
| `.shp` | 几何坐标 | 必需 |
| `.shx` | 几何索引 | 必需 |
| `.dbf` | 属性表（dBASE） | 必需 |
| `.prj` | 坐标系声明（WKT） | 建议 |
| `.cpg` | 属性表编码 | 建议 |

缺 `.shx` 时部分软件无法建立索引；缺 `.prj` 时坐标系未知；缺 `.cpg` 时中文属性可能乱码。

## 历史限制

- **一个图层只能一种几何类型**：点、线、面必须拆成多个 Shapefile。
- **字段名最多 10 个字符**，中文或长英文名会被截断、重命名。
- **单文件不超过 2GB**，超出必须分片。
- **字段数量和文本长度有上限**，长文本会被截断。
- **不支持 NULL 与复杂类型**，日期、布尔等类型表达有限。

## 正确的交付方式

把同名文件打包成 ZIP，至少包含 `.shp`、`.shx`、`.dbf`，并尽量带上 `.prj` 与 `.cpg`。只发 `.shp` 是最常见的错误。

## 什么时候仍然要用它

- 对接只认 Shapefile 的传统 GIS 或行业流程。
- 需要被老旧软件读取。
- 数据量不大、字段简单。

如果可以选择，GeoPackage 支持多图层、长字段名和更好的类型系统，逐渐取代 Shapefile 作为交付格式。

## 转换时注意

Shapefile 转 GeoJSON / GeoPackage 时，字段名截断和几何类型限制不会自动恢复；多图层可能需要拆成多个文件，反向转换则要把多个图层分别导出。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)，二进制格式对比见 [GeoPackage](/zh/guide/geopackage/) 与 [FlatGeobuf](/zh/guide/flatgeobuf/)。