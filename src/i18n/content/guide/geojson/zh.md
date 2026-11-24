---
title: 'GeoJSON：结构、坐标顺序与限制 | 地理工具箱'
description: GeoJSON 的 FeatureCollection、Feature 与 Geometry 结构，经纬度顺序、WGS84 约定、多边形环规则，以及它在体积、属性和坐标系上的限制。
heading: GeoJSON 格式详解：结构、坐标顺序与限制
group: vector
order: 4
readingMinutes: 5
updated: 2026-11-23
---

GeoJSON 大概是 Web 地理数据里最通用的一种格式。点、线、面加上属性，用 JSON 写出来，什么语言都能读写，浏览器也能直接解析，GIS 和地图库基本都认它。

规范是 IETF 的 RFC 7946，2016 年发布，登记的媒体类型为 `application/geo+json`。仓库里的地图预览、开放数据接口、地图组件的数据源，大多直接用它。它赢在通用而不是紧凑：同一个 `.geojson` 文件，浏览器、Python、PostGIS 和桌面 GIS 都能打开。

换来的是体积和表达能力的折中。坐标顺序、环的闭合规则、坐标系的固定约定，这三件事弄明白了，大部分「文件能打开但位置不对」的情况都能避开。

## 最小示例

顶层一般是 `FeatureCollection`，里面装一个 `Feature` 数组，每个要素带 `geometry` 和 `properties`。

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

顶层直接放单个 `Feature` 或一个 Geometry 也允许，不过成批的数据几乎都写成 `FeatureCollection`。

看示例里的 `coordinates`：点是一对数字，面多了两层方括号——第一层是环的列表，第二层才是一个环里的坐标序列。数组层级和几何类型一一对应，多一层或少一层，读取程序要么报错要么理解错。

## 结构与字段表

三个层级的字段各有分工：

| 层级 | 字段 | 是否必需 | 含义 |
|---|---|---|---|
| FeatureCollection | `type` | 必需 | 固定为 `FeatureCollection` |
| FeatureCollection | `features` | 必需 | Feature 数组 |
| FeatureCollection | `bbox` | 可选 | 外包框，格式为 `[西, 南, 东, 北]` |
| Feature | `type` | 必需 | 固定为 `Feature` |
| Feature | `geometry` | 必需 | 几何对象，允许为 `null` |
| Feature | `properties` | 必需 | 属性对象，可为空对象 |
| Feature | `id` | 可选 | 标识符，字符串或数字 |
| Geometry | `type` | 必需 | 几何类型名称 |
| Geometry | `coordinates` | 必需 | 坐标数组，层级随类型变化 |
| GeometryCollection | `geometries` | 必需 | 几何数组，替代 `coordinates` |

`bbox` 是可选的外包框，作用是让读取程序在解析全部坐标之前先判断范围。跨越 180° 经线时它有一套专门写法，不是简单取最小值和最大值；拿不准就干脆省略。

### 坐标规则

- **顺序是经度、纬度**：`[lng, lat]`。这是 GeoJSON 最容易踩的坑，写反了不报错，点直接跑到地球另一边。
- **固定 WGS84 经纬度**，单位为度。RFC 7946 取消了 `crs` 成员；遇到带 `crs` 的旧文件，按其声明处理。
- **多边形用嵌套数组**：最外层是环的列表，内层是一个环的坐标。
- **环必须闭合**：首尾坐标相同；外环和洞的绕向属于约定，不是所有软件都校验。
- **坐标可以有第三维**（海拔），但很多工具会忽略。
- **右手定则**：RFC 7946 建议外环逆时针、内环顺时针，同时要求读取程序不要仅因为绕向相反就拒绝数据。写数据时按建议来，读数据时别假设绕向一定正确。
- **`properties` 是普通 JSON 对象**：值可以是字符串、数字、布尔、null，也可以是嵌套对象和数组，但跨系统交换时保持扁平更稳妥。
- **`geometry` 可以为 `null`**：表示只有属性、没有位置，适合待定位的地址或占位记录。

### 几何类型

| 类型 | `coordinates` 层级 | 说明 |
|---|---|---|
| `Point` | 位置 | 一个 `[lng, lat]` |
| `MultiPoint` | 位置数组 | 多个点 |
| `LineString` | 位置数组 | 至少两个位置 |
| `MultiLineString` | 线数组 | 多条线 |
| `Polygon` | 环数组 | 第一个环是外环，其余是洞 |
| `MultiPolygon` | 面数组 | 多个多边形 |
| `GeometryCollection` | 用 `geometries` | 混合几何的集合 |

位置是 `[经度, 纬度]` 或 `[经度, 纬度, 海拔]`。要判断嵌套层级，数一数 `[` 的层数就行：点一层，线两层，面三层，多面四层。

## 常见错误与陷阱

**经纬度写反。** 点落在海里、另一个大洲，或者坐标被截断，多半是这个原因——把 `[纬度, 经度]` 当成了 `[经度, 纬度]`。解析不报错，位置却整体偏移；时代广场应为 `[-73.9855, 40.7580]`，写成 `[40.7580, -73.9855]` 就跑到南半球去了。先看数值范围能省不少事：纬度绝对值超过 90 的，除非那是投影坐标，否则一定写反了。

**多边形环没有闭合。** 浏览器或桌面 GIS 不显示这个面，或者面积算出来不对。原因是首尾坐标不同，也可能一个环里只有 3 个位置。几何因此无效，有的工具自动补上首点，有的直接丢弃。写入前补上首点，同时保证一个环至少有 4 个位置。

**投影坐标混进 GeoJSON。** 坐标里冒出 `500000`、`4400000` 这类大数，地图一片空白。原因是数据来自 UTM 或高斯克吕格，导出前没转到 WGS84。坐标超出经纬度范围后，读取程序可能裁剪、夹取，也可能画到错误位置。办法是先做投影转换，再导出。

**坐标精度保留过多。** 文件体积翻倍，版本差异里全是小数位变化。原因是留了 15 位小数，而 1e-7 度在纬度上约为 1 厘米。体积和解析时间涨了，精度并没有实际提升。按用途保留 6 到 7 位就够了，分别约 0.1 米与 1 厘米。

**把几何或大块数据塞进 `properties`。** 导入某些系统后属性丢失、列类型变成文本，或者文件突然暴涨。因为属性里放了 WKT、图片 base64 或深层嵌套对象，而目标系统只支持标量。结果是属性查不了、索引失效、传输变慢。几何放回 `geometry`，属性保持扁平，大对象单独存放。

**JSON 里写注释、尾逗号或 `NaN`。** 整个文件解析失败，错误只给出行列号。JSON 标准不支持注释、尾逗号和 `NaN`、`Infinity`，而 GeoJSON 又没有降级解析的余地。删掉注释与尾逗号，空值一律写 `null`。

**用 `crs` 成员声明投影。** 文件里写着 `EPSG:3857`，地图却偏移或缩放异常。原因是 RFC 7946 已移除 `crs`，现代读取程序忽略它，按 WGS84 解释。于是投影坐标被当成经纬度，位置和比例都不对。先转换到 WGS84，别依赖 `crs`。

## 与相邻格式对比

GeoJSON 管的是交换和展示，不是把所有信息都存下来。同一份数据换个格式，体积、拓扑、样式上就得做些取舍。

| 项目 | GeoJSON | TopoJSON | KML | Shapefile |
|---|---|---|---|---|
| 编码 | JSON 文本 | JSON 文本 | XML | 二进制 |
| 拓扑 | 无，共享边重复 | `arcs` 去重 | 无 | 无 |
| 样式 | 无 | 无 | 有，含图标与气泡 | 无 |
| 坐标系 | 固定 WGS84 | 固定 WGS84 | 固定 WGS84 | `.prj` 可声明多种 |
| 体积 | 大 | 较小 | 中等 | 中等 |
| 浏览器直接读取 | 可以 | 需要库 | 需要库 | 需要库 |
| 属性 | `properties`，类型自由 | `properties` | `ExtendedData` | DBF，字段名 10 字符 |

TopoJSON 更适合共享边密集的行政区数据；KML 的长处是带样式和气泡的展示；Shapefile 对应传统 GIS 流程，但字段名和几何类型限制都很明显。要归档或处理百万级要素，GeoPackage 与 FlatGeobuf 更合适。

## 转换与工具入口

从 KML 转过来，样式和气泡描述会丢；从 Shapefile 转过来，字段名能保留，但 `.prj` 声明的投影不会自动跟着走，得先做坐标转换。真要互转，用 [矢量格式转换](/zh/tools/format-convert/)；想横向比较，可以回到 [15 种格式总览](/zh/guide/vector-formats/)。

本站的转换器在浏览器里解析文件，支持 GeoJSON、TopoJSON、KML、Shapefile 等格式互转，导出统一写成 WGS84 经纬度。[地图预览](/zh/tools/map-preview/) 支持直接拖入 `.geojson` 查看位置，转换前后目视核对一次挺方便。源数据本身是投影坐标的话，先去 [投影坐标转换](/zh/tools/epsg-convert/)。

命令行下可以用 GDAL：

```bash
ogr2ogr -f GeoJSON out.geojson input.shp
```

有 `.prj` 时，`ogr2ogr` 会按声明重投影到 WGS84；没有 `.prj` 就按源坐标原样处理，结果可能落在错误位置。反向转换一律写成 WGS84，原来的投影定义不会自动恢复。

## 示例数据与解析脚本

站点提供了一份可直接下载的样例和配套解析脚本：

- [sample.geojson](/examples/data/sample.geojson)：三个要素，分别为点、线、面
- [geojson_parser.py](/examples/python/geojson_parser.py)：只用标准库的解析脚本

样例描述的是纽约时代广场：`Times Square` 是一个点，`Walk` 是通往附近地点的一条线，`Square` 是一个闭合矩形面。三个要素同在一个 `FeatureCollection` 里，属性为 `name` 与 `kind`，坐标顺序都是经度在前。

脚本接受 `FeatureCollection`、单个 `Feature` 或单个 Geometry 作为顶层对象，后两种会被包成集合，所以手写的单要素文件也能读。`crs` 成员会被忽略，坐标不做重投影；顶层类型认不出来时它会明确报错，而不是输出一个空文件。

```bash
python geojson_parser.py sample.geojson
python geojson_parser.py sample.geojson -o out.geojson --indent 0
```

输出仍是 GeoJSON `FeatureCollection`，可以用来验证文件能否被严格解析，也可以作为自己实现的对照。

## 参考与依据

- [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)：GeoJSON 的正式规范，坐标顺序、环的绕向、`crs` 移除等约定均以此为准。
- [IANA media type `application/geo+json`](https://www.iana.org/assignments/media-types/application/geo+json)：媒体类型注册信息，用于 HTTP 响应头与文件类型识别。

相关阅读：[TopoJSON](/zh/guide/topojson/)、[KML](/zh/guide/kml/)、[Shapefile](/zh/guide/shapefile/)、[15 种格式总览](/zh/guide/vector-formats/)。