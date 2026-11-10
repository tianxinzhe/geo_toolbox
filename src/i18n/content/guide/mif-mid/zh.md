---
title: MIF/MID 格式详解：几何与属性双文件 | 地理工具箱
description: MIF 的 Version、Charset、Columns、Data 结构，Point、Line、Region 等几何关键字，MID 属性行的一一对应关系，以及编码和坐标系限制。
heading: MIF/MID 格式详解：几何与属性双文件
group: vector
order: 17
readingMinutes: 5
updated: 2026-11-09
---

MIF/MID 是 MapInfo 的交换格式，由两个文件组成：`.mif` 存几何和表结构，`.mid` 存属性行。两者必须同名、成对出现。

## MIF 结构

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

- `Version`：格式版本，常见 300。
- `Charset`：字符集，中文数据常见编码问题就出在这里。
- `Delimiter`：MID 的分隔符，通常是逗号。
- `Columns`：属性列定义，包括名称和类型。
- `Data`：之后是几何对象。
- 几何关键字包括 `Point`、`Line`、`Pline`、`Region`、`Rect`、`Ellipse` 等。

## MID 结构

```text
天安门,landmark
```

每一行对应 MIF 中一个几何对象，顺序必须一致。少一行或多一行都会导致属性错位。

## 需要注意

- **双文件必须一起处理**：只给 `.mif` 会丢属性，只给 `.mid` 没有几何。
- **编码由 `Charset` 声明**：`WindowsLatin1` 存中文会乱码，应改为合适的字符集或统一转 UTF-8。
- **坐标系信息有限**：通常需要额外的投影说明，不能只靠文件判断 EPSG。
- **属性类型简单**：Char、Integer、Decimal、Date 等，复杂结构难以表达。
- **不是主流新格式**：新项目更常用 GeoPackage，但对接 MapInfo 或行业旧流程时仍会遇到。

## 转换时注意

MIF/MID 转 GeoJSON 时，几何与属性按行配对；Pline、Region 会转成线或多边形；中文编码要手动确认。需要互转时用 [矢量格式转换](/zh/tools/format-convert/)，其他制图格式见 [DXF](/zh/guide/dxf/) 与 [GMT](/zh/guide/gmt/)。