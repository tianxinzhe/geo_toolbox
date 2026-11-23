---
title: GeoPackage 格式详解：SQLite 容器与几何 blob | 地理工具箱
description: GeoPackage 的系统表 gpkg_contents、gpkg_geometry_columns、gpkg_spatial_ref_sys，几何 blob 的 GP 头与 WKB，以及多图层和空间索引能力。
heading: GeoPackage 格式详解：SQLite 容器与几何 blob
group: vector
order: 13
readingMinutes: 1
updated: 2026-11-09
---

GeoPackage（`.gpkg`）是 OGC 标准化的现代矢量容器，本质是一个 SQLite 数据库。一个文件可以同时装多个图层、多种几何类型、样式和元数据，正在逐步取代 Shapefile。

## 系统表

| 表 | 作用 |
|---|---|
| `gpkg_spatial_ref_sys` | 坐标系定义 |
| `gpkg_contents` | 图层清单：表名、类型、范围、SRS |
| `gpkg_geometry_columns` | 几何列名、几何类型、SRS |
| 业务表 | 每个图层一张，含 `fid`、`geom` 与属性列 |

可以直接用 SQL 查看：

```sql
SELECT table_name, data_type, srs_id
FROM gpkg_contents;

SELECT fid, geom FROM features LIMIT 5;
```

## 几何怎么存

`geom` 列不是裸 WKB，而是带 GPKG 头：

- magic `GP`（2 字节）
- 版本号
- flags（是否含包络框、字节序等）
- `srs_id`
- 可选包络框（minx, maxx, miny, maxy）
- 之后的 WKB 几何

这就是为什么普通 SQLite 表不能直接当 GeoPackage 使用：缺少系统表和几何头。

## 能力与优势

- **单文件多图层**，一个文件可以交付完整项目。
- **支持空间索引**（R-tree），范围查询快。
- **字段名与类型不受 Shapefile 限制**。
- **事务与并发**由 SQLite 提供，适合数据管理。
- **生态成熟**：QGIS、GDAL、GeoServer、移动端库都支持。

## 限制

- **文件通常比 FlatGeobuf 大**。
- **需要 SQLite 引擎**，纯前端读取要额外 wasm。
- **写入时要注意 SRS 一致性**，不同图层可以有不同的 `srs_id`。
- **不是纯文本**，无法直接查看或做差异比较。

## 转换时注意

多图层 GeoPackage 导出到 Shapefile 或 FlatGeobuf 时需要拆分文件；导出到单图层 GeoPackage 时只保留一个图层。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)；与 Shapefile 的差异见 [Shapefile](/zh/guide/shapefile/)。