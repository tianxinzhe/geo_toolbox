---
title: 'KML 与 KMZ：结构、样式与打包 | 地理工具箱'
description: KML 的 Document、Placemark、coordinates 与样式结构，KMZ 作为 ZIP 容器的组成，以及它们在坐标系、属性与附件上的限制。
heading: KML 与 KMZ 格式详解：结构、样式与打包
group: vector
order: 6
readingMinutes: 4
updated: 2026-11-23
---

KML 是 OGC 标准，也是 Google Earth 的原生格式，用 XML 描述地标、线、面、样式和时间轴。KMZ 则把它连同图片、图标一起塞进一个 ZIP 包。

## 最小可用示例

顶层是 `<kml>`，里面常见的容器有 `<Document>`、`<Folder>`、`<Placemark>`。坐标写在 `<coordinates>` 里，顺序是**经度,纬度[,海拔]**。

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

多个点之间用空格隔开；面同样要求闭合。

一个 Placemark 只装一种几何最省事。要是点、线、面得放进同一个地标，用 `<MultiGeometry>` 把几个几何包起来。反过来，把多个 `<Point>` 直接并排写在 Placemark 下面不是合法结构，解析器多半只认第一个。

## 结构与字段说明

KML 的元素名是固定的，层级由 schema 管着。下表按读取顺序列出最常碰到的部分。

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

经纬度用十进制度，海拔用米。海拔怎么理解，要看 `altitudeMode`：贴地、相对地面、绝对高度，三种含义差得远。默认值各家软件并不统一，跨工具传递时最好显式写上。

## 样式能力

KML 最强的地方是展示。`<Style>` 能定义图标、颜色、线宽、填充透明度；`<description>` 支持 HTML 气泡；`<TimeStamp>` 和 `<TimeSpan>` 可以做时间轴动画。这些一转到 GeoJSON 就没了。

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

颜色不是常见的 RGB 或 RGBA 顺序，而是 `aabbggrr`——透明度、蓝、绿、红，依次排。按 CSS 习惯写 `ff0000ff`，出来的是蓝色，不是红色，这也是 KML 样式最容易错位的地方。样式可以内联，也可以带个 `id`，再用 `<styleUrl>#id</styleUrl>` 复用；`<StyleMap>` 还能给普通和高亮状态各指定一个样式。

除了地标，KML 还能用 GroundOverlay 贴图、用 NetworkLink 引用远程文件、用 Region 控制按视野加载。靠着这些，一个文件可以组织成图层树。代价是，想完整还原一份 KML，光解析几何远远不够。

## KMZ

KMZ 不是新语法，就是个 ZIP：

```text
example.kmz
├─ doc.kml
├─ images/
│  └─ icon.png
└─ files/
   └─ photo.jpg
```

KML 里的相对路径指向包内附件。解压时只拿 `doc.kml`，图片和图标就全失效了。KMZ 适合分发和展示，不适合程序之间交换。

压缩包一般以根目录的 `doc.kml` 作为入口，但没有强制文件名。有的工具读包里第一个 `.kml`，有的只认 `doc.kml`。生成 KMZ 时，把入口文件放在根目录、保持相对路径不动，兼容性最好。

## 常见错误与陷阱

- **经纬度顺序写反**：地标跑到另一半球去了。照 GeoJSON 的习惯写成纬度,经度就会这样。位置错了却不报错，批量数据里很难一个个查出来。
- **颜色按 RGBA 写**：红色显示成蓝色，透明度也不对。KML 用的是 `aabbggrr`，整份图层的配色与设计不符，还只能逐条排查。
- **环没闭合**：面不显示，或者显示残缺。首尾坐标不一致，或者漏了最后那个重复点。出问题的地物被忽略，旁边的看着正常，很容易误判成数据缺失。
- **只解压 doc.kml**：图标变成默认问号，照片打不开。附件没跟着文件一起搬走。展示效果全丢了，几何本身却没问题。
- **属性塞进 description**：转换后属性没法结构化读取。业务字段写进了 HTML 文本，下游只能上正则，字段一改版就失效。
- **单文件塞太多地标**：Google Earth 加载卡顿，甚至崩溃。几十万个 Placemark 全堆在一个 Document 里，文件难打开，也没法按需加载。

## 限制

- **固定 WGS84**，不声明 EPSG 代码。
- **属性能力弱**：业务字段只能往 `<ExtendedData>` 里塞，不同软件支持程度还不一样。
- **手写容易破坏 `<coordinates>`** 里的空格和换行。
- **不是数据库格式**：几十万要素时，体积和解析速度都不理想。

KML 同样不保存拓扑，相邻面的公共边各存各的。它的时间能力集中在展示层，替代不了带完整时间序列的轨迹格式。要逐点记时间和海拔，GPX 或者带时间扩展的结构更合适。

KMZ 只是个压缩壳，里面还是 KML。把它当成独立格式，只会多一步解包，坐标、属性、样式上的限制一点没变。

## 与相邻格式对比

| 维度 | KML / KMZ | GeoJSON | GPX |
| --- | --- | --- | --- |
| 语法 | XML，KMZ 为 ZIP 包 | JSON | XML |
| 坐标系 | 固定 WGS84 | 固定 WGS84 | 固定 WGS84 |
| 样式 | 强，图标、线宽、填充、时间轴 | 无，由应用层决定 | 无 |
| 属性 | 弱，靠 ExtendedData | 有 properties | 固定字段加扩展 |
| 体积 | 中，KMZ 可压缩附件 | 小 | 中，逐点标签多 |
| 典型场景 | 地球浏览、汇报与分发 | Web 地图与接口 | GPS 记录与运动轨迹 |

KML 的好处是“打开就能看”：图标、气泡、时间动画、附件打包，全在一个文件里。GeoJSON 更适合程序消费，属性和几何分得清楚，但完全没有展示语义。GPX 只管航点、轨迹、路线，不表达面，也没有样式，拿来记设备数据可以，拿来发地图不行。

## 转换与工具入口

KML / KMZ 转 GeoJSON，几何和名称能留下，样式、气泡、附件会丢。反过来能生成基础地标，但样式不会自动补全。互转用 [矢量格式转换](/zh/tools/format-convert/)；带属性的轻量结构看 [GeoJSON](/zh/guide/geojson/)；其他格式见 [总览](/zh/guide/vector-formats/)。

转换前先想清楚要留什么。只要几何，直接转；要属性，把 ExtendedData 映射到 properties；要样式，就得在目标格式之外另存一份样式规则。KMZ 得先解包，确认入口 KML 与附件路径，再处理坐标。

转完还想回到 Google Earth 的话，样式和气泡得重新生成。只留几何的往返转换，原来的展示效果是找不回来的。

## 示例数据与解析脚本

仓库里有 KML 和 KMZ 两套示例：[sample.kml](/examples/data/sample.kml) 配 [kml_parser.py](/examples/python/kml_parser.py)，[sample.kmz](/examples/data/sample.kmz) 配 [kmz_parser.py](/examples/python/kmz_parser.py)。两个脚本都只依赖标准库：遍历 Placemark，支持 Point、LineString、Polygon 和 MultiGeometry，`gx:Track` 按 LineString 读；海拔被丢弃，样式和叠加层忽略，也不做重投影。KMZ 脚本在内存里解压，取 ZIP 顺序里的第一个 `.kml`。用法：`python kml_parser.py sample.kml -o out.geojson`。

## 参考与依据

- [OGC KML](https://www.ogc.org/publications/standard/kml/)
- [Google KML Reference](https://developers.google.com/kml/documentation/kmlreference)