---
title: GeoJSON 格式详解：结构、坐标顺序与限制 | 地理工具箱
description: GeoJSON 的 FeatureCollection、Feature 与 Geometry 结构，经纬度顺序、WGS84 约定、多边形环规则，以及它在体积、属性和坐标系上的限制。
heading: GeoJSON 格式详解：结构、坐标顺序与限制
group: vector
order: 4
readingMinutes: 5
updated: 2026-11-23
---

GeoJSON 是 Web 地理数据的事实标准。它用 JSON 表达点、线、面和属性，任何语言都能读写，浏览器可以直接解析，几乎所有 GIS 和地图库都支持。

规范是 IETF 的 RFC 7946，2016 年发布，注册的媒体类型为 `application/geo+json`。仓库里的地图预览、开放数据接口、地图组件的数据源，大多直接使用它。它的价值不在紧凑，而在通用：一个 `.geojson` 文件可以同时被浏览器、Python、PostGIS 和桌面 GIS 打开。

代价是体积和表达能力有限。理解坐标顺序、环的规则和坐标系的固定约定，可以避开大部分「文件能打开但位置不对」的问题。

## 最小示例

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

示例里点的 `coordinates` 是一对数字，面的 `coordinates` 多两层方括号：第一层是环的列表，第二层是一个环内的坐标序列。数组层级对应几何类型，多一层或少一层都会让读取程序报错或误解。

## 结构与字段表

三个层级的字段分工明确：

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

`bbox` 是可选优化，用于让读取程序在解析全部坐标前判断范围。跨越 180° 经线时，`bbox` 的写法有专门约定，不能简单取最小值和最大值；不确定时省略这个字段更稳妥。

### 坐标规则

- **顺序是经度、纬度**：`[lng, lat]`。这是 GeoJSON 最容易出错的地方，写反不会报错，只会把点放到地球另一侧。
- **固定 WGS84 经纬度**，单位为度。RFC 7946 取消了 `crs` 成员；带 `crs` 的旧文件要按其声明处理。
- **多边形用嵌套数组**：最外层是环的列表，内层是一个环的坐标。
- **环必须闭合**：首尾坐标相同；外环与洞的绕向是约定，不是所有软件都校验。
- **坐标可以有第三维**（海拔），但很多工具会忽略。
- **右手定则**：RFC 7946 建议外环逆时针、内环顺时针，同时要求读取程序不要仅因为绕向相反就拒绝数据。写数据时按建议做，读数据时不要假设绕向一定正确。
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

位置是 `[经度, 纬度]` 或 `[经度, 纬度, 海拔]`。判断嵌套层级时，可以数 `[` 的层数：点一层，线两层，面三层，多面四层。

## 常见错误与陷阱

**经纬度写反。** 现象是点落在海里、另一个大洲，或者坐标被截断。原因是把 `[纬度, 经度]` 当成了 `[经度, 纬度]`。后果是解析不报错，位置整体偏移；时代广场应为 `[-73.9855, 40.7580]`，写成 `[40.7580, -73.9855]` 会落到南半球。处理时先看数值范围：纬度绝对值超过 90 的一定写反了，除非那是投影坐标。

**多边形环没有闭合。** 现象是浏览器或桌面 GIS 不显示面，或者面积计算异常。原因是首尾坐标不同，或者环里只有 3 个位置。后果是几何无效，部分工具自动补上首点，部分直接丢弃。处理方式是在写入前补首点，并保证一个环至少有 4 个位置。

**投影坐标混进 GeoJSON。** 现象是坐标出现 `500000`、`4400000` 这种大数，地图一片空白。原因是数据来自 UTM 或高斯克吕格，没有先转到 WGS84。后果是坐标超出经纬度范围，读取程序可能裁剪、夹取或画到错误位置。处理方式是先做投影转换，再导出。

**坐标精度保留过多。** 现象是文件体积翻倍，版本差异里全是小数位变化。原因是保留了 15 位小数，而 1e-7 度在纬度上约为 1 厘米。后果是体积和解析时间增加，精度没有实际提升。处理时按用途保留 6 到 7 位，分别约 0.1 米与 1 厘米。

**把几何或大块数据塞进 `properties`。** 现象是导入某些系统后属性丢失、列类型变成文本，或者文件暴涨。原因是在属性里放 WKT、图片 base64 或深层嵌套对象，而目标系统只支持标量。后果是属性无法查询、索引失效、传输变慢。处理方式是几何放在 `geometry`，属性保持扁平，大对象单独存放。

**JSON 里写注释、尾逗号或 `NaN`。** 现象是整个文件解析失败，错误只给出行列号。原因是 JSON 标准不支持注释、尾逗号和 `NaN`、`Infinity`。后果是文件完全不可读，而 GeoJSON 没有降级解析的余地。处理方式是删除注释与尾逗号，空值用 `null`。

**用 `crs` 成员声明投影。** 现象是文件写着 `EPSG:3857`，地图却偏移或缩放异常。原因是 RFC 7946 已移除 `crs`，现代读取程序忽略它并按 WGS84 解释。后果是投影坐标被当作经纬度，位置和比例都不对。处理方式是先转换到 WGS84，不要依赖 `crs`。

## 与相邻格式对比

GeoJSON 的定位是交换与展示，不是把所有信息都存下来。同样一份数据，换成别的格式就会在体积、拓扑和样式上有所取舍。

| 项目 | GeoJSON | TopoJSON | KML | Shapefile |
|---|---|---|---|---|
| 编码 | JSON 文本 | JSON 文本 | XML | 二进制 |
| 拓扑 | 无，共享边重复 | `arcs` 去重 | 无 | 无 |
| 样式 | 无 | 无 | 有，含图标与气泡 | 无 |
| 坐标系 | 固定 WGS84 | 固定 WGS84 | 固定 WGS84 | `.prj` 可声明多种 |
| 体积 | 大 | 较小 | 中等 | 中等 |
| 浏览器直接读取 | 可以 | 需要库 | 需要库 | 需要库 |
| 属性 | `properties`，类型自由 | `properties` | `ExtendedData` | DBF，字段名 10 字符 |

TopoJSON 适合共享边密集的行政区数据；KML 适合带样式和气泡的展示；Shapefile 适合传统 GIS 流程，但字段名与几何类型限制明显。需要归档或百万级要素时，GeoPackage 与 FlatGeobuf 更合适。

## 转换与工具入口

从 KML 转 GeoJSON 会丢失样式和气泡描述；从 Shapefile 转过来时字段名会保留，但 `.prj` 声明的投影不会自动保留，需要先做坐标转换。需要实际互转时，用 [矢量格式转换](/zh/tools/format-convert/)；也可以回到 [15 种格式总览](/zh/guide/vector-formats/) 对比其他选择。

本站的转换器在浏览器里解析文件，支持 GeoJSON、TopoJSON、KML、Shapefile 等格式互转，导出统一写成 WGS84 经纬度。[地图预览](/zh/tools/map-preview/) 可以直接拖入 `.geojson` 文件查看位置，适合在转换前后做一次目视核对。源数据是投影坐标时，先到 [投影坐标转换](/zh/tools/epsg-convert/) 处理。

命令行下可以用 GDAL：

```bash
ogr2ogr -f GeoJSON out.geojson input.shp
```

有 `.prj` 时，`ogr2ogr` 会按声明重投影到 WGS84；没有 `.prj` 时按源坐标原样处理，结果可能落在错误位置。反向转换会写成 WGS84，原来的投影定义不会自动恢复。

## 示例数据与解析脚本

站点提供一份可直接下载的样例与解析脚本：

- [sample.geojson](/examples/data/sample.geojson)：三个要素，分别为点、线、面
- [geojson_parser.py](/examples/python/geojson_parser.py)：只用标准库的解析脚本

样例描述纽约时代广场：`Times Square` 是一个点，`Walk` 是一条到附近地点的线，`Square` 是一个闭合矩形面。三个要素都在同一个 `FeatureCollection` 里，属性为 `name` 与 `kind`，坐标顺序都是经度在前。

脚本接受 `FeatureCollection`、单个 `Feature` 或单个 Geometry 作为顶层对象，后两种会被包装成集合，因此手写的单要素文件也能读。`crs` 成员会被忽略，坐标不做重投影；无法识别的顶层类型会明确报错，而不是输出空文件。

```bash
python geojson_parser.py sample.geojson
python geojson_parser.py sample.geojson -o out.geojson --indent 0
```

输出仍是 GeoJSON `FeatureCollection`，适合用来验证文件能否被严格解析，或作为自己实现的对照。

## 参考与依据

- [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)：GeoJSON 的正式规范，坐标顺序、环的绕向、`crs` 移除等约定均以此为准。
- [IANA media type `application/geo+json`](https://www.iana.org/assignments/media-types/application/geo+json)：媒体类型注册信息，用于 HTTP 响应头与文件类型识别。

相关阅读：[TopoJSON](/zh/guide/topojson/)、[KML](/zh/guide/kml/)、[Shapefile](/zh/guide/shapefile/)、[15 种格式总览](/zh/guide/vector-formats/)。