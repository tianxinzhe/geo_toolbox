---
title: Excel（XLSX / XLS）坐标数据详解 | 地理工具箱
description: XLSX 的 ZIP + XML 结构、旧版 XLS 的 BIFF 差异，以及日期序列号、科学计数法、前导零、公式和合并单元格为什么会改坏坐标数据。
heading: Excel（XLSX / XLS）坐标数据详解
group: vector
order: 9
readingMinutes: 6
updated: 2026-11-09
---

Excel 是最常见的坐标数据来源，也是最不适合作为程序交换格式的选择。它方便人编辑，却会在保存和显示过程中悄悄改变数值。

## XLSX 的内部结构

XLSX 不是纯文本，而是一个 ZIP 容器：

```text
example.xlsx
├─ [Content_Types].xml
├─ xl/workbook.xml
├─ xl/worksheets/sheet1.xml
├─ xl/sharedStrings.xml
└─ xl/styles.xml
```

工作表数据在 `sheet1.xml`，文本常放进共享字符串表。旧版 `.xls` 使用二进制 BIFF 结构，与 XLSX 完全不兼容，现代工具通常需要额外库才能读取。

## 坐标数据怎么放

推荐两种布局：

| 布局 | 列 | 适用 |
|---|---|---|
| 经纬度列 | `name, lng, lat` | 纯点数据 |
| WKT 列 | `name, geom` | 含线、面或复杂几何 |

经纬度列要保持数值格式，不要加单位或方向字母；WKT 列要确保单元格是文本，避免 Excel 自动换行或截断。

## 五个会改坏数据的行为

1. **长数字变科学计数法**：地块编号、身份证号后几位可能变成 0。
2. **前导零消失**：`00123` 会变成 `123`。
3. **日期变序列号**：`2026-11-09` 内部可能存成 `46304`。
4. **公式未计算**：程序读到的是公式文本，而不是结果。
5. **隐藏字符与合并单元格**：多余空格、换行、合并区域都会让列映射失败。

## 正确的交付方式

- 在 Excel 里完成编辑后，**另存为 CSV UTF-8**，再交给转换工具。
- 如果必须交付 XLSX，明确告知工作表名称、表头行和坐标列。
- 不要用 Excel 直接打开再保存已经生成的 CSV，否则编码和数字格式可能被再次改写。

需要把 Excel 或 CSV 转成矢量数据，用 [矢量格式转换](/zh/tools/format-convert/)；其他表格格式见 [CSV 与 TSV](/zh/guide/csv-tsv/)。