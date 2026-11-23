---
title: TopoJSON 格式详解：拓扑、arcs 与量化 | 地理工具箱
description: TopoJSON 如何用 arcs 共享边界、transform 量化坐标、objects 组织图层，以及它不能直接打开、转换会产生微小偏移等限制。
heading: TopoJSON 格式详解：拓扑、arcs 与量化
group: vector
order: 5
readingMinutes: 4
updated: 2026-11-23
---

TopoJSON 是 GeoJSON 的压缩与拓扑化版本。同样是 JSON 文本，但它不直接存每个多边形的完整轮廓，而是把共享边界抽成 `arcs`，几何只引用弧段编号。

这一层间接带来的效果不只是文件变小。相邻行政区、地块、流域的公共边在文件里只有一份，改一条弧，两侧的边界同时变化，因此不会出现「你的边界和我的边界差几厘米」的缝隙。代价是任何工具都必须先把它还原成 GeoJSON，才能画到地图上。

## 为什么需要它

行政区划、地块、流域这类数据，相邻多边形共享大量边界。GeoJSON 会把公共边存两遍甚至多遍，TopoJSON 只存一次。再配合整数化和共享字符串，文件可以缩小到原来的几分之一。

共享边越多，收益越明显。省界、县界这类层层嵌套的数据，一条边界可能被三四个面同时引用。反过来，散点、独立地块几乎不共享边界，用 TopoJSON 只是多一层转换，不会有体积优势。

## 最小可用示例：基本结构

```json
{
  "type": "Topology",
  "transform": { "scale": [0.0001, 0.0001], "translate": [116.3, 39.8] },
  "objects": {
    "districts": {
      "type": "GeometryCollection",
      "geometries": [
        { "type": "Polygon", "arcs": [[0]], "properties": { "name": "A" } },
        { "type": "Polygon", "arcs": [[1]], "properties": { "name": "B" } }
      ]
    }
  },
  "arcs": [
    [[0, 0], [1000, 0], [1000, 1000], [0, 0]],
    [[1000, 0], [2000, 0], [2000, 1000], [1000, 0]]
  ]
}
```

- `objects` 相当于图层容器，可以放多个几何集合。
- `arcs` 是去重后的路径，坐标是量化后的整数，按 `transform` 还原。
- `transform.scale` 与 `translate` 决定还原后的真实坐标。
- 负的弧段编号表示反向引用同一条弧。

上面为了看清结构，坐标直接写成了完整整数。真实文件里，每段弧只有第一个点是绝对整数，后续点是相对前一个点的差值。站点提供的 `sample.topojson` 就是这种写法：`arcs` 的第二项是 `[83, -53]`，还原时要先加上前一点，而不是当成新坐标。

## 结构与字段说明

| 字段 | 作用 | 是否必需 | 常见取值 |
|---|---|---|---|
| `type` | 标识顶层对象类型 | 必需 | `"Topology"` |
| `objects` | 图层名到几何对象的映射 | 必需 | `districts`、`stations` |
| `arcs` | 去重后的弧段集合 | 必需（可为空数组） | 整数坐标数组 |
| `transform` | 量化参数 | 可选 | `scale`、`translate` |
| `bbox` | 包围盒 | 可选 | 四个或六个数字 |
| `properties` | 属性，挂在几何对象上 | 可选 | 与 GeoJSON 相同 |
| 弧段索引 | 引用 `arcs` 的编号 | 几何内部 | 非负整数或负数 |

几个规则需要记住。`objects` 是一个对象而不是数组，键名就是图层名，解析时通常按顺序取出每个值。`GeometryCollection` 可以嵌套，子几何同样通过 `arcs` 引用弧段。线状几何的 `arcs` 是编号数组，面状几何的 `arcs` 是「环的数组」，每个环又是一串编号；第一个环是外环，其余是洞。点没有弧段，`coordinates` 直接写量化后的绝对整数，这一点与线面不同。

属性依然放在 `properties` 里，结构与 GeoJSON 一致，还原时通常不会丢失；真正丢掉的是对象名和量化参数，需要另行记录。

负数索引是 TopoJSON 特有的写法。编号 `i` 表示正着走第 `i` 条弧，`~i`（即 `-i-1`）表示倒着走同一条弧。这样两个相邻面可以共用一条弧，而不必为其中一个反向复制一份。读错正负号，外环会变成内环，面就会渲染成洞或者直接消失。

## 量化与精度

TopoJSON 常用整数坐标压缩浮点数。`scale` 是量化网格的边长：调大它，网格变粗、整数变小、文件更小，但坐标偏移也更大；调小则精度更高、体积更大。对于厘米级或测量级数据，量化误差可能不可接受，应先评估精度要求。

还原公式很直接：真实坐标 = `translate` + `scale` × 整数值。`scale` 为 0.0001 度时，网格边长在赤道附近约为 11 米，也就是量化误差的量级。这个精度对省级、市级边界足够，对地籍和管线不够。量化还会把落在同一网格里的相邻点合并，极短的边可能在还原后消失，形成退化环。

拓扑带来的一个实际好处是简化时不会产生缝隙。基于拓扑做简化，共享弧段只简化一次，两侧多边形仍然严丝合缝；如果分别简化两份 GeoJSON，公共边就会错开，出现发丝一样的缝或重叠。这也是边界数据常先转成 TopoJSON、简化后再转回去的原因。

## 常见错误与陷阱

### 把 TopoJSON 直接交给地图库

**现象**：地图空白，控制台报几何类型未知，或者只画出一个点。

**原因**：地图库按 GeoJSON 读取，期望顶层是 `FeatureCollection`，而文件顶层是 `Topology`，几何藏在 `objects` 里并引用 `arcs`。

**后果**：要么直接报错，要么读到空集合。必须先用 `topojson-client` 的 `feature()` 还原，或者让转换工具先转成 GeoJSON。

### 手工修改 arcs 坐标

**现象**：本来接合的两块区域出现缝隙，或者边界互相穿插。

**原因**：同一条弧被多个几何引用，改一处等于同时改所有引用它的面；差值编码还意味着改一个点会影响它后面的所有点。

**后果**：拓扑被破坏，而且很难定位是哪一块改坏了。需要编辑时应在 GIS 软件里改几何，再重新生成 TopoJSON。

### 量化过粗

**现象**：边界出现明显锯齿，细小岛屿消失，窄面变成一条线。

**原因**：`scale` 设得太大，网格太粗，相邻点被合并到同一个格子里。

**后果**：精度损失不可逆。拓扑仍然一致，因为两侧共用同一批点，但形状已经变形，无法靠再次转换恢复。

### 弧段索引方向写错

**现象**：某个面渲染成空心，或者面积计算得到负值。

**原因**：负数索引表示反向遍历，`-1` 指的是第 0 条弧倒着走；误把它当成「第 1 条弧」就会得到相反的绕向。

**后果**：外环与内环的判断颠倒，面被填成洞，或者被渲染器直接丢弃。

### 只取 objects 的第一个键

**现象**：转换后只剩一个图层，其他对象不见了。

**原因**：`objects` 是映射，一个文件可以同时放行政区、道路、水系多个对象。

**后果**：数据不完整。转换前应先确认对象数量，需要时逐个展开再合并。

## 与相邻格式对比

| 格式 | 体积 | 拓扑 | 可读性 | 兼容性 |
|---|---|---|---|---|
| TopoJSON | 小，共享边越多越明显 | 有，共享弧段 | 中，需要还原 | 较小，主要靠 topojson-client |
| GeoJSON | 大 | 无 | 高，结构直白 | 最广，几乎所有地图库都支持 |
| FlatGeobuf | 小，二进制 | 无 | 低，需工具 | GIS 与部分库 |
| GeoPackage | 中，含索引 | 无 | 低，SQLite | GIS 软件与数据库 |

选择很直接：数据要进网页地图、要给第三方接口、要人眼检查，用 GeoJSON；数据以共享边界为主、体积是瓶颈、且链路里已经有 TopoJSON 工具，用 TopoJSON。两者之间的转换只改变组织方式，不改变坐标系，也不修正本身就不一致的边界。

## 转换与工具入口

TopoJSON ↔ GeoJSON 会改变坐标的数值精度，但几何形状保持一致；共享边在转换后不保证逐位相同。需要互转时用[矢量格式转换](/zh/tools/format-convert/)，GeoJSON 的结构见 [GeoJSON 格式详解](/zh/guide/geojson/)，更多格式对比见 [15 种格式总览](/zh/guide/vector-formats/)。

## 示例数据与解析脚本

- [sample.topojson](/examples/data/sample.topojson)、[topojson_parser.py](/examples/python/topojson_parser.py)

样例含一个点、一条线和矩形面，`transform` 为 `scale: [0.0001, 0.0001]`、`translate: [-180, -90]`。脚本只用标准库，负责还原差值、应用量化参数、按索引拼接几何：

```bash
python topojson_parser.py sample.topojson -o out.geojson
```

支持 Point、MultiPoint、LineString、MultiLineString、Polygon、MultiPolygon 与 GeometryCollection，对象名不会保留。

## 参考与依据

- [TopoJSON specification](https://github.com/topojson/topojson-specification)
- [topojson-client](https://github.com/topojson/topojson-client)