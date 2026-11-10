---
title: "MIF/MID explained: geometry and attribute in two files | GeoToolbox"
description: The Version, Charset, Columns and Data structure of MIF, the Point, Line and Region geometry keywords, how MID rows pair up, and the encoding and CRS limits.
heading: "MIF/MID explained: geometry and attribute in two files"
group: vector
order: 17
readingMinutes: 5
updated: 2026-11-09
---

MIF/MID is MapInfo's exchange format, made of two files: `.mif` holds geometry and table structure, `.mid` holds the attribute rows. They must share a name and travel together.

## MIF structure

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

- `Version`: format version, commonly 300.
- `Charset`: character set, and the usual source of encoding problems with non-ASCII text.
- `Delimiter`: the separator used in the MID file, usually a comma.
- `Columns`: attribute column definitions with names and types.
- `Data`: geometry objects follow.
- Geometry keywords include `Point`, `Line`, `Pline`, `Region`, `Rect` and `Ellipse`.

## MID structure

```text
Tiananmen,landmark
```

Each row corresponds to one geometry object in the MIF file, in the same order. One row too few or too many shifts every attribute.

## Things to watch

- **Handle both files together**: a `.mif` alone loses attributes, a `.mid` alone has no geometry.
- **Encoding comes from `Charset`**: `WindowsLatin1` mangles non-Latin text, so switch to a suitable charset or normalise to UTF-8.
- **Coordinate system information is thin**: an external projection statement is usually required, and the EPSG code cannot be inferred from the file.
- **Attribute types are simple**: Char, Integer, Decimal, Date; complex structures are hard to express.
- **Not a mainstream new format**: new projects prefer GeoPackage, but MapInfo and legacy industry workflows still use it.

## When converting

Converting MIF/MID to GeoJSON pairs geometry and attributes row by row; `Pline` and `Region` become lines or polygons, and the encoding of non-ASCII text must be confirmed by hand. Use the [vector format converter](/en/tools/format-convert/) for conversion, and see [DXF](/en/guide/dxf/) and [GMT](/en/guide/gmt/) for the other mapping formats.