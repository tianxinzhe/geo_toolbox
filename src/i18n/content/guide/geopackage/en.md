---
title: "GeoPackage explained: SQLite container and geometry blobs | GeoToolbox"
description: The gpkg_contents, gpkg_geometry_columns and gpkg_spatial_ref_sys tables, the GP header and WKB inside geometry blobs, multi-layer support and spatial indexing.
heading: "GeoPackage explained: SQLite container and geometry blobs"
group: vector
order: 13
readingMinutes: 6
updated: 2026-11-09
---

GeoPackage (`.gpkg`) is the OGC-standard modern vector container, and at heart a SQLite database. One file can hold multiple layers, several geometry types, styles and metadata, and it is steadily replacing Shapefile.

## The system tables

| Table | Purpose |
|---|---|
| `gpkg_spatial_ref_sys` | Coordinate system definitions |
| `gpkg_contents` | Layer list: table name, type, extent, SRS |
| `gpkg_geometry_columns` | Geometry column name, geometry type, SRS |
| Feature tables | One per layer, with `fid`, `geom` and attribute columns |

You can inspect it with plain SQL:

```sql
SELECT table_name, data_type, srs_id
FROM gpkg_contents;

SELECT fid, geom FROM features LIMIT 5;
```

## How geometry is stored

The `geom` column is not raw WKB but carries a GeoPackage header:

- magic `GP` (2 bytes)
- version number
- flags (envelope present, byte order and so on)
- `srs_id`
- optional envelope (minx, maxx, miny, maxy)
- then the WKB geometry

This is why an ordinary SQLite table cannot be used as a GeoPackage directly: the system tables and the geometry header are missing.

## Strengths

- **Multiple layers in one file**, so a whole project can be delivered at once.
- **Spatial indexing** (R-tree) for fast extent queries.
- **Field names and types are free of Shapefile limits**.
- **Transactions and concurrency** come from SQLite, which suits data management.
- **A mature ecosystem**: QGIS, GDAL, GeoServer and mobile libraries all support it.

## Limits

- **Files are usually larger than FlatGeobuf**.
- **Needs a SQLite engine**; pure browser reading requires a wasm build.
- **SRS consistency matters on write**, since layers may use different `srs_id` values.
- **Not plain text**, so you cannot inspect or diff it directly.

## When converting

Exporting a multi-layer GeoPackage to Shapefile or FlatGeobuf requires splitting the layers; exporting to a single-layer GeoPackage keeps only one. Use the [vector format converter](/en/tools/format-convert/) for conversion, and see [Shapefile](/en/guide/shapefile/) for the differences.