---
title: KML 与 KMZ 格式详解：结构、样式与打包 | 地理工具箱
description: KML 的 Document、Placemark、coordinates 与样式结构，KMZ 作为 ZIP 容器的组成，以及它们在坐标系、属性与附件上的限制。
heading: KML 与 KMZ 格式详解：结构、样式与打包
group: vector
order: 6
readingMinutes: 4
updated: 2026-11-23
---

KML 是 OGC 标准，也是 Google Earth 的原生格式。它用 XML 描述地标、线、面、样式和时间轴；KMZ 则是把 KML 与图片、图标一起打包成 ZIP。

## 最小可用示例

顶层是 `<kml>`，常用容器是 `<Document>`、`<Folder>` 和 `<Placemark>`。坐标写在 `<coordinates>` 中，顺序为**经度,纬度[,海拔]**。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>示例</name>
    <Placemark>
      <name>天安门</name>
      <Point>
        <coordinates>116.3974,39.9088,0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>示例范围</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              116.39,39.90,0 116.41,39.90,0 116.41,39.92,0 116.39,39.90,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>
```

多个点之间用空格分隔；面同样要求环闭合。

一个 Placemark 只放一种几何时最省事。需要把点、线、面放在同一个地标里时，用 `<MultiGeometry>` 包住多个几何元素；相反，把多个 `<Point>` 直接并列写在 Placemark 下不是合法结构，解析器可能只取第一个。

## 结构与字段说明

KML 的元素名固定，层级由 schema 约束。下表按读取顺序列出最常打交道的部分。

| 元素或属性 | 是否必需 | 常见取值或单位 |
| --- | --- | --- |
| `<kml>` | 必需，作为根元素 | 带 KML 命名空间，通常为 2.2 |
| `<Document>`、`<Folder>` | 可选 | 组织地标；Folder 可嵌套，Document 通常只有一个 |
| `<Placemark>` | 承载单个地物时必需 | 可含名称、描述、几何和样式引用 |
| `<name>` | 可选 | 纯文本，显示在列表和气泡标题 |
| `<description>` | 可选 | 可含 HTML，常用 CDATA 包裹 |
| `<coordinates>` | 几何必需 | 经度,纬度[,海拔]，元组之间用空白分隔 |
| `<Point>`、`<LineString>`、`<Polygon>` | 按地物类型选择 | 面使用 `outerBoundaryIs` 与 `innerBoundaryIs` |
| `<Style>` | 可选 | 含 IconStyle、LineStyle、PolyStyle、LabelStyle |
| `<ExtendedData>` | 可选 | 用 `Data` 的 name/value 存业务字段 |
| `<TimeStamp>`、`<TimeSpan>` | 可选 | ISO 8601 时间，驱动时间轴 |
| `altitudeMode` | 可选 | clampToGround、relativeToGround、absolute |

经度和纬度用十进制度，海拔用米。海拔的解释取决于 `altitudeMode`：贴地、相对地面还是绝对高度，含义完全不同。默认值在不同软件中并不完全一致，跨工具传递时应显式写出。

## 样式能力

KML 最强的地方是展示：`<Style>` 可以定义图标、颜色、线宽、填充透明度；`<description>` 支持 HTML 气泡；`<TimeStamp>` 和 `<TimeSpan>` 可以做时间轴动画。这些在转成 GeoJSON 后都会丢失。

```xml
<Style id="line">
  <LineStyle>
    <color>ff0000ff</color>
    <width>2</width>
  </LineStyle>
</Style>
<Placemark>
  <name>示例线</name>
  <styleUrl>#line</styleUrl>
  <ExtendedData>
    <Data name="category"><value>landmark</value></Data>
  </ExtendedData>
</Placemark>
```

颜色不是常见的 RGB 或 RGBA 顺序，而是 `aabbggrr`：透明度、蓝、绿、红依次排列。按 CSS 习惯写 `ff0000ff` 会得到蓝色而不是红色，这是 KML 样式最常见的错位来源。样式可以内联，也可以带 `id` 后用 `<styleUrl>#id</styleUrl>` 复用；`<StyleMap>` 还能为普通和高亮状态各指定一个样式。

除地标外，KML 还能用 GroundOverlay 贴图片、用 NetworkLink 引用远程文件、用 Region 控制按视野加载。这些能力让单个文件可以组织成图层树，但也意味着完整还原一个 KML 需要的不只是几何解析。

## KMZ

KMZ 不是新语法，而是 ZIP：

```text
example.kmz
├─ doc.kml
├─ images/
│  └─ icon.png
└─ files/
   └─ photo.jpg
```

KML 里的相对路径指向包内附件。解压后如果只取 `doc.kml`，图片和图标就会失效。KMZ 适合分发和展示，不适合程序间交换。

压缩包通常以根目录的 `doc.kml` 作为入口，但并没有强制文件名；部分工具会读取包内第一个 `.kml` 文件，另有工具只认 `doc.kml`。生成 KMZ 时把入口文件放在根目录并保持相对路径不变，兼容性最好。

## 常见错误与陷阱

- **经纬度顺序写反**：现象是地标出现在另一半球；原因是照 GeoJSON 习惯写成纬度,经度；后果是位置错误但不报错，批量数据很难逐个发现。
- **颜色按 RGBA 书写**：现象是红色显示成蓝色、透明度异常；原因是 KML 使用 `aabbggrr`；后果是整份图层的配色与设计不符，且只能逐条排查。
- **环没有闭合**：现象是面不显示或显示残缺；原因是首尾坐标不一致，或漏掉最后一个重复点；后果是该地物被忽略，周围地物看起来正常，容易误判为数据缺失。
- **只解压 doc.kml**：现象是图标变成默认问号、照片打不开；原因是附件没有随文件一起移动；后果是展示效果完全丢失，而几何本身仍然正常。
- **把属性塞进 description**：现象是转换后属性无法结构化读取；原因是业务字段写进了 HTML 文本；后果是下游只能正则提取，字段一旦改版就失效。
- **单文件塞入过多地标**：现象是 Google Earth 加载卡顿甚至崩溃；原因是几十万个 Placemark 全部放在一个 Document；后果是文件难以打开，也无法按需加载。

## 限制

- **固定 WGS84**，不声明 EPSG 代码。
- **属性能力弱**：业务字段只能塞进 `<ExtendedData>`，不同软件支持程度不一。
- **手写容易破坏 `<coordinates>`** 的空格与换行。
- **不是数据库格式**：几十万要素时体积和解析速度都不理想。

KML 也不保存拓扑，相邻面的公共边分别存储。它的时间能力集中在展示层，不能替代带完整时间序列的轨迹格式；需要逐点记录时间和海拔时，GPX 或带时间扩展的结构更合适。

KMZ 只是压缩容器，内部仍然是 KML；把它当成独立格式会增加解包步骤，却不会改变坐标、属性和样式上的限制。

## 与相邻格式对比

| 维度 | KML / KMZ | GeoJSON | GPX |
| --- | --- | --- | --- |
| 语法 | XML，KMZ 为 ZIP 包 | JSON | XML |
| 坐标系 | 固定 WGS84 | 固定 WGS84 | 固定 WGS84 |
| 样式 | 强，图标、线宽、填充、时间轴 | 无，由应用层决定 | 无 |
| 属性 | 弱，靠 ExtendedData | 有 properties | 固定字段加扩展 |
| 体积 | 中，KMZ 可压缩附件 | 小 | 中，逐点标签多 |
| 典型场景 | 地球浏览、汇报与分发 | Web 地图与接口 | GPS 记录与运动轨迹 |

KML 的优势在"打开就能看"：图标、气泡、时间动画和附件打包都在一个文件里。GeoJSON 更适合程序消费，属性和几何分离清晰，但没有任何展示语义。GPX 只关心航点、轨迹和路线，不表达面，也不带样式，适合设备记录而不是地图发布。

## 转换与工具入口

KML / KMZ 转 GeoJSON 会保留几何与名称，但样式、气泡和附件会丢失；反向转换则能生成基础地标，但不会自动补全样式。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)，带属性的轻量结构见 [GeoJSON](/zh/guide/geojson/)，其他格式见 [总览](/zh/guide/vector-formats/)。

转换前先决定保留哪些信息：只需要几何时直接转；需要属性时把 ExtendedData 映射到 properties；需要样式时要在目标格式之外另存样式规则。KMZ 要先解包，确认入口 KML 与附件路径，再处理其中的坐标。

转换后如果还要回到 Google Earth，需要重新生成样式和气泡；只保留几何的往返转换会丢失原始展示效果。

## 示例数据与解析脚本

仓库提供 KML 与 KMZ 两套示例：[sample.kml](/examples/data/sample.kml) 配 [kml_parser.py](/examples/python/kml_parser.py)，[sample.kmz](/examples/data/sample.kmz) 配 [kmz_parser.py](/examples/python/kmz_parser.py)。两个脚本都只依赖标准库：遍历 Placemark，支持 Point、LineString、Polygon 和 MultiGeometry，`gx:Track` 按 LineString 读取；海拔被丢弃，样式和叠加层忽略，不做重投影。KMZ 脚本在内存中解压，取 ZIP 顺序里的第一个 `.kml`。用法为 `python kml_parser.py sample.kml -o out.geojson`。

## 参考与依据

- [OGC KML](https://www.ogc.org/publications/standard/kml/)
- [Google KML Reference](https://developers.google.com/kml/documentation/kmlreference)