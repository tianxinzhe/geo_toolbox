---
title: 'MIF/MID explained: geometry and attributes | GeoToolbox'
description: 'MIF Version, Charset, Columns and Data structure, the Point, Line and Region keywords, how MID rows pair up, and its encoding and CRS limits.'
heading: "MIF/MID explained: geometry and attribute in two files"
group: vector
order: 17
readingMinutes: 7
updated: 2026-11-23
---

MIF/MID is MapInfo's exchange format, made of two files: `.mif` holds geometry and table structure, `.mid` holds the attribute rows. They must share a name and travel together.

MapInfo Professional has used the pair since the 1990s to export and exchange layers. It still shows up in surveying, cadastral, telecom network and retail site-selection workflows. GDAL reads and writes it through the MITAB driver, and QGIS opens it directly. Because both files are plain text, a text editor is often enough to inspect a suspicious file and compare two exports.

One layer is one pair. The first part of the `.mif` file is a header; the rest is a sequence of geometry objects. The `.mid` file has no header row, and each of its lines corresponds to one object in the `.mif` file. Two rules explain most of the format: a header plus objects in the `.mif`, rows aligned by order in the `.mid`.

## Minimal example

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

The file above is the smallest useful `.mif`: version, character set, delimiter and two attribute columns, followed by one point after the `Data` marker. Its `.mid` partner has a single row:

```text
Tiananmen,landmark
```

Together they describe one point feature with a name and a category. Geometry lives in the `.mif` file, attributes in the `.mid` file, and row order is the only link between them. There is no primary key, and no column name is repeated in the attribute rows.

## Structure and fields

The header decides how everything else is read.

| Declaration | Example | Purpose | Note |
|---|---|---|---|
| `Version` | `300` | Format version | Must be at the start of the file |
| `Charset` | `"WindowsLatin1"`, `"UTF-8"` | Encoding for both files | A mismatch produces mojibake |
| `Delimiter` | `","` | Field separator in MID | One character, usually a comma |
| `Columns` | `2` | Number of attribute columns | Followed by that many definitions |
| Column line | `name Char(40)` | Name and type | Order fixes the MID field position |
| `Data` | A line by itself | End of the header | Geometry follows |
| `CoordSys` | `CoordSys Earth Projection ...` | Coordinate system | Optional; missing means unknown |

After `Columns`, each line gives a name and a type. Common types are `Char(n)`, `Integer`, `SmallInt`, `Decimal(w,d)`, `Float`, `Date` and `Logical`. `Char` stores up to its declared width, and longer values are truncated rather than written back to the source.

Geometry objects start with a keyword, and coordinates follow:

| Keyword | Form | Meaning |
|---|---|---|
| `Point` | `x y` | A single point |
| `Line` | `x1 y1 x2 y2 ...` | One polyline, all coordinates on one line |
| `Pline` | Section count, then points and coordinates per section | Multi-part line |
| `Region` | Section count, then points and coordinates per section | Polygon with one or more rings |
| `Rect` | `x1 y1 x2 y2` | Axis-aligned rectangle |
| `Ellipse` | Centre and bounding box | Ellipse |
| `Text` | Position and string | Text label |
| `None` | No coordinates | Attribute-only object |

Coordinates are always written as `x y`. When `CoordSys` is a geographic system, `x` is longitude and `y` is latitude, matching the usual horizontal-then-vertical convention. For `Pline` and `Region`, the nesting is "section count, point count per section, coordinate lines". Indentation is for humans; the parser follows the counts.

### MID and attribute alignment

Each row corresponds to one geometry object in the MIF file, in the same order. One row too few or too many shifts every attribute.

`Columns 2` means every MID row should contain two fields. If a row has fewer, the missing columns read as empty; extra fields may be ignored or rejected, depending on the reader. A value containing the delimiter is wrapped in double quotes, and a literal quote is written twice.

Attribute rows carry no column names. Given a `.mid` file alone, the only way to learn what the fields mean is to read the `Columns` block of its `.mif` partner. Changing the column order therefore means rewriting every historical `.mid` file as well.

### Coordinate system declaration

A `.mif` header may contain a `CoordSys` clause. Geographic data commonly appears as `CoordSys Earth Projection 1, 104`, where the numbers refer to MapInfo's own projection and datum definitions. Projected data carries a projection code plus central meridian, false easting and northing, and units.

`CoordSys` describes a MapInfo projection definition, not an EPSG code. Mapping it to EPSG means comparing datum, projection method, central meridian and false origin item by item. The sample file omits `CoordSys`, so a reader normally treats the coordinate system as unknown and does not guess an EPSG code. Attributes carry no coordinates; the declaration only affects geometry in the `.mif` file.

## Common mistakes and pitfalls

**Non-ASCII attributes turn into question marks or boxes.** A name column shows `???` or mojibake while the geometry looks fine. The cause is a `Charset` declaration that does not match the bytes, such as a UTF-8 file still marked `WindowsLatin1`, which the reader then decodes as declared. Joins, filters and labels built on names then fail, while the geometry survives and makes the file look healthy. Align the declaration with the actual encoding, or specify the source encoding when reading.

**Every attribute is off by one row.** The first feature looks correct, then each later feature receives the next feature's attributes. The cause is an extra blank line, a deleted row, or an interrupted export in the MID file. The consequence is silent, systematic mislabelling that survives visual inspection and corrupts every statistic. Count MIF objects against non-empty MID rows before trusting the file.

**The delimiter does not match the file.** Every row collapses into the first column, later columns sit empty, and numeric fields turn into text. The header says `Delimiter ","` while the MID file uses semicolons, tabs or spaces. Fields shift, and type conversion fails for any reader that addresses columns by position. Normalise the delimiter or rewrite the file before parsing.

**Projected coordinates are treated as degrees.** Points pile up near the origin, or coordinate values reach hundreds of thousands or millions. MIF stores bare `x y` numbers and leaves the unit to `CoordSys`; without a declaration the reader cannot tell metres from degrees. The result is an empty map, or a layer displaced to the wrong part of the world. Confirm the projection with the data provider and reproject to WGS84 before conversion when needed.

**The section or point counts in a `Region` or `Pline` are wrong.** Parsing fails halfway, or the objects after the broken one vanish. The cause is the counts: the number after `Region` is the section count, and each section starts with its own point count; one missing number makes the reader treat the next keyword as a number. The consequence is truncated geometry followed by shifted attributes. Check the "section count, point count, coordinate lines" levels one by one.

**Only the `.mif` file is delivered.** The recipient sees shapes but no attribute table. The `.mid` file is missing. Every name, identifier and category is lost without a warning. Pack the two same-named files together, or export to a single-file format.

**A BOM or blank line precedes the header.** Some readers report that the first line is not `Version`. Either a UTF-8 BOM or an empty line added by an editor sits in front of it. The file then cannot be parsed at all. Save as UTF-8 without a BOM and keep `Version` on the first line.

## Comparison with neighbouring formats

MIF/MID is often compared with Shapefile, because both separate geometry from attributes and both come from the desktop GIS era. MIF/MID is text, allows field names longer than 10 characters, and avoids the DBF 2 GB ceiling. Shapefile is binary, has broader support, but brings more files and harder limits.

| Item | MIF/MID | Shapefile | GeoPackage |
|---|---|---|---|
| Files | `.mif` plus `.mid` | `.shp`, `.shx`, `.dbf` and more | One SQLite file |
| Encoding | Text, declared by `Charset` | DBF encoding via `.cpg` | UTF-8 |
| Field names | Can exceed 10 characters | 10 characters at most | Effectively unlimited |
| Geometry types | Mixed types in one file | One type per layer | One type per table |
| Coordinate system | `CoordSys` clause | `.prj` | Registered in system tables |
| Size | Larger, plain text | Medium | Smaller |
| Readability | Open in a text editor | Needs a dedicated tool | Needs an SQLite tool |

For a quick exchange, text is easy to inspect and patch by hand. For hundreds of thousands of features kept over time, GeoPackage offers indexes, typed columns and a single file. Shapefile's remaining advantage is compatibility with older systems that accept nothing else. New projects usually prefer GeoPackage, but MapInfo and legacy industry workflows still bring MIF/MID files.

## Conversion and tools

Converting MIF/MID to GeoJSON pairs geometry and attributes row by row; `Pline` and `Region` become lines or polygons, and the encoding of non-ASCII text must be confirmed by hand. Use the [vector format converter](/en/tools/format-convert/) for conversion, and see [DXF](/en/guide/dxf/) and [GMT](/en/guide/gmt/) for the other mapping formats.

Check two things before converting: whether the `.mid` file shares the `.mif` name and sits in the same directory, and whether `Charset` matches the actual encoding. The first decides whether attributes are read at all; the second decides whether the text read is correct.

On the command line, GDAL's `ogr2ogr` handles the pair:

```bash
ogr2ogr -f GeoJSON out.geojson input.mif
```

It finds the matching `.mid` automatically and writes geometry and attributes together. If the encoding declaration is wrong, `ogr2ogr` may decode the file incorrectly, so fix the source or convert the text to UTF-8 and update `Charset` at the same time. Conversion changes the container only and performs no reprojection; if the source is projected, run it through the [coordinate converter](/en/tools/epsg-convert/) first.

## Sample data and parser

A downloadable sample uses three objects with a shared attribute schema:

- [sample.mif](/examples/data/sample.mif): geometry and table structure
- [sample.mid](/examples/data/sample.mid): three attribute rows
- [mif_parser.py](/examples/python/mif_parser.py): a standard-library parser

The sample describes Times Square in New York: a point, a line to a nearby place, and a rectangular area. The `.mif` header declares `Charset "UTF-8"` and `Delimiter ","`, and `Columns 2` defines `name` and `kind`. The three `.mid` rows are `Times Square,poi`, `Walk,line` and `Square,area`.

The script reads a `.mif` file, looks for the matching `.mid`, and also accepts a ZIP containing both. It outputs a GeoJSON FeatureCollection: `Point` becomes a point, `Line` and `Pline` become lines, `Region` becomes a polygon, while `Text`, `Rect` and `Ellipse` are skipped. Coordinates are written as stored, with no reprojection.

```bash
python mif_parser.py sample.mif
python mif_parser.py sample.mif -o out.geojson --indent 0
```

Each feature's `properties` come from the corresponding MID row, and empty values are omitted. If the `.mid` file is missing, the script still writes geometry with empty `properties`, which is a quick way to check whether both halves of the pair are present.

## References

- [GDAL MITAB driver](https://gdal.org/en/stable/drivers/vector/mitab.html): read/write implementation and notes on header fields, geometry types and known limits.
- [OGC Simple Feature Access](https://www.ogc.org/publications/standard/sfa/): the general geometry model behind points, lines, polygons and multi-part objects.

Related reading: [GeoJSON](/en/guide/geojson/), [Shapefile](/en/guide/shapefile/), [15-format overview](/en/guide/vector-formats/).