---
title: GML 格式详解：OGC XML 要素与轴序 | 地理工具箱
description: GML 的 FeatureCollection、featureMember、gml:pos 与 srsName 结构，命名空间规则，以及 EPSG:4326 轴序歧义和体积问题。
heading: GML 格式详解：OGC XML 要素与轴序
group: vector
order: 11
readingMinutes: 4
updated: 2026-11-23
---

GML（Geography Markup Language）是 OGC 的 XML 编码标准。在 GeoJSON 普及之前，它是 Web 地理数据交换的主力，至今仍广泛出现在 OGC 服务、行业平台和政务数据中。

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
- **`srsName` 声明坐标系**，可写 EPSG 代码或 URI。
- **`gml:pos` 写坐标**，多点线面用 `gml:posList`。
- **`featureMember`** 在新版 GML 中也写作 `featureMembers`，读取时要兼容。

同一份数据也可以用 `gml:featureMembers` 一次包住多个要素，省掉重复的外层标签。两种写法语义相同，但 XSD 中的元素名不同，按 schema 校验时不能混用。

## 结构与字段说明

GML 本身是一组 XML Schema，而不是单一的固定结构。实际文件通常遵循某个应用模式，只使用其中一部分元素。下表列出通用解析器最常遇到的部件。

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

GML 坐标没有统一的单位。经纬度用十进制度，投影坐标用米或英尺，都由 `srsName` 指向的坐标系决定。`srsName` 可以写在几何元素上，也可以写在祖先元素上向下继承；解析时不能只看当前节点。

`xsi:schemaLocation` 只是提示，解析器不一定会联网校验；离线环境下通常按元素名和命名空间做宽松读取。需要严格校验时，应把 XSD 保存到本地，并确认版本与文件声明一致。

## 轴序歧义

EPSG:4326 的官方轴序是**纬度在前**，但大量实际文件按经度在前书写。仅凭 `srsName` 无法判断，必须结合数值范围（经度通常 -180~180，纬度 -90~90）和数据提供方说明。

轴序问题在 GML 中比在其他格式更突出，因为 GML 严格遵循坐标系定义，而多数桌面工具和手写文件习惯经度在前。中国的经纬度范围还能靠数值大小判断，接近赤道或本初子午线的数据则可能两种解释都"看起来合理"，此时只能查数据说明或对照已知地物。

## 常见错误与陷阱

- **命名空间缺失或前缀不一致**：现象是解析器报未绑定前缀或找不到元素；原因是 `xmlns:gml` 未声明，或用了 `gml2:` 却按 `gml:` 读取；后果是整个文档解析失败。
- **GML 版本混用**：现象是 schema 校验失败或几何元素认不出；原因是文件声明 GML 3.2 命名空间，却照 2.x 的结构书写；后果是严格校验直接拒绝，宽松解析器则静默丢掉部分内容。
- **经纬度轴序判断错误**：现象是点整体偏移或翻转；原因是把官方轴序当成书写顺序；后果是位置错误但不报错，空间查询和叠加结果都不可信。
- **`posList` 分隔符写错**：现象是坐标数量对不上或数值解析失败；原因是用逗号分隔坐标元组；后果是线面几何错位，甚至生成穿越整个地图的折线。
- **属性名带命名空间前缀**：现象是转换后字段名变成 `app:name` 一类字符串；原因是直接按原始标签输出；后果是下游按 `name` 匹配字段时全部落空。
- **非 4326 坐标未投影**：现象是数据落到地图范围之外；原因是误以为工具会自动换算 `srsName`；后果是需要重新投影才能使用，已生成的派生数据也要重做。

## 限制

- **体积冗长**：同样的点数据，GML 常比 GeoJSON 大数倍。
- **命名空间严格**：漏掉 `xmlns` 或前缀不匹配会直接解析失败。
- **结构自由度高**：不同行业的 GML 应用模式差异很大，通用解析器只能处理常见几何。
- **不是为浏览器设计的**：前端直接解析成本高。

GML 还支持曲线、曲面、覆盖和拓扑等扩展类型，这些内容超出了多数轻量解析器的实现范围。遇到数学定义的圆弧或复杂应用模式时，通常要借助 GDAL、GeoServer 或专门的 schema 感知库，而不是标准库的 XML 解析器。

应用模式还会定义字段的必填性和类型。通用转换器只保留文本，数字、日期和代码表都可能退化成字符串，下游需要再次转换才能恢复语义。

## 与相邻格式对比

| 维度 | GML | KML | GeoJSON |
| --- | --- | --- | --- |
| 语法 | XML，命名空间严格 | XML，结构固定 | JSON |
| 坐标系 | 由 `srsName` 指定，可投影 | 固定 WGS84 | 固定 WGS84 |
| 属性能力 | 强，由应用模式定义 | 较弱，靠 `ExtendedData` | 有 `properties` |
| 体积 | 大，标签重复 | 中 | 小 |
| 典型场景 | WFS、政务与行业数据 | Google Earth、展示分发 | Web 接口、前端渲染 |

GML 与 KML 都是 XML，但目标不同。KML 面向展示，样式、图标和时间轴是核心，坐标系固定；GML 面向数据交换，坐标系和属性结构都可以扩展，代价是体积和解析复杂度。GeoJSON 则在两者之间取了轻量路线，属性简单、浏览器友好，但不适合表达复杂应用模式和投影坐标。

## 转换与工具入口

GML 转 GeoJSON 时，属性名可能带命名空间前缀，需要清理；`srsName` 若不等于 EPSG:4326，坐标不会自动转换。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)，文本几何写法见 [WKT](/zh/guide/wkt/)，展示导向的结构见 [KML](/zh/guide/kml/)。

从 WFS 获取的 GML 往往还带有 `boundedBy`、`Envelope` 和多层应用模式嵌套，转换前先确认几何所在的层级。轴序不确定时，先取一个已知点核对经纬度，再批量处理，比事后修数据省事。

## 示例数据与解析脚本

仓库提供了示例文件 [sample.gml](/examples/data/sample.gml) 和解析脚本 [gml_parser.py](/examples/python/gml_parser.py)。脚本只依赖 Python 标准库，读取 `featureMember` 或 `member` 下的要素，把第一个几何后代转换为 GeoJSON，坐标来自 `pos`、`posList` 或旧式 `coordinates`；其他直接子元素按文本转成属性。它不处理应用模式嵌套，也不会对非 4326 的 `srsName` 做重投影。用法为 `python gml_parser.py sample.gml -o out.geojson`。

## 参考与依据

- [OGC Geography Markup Language](https://www.ogc.org/publications/standard/gml/)
- [OGC Simple Feature Access](https://www.ogc.org/publications/standard/sfa/)