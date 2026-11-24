---
title: 格式转换如何解析：16 种矢量格式的读入方式 | 地理工具箱
description: 从识别、解析到写出，逐种拆解 GeoJSON、TopoJSON、KML、GPX、GML、CSV、XLSX、WKT、DXF、GMT、MIF/MID、Shapefile、FlatGeobuf、GeoPackage 的读入规则，每种配一个最小示例。
heading: 格式转换如何解析：16 种矢量格式的读入方式与最小示例
group: vector
order: 19
readingMinutes: 7
updated: 2026-11-18
faq:
  - q: '为什么转换后坐标系没有跟着变？'
    a: '格式转换只改变文件的组织方式，不做投影计算。只有 Shapefile 自带的 .prj 会被读取，并重投影到 WGS84；其余格式一律按 WGS84 经纬度理解。源数据是投影坐标（例如 UTM 米制坐标）时，先在坐标系转换工具里转到 EPSG:4326，再回来换格式。'
  - q: '为什么 KML 里的面转到 GPX 之后就没了？'
    a: 'GPX 规范里只有航点（wpt）、轨迹（trk）和路线（rte），没有面。转换器不会静默丢弃：发现目标格式装不下的几何时，会先提示数量与类型，由你选择跳过才继续。'
  - q: '为什么 DXF 的圆变成了多边形？'
    a: 'GeoJSON 只有点、线、面，没有圆这个几何类型。读入 DXF 时，CIRCLE 会被离散成 72 个顶点的闭合多边形，ARC 会被离散成 36 段折线，后续任何目标格式都能表达。半径小时这种近似几乎看不出差别，半径大就会看到明显的折线。'
  - q: '为什么 CSV 提示识别不到经纬度列？'
    a: 'CSV 解析只认明确的列名，例如 lat、latitude、纬度、y 与 lng、lon、longitude、经度、x。列名对不上时不会去猜「第一列是经度」，而是把表头交给你手动选列，免得顺序搞反。'
---

同一份点线面数据，可能来自 GeoJSON、Shapefile、Excel、DXF 等十几种格式。要让它们互相转换，最稳妥的做法不是给每一对格式写一个转换器，而是先把数据统一收进一个中间模型，再从中间模型写出目标格式。

这篇文章讲的就是这条管线：**怎么识别、怎么解析、解析时保留什么丢掉什么**。每种格式配一个最小示例，方便对照手里的文件。

## 三步管线

### 第一步：识别格式

识别优先看内容，扩展名只作为兜底，因为 `.json` 可能是 GeoJSON 也可能是 TopoJSON，`.txt` 可能是 CSV 也可能是 WKT。判断顺序是：

1. 以 `{` 开头：按 JSON 解析，`type` 为 `Topology` 就是 TopoJSON，否则按 GeoJSON 处理；
2. 以 `<` 开头：看根元素，`gml:FeatureCollection` 为 GML，`<kml>` 为 KML，`<gpx>` 为 GPX；
3. 第一个组码是 `0 / SECTION`：DXF；
4. 以 `POINT`、`LINESTRING`、`POLYGON` 等几何关键字开头：WKT；
5. 以 `>` 开头且不止一行：GMT；
6. 以 `Version 300` 之类开头：MapInfo MIF；
7. 都不匹配时才看扩展名，最后按「有制表符没逗号 = TSV，有逗号 = CSV」收尾。

识别不出来时会明确报错，而不是猜一个格式继续读。

### 第二步：解析成统一的要素集合

所有格式最终都变成同一种结构：**要素集合**，每个要素由「几何 + 属性」组成，几何只有点、线、面及其 Multi 形式与几何集合。这一步的规则是：

- **语法错误中断**：括号不配对、XML 损坏、JSON 非法会直接报错，不会给出半份数据；
- **几何问题只记录**：环未闭合、点数不足、坐标越界、空几何会进入「问题清单」，转换继续；
- **不猜坐标系**：除 Shapefile 读取 `.prj` 外，其余格式的数值一律当作 WGS84 经纬度；
- **不静默丢数据**：读不了的实体（例如 DXF 的文字、标注）会跳过并给出警告。

### 第三步：写出目标格式

写出前会统一做三件事：按指定小数位取整坐标、可选清空空字符串与 null 属性、剔除空几何并计入警告。然后才序列化。

目标格式装不下某种几何时（例如把面写进 GPX），默认**阻止并提示**，等你确认「跳过」才继续。这是刻意的：转换工具最危险的失败方式不是报错，而是悄悄少了一半数据。

## 一张表看完 16 种输入

| 家族 | 格式 | 读入方式 | 能承载 | 最容易丢的内容 |
|---|---|---|---|---|
| JSON | GeoJSON | 原生解析 | 点线面全集 | 无（保真度最高） |
| JSON | TopoJSON | 按弧段还原 | 点线面全集 | 对象名、量化参数 |
| XML | KML | DOM + 要素映射 | 点线面全集 | 样式、图标、气泡描述 |
| XML | KMZ | 解压后读首个 KML | 点线面全集 | 同上 |
| XML | GPX | DOM + 要素映射 | 点、线 | 面、样式 |
| XML | GML | DOM + 几何元素遍历 | 点线面全集 | 复杂应用模式、非 4326 声明只提示 |
| 表格 | CSV / TSV | 表头识别经纬度列 | 点 | 线面（改用 WKT 列） |
| 表格 | XLSX | 读首个工作表后走 CSV 管线 | 点 | 样式、公式、多工作表 |
| 文本几何 | WKT | 自研分词 + 递归下降 | 点线面全集 | 属性、SRID |
| 文本几何 | GMT | 分段 ASCII | 点、线、面 | 内环、属性 |
| 文本几何 | DXF | 组码流 | 点、线、面 | 块引用、文字、属性 |
| 文本几何 | MIF/MID | MIF 几何 + MID 属性 | 点、线、面 | 文字、装饰对象 |
| 二进制 | Shapefile | shpjs + proj4 | 点线面全集 | 字段名（10 字符）、混合几何分层 |
| 二进制 | FlatGeobuf | FlatBuffers 解析 | 点线面全集 | 多图层被拆平、列类型冲突降级文本 |
| 二进制 | GeoPackage | sql.js 读 SQLite | 点线面全集 | 多图层只取一张表、样式表 |

## JSON 系

### GeoJSON

最直接的一种：`FeatureCollection` 里的每个 `Feature` 有 `geometry` 与 `properties`。解析时三种入口都接受——完整集合、单个 Feature、单个 Geometry，后两种会包装成一个要素。坐标一律「经度在前」，单位是度。示例用纽约时代广场：美国位于西半球，经度是负值，符号不影响解析。

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "时代广场" },
      "geometry": { "type": "Point", "coordinates": [-73.9855, 40.7580] }
    }
  ]
}
```

读入时未知的几何类型会被丢弃并标记为无效要素；`GeometryCollection` 会保留嵌套结构，写出成其他格式时再展开。

### TopoJSON

TopoJSON 把共享边界抽成 `arcs`，几何只记弧段编号，因此同样一片行政区的体积可能只有 GeoJSON 的几分之一。解析时逐个展开 `objects` 里的对象，再合并成一个要素集合。

```json
{
  "type": "Topology",
  "objects": {
    "stations": {
      "type": "GeometryCollection",
      "geometries": [
        { "type": "Point", "coordinates": [-73.9855, 40.7580], "properties": { "name": "时代广场" } }
      ]
    }
  },
  "arcs": []
}
```

注意 `arcs` 是数组的数组：省体积靠的就是这里只存一次共享边界。多个对象展开后会按顺序拼进同一个集合，对象名不会保留。

## XML 系

### KML 与 KMZ

KML 的坐标写在 `<coordinates>` 里，顺序是**经度,纬度,高程**，跟 GPX 的 `lon` / `lat` 属性写法不同。读取后样式（颜色、图标、线宽）会被丢弃，保留几何与名称、描述等文本字段。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>时代广场</name>
      <Point><coordinates>-73.9855,40.7580,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>
```

KMZ 就是 ZIP 包：解压后取第一个 `.kml` 按 KML 读。本站导出 KMZ 时固定打包成 `doc.kml`。

### GPX

GPX 只有航点、轨迹、路线三类。`wpt` 读成点，`trk` 与 `rte` 读成线；高程、时间等标签转成属性。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Geo Toolbox" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="40.7580" lon="-73.9855"><name>时代广场</name></wpt>
  <trk>
    <name>步行</name>
    <trkseg>
      <trkpt lat="40.7580" lon="-73.9855"/>
      <trkpt lat="40.7527" lon="-73.9772"/>
    </trkseg>
  </trk>
</gpx>
```

GPX 表达不了面。把面写进 GPX 时会先提示「多少个面装不下」，确认跳过才写。属性也受限：除了 `name`，其余字段会被合并进 `desc` 文本。

### GML

GML 是 OGC 的 XML 编码。解析器先找 `featureMember`（或 `member`）里的要素元素，再在要素内部找第一个几何元素，坐标来源支持 `gml:pos`、`gml:posList` 与 `gml:coordinates` 三种写法。要素下的其他子元素按「标签名 → 文本值」变成属性。

```xml
<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="urn:app">
  <gml:featureMember>
    <app:station>
      <app:name>时代广场</app:name>
      <app:geom>
        <gml:Point srsName="EPSG:4326"><gml:pos>-73.9855 40.7580</gml:pos></gml:Point>
      </app:geom>
    </app:station>
  </gml:featureMember>
</gml:FeatureCollection>
```

`srsName` 不是 EPSG:4326 / CRS84 时只给警告，不做投影变换；曲线、曲面、嵌套的应用模式字段不展开。

## 表格系

### CSV 与 TSV

表格格式只承载点。解析时用表头识别两列：

- 纬度：`lat`、`latitude`、`纬度`、`緯度`、`wgs84lat`、`latdeg`、`gpslat`、`y`
- 经度：`lng`、`lon`、`long`、`longitude`、`经度`、`經度`、`wgs84lng`、`lngdeg`、`gpslng`、`x`

比较时会忽略大小写、空格、下划线、连字符和括号。识别不到就停下来让你手动选列，不猜。

```csv
lng,lat,name
-73.9855,40.7580,时代广场
-73.9772,40.7527,中央车站
```

数值必须是十进制小数，度分秒写法不支持（需要先转成十进制度）。经纬度缺失或无法解析的行会跳过，并计入问题清单。TSV 只是分隔符换成制表符，所以文件里有制表符而没有逗号时会被优先识别成 TSV。

导出时会看数据里有没有非点几何：**全是点**就写 `lng,lat` 加属性列；**只要含线或面**就改用 `wkt` 列，避免信息丢失。

### Excel（XLSX / XLS）

Excel 本质是 ZIP 包里的 XML。读入时只取**第一个工作表**，把单元格读成矩阵，再转成 CSV 交给同一套列识别逻辑。所以「手动选列」「跳过坏行」的行为跟 CSV 完全一致，不会出现两套规则。

| lng | lat | name |
|---|---|---|
| -73.9855 | 40.7580 | 时代广场 |
| -73.9772 | 40.7527 | 中央车站 |

导出只写一个工作表，不含样式、公式、多个 sheet 与图表，换来的是文件很小、任何表格软件都能打开。

## 文本几何系

### WKT

WKT 用一行文本描述一个几何，括号表达嵌套层级。解析器是自研的分词器，括号不配对时能指出**第几列出错**，而不是只回一句「格式错误」。

```wkt
POINT (-73.9855 40.7580)
LINESTRING (-73.9855 40.7580, -73.9772 40.7527)
POLYGON ((-73.9864 40.7572, -73.9846 40.7572, -73.9846 40.7586, -73.9864 40.7586, -73.9864 40.7572))
```

支持 7 种几何与 XY / XYZ / XYM / XYZM 四种维度；M 值会被丢掉并提示。多边形的环不闭合时会自动补上首点并给出警告。输入按行读取，一行一个几何，因此可以一次粘贴多条。输出不带属性，也不写 SRID 前缀——坐标系是另一件事。

### GMT

GMT 的纯文本格式没有官方规范，通行约定是：`>` 开头一行是段头，随后每行一个 `x y` 坐标。解析时一个段对应一个要素，段头文字作为名称；单点写成点，首尾相同且不少于 4 个点时写成面，其余写成线。

```
> 时代广场
-73.9855 40.7580
> 步行
-73.9855 40.7580
-73.9772 40.7527
```

纯文本无法表达内环（洞），写出时会丢弃并警告；一个要素里的多个部件会被拆成多个段。

### DXF

DXF 是「组码 + 值」逐行交替的文本：`0` 表示实体类型，`8` 表示图层，`10` / `20` 是 X / Y 坐标。解析器读出实体流后只处理二维基础实体：

- `POINT` → 点
- `LINE`、`LWPOLYLINE`、`POLYLINE`（含后续 `VERTEX`）→ 线或面
- `CIRCLE` → 72 个顶点的闭合多边形
- `ARC` → 36 段折线

```
0
SECTION
2
ENTITIES
0
POINT
8
0
10
-73.9855
20
40.7580
0
ENDSEC
0
EOF
```

图层名不是 `0` 时会写成 `layer` 属性，其余属性无法写进基础实体，导出时统一提示「属性已丢弃」。DXF 文件本身不声明坐标系，读入的数值按原样当作经纬度，投影坐标请先转换。

### MIF/MID

MapInfo 用一对文件：`.mif` 存几何与表结构，`.mid` 存逐行属性。解析支持 `Point`、`Line`、`Pline`、`Region` 四类对象，`Text`、`Rect`、`Ellipse` 等装饰对象跳过。

```text
Version 300
Charset "UTF-8"
Delimiter ","
Columns 1
  name Char(254)
Data
Point -73.9855 40.7580
```

```
时代广场
```

为了只给你一个下载项，导出会打包成 ZIP（`data.mif` + `data.mid`）；导入时既接受这个 ZIP，也接受单个 `.mif`（此时没有属性）。

## 二进制容器系

### Shapefile

Shapefile 是一组文件的集合，必须打包才能一次上传：

```
stations.zip
├── stations.shp   # 几何
├── stations.shx   # 索引
├── stations.dbf   # 属性
├── stations.prj   # 坐标系
└── stations.cpg   # 编码
```

读取时用 shpjs 解析，有 `.prj` 就按声明坐标系重投影到 WGS84——这是整条管线里**唯一**会做投影变换的地方；没有 `.prj` 则按 WGS84 处理并警告。ZIP 里有多个 `.shp` 时只读第一个图层，同样会提示。

导出时按几何类型拆图层（Shapefile 一个图层只能容纳一种几何），同时写出 `.prj` 与 `.cpg`，字段名受 DBF 限制会被截到 10 个字符。

### FlatGeobuf（.fgb）

FlatGeobuf 用 FlatBuffers 存要素，并在文件头之后带一棵打包的 R-tree，适合流式读取与大数据量。它是**单图层**容器，多图层读入后会拆平成一个集合。

导出前会把属性列对齐成并集：缺列补 null，同一列出现数字与文本混用时统一降级为文本并给出警告。

### GeoPackage（.gpkg）

GeoPackage 是一个 SQLite 数据库，几何以「`GP` 魔数 + WKB」的 blob 存在普通表里，可以直接用 SQL 查询与索引。

```
gpkg_contents          -- 有哪些图层、范围、SRS
gpkg_geometry_columns  -- 几何列名与几何类型
features               -- id | geom(BLOB) | 业务字段…
```

读取用 sql.js 在浏览器里打开数据库，读出几何 blob 再转成统一模型。导出固定写单表 `features`、几何列 `geom`、SRS 4326；属性类型跨要素推断，混合类型降级为 TEXT，空几何写 NULL 并计入警告。

## 解析后的统一校验

不管来自哪种格式，进入中间模型后都会跑同一套检查，结果列在「问题清单」里：

- **环未闭合**：多边形首尾点不一致，或点数不足 4 个；
- **坐标越界**：经度超出 ±180 或纬度超出 ±90 —— 通常意味着源文件其实是投影坐标；
- **空几何**：要素存在但没有几何；
- **表格行问题**：经纬度缺失、无法解析的行被跳过。

清单最多显示 200 条，避免大文件把页面撑满。这些问题都不会中断转换，但值得在下载前看一眼。

## 边界与限制

- 单文件 20 MB、最多 5 万个要素，超出会明确提示；
- 预览只渲染前 20 条要素或前 200 行文本，下载拿到的是完整结果；
- 文本格式可以直接粘贴，Shapefile / KMZ / XLSX / FlatGeobuf / GeoPackage 等二进制格式必须上传文件；
- 转换器不做坐标系变换。需要换坐标系时，先在坐标系工具里转到 WGS84，再回来换格式。

## 16 种格式的 Python 示例

每种格式都有一份**独立可运行**的 Python 脚本，不依赖本仓库的包，下载后直接执行即可：

```bash
python kml_parser.py data.kml                 # 打印 GeoJSON
python kml_parser.py data.kml -o out.geojson  # 写入文件
```

脚本统一输出 GeoJSON `FeatureCollection`，注释与文档为英文；除 WKT / XLSX / DXF / Shapefile / FlatGeobuf / GeoPackage 需要装一个第三方库外，其余只用标准库。

每种格式还配了一份**可直接下载的样例数据**。所有样例描述同一组内容——时代广场的点、到中央车站的线、一个矩形面，可以拿去跑上面的脚本：

| 格式 | 脚本 | 样例数据 |
|---|---|---|
| GeoJSON | [geojson_parser.py](/examples/python/geojson_parser.py) | [sample.geojson](/examples/data/sample.geojson) |
| TopoJSON | [topojson_parser.py](/examples/python/topojson_parser.py) | [sample.topojson](/examples/data/sample.topojson) |
| KML | [kml_parser.py](/examples/python/kml_parser.py) | [sample.kml](/examples/data/sample.kml) |
| KMZ | [kmz_parser.py](/examples/python/kmz_parser.py) | [sample.kmz](/examples/data/sample.kmz) |
| GPX | [gpx_parser.py](/examples/python/gpx_parser.py) | [sample.gpx](/examples/data/sample.gpx) |
| GML | [gml_parser.py](/examples/python/gml_parser.py) | [sample.gml](/examples/data/sample.gml) |
| CSV | [csv_parser.py](/examples/python/csv_parser.py) | [sample.csv](/examples/data/sample.csv) |
| TSV | [tsv_parser.py](/examples/python/tsv_parser.py) | [sample.tsv](/examples/data/sample.tsv) |
| XLSX | [xlsx_parser.py](/examples/python/xlsx_parser.py) | [sample.xlsx](/examples/data/sample.xlsx) |
| WKT | [wkt_parser.py](/examples/python/wkt_parser.py) | [sample.wkt](/examples/data/sample.wkt) |
| GMT | [gmt_parser.py](/examples/python/gmt_parser.py) | [sample.gmt](/examples/data/sample.gmt) |
| DXF | [dxf_parser.py](/examples/python/dxf_parser.py) | [sample.dxf](/examples/data/sample.dxf) |
| MIF/MID | [mif_parser.py](/examples/python/mif_parser.py) | [sample.mif](/examples/data/sample.mif) + [sample.mid](/examples/data/sample.mid) |
| Shapefile | [shapefile_parser.py](/examples/python/shapefile_parser.py) | [sample-shapefile.zip](/examples/data/sample-shapefile.zip) |
| FlatGeobuf | [flatgeobuf_parser.py](/examples/python/flatgeobuf_parser.py) | [sample.fgb](/examples/data/sample.fgb) |
| GeoPackage | [geopackage_parser.py](/examples/python/geopackage_parser.py) | [sample.gpkg](/examples/data/sample.gpkg) |

Shapefile 一个图层只能容纳一种几何，所以样例是点图层（两个点）；MIF/MID 是成对文件，两个都要下载放在同一目录。

## 相关阅读

- [15 种矢量数据格式总览与选型](/zh/guide/vector-formats/)
- [GeoJSON 格式详解](/zh/guide/geojson/)、[TopoJSON 格式详解](/zh/guide/topojson/)
- [KML 与 KMZ 格式详解](/zh/guide/kml/)、[GPX 格式详解](/zh/guide/gpx/)、[GML 格式详解](/zh/guide/gml/)
- [CSV 与 TSV 坐标格式详解](/zh/guide/csv-tsv/)、[Excel 坐标数据详解](/zh/guide/excel/)
- [WKT 格式详解](/zh/guide/wkt/)、[DXF 格式详解](/zh/guide/dxf/)、[GMT 格式详解](/zh/guide/gmt/)、[MIF/MID 格式详解](/zh/guide/mif-mid/)
- [Shapefile 格式详解](/zh/guide/shapefile/)、[GeoPackage 格式详解](/zh/guide/geopackage/)、[FlatGeobuf 格式详解](/zh/guide/flatgeobuf/)