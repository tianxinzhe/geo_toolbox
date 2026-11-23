---
title: MIF/MID 格式详解：几何与属性双文件 | 地理工具箱
description: MIF 的 Version、Charset、Columns、Data 结构，Point、Line、Region 等几何关键字，MID 属性行的一一对应关系，以及编码和坐标系限制。
heading: MIF/MID 格式详解：几何与属性双文件
group: vector
order: 17
readingMinutes: 5
updated: 2026-11-23
---

MIF/MID 是 MapInfo 的交换格式，由两个文件组成：`.mif` 存几何和表结构，`.mid` 存属性行。两者必须同名、成对出现。

MapInfo Professional 从 1990 年代起用它导出和交换图层，今天仍能在测绘、地籍、电信管线、零售选址等行业流程里遇到。GDAL 的 MITAB 驱动提供了读写实现，QGIS 也能直接打开。它是纯文本格式，可以用文本编辑器查看、比较差异，排查字段错位时比二进制格式省事。

一个图层就是一对文件。`.mif` 的前半段是头部声明，后半段是逐个几何对象；`.mid` 没有表头，每一行对应 `.mif` 里的一个对象。理解「头部加对象序列」和「逐行对齐」这两件事，基本就能读懂全部结构。

## 最小示例

```text
Version 300
Charset "WindowsLatin1"
Delimiter ","

Columns 2
  name Char(40)
  category Char(20)
Data

Point 116.3974 39.9088
```

上面是最小可用的 `.mif`：声明版本、字符集、分隔符和两列属性，`Data` 之后跟一个点对象。对应的 `.mid` 只有一行：

```text
天安门,landmark
```

这一对文件描述一个点要素，属性为名称与类别。几何在 `.mif`，属性在 `.mid`，两边的顺序靠行号维系，没有主键，也没有字段名写在属性行里。

## 结构与字段表

头部声明决定其余内容怎么读。常见字段如下：

| 声明 | 示例 | 作用 | 注意 |
|---|---|---|---|
| `Version` | `300` | 格式版本 | 必须位于文件开头 |
| `Charset` | `"WindowsLatin1"`、`"UTF-8"` | 两个文件的字符编码 | 与真实编码不符会乱码 |
| `Delimiter` | `","` | MID 的字段分隔符 | 单个字符，常见逗号 |
| `Columns` | `2` | 属性列数量 | 后面紧跟同样数量的列定义 |
| 列定义 | `name Char(40)` | 列名与类型 | 顺序决定 MID 的字段位置 |
| `Data` | 单独一行 | 头部结束标记 | 之后才是几何对象 |
| `CoordSys` | `CoordSys Earth Projection ...` | 坐标系声明 | 可选，缺失时坐标系未知 |

`Columns` 后面逐行写列名和类型，常见类型有 `Char(n)`、`Integer`、`SmallInt`、`Decimal(w,d)`、`Float`、`Date` 和 `Logical`。`Char` 按声明的宽度存储，超出部分会被截断，不会回写到原始数据。

几何对象以关键字开头，坐标跟在后面：

| 关键字 | 写法 | 含义 |
|---|---|---|
| `Point` | `x y` | 单个点 |
| `Line` | `x1 y1 x2 y2 ...` | 一条折线，所有坐标写在同一行 |
| `Pline` | 段数，然后每段点数与坐标 | 多段线，可含多个部分 |
| `Region` | 段数，然后每段点数与坐标 | 面，可含多个环 |
| `Rect` | `x1 y1 x2 y2` | 轴对齐矩形 |
| `Ellipse` | 中心与包围框 | 椭圆 |
| `Text` | 位置与字符串 | 文字标注 |
| `None` | 无坐标 | 只有属性、没有几何的对象 |

坐标一律写成 `x y`。当 `CoordSys` 是经纬度时，`x` 是经度、`y` 是纬度，与屏幕上「先横后纵」的习惯一致。`Pline` 与 `Region` 的层级是「段数 → 每段点数 → 该段坐标行」，缩进只是给人看的，解析依赖数字计数。

### MID 与属性对齐

每一行对应 MIF 中一个几何对象，顺序必须一致。少一行或多一行都会导致属性错位。

`Columns 2` 声明两列，MID 每行就应有两个字段。字段数少于声明时，缺的列被当作空值；多出的字段可能被忽略或报错，取决于读取程序。字段值里出现分隔符时用双引号包住，引号本身写成两个连续引号。

属性行里没有字段名。拿到一份 `.mid` 却不知道列含义时，只能回到 `.mif` 的 `Columns` 段查看顺序。这也意味着列顺序一旦调整，所有历史 `.mid` 都要同步重写。

### 坐标系声明

`.mif` 头部可以出现 `CoordSys` 子句。经纬度数据常见写法是 `CoordSys Earth Projection 1, 104`，其中数字对应 MapInfo 自己的投影与基准面定义；投影数据则会带上投影编号、中央经线、假东假北和单位。

`CoordSys` 描述的是 MapInfo 的投影定义，不是 EPSG 编号。要落到 EPSG，需要根据基准面、投影方法、中央经线、假东假北逐项比对。样例文件省略了 `CoordSys`，读取程序通常按未知坐标系处理，不会替你猜一个 EPSG 代码。属性数据本身不带坐标，坐标系只影响 `.mif` 里的几何。

## 常见错误与陷阱

**中文属性变成问号或方块。** 现象是名称列显示 `???` 或乱码，几何位置却正常。原因是 `Charset` 声明与实际字节编码不一致，例如文件按 UTF-8 保存，头部仍写 `WindowsLatin1`，读取程序按声明解码。后果是属性不可读，按名称做的连接、筛选和标注全部失效；几何不受影响，容易让人误判文件没坏。处理方式是让声明与文件编码一致，或在读取时显式指定源编码。

**属性整体错开一行。** 现象是第一个要素名称正确，后面每个要素都拿到下一个要素的属性。原因是 MID 中多出空行、少写一行，或导出过程中断。后果是数据看起来完整，属性却系统性错位，统计和标注都会张冠李戴。处理时先数 MIF 的对象数与 MID 的非空行数，再逐条核对。

**分隔符与实际文件不符。** 现象是整行属性挤进第一列，后面的列全空，数值列也变成文本。原因是头部写 `Delimiter ","`，实际 MID 用分号、制表符或空格分隔。后果是字段错位、类型转换失败，任何按列取值的程序都会读错。处理方式是统一分隔符，或先做一次文本替换再解析。

**把投影坐标当经纬度。** 现象是点全部堆在原点附近，或者坐标值达到几十万、几百万。原因是 MIF 只存 `x y` 数值，单位由 `CoordSys` 决定；缺少声明时读取程序不知道单位是米还是度。后果是地图上什么都看不到，或整体偏移到另一个位置。处理方式是向数据提供方确认投影，必要时先转到 WGS84 再转换格式。

**Region 或 Pline 的段数与点数写错。** 现象是解析在中途报错，或后面几个对象消失。原因是 `Region 1` 后的第一个数字是段数，每段又以点数开头；少一个点数，读取程序会把下一行的关键字当成数字。后果是几何被截断，后续对象和属性行跟着错位。处理时逐段核对「段数 → 点数 → 坐标行」的层级。

**只交付 `.mif`。** 现象是别人打开只有图形，没有属性表。原因是 `.mid` 没有随文件一起发送。后果是名称、编号、分类全部丢失，而且不会报错。处理方式是把两个文件同名同目录打包，或导出为单文件格式。

**文件开头带 BOM 或空行。** 现象是某些读取程序提示第一行不是 `Version`。原因是文件带 UTF-8 BOM，或保存时多了空行。后果是整个文件无法解析。处理方式是保存为无 BOM 的 UTF-8，并确保第一行就是 `Version`。

## 与相邻格式对比

MIF/MID 常被拿来和 Shapefile 比较，因为两者都把几何与属性分开存放，又都来自桌面 GIS 时代。区别在于 MIF/MID 是文本，字段名可以超过 10 个字符，也不受 DBF 的 2GB 限制；Shapefile 是二进制，生态更广，但文件更多、限制更硬。

| 项目 | MIF/MID | Shapefile | GeoPackage |
|---|---|---|---|
| 组成 | `.mif` 加 `.mid` | `.shp`、`.shx`、`.dbf` 等 | 单个 SQLite 文件 |
| 编码 | 文本，由 `Charset` 声明 | DBF 编码靠 `.cpg` | UTF-8 |
| 字段名 | 可超过 10 字符 | 最多 10 字符 | 基本不受限 |
| 几何类型 | 同一文件可混合 | 一个图层一种 | 一张表一种 |
| 坐标系 | `CoordSys` 子句 | `.prj` | 系统表登记 |
| 体积 | 较大，纯文本 | 中等 | 较小 |
| 可读性 | 可直接查看 | 需专用工具 | 需 SQLite 工具 |

如果只是临时交换，文本格式便于检查和手工修补；如果要长期保存几十万要素，GeoPackage 的索引、字段类型和单文件结构更省心。Shapefile 的优势只剩兼容性，很多老系统仍然只认它。新项目更常用 GeoPackage，但对接 MapInfo 或行业旧流程时仍会遇到 MIF/MID。

## 转换与工具入口

MIF/MID 转 GeoJSON 时，几何与属性按行配对；Pline、Region 会转成线或多边形；中文编码要手动确认。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)，其他制图格式见 [DXF](/zh/guide/dxf/) 与 [GMT](/zh/guide/gmt/)。

转换前先确认两件事：`.mid` 是否与 `.mif` 同名同目录，以及 `Charset` 是否与实际编码一致。前者决定属性能否读到，后者决定读到的是不是正确文字。

命令行下可以用 GDAL 的 `ogr2ogr`：

```bash
ogr2ogr -f GeoJSON out.geojson input.mif
```

它会自动寻找同名 `.mid`，把几何与属性一起写出。编码声明有误时，`ogr2ogr` 可能按错误编码读取，先在源头修正，或把文本转成 UTF-8 并同步改 `Charset`。转换只改变组织方式，不做投影计算；源数据若是投影坐标，先到 [投影坐标转换](/zh/tools/epsg-convert/) 处理。

## 示例数据与解析脚本

站点提供一组可直接下载的样例，三个对象共用同一组属性：

- [sample.mif](/examples/data/sample.mif)：几何与表结构
- [sample.mid](/examples/data/sample.mid)：三行属性
- [mif_parser.py](/examples/python/mif_parser.py)：只用标准库的解析脚本

样例描述纽约时代广场：一个点、一条到附近地点的线、一个矩形区域。`.mif` 头声明 `Charset "UTF-8"` 与 `Delimiter ","`，`Columns 2` 定义 `name` 与 `kind` 两列；`.mid` 三行依次是 `Times Square,poi`、`Walk,line`、`Square,area`。

脚本读入 `.mif` 后自动寻找同名 `.mid`，也接受同时包含两者的 ZIP，输出 GeoJSON 的 FeatureCollection。`Point` 转点，`Line` 与 `Pline` 转线，`Region` 转多边形；`Text`、`Rect`、`Ellipse` 等对象跳过，坐标按原值写出，不做重投影。

```bash
python mif_parser.py sample.mif
python mif_parser.py sample.mif -o out.geojson --indent 0
```

输出里每个要素的 `properties` 来自对应的 MID 行，空值被省略。若 `.mid` 缺失，脚本仍会输出几何，但 `properties` 为空，正好可以用来验证双文件是否配齐。

## 参考与依据

- [GDAL MITAB driver](https://gdal.org/en/stable/drivers/vector/mitab.html)：MIF/MID 的读写实现，头部字段、几何类型与已知限制的说明。
- [OGC Simple Feature Access](https://www.ogc.org/publications/standard/sfa/)：简单要素几何模型的通用定义，用于理解点、线、面与多部件的对应关系。

相关阅读：[GeoJSON](/zh/guide/geojson/)、[Shapefile](/zh/guide/shapefile/)、[15 种矢量格式总览](/zh/guide/vector-formats/)。