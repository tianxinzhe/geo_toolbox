---
title: GML 格式详解：OGC XML 要素与轴序 | 地理工具箱
description: GML 的 FeatureCollection、featureMember、gml:pos 与 srsName 结构，命名空间规则，以及 EPSG:4326 轴序歧义和体积问题。
heading: GML 格式详解：OGC XML 要素与轴序
group: vector
order: 11
readingMinutes: 4
updated: 2026-11-23
---

GML（Geography Markup Language）是 OGC 的 XML 编码标准。GeoJSON 普及之前，它是 Web 地理数据交换的主力，至今仍广泛出现在 OGC 服务、行业平台和政务数据中。

## 最小可用示例

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gml:FeatureCollection
    xmlns:gml="http://www.opengis.net/gml/3.2"
    xmlns:app="https://example.com/app">
  <gml:featureMember>
    <app:station>
      <app:name>天安门</app:name>
      <app:location>
        <gml:Point srsName="EPSG:4326">
          <gml:pos>116.3974 39.9088</gml:pos>
        </gml:Point>
      </app:location>
    </app:station>
  </gml:featureMember>
</gml:FeatureCollection>
```

- **要素与几何分离**：业务属性放在自定义命名空间（`app:`），几何放在 `gml:` 元素里。
- **`srsName` 声明坐标系**，EPSG 代码或 URI 都行。
- **`gml:pos` 写坐标**，多点、线、面用 `gml:posList`。
- **`featureMember`** 在新版 GML 里也写作 `featureMembers`，读取时两种都要兼容。

同一份数据还可以用 `gml:featureMembers` 一次包住多个要素，省掉重复的外层标签。两种写法语义相同，只是 XSD 里的元素名不一样，按 schema 校验时不能混着用。

## 结构与字段说明

GML 本身是一组 XML Schema，不是某个固定结构。实际文件通常遵循某个应用模式，只用到其中一部分元素。下表列的是通用解析器最常打交道的部件。

| 元素或属性 | 是否必需 | 常见取值或单位 |
| --- | --- | --- |
| `gml:FeatureCollection` | 通常作为根元素 | 要素集合容器，也可被其他元素替代 |
| `gml:featureMember` / `gml:featureMembers` | 至少一处 | 每个成员包含一个要素 |
| 要素元素 | 必需 | 由应用模式定义，常使用自定义命名空间 |
| `gml:Point`、`gml:LineString`、`gml:Polygon` | 要素内通常有 | 也可用 `curve`、`surface` 等别名 |
| `srsName` | 建议声明 | EPSG 代码或 `urn:ogc:def:crs:EPSG::4326` 一类 URI |
| `gml:pos` | 单个坐标时使用 | 数字空格分隔，顺序随坐标系定义 |
| `gml:posList` | 线、面使用 | 一维数字串，可用 `srsDimension` 声明维数 |
| `gml:boundedBy` | 可选 | 用 `Envelope` 的 `lowerCorner` 与 `upperCorner` 给出范围 |
| `xsi:schemaLocation` | 可选 | 指向 XSD，供校验与工具识别模式 |

GML 的坐标没有统一单位。经纬度用十进制度，投影坐标用米或英尺，全看 `srsName` 指向哪个坐标系。`srsName` 可以写在几何元素上，也可以写在祖先元素上往下继承，解析时不能只盯当前节点。

`xsi:schemaLocation` 只是个提示，解析器不一定会联网校验；离线环境下通常按元素名和命名空间做宽松读取。需要严格校验，就把 XSD 存到本地，并确认版本与文件声明一致。

## 轴序歧义

EPSG:4326 的官方轴序是**纬度在前**，但大量实际文件按经度在前书写。仅凭 `srsName` 分不出来，得结合数值范围（经度通常 -180~180，纬度 -90~90）和数据提供方的说明。

轴序问题在 GML 里比别的格式更扎眼，因为 GML 严格遵循坐标系定义，而多数桌面工具和手写文件习惯经度在前。中国的经纬度范围还能靠数值大小判断；数据要是靠近赤道或本初子午线，两种解释都"看起来合理"，那就只能翻数据说明，或者对照已知地物。

## 常见错误与陷阱

- **命名空间缺失或前缀不一致**：现象是解析器报未绑定前缀、找不到元素；原因是 `xmlns:gml` 未声明，或者写了 `gml2:` 却按 `gml:` 去读；后果是整个文档解析失败。
- **GML 版本混用**：现象是 schema 校验失败，或几何元素认不出来；原因是文件声明了 GML 3.2 命名空间，却照 2.x 的结构书写；后果是严格校验直接拒绝，宽松解析器则静默丢掉部分内容。
- **经纬度轴序判断错误**：现象是点整体偏移或翻转；原因是把官方轴序当成了书写顺序；后果是位置错了却不报错，空间查询和叠加结果都不可信。
- **`posList` 分隔符写错**：现象是坐标数量对不上，或数值解析失败；原因是用逗号分隔坐标元组；后果是线面几何错位，甚至生成一条穿越整个地图的折线。
- **属性名带命名空间前缀**：现象是转换后字段名变成 `app:name` 一类字符串；原因是直接按原始标签输出；后果是下游按 `name` 匹配字段时全部落空。
- **非 4326 坐标未投影**：现象是数据落到地图范围之外；原因是误以为工具会自动换算 `srsName`；后果是需要重新投影才能使用，已生成的派生数据也要重做。

## 限制

- **体积冗长**：同样的点数据，GML 常比 GeoJSON 大数倍。
- **命名空间严格**：漏掉 `xmlns` 或前缀不匹配会直接解析失败。
- **结构自由度高**：不同行业的 GML 应用模式差异很大，通用解析器只能处理常见几何。
- **不是为浏览器设计的**：前端直接解析成本高。

GML 还支持曲线、曲面、覆盖和拓扑等扩展类型，这些超出了多数轻量解析器的实现范围。遇到数学定义的圆弧或复杂应用模式，一般得上 GDAL、GeoServer 或专门的 schema 感知库，标准库的 XML 解析器搞不定。

应用模式还会规定字段的必填性和类型。通用转换器只保留文本，数字、日期和代码表都可能退化成字符串，下游得再转一次才能恢复语义。

## 与相邻格式对比

| 维度 | GML | KML | GeoJSON |
| --- | --- | --- | --- |
| 语法 | XML，命名空间严格 | XML，结构固定 | JSON |
| 坐标系 | 由 `srsName` 指定，可投影 | 固定 WGS84 | 固定 WGS84 |
| 属性能力 | 强，由应用模式定义 | 较弱，靠 `ExtendedData` | 有 `properties` |
| 体积 | 大，标签重复 | 中 | 小 |
| 典型场景 | WFS、政务与行业数据 | Google Earth、展示分发 | Web 接口、前端渲染 |

GML 和 KML 都是 XML，目标却不一样。KML 面向展示，样式、图标和时间轴是核心，坐标系固定；GML 面向数据交换，坐标系和属性结构都能扩展，代价是体积和解析复杂度。GeoJSON 取了中间的轻量路线，属性简单、对浏览器友好，但表达复杂应用模式和投影坐标就吃力了。

## 转换与工具入口

GML 转 GeoJSON 时，属性名可能带着命名空间前缀，需要清理；`srsName` 若不等于 EPSG:4326，坐标不会自动转换。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)，文本几何写法见 [WKT](/zh/guide/wkt/)，展示导向的结构见 [KML](/zh/guide/kml/)。

从 WFS 获取的 GML 往往还带着 `boundedBy`、`Envelope` 和多层应用模式嵌套，转换前先确认几何所在的层级。轴序拿不准时，先取一个已知点核对经纬度，再批量处理，比事后修数据省事。

## 示例数据与解析脚本

仓库提供了示例文件 [sample.gml](/examples/data/sample.gml) 和解析脚本 [gml_parser.py](/examples/python/gml_parser.py)。脚本只依赖 Python 标准库，读取 `featureMember` 或 `member` 下的要素，把第一个几何后代转换为 GeoJSON，坐标来自 `pos`、`posList` 或旧式 `coordinates`；其他直接子元素按文本转成属性。它不处理应用模式嵌套，也不会对非 4326 的 `srsName` 做重投影。用法为 `python gml_parser.py sample.gml -o out.geojson`。

## 参考与依据

- [OGC Geography Markup Language](https://www.ogc.org/publications/standard/gml/)
- [OGC Simple Feature Access](https://www.ogc.org/publications/standard/sfa/)