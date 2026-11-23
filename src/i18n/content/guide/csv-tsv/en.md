---
title: "CSV and TSV for coordinates: layout and traps | GeoToolbox"
description: Two ways to arrange longitude and latitude in CSV / TSV, when to use a WKT column, encoding and delimiter traps, and why spreadsheets are the most error-prone geodata format.
heading: CSV and TSV for coordinates
group: vector
order: 8
readingMinutes: 1
updated: 2026-11-09
---

CSV and TSV are ordinary tabular text, and the most error-prone way to deliver geodata: there is no CRS declaration and no geometry type, so everything depends on column names and convention.

## Two layouts

**Two coordinate columns**, for point data:

```csv
name,lng,lat,category
Tiananmen,116.3974,39.9088,landmark
Forbidden City,116.3970,39.9163,landmark
```

**One WKT geometry column plus attributes**, for mixed geometry:

```csv
name,geom,area_m2
Example extent,"POLYGON ((116.39 39.90, 116.41 39.90, 116.41 39.92, 116.39 39.90))",482000
Example road,"LINESTRING (116.39 39.90, 116.40 39.91)",0
```

As soon as a line or polygon appears, use a WKT column or the geometry will be flattened into points.

## TSV

TSV uses tabs instead of commas under otherwise identical rules. Its advantage is that names and addresses may contain commas without quoting:

```tsv
name	lng	lat
Tiananmen	116.3974	39.9088
Forbidden City	116.3970	39.9163
```

The cost is that a literal tab cannot appear in a field, and copy-paste often replaces tabs with spaces.

## Five common traps

1. **Encoding**: Chinese CSV files arrive as UTF-8, UTF-8 BOM or GBK; UTF-8 without a BOM may look like mojibake in Excel.
2. **Comma conflicts**: fields containing commas must be quoted; embedded quotes are doubled.
3. **Coordinate order**: `lng,lat` in the header is unambiguous; with `x,y`, confirm whether x is longitude or a projected easting.
4. **Decimal separators**: `116,3974` is read as two columns; normalise to a period first.
5. **Blank rows and multi-row headers**: both break column mapping.

## Relationship to other formats

CSV / TSV carry only values and text. Geometry comes either from two coordinate columns or from WKT. To turn a table into vector data, use the [vector format converter](/en/tools/format-convert/); for batch coordinate or distance work, use the batch panel on the relevant tool. See the [overview](/en/guide/vector-formats/) for other formats.