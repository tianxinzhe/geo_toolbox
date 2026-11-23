---
title: "Shapefile explained: the multi-file format and its limits | GeoToolbox"
description: What .shp, .shx, .dbf, .prj and .cpg each do, the 2 GB ceiling, 10-character field names and single geometry type, and how to package a Shapefile correctly.
heading: "Shapefile explained: the multi-file format and its limits"
group: vector
order: 12
readingMinutes: 6
updated: 2026-11-23
---

Shapefile is the most widely used vector format in GIS, defined by Esri in the 1990s. It is not a single file but a group of files sharing one name; most "cannot open" problems come down to one missing piece.

The format is described in an Esri white paper and has barely changed since. It spread because it arrived early, was simple to implement and could be read by nearly every tool, not because the design was good. That popularity also kept its limits in place: field name length, geometry type and file size are fixed by the format itself.

## Minimum working example

| File | Purpose | Required |
|---|---|---|
| `.shp` | Geometry coordinates | Yes |
| `.shx` | Geometry index | Yes |
| `.dbf` | Attribute table (dBASE) | Yes |
| `.prj` | Coordinate system as WKT | Recommended |
| `.cpg` | Attribute table encoding | Recommended |

Without `.shx` some software cannot build an index; without `.prj` the coordinate system is unknown; without `.cpg` non-ASCII attributes may be mojibake.

Zip the files that share a name, including at least `.shp`, `.shx` and `.dbf`, and add `.prj` and `.cpg` where possible. Sending only the `.shp` is the most common mistake.

```text
sample.shp
sample.shx
sample.dbf
sample.prj
sample.cpg
```

Desktop GIS usually needs only the `.shp` path; the other files in the same folder are loaded automatically. That convenience is also where accidents happen: copy, upload or compress only the `.shp` and the geometry survives while the attributes are gone.

You may also see `.sbn` / `.sbx` (Esri spatial indexes), `.qix` (used by GDAL and MapServer) and `.shp.xml` (metadata). None of them are required. Dropping them costs read speed or metadata, not geometry or attributes.

## Structure and fields

The `.shp` file starts with a fixed-length header holding the file length, version, geometry type and overall bounding box, followed by the shape records in order. `.shx` keeps a fixed-length offset and length for each record, working as a table of contents so software can jump to a feature instead of scanning. The two must stay in sync; replacing one alone shifts every record.

`.dbf` is a dBASE table: field definitions first, each with a name, type, width and decimal count, then fixed-length records padded with spaces. Field names max out at 10 characters, and the types are limited to character, numeric, float, date, logical and memo. Arrays, nesting and JSON have nowhere to go.

| Location | Content | Notes |
|---|---|---|
| `.shp` header | Version, geometry type, extent | Geometry type is fixed per file |
| `.shp` records | Record number, length, coordinates | Stored in sequence |
| `.shx` records | Offset, content length | One per `.shp` record |
| `.dbf` field definitions | Name, type, width, decimals | Name limited to 10 characters |
| `.dbf` records | Attribute values | Fixed width, space padded |
| `.prj` | Coordinate system WKT | Single line of text |

Common DBF field types:

| Type | Meaning | Typical values |
|---|---|---|
| `C` | Character | Names, categories, codes |
| `N` | Numeric | Area, population, IDs |
| `F` | Float | Length, ratio |
| `D` | Date | `YYYYMMDD` |
| `L` | Logical | `T` / `F` |

These types come from dBASE rather than from GIS needs. Dates carry no time zone, a logical field cannot express "unknown", and numeric precision is not declared uniformly, so readers infer it from the width. Empty values are blank padding or zero instead of a true NULL, which makes "no value" hard to separate from "empty string".

Historical limits:

- **One geometry type per layer**: points, lines and polygons must be split into separate Shapefiles.
- **Field names max out at 10 characters**, so longer or non-ASCII names get truncated or renamed.
- **A single file cannot exceed 2 GB**, so large datasets must be split.
- **Field count and text length are capped**, and long text is truncated.
- **No NULLs and no complex types**; dates and booleans are expressed only partially.

None of this is a bug in a particular implementation; the constraints are part of the format. A converter can move the data, but names already truncated and values already blanked do not come back.

## Common errors and traps

**Sending only the `.shp`**: the file opens without attributes, or the software errors out; the cause is that `.dbf` and `.shx` were left behind; the result is unusable data and a second delivery.

**Non-ASCII text turns into mojibake**: characters appear as question marks or boxes; the cause is that `.dbf` stores bytes in a code page while `.cpg` is missing or names the wrong encoding; the result is unreadable attributes and broken filtering, joins and exports, usually with no way to recover the original encoding from the file.

**Field names become `NAME_1` or `FIELD_2`**: long or non-ASCII names are replaced; the cause is the 10-character limit together with ASCII-only names in older implementations; the result is lost meaning and joins that need remapping.

**Points, lines and polygons in one layer**: only some features appear after import, or empty geometries show up; the cause is that effective features in one `.shp` must share a geometry type — the spec allows Null records, but most software will not split the types for you; the result is incomplete data that has to be divided into separate files.

**Features land millions of metres off the map**: the extent does not match the basemap; the cause is a missing or wrong `.prj`, or data that is really in engineering coordinates; the result is that nothing overlays and the CRS must be confirmed before reprojection.

**Writing fails halfway or the file is corrupt**: everything after a certain feature is lost; the cause is the 32-bit offsets and the 2 GB per-file ceiling; the result is that the remainder cannot be written and the data has to be split by extent or feature count.

## Comparison with nearby formats

| Dimension | Shapefile | GeoPackage | FlatGeobuf | GeoJSON |
|---|---|---|---|---|
| File layout | Several files with one name | One SQLite file | One file | One text file |
| Layers and geometry | Single layer, single type | Multiple layers and types | Single layer | One collection, mixed types |
| Fields | 10-character names, few types | Whatever SQLite supports | Fuller type set | Whatever JSON carries |
| CRS | Optional `.prj` | SRS declared per layer | Optional header declaration | WGS84 by convention |
| Spatial index | Separate index file | R-tree tables | Packed Hilbert R-tree | None |
| Size | Moderate | Moderate to large | Small | Largest |
| Streaming reads | No | No | Yes | No |

When you still need it:

- Connecting to legacy GIS or industry workflows that only accept Shapefile.
- Data that must be readable by old software.
- Small datasets with simple fields.

Given the choice, GeoPackage supports multiple layers, long field names and a better type system, and is gradually replacing Shapefile as a delivery format.

## Conversion and tools

Converting Shapefile to GeoJSON or GeoPackage does not automatically restore truncated field names, and the single-type limit stays in the source; multi-layer data may need to be split into several files, while the reverse conversion exports each layer separately.

Before converting, check three things: the file set is complete, the `.prj` matches what you expect, and the target format can hold the current names and types. Moving to GeoPackage or FlatGeobuf removes the 10-character limit, but names already truncated stay truncated; in the other direction long names are cut again, so rename them first.

Use the [vector format converter](/en/tools/format-convert/) for conversion, and run coordinates through the [projection converter](/en/tools/epsg-convert/) to WGS84 when the CRS is unclear. Compare the binary alternatives in [GeoPackage](/en/guide/geopackage/) and [FlatGeobuf](/en/guide/flatgeobuf/), and see [GeoJSON](/en/guide/geojson/) for the text structure.

## Sample data and parser script

[sample-shapefile.zip](/examples/data/sample-shapefile.zip) is a zipped minimum example with `.shp`, `.shx`, `.dbf`, `.prj` and `.cpg`, useful for testing a full read path.

[shapefile_parser.py](/examples/python/shapefile_parser.py) uses pyshp to read a `.shp` or a ZIP, turns every feature into GeoJSON and keeps field names as stored; null shapes are skipped. It ignores `.prj` and does not reproject, so coordinates come out exactly as written.

```text
python shapefile_parser.py sample.shp -o out.geojson
```

If the attributes come out empty, check that `.dbf` sits next to the `.shp`; if the coordinates are far too large, the data is projected and needs a CRS conversion first.

## References

- [ESRI Shapefile Technical Description](https://www.esri.com/content/dam/esrisites/sitecore-archive/Files/Pdfs/library/whitepapers/pdfs/shapefile.pdf)
- [OGC Simple Feature Access](https://www.ogc.org/publications/standard/sfa/)