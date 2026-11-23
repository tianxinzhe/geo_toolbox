---
title: DXF 格式详解：组码、实体与坐标限制 | 地理工具箱
description: DXF 的组码与值成对结构、SECTION/ENTITIES、POINT、LINE、LWPOLYLINE 实体写法，以及缺少坐标系声明、圆弧离散化和属性丢失问题。
heading: DXF 格式详解：组码、实体与坐标限制
group: vector
order: 15
readingMinutes: 1
updated: 2026-11-09
---

DXF（Drawing Exchange Format）是 AutoCAD 的交换格式，广泛用于 CAD 与 GIS 之间的数据传递。ASCII 版本是纯文本，由「组码 + 值」成对组成。

## 基本结构

```text
0
SECTION
2
ENTITIES
0
POINT
8
0
10
116.3974
20
39.9088
0
LINE
8
0
10
116.39
20
39.90
11
116.40
21
39.91
0
ENDSEC
0
EOF
```

- `0/SECTION` + `2/ENTITIES` 进入实体段。
- `0/POINT` 开始点实体，`8` 是图层，`10/20` 是 X/Y。
- `0/LINE` 的起点是 `10/20`，终点是 `11/21`。
- `0/ENDSEC`、`0/EOF` 结束文件。

常见实体还包括 `LWPOLYLINE`（轻量多段线）、`CIRCLE`、`ARC`、`TEXT`、`INSERT`（块参照）。

## 坐标与单位

DXF **没有强制的坐标系声明**。坐标可能是经纬度，也可能是以米为单位的工程坐标。判断方法只有两个：询问数据提供方，或者看数值范围是否落在经纬度区间。

## 已知限制

- **圆弧和样条会被离散**：转成 GeoJSON 或 Shapefile 后通常变成折线，点数取决于导出设置。
- **文字与块属性不会自动成为字段**：`TEXT`、`MTEXT`、`ATTRIB` 需要单独提取。
- **图层与样式丢失**：目标格式如果没有图层概念，只能退化成属性或直接丢弃。
- **二进制 DXF** 不能按文本解析，需要先另存为 ASCII。

## 适用场景

| 场景 | 建议 |
|---|---|
| 从 CAD 提取地块边界 | DXF → GeoJSON / GeoPackage |
| 保留图纸继续编辑 | 继续用 DXF |
| 需要属性表 | 先把文字和块属性整理成 CSV，再与几何关联 |
| 需要坐标系 | 向提供方确认，或按已知工程坐标转换 |

需要互转时用 [矢量格式转换](/zh/tools/format-convert/)；投影坐标先经 [投影坐标转换](/zh/tools/epsg-convert/) 处理到 WGS84。其他制图格式见 [GMT](/zh/guide/gmt/) 与 [MIF/MID](/zh/guide/mif-mid/)。