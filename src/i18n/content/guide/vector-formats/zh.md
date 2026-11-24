---
title: 15 种矢量数据格式总览与选型 | 地理工具箱
description: GeoJSON、KML、GPX、Shapefile、GeoPackage、FlatGeobuf、DXF 等 15 种矢量格式的分组、适用场景、文本与二进制差异，以及转换时最容易丢失的内容。
heading: 15 种矢量数据格式总览与选型
group: vector
order: 3
readingMinutes: 4
updated: 2026-11-23
---

同一份点线面数据，能存成 GeoJSON、KML、GPX、Shapefile、GeoPackage、FlatGeobuf 等十几种格式。选错了通常当场不报错，问题要等到交付、导入，或者换台软件打开时才冒出来。

这页只做总览。各个格式的字段结构、代码示例和转换陷阱，都放在对应的详解页里。

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

**文本格式**能直接打开看，能用 Git 比对差异，也能用脚本生成：GeoJSON、TopoJSON、KML、GPX、GML、CSV、TSV、WKT、GMT、MIF/MID，以及大多数 DXF。

**二进制或容器格式**体积更小、读写更快，代价是必须靠对应的软件或库来读：KMZ（ZIP 包）、Excel（ZIP 包）、Shapefile（多文件组合）、GeoPackage（SQLite 数据库）、FlatGeobuf（FlatBuffers 二进制）。

常见的误判是：KMZ 和 Excel 从扩展名看像「一种格式」，其实都是 ZIP 容器，改个后缀解压，里面的 XML 文件就露出来了。

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

1. **坐标系声明**：GeoJSON 按规范固定为 WGS84；Shapefile 靠 `.prj`；GPKG 把 EPSG 记在数据库里。转换前先确认源坐标系，别靠猜。
2. **属性字段**：Shapefile 字段名上限 10 个字符，一个图层只放一种几何；Excel 会把长数字变成科学计数法；CSV 没有编码声明时，中文很容易乱码。
3. **几何细节**：GPX 存不了面；KML 对多部件面的写法支持不全；DXF 的圆弧和块参照转完可能成了折线。
4. **样式与附件**：KML 的图标、颜色、图片描述转成 GeoJSON 后就没了；KMZ 解包后的附件还得单独处理。

## 常见错误与陷阱

格式本身很少报错，坑大多埋在对坐标系、字段能力和体积的假设里。

1. **经纬度顺序颠倒**
   - 现象：点位整体镜像，或者经度占了纬度该在的位置。
   - 原因：GeoJSON 和多数接口按「经度、纬度」排，CSV 表头却写成 lat,lng，整理时照着抄了顺序。
   - 后果：所有要素都错位，可地图上形状照画，肉眼很难看出来。
   - 处理：按数值范围判断，经度不超过 ±180、纬度不超过 ±90；列名和顺序一起核对，不能只看表头。

2. **用 Excel 直接改坐标列**
   - 现象：坐标末尾几位成了零，行政区代码变成科学计数法。
   - 原因：Excel 会自动推断数字类型，超过 15 位的整数丢精度，前导零也被抹掉。
   - 后果：精度损失无法靠再次导出挽回，位置偏移从厘米到公里都有。
   - 处理：导入时把坐标列设成文本，或者让转换工具直接读原始文件，别在表格里手动改数。

3. **把格式转换当成坐标系转换**
   - 现象：文件打得开，属性也全，位置却整体偏了几千公里。
   - 原因：GeoJSON、KML、GPX 都按 WGS84 经纬度解释，而源数据其实是 CGCS2000 投影坐标。
   - 后果：位置显示错，接着距离、面积、空间查询全部失效。
   - 处理：先确认源坐标系，换成经纬度，再改格式。

4. **忽略字段名与单图层限制**
   - 现象：Shapefile 导入后字段名被截断或撞名，面图层里的点要素不见了。
   - 原因：Shapefile 字段名最长 10 个字符，一个图层只能装一种几何类型。
   - 后果：属性对不上号，要素被悄悄丢掉，往往到做统计时才发现。
   - 处理：输出前先改名、拆图层；有得选就换成 GeoPackage。

这几类格式对坐标系、属性、体积的假设各不相同。GeoJSON 按规范固定 WGS84，坐标是经纬度顺序；KML、GPX 同样用经纬度。Shapefile 靠 `.prj`，GeoPackage 把 EPSG 写进数据库，FlatGeobuf 在文件头记坐标系，缺了就只能按约定去猜。属性能力也差得远：Shapefile 字段名受限，GeoJSON 是自由键值，GeoPackage 更像数据库表，CSV 只有一层表头。体积和读写方式大致成反比，文本便于阅读和比对，二进制更适合百万级要素和移动端。规范依据见 [OGC 简单要素模型](https://www.ogc.org/publications/standard/sfa/)、[RFC 7946](https://www.rfc-editor.org/rfc/rfc7946) 与 [geopackage.org](https://www.geopackage.org/)。

## 选型对照

| 目标 | 首选 | 备选 | 注意 |
|---|---|---|---|
| Web 接口与程序处理 | GeoJSON | TopoJSON | 坐标按经纬度顺序，文件偏大 |
| 交付给非 GIS 用户 | KML / KMZ | GeoJSON | 样式与图标随格式保留 |
| 长期存档与大数据读取 | GeoPackage | FlatGeobuf | 记录 EPSG，带属性与空间索引 |
| 表格协作与批量计算 | CSV / TSV | Excel | 明确坐标系与编码 |

## 本站工具与示例

需要互转时，[矢量格式转换](/zh/tools/format-convert/) 覆盖了上表里的主要格式，导出 GPX、CSV 这类受限格式前会提示哪些要素会丢。想确认转换结果落在正确位置，用 [地图速览](/zh/tools/map-preview/) 叠一层底图看；位置整体偏移的话，先用 [投影坐标转换](/zh/tools/epsg-convert/) 换成 WGS84，再回格式转换。单条几何的写法和环闭合规则见 [WKT](/zh/guide/wkt/)；已经切好的矢量瓦片，用 [MVT 解析](/zh/tools/mvt/) 看图层和属性。

转换本身不难，难的是事先知道哪些东西会消失。真需要互转，用 [矢量格式转换](/zh/tools/format-convert/)。