---
title: '矢量格式转换：GeoJSON、KML | 地理工具箱'
description: '在 GeoJSON、KML/KMZ、GPX、Shapefile、GeoPackage、FlatGeobuf、CSV/Excel、WKT、TopoJSON 等十余种矢量格式之间互转，保留属性，文件不上传、全部本地处理。'
updated: 2026-11-23
faq:
  - q: '文件会被上传到服务器吗？'
    a: '不会。文件通过浏览器的 File API 读入当前标签页内存，转换也在本地完成，没有上传请求。关闭页面或刷新后数据即销毁，本站也不会把内容写入浏览器本地存储。这是本工具与多数在线转换器最根本的区别。'
  - q: '为什么转换后的坐标位置看起来不对？'
    a: '本工具只做格式转换，不做坐标系变换。GeoJSON、KML、GPX 都按 WGS84 语义处理；源数据若是 CGCS2000 等投影坐标，直接转格式会保留原始数值，地图上的位置就会错位。请先用「投影坐标转换（EPSG）」把数据换成 WGS84 经纬度，再回到这里。'
  - q: 'GPX 为什么不支持面？'
    a: 'GPX 规范只定义了航点（wpt）、路线（rte）和轨迹（trk），没有表达多边形的方式。目标格式选 GPX 而数据里有面要素时，工具会先告诉你受影响的要素数量与类型，只有你明确选择「跳过这些要素」后才继续，不会静默丢数据。'
  - q: 'CSV 输出的格式是什么样的？'
    a: '所有要素都是点时，输出为 lng,lat 两列加原有属性列；只要存在线或面，就改成一列 WKT 几何加属性列。这样任何几何类型都不会在 CSV 里丢失。下载前结果区会显示当前采用的是哪一种形态。'
  - q: 'FlatGeobuf 与 GeoPackage 支持到什么程度？'
    a: '两者都按单图层处理：FGB 读写一个要素集合，GPKG 只读取第一个要素图层，并提示其余图层数量。导出 GPKG 固定为 EPSG:4326、表名 features、几何列 geom；属性列类型跨要素推断，类型冲突时降级为文本，嵌套对象转成 JSON 字符串。FGB 的列结构由首条要素推断，工具会先对齐所有要素的属性列，类型不一致时统一为文本。两种格式都是二进制，页面内不提供预览；空几何写入 NULL，并在结果区提示。'
---

## 这个工具解决什么问题

同一份地理数据，换个软件就换一种格式要求：桌面 GIS 偏好 GeoJSON 或 TopoJSON，Google Earth 要 KML/KMZ，GPS 设备与运动应用要 GPX，数据分析和报表要 CSV，数据库与开发联调又常用 WKT；数据量大时、或者在 GIS 数据库之间倒腾时，FlatGeobuf 与 GeoPackage 越来越常见。转换本身不难，难的是找一个不用注册、不用上传、还能把属性与几何都留住的工具。

本工具把整条链路放在浏览器里：选源格式与目标格式 → 读取 → 解析 → 摘要与校验 → 预览 → 下载。文件不会离开你的设备。

## 支持的格式

输入支持 GeoJSON、KML、KMZ、GPX、CSV/TSV、Excel（XLSX/XLS）、GML、DXF、GMT、MIF/MID、TopoJSON、WKT、FlatGeobuf（FGB）与 GeoPackage（GPKG），以及打包为 ZIP 的 Shapefile（`.shp/.dbf/.shx/.prj`）。输出支持 GeoJSON、KML、KMZ、GPX、CSV、XLSX、GML、DXF、GMT、MIF/MID、TopoJSON、WKT、FlatGeobuf、GeoPackage 与 Shapefile ZIP。输入输出为同一格式也允许提交，此时等同「格式化 + 校验」，结果区会说明。

各格式的边界最好先知道：Excel 只读第一个工作表，经纬度列规则与 CSV 相同；GML 覆盖常见的简单要素（Point/LineString/Polygon 及其 Multi 形式），复杂应用模式不展开；DXF 只处理 ASCII 二维实体（POINT、LINE、LWPOLYLINE、POLYLINE、CIRCLE、ARC），不带属性，CAD 坐标也不声明地理坐标系；GMT 是纯文本约定，多边形内环没法表达；MIF/MID 输出会打包成含 `data.mif` 与 `data.mid` 的 ZIP，读取时源格式要显式选 MIF/MID，否则 `.zip` 会按 Shapefile 处理。碰上这些情况，结果区会给警告，而不是静默丢弃。

页面顶部的「源格式」和「目标格式」互相独立。源格式默认「自动识别」，按文件扩展名和内容判断，也可以手动指定。同一段文本有两种合理解释时——纯逗号分隔的内容既像 CSV 又像坐标列表、`.json` 既可能是 GeoJSON 也可能是 TopoJSON、XML 头难以区分 KML 与 GPX——手动指定能避免误判。指定之后严格按所选格式解析，失败不会偷偷退回自动识别，这样错误才暴露得出来。目标格式只决定输出，切换它不会重新解析输入。

Shapefile 要先把 `.shp`、`.dbf`、`.shx` 与 `.prj` 一起打包成 ZIP 再上传，一次只读第一个图层。ZIP 里带 `.prj`，工具按其声明的坐标系把坐标重投影到 WGS84；没有 `.prj` 就按 WGS84 原样处理，摘要区会提示。

导出 Shapefile 会生成一个 ZIP，内含 `.shp/.shx/.dbf/.prj/.cpg`，坐标统一为 WGS84，属性以 UTF-8 写入 DBF。一个 Shapefile 图层只能容纳一种几何类型，点、线、面混在一起就会被拆成多个图层；DBF 字段名限 10 个字符，超长或含非 ASCII 字符时自动重命名并在结果区提示。Shapefile 是二进制格式，页面内不提供文本预览，下载后能直接用 QGIS 或 ArcGIS 打开。

FlatGeobuf（`.fgb`）和 GeoPackage（`.gpkg`）同样是二进制，只在浏览器里按需加载解码器，页面内不给预览。两者都按单图层处理：FGB 把输入要素写成一个集合；GPKG 只读第一个要素图层，并在结果区提示其余图层数量。导出 GPKG 会生成一个 SQLite 数据库，表名 `features`，几何列名 `geom`，坐标系固定 EPSG:4326；属性列类型跨要素推断，数字与布尔混用或出现嵌套对象时降级为文本，对象与数组转成 JSON 字符串。FGB 的列结构由首条要素推断，工具先对齐所有要素的属性列，类型不一致就统一为文本并给出警告。两者都会保留全部要素，空几何写入 NULL 并计入警告，不会静默丢行。

CSV/TSV 会自动认常见的经纬度列名，比如 `lat/lng`、`latitude/longitude`、`纬度/经度`、`y/x`。认不出来不猜列，而是列出表头让你手动选。文件编码默认按 UTF-8 读；旧版中文数据可以切到 GBK / GB18030 重试。

## 属性、几何与降级

默认保留全部属性。目标格式能力有限时，工具给出明确的降级选项：GPX 只能承载 name 与 description，你可以选「保留 name 与 desc，其余属性合并进描述」或「仅保留 name」。

目标格式不支持某类几何，工具不会静默丢弃：比如 GeoJSON 的面数据转 GPX，会先列出受影响的要素数量与类型，让你选跳过还是换格式。空几何、坐标超出经纬度范围、多边形环未闭合等问题会进「问题清单」，但不阻断转换——可以先转完，再回头处理数据质量。

## 坐标、取整与预览

转换过程不做坐标系变换。摘要区常驻一条警告：数据若不是 WGS84，位置可能偏移，应先用坐标系或投影转换工具处理。

高级选项有三个开关：缩进美化 / 压缩单行、坐标小数位截断（0~12，默认 7 位）、移除空属性。预览只渲染前 200 行文本，下载的是完整结果；要素结构树只展示前 20 条，免得大文件拖慢页面。

## 限额与隐私

单个文件上限 20 MB，最多 50,000 个要素；粘贴文本上限 200,000 字符。超限时会明确告知实际数值与限额，不会硬着头皮处理。文件只在当前标签页内存里，不上传、不写本地存储，关闭页面即销毁。

## 国内数据源与中文编码

国内公开数据多以 Shapefile（CGCS2000）或 GDB 分发，GeoJSON 反而少见。GDB 不是本工具的输入格式，得先在 QGIS 或 ArcGIS 里导出为 Shapefile 或 GeoPackage。Shapefile 带 `.prj` 时，导入会按声明转换到 WGS84；CGCS2000 与 WGS84 的差异在厘米级，坐标数值几乎不变。

高德、腾讯开放平台返回 GCJ-02 坐标，百度返回 BD-09。把接口结果存成 CSV 再转成 GeoJSON，只是换了容器，偏移还在：这些坐标与 WGS84 相差 50~500 米，叠到 OSM 或天地图底图上会整体错位。要与卫星影像对齐，先做纠偏，再进本工具。

编码是另一个常见麻烦。Excel 另存为 CSV 时默认使用本地编码，中文 Windows 下通常是 GB18030；工具在 CSV/TSV 的导入选项里提供 UTF-8 与 GBK/GB18030 两种选择，选错了属性里的中文会变乱码，坐标列不受影响。Shapefile 的属性由 DBF 承载，带 `.cpg` 且声明 UTF-8 时中文正常，缺少 `.cpg` 的旧数据按 GBK 读取。DBF 字段名上限为 10 个字符，较长的中文名会在导出时被重命名并提示。

## 参考与依据

- [RFC 7946：GeoJSON 格式规范](https://datatracker.ietf.org/doc/html/rfc7946)
- [OGC KML 标准](https://www.ogc.org/standards/kml/)
- [GeoPackage 规范](https://www.geopackage.org/spec/)