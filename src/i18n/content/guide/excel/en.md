---
title: "Excel (XLSX / XLS) for coordinates: structure and traps | GeoToolbox"
description: The ZIP + XML structure of XLSX, how legacy XLS differs, and why date serial numbers, scientific notation, leading zeros, formulas and merged cells corrupt coordinate data.
heading: Excel (XLSX / XLS) coordinate data
group: vector
order: 9
readingMinutes: 1
updated: 2026-11-09
---

Excel is the most common source of coordinate data and the least suitable format for programmatic exchange. It is convenient for people to edit, and it quietly changes values while saving and displaying them.

## What is inside an XLSX

An XLSX is not plain text but a ZIP container:

```text
example.xlsx
├─ [Content_Types].xml
├─ xl/workbook.xml
├─ xl/worksheets/sheet1.xml
├─ xl/sharedStrings.xml
└─ xl/styles.xml
```

Sheet data lives in `sheet1.xml`, and text is usually stored in a shared string table. Legacy `.xls` uses the binary BIFF structure, which is entirely incompatible with XLSX and usually needs an extra library to read.

## Two ways to hold coordinates

| Layout | Columns | Suits |
|---|---|---|
| Longitude and latitude | `name, lng, lat` | Point data only |
| WKT column | `name, geom` | Lines, polygons, mixed geometry |

Keep coordinate columns numeric, with no units or direction letters. Make sure a WKT column is formatted as text, or Excel will wrap or truncate it.

## Five things that corrupt data

1. **Long numbers turn into scientific notation**: parcel IDs and trailing digits can become zeros.
2. **Leading zeros disappear**: `00123` becomes `123`.
3. **Dates become serial numbers**: `2026-11-09` may be stored internally as `46304`.
4. **Formulas are not evaluated**: a script reads the formula text, not the result.
5. **Hidden characters and merged cells**: stray spaces, line breaks and merged ranges break column mapping.

## How to deliver it properly

- Finish editing in Excel, then **save as CSV UTF-8** and hand that to the converter.
- If XLSX is mandatory, state the sheet name, header row and coordinate columns explicitly.
- Do not open a generated CSV in Excel and save it again, or the encoding and number formats may be rewritten.

To turn Excel or CSV into vector data, use the [vector format converter](/en/tools/format-convert/). For the plain-text alternative, see [CSV and TSV](/en/guide/csv-tsv/).