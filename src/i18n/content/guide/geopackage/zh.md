---
title: 'GeoPackage 结构与限制 | 地理工具箱'
description: GeoPackage 的系统表 gpkg_contents、gpkg_geometry_columns、gpkg_spatial_ref_sys，几何 blob 的 GP 头与 WKB，以及多图层和空间索引能力。
heading: GeoPackage 格式详解：SQLite 容器与几何 blob
group: vector
order: 13
readingMinutes: 4
updated: 2026-11-23
---

GeoPackage（`.gpkg`）是 OGC 标准化的现代矢量容器，本质是一个 SQLite 数据库。一个文件能同时装下多个图层、多种几何类型、样式和元数据，正在逐步取代 Shapefile。

标准由 OGC 维护，规范文本公开，版本迭代保持向后兼容。它的思路和 Shapefile 正好相反：不再给每种数据单独设计文件，而是复用通用的 SQLite，只在表结构上加一层约定。事务、索引、视图这些数据库能力因此可以直接拿来用，代价是读取方得先弄懂这套约定。

## 最小可用示例

| 表 | 作用 |
|---|---|
| `gpkg_spatial_ref_sys` | 坐标系定义 |
| `gpkg_contents` | 图层清单：表名、类型、范围、SRS |
| `gpkg_geometry_columns` | 几何列名、几何类型、SRS |
| 业务表 | 每个图层一张，含 `fid`、`geom` 与属性列 |

直接用 SQL 就能看：

```sql
SELECT table_name, data_type, srs_id
FROM gpkg_contents;

SELECT fid, geom FROM features LIMIT 5;
```

一个最小的矢量 GeoPackage 包含三张元数据表和至少一张要素表。元数据表登记「有哪些图层、几何列叫什么、用哪个坐标系」，要素表存实际数据。缺任何一张，GIS 都会认为文件不合法，即使 SQLite 本身能打开。

除了要素表，GeoPackage 还允许瓦片表（`data_type` 为 `tiles`）和纯属性表（`attributes`）。同一个文件里既有矢量又有切片底图，这是 Shapefile 做不到的。

## 结构与字段说明

| 表 | 关键字段 | 是否必需 | 常见取值 |
|---|---|---|---|
| `gpkg_spatial_ref_sys` | `srs_id`、`srs_name`、`organization`、`definition` | 必需 | `srs_id` 4326，`organization` 为 EPSG |
| `gpkg_contents` | `table_name`、`data_type`、`srs_id`、`min_x` 等范围字段 | 必需 | `features`、`tiles`、`attributes` |
| `gpkg_geometry_columns` | `table_name`、`column_name`、`geometry_type_name`、`srs_id` | 有矢量图层时必需 | `GEOMETRY`、`POINT`、`POLYGON` |
| 要素表 | `fid`、`geom`、业务属性列 | 每图层一张 | 主键为整数，`geom` 为 blob |
| `rtree_<表>_<列>` | `id`、`minx`、`maxx`、`miny`、`maxy` | 可选 | 由触发器维护 |
| `gpkg_tile_matrix` | `table_name`、`zoom_level`、`tile_matrix_width` | 有瓦片时必需 | 瓦片层级与网格大小 |

`gpkg_spatial_ref_sys` 里除了真实坐标系，还预置了「未定义地理坐标系」和「未定义平面坐标系」两条记录，留给没有坐标含义的绘图数据。读取时如果业务图层引用的正是这两条，就不能把坐标当经纬度处理。

`gpkg_contents` 的范围字段是图层的外包框，很多软件拿它做快速定位；范围与实际数据不符，缩放时会出现空白或定位偏差。写完记得让它与数据保持一致。

`geometry_type_name` 允许写 `GEOMETRY`，表示同一列里点、线、面可以混着放。这比 Shapefile 宽松，也意味着读取方不能假设所有要素都是同一种类型。

## 几何怎么存

`geom` 列不是裸的 WKB，前面还压着一个 GPKG 头：

- magic `GP`（2 字节）
- 版本号
- flags（是否含包络框、字节序等）
- `srs_id`
- 可选包络框（minx, maxx, miny, maxy）
- 之后的 WKB 几何

这就是普通 SQLite 表不能直接当 GeoPackage 用的原因：系统表和几何头都缺。

头里的 `srs_id` 让每一行都能声明自己的坐标系，理论上同一张表可以混用不同 SRS，实践中最好还是统一，否则范围查询和显示都会出问题。包络框是可选项，写入端不一定填；用 `shapely` 之类的库解码时，要先按 flags 跳过头部再读 WKB。

## 能力与优势

- **单文件多图层**，一个文件可以交付完整项目。
- **支持空间索引**（R-tree），范围查询快。
- **字段名与类型不受 Shapefile 限制**。
- **事务与并发**由 SQLite 提供，适合数据管理。
- **生态成熟**：QGIS、GDAL、GeoServer、移动端库都支持。

R-tree 索引不是自动建好的：建表之后要跑 SQLite 的 `rtree` 相关语句生成索引表，再创建触发器，让插入、更新、删除同步维护索引。很多工具会默认替用户做完，手写 SQL 时最容易漏掉这一段。

## 限制

- **文件通常比 FlatGeobuf 大**。
- **需要 SQLite 引擎**，纯前端读取要额外 wasm。
- **写入时要注意 SRS 一致性**，不同图层可以有不同的 `srs_id`。
- **不是纯文本**，无法直接查看或做差异比较。

另外，SQLite 同一时刻只允许一个写入者。多人同时写同一个文件，或者把文件放在网络共享盘上，很容易碰上锁等待甚至 `database is locked`。它适合单机编辑和分发，不适合拿来当多人并发写入的服务端数据库。

## 常见错误与陷阱

**把普通 SQLite 文件改成 `.gpkg` 后缀**：现象是 QGIS 打不开，或提示不是合法的 GeoPackage；原因是缺少元数据表，文件标识也没有设置成 GeoPackage；后果是数据无法被识别，只能重新导出。

**只复制 `.gpkg`，漏掉 `-wal` 与 `-shm`**：现象是打开后看不到刚写入的要素；原因是数据库处于 WAL 模式，最近的提交还在旁文件里；后果是数据丢失，必须在原目录完整关闭后一起复制。

**用 SQL 直接改几何，范围查询却查不到**：现象是要素存在，按范围筛选时却被漏掉；原因是空间索引由触发器维护，绕过触发器的写入不会更新 R-tree；后果是查询结果不完整，需要重建索引。

**多图层导出成单图层格式**：现象是只出现一个图层，其余静默消失；原因是 Shapefile、FlatGeobuf 都是单图层格式；后果是数据不全，而且没有报错提示。

**坐标系声明与实际坐标不符**：现象是要素整体偏移，或缩放到错误位置；原因是写入时把投影坐标标成了 `srs_id` 4326，或沿用了模板的元数据；后果是无法与底图叠加，软件也不会报错。

## 与相邻格式对比

| 维度 | GeoPackage | Shapefile | FlatGeobuf | GeoJSON |
|---|---|---|---|---|
| 容器 | SQLite 数据库 | 多个同名文件 | 单个二进制文件 | 单个文本文件 |
| 图层 | 多图层、要素与瓦片 | 单图层、单几何类型 | 单图层 | 单集合、多类型 |
| 字段 | 几乎不受限制 | 10 字符、类型少 | 类型较完整 | 由 JSON 决定 |
| 坐标系 | 每图层声明 SRS | 可选 `.prj` | 可选头声明 | 约定 WGS84 |
| 空间索引 | R-tree 表 | 依赖附带索引文件 | 打包 Hilbert R-tree | 无 |
| 事务与并发 | 支持，单写者 | 无 | 无 | 无 |
| 体积 | 中等偏大 | 中等 | 较小 | 最大 |

## 转换与工具入口

多图层 GeoPackage 导出到 Shapefile 或 FlatGeobuf 时需要拆文件；导出到单图层 GeoPackage 时只保留一个图层。

转换前先看清源文件里的图层清单和每个图层的 `srs_id`。目标是 Shapefile 的话，字段名会按 10 字符截断，几何类型也被迫统一；目标是 FlatGeobuf 就只能留一个图层。反向转换时，多个 Shapefile 可以写进同一个 GeoPackage，前提是表名和字段名都合法。

需要互转时用 [矢量格式转换](/zh/tools/format-convert/)；坐标系不一致时先用 [投影坐标转换](/zh/tools/epsg-convert/) 统一到 WGS84。与 Shapefile 的差异见 [Shapefile](/zh/guide/shapefile/)，Web 传输场景见 [FlatGeobuf](/zh/guide/flatgeobuf/)。

## 示例数据与解析脚本

[sample.gpkg](/examples/data/sample.gpkg) 是一个最小示例：只有一张要素表 `features`，几何类型声明为 `GEOMETRY`，`srs_id` 为 4326，三张标准元数据表齐全。

[geopackage_parser.py](/examples/python/geopackage_parser.py) 用标准库 `sqlite3` 以只读方式打开数据库，读取第一张要素表，再用 `shapely` 从 blob 里解出几何，输出 GeoJSON。空几何会被跳过，样式表和非要素表不处理。

```text
python geopackage_parser.py sample.gpkg -o out.geojson
```

要是脚本报错说找不到要素表，先用 SQLite 查看 `gpkg_contents`，确认 `data_type` 是 `features`；要是坐标不对，检查 `gpkg_geometry_columns` 里的 `srs_id` 是否与数据一致。

## 参考与依据

- [GeoPackage](https://www.geopackage.org/)
- [GeoPackage Specification](https://www.geopackage.org/spec/)