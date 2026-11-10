---
title: "Shapefile explained: the multi-file format and its limits | GeoToolbox"
description: What .shp, .shx, .dbf, .prj and .cpg each do, the 2 GB ceiling, 10-character field names and single geometry type, and how to package a Shapefile correctly.
heading: "Shapefile explained: the multi-file format and its limits"
group: vector
order: 12
readingMinutes: 6
updated: 2026-11-09
---

Shapefile is the most widely used vector format in GIS, defined by Esri in the 1990s. It is not a single file but a group of files sharing one name; most "cannot open" problems come down to one missing piece.

## What the files do

| File | Purpose | Required |
|---|---|---|
| `.shp` | Geometry coordinates | Yes |
| `.shx` | Geometry index | Yes |
| `.dbf` | Attribute table (dBASE) | Yes |
| `.prj` | Coordinate system as WKT | Recommended |
| `.cpg` | Attribute table encoding | Recommended |

Without `.shx` some software cannot build an index; without `.prj` the coordinate system is unknown; without `.cpg` non-ASCII attributes may be mojibake.

## Historical limits

- **One geometry type per layer**: points, lines and polygons must be split into separate Shapefiles.
- **Field names max out at 10 characters**, so longer or non-ASCII names get truncated or renamed.
- **A single file cannot exceed 2 GB**, so large datasets must be split.
- **Field count and text length are capped**, and long text is truncated.
- **No NULLs and no complex types**; dates and booleans are expressed only partially.

## Packaging it correctly

Zip the files that share a name, including at least `.shp`, `.shx` and `.dbf`, and add `.prj` and `.cpg` where possible. Sending only the `.shp` is the most common mistake.

## When you still need it

- Connecting to legacy GIS or industry workflows that only accept Shapefile.
- Data that must be readable by old software.
- Small datasets with simple fields.

Given the choice, GeoPackage supports multiple layers, long field names and a better type system, and is gradually replacing Shapefile as a delivery format.

## When converting

Converting Shapefile to GeoJSON or GeoPackage does not automatically restore truncated field names, and the single-type limit stays in the source; multi-layer data may need to be split into several files, while the reverse conversion exports each layer separately. Use the [vector format converter](/en/tools/format-convert/) for conversion, and compare the binary alternatives in [GeoPackage](/en/guide/geopackage/) and [FlatGeobuf](/en/guide/flatgeobuf/).