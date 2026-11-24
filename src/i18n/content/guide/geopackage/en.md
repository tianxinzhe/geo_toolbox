---
title: 'GeoPackage explained: SQLite and geometry | GeoToolbox'
description: 'The gpkg_contents, gpkg_geometry_columns and gpkg_spatial_ref_sys tables, geometry blobs, multi-layer support and spatial indexing.'
heading: "GeoPackage explained: SQLite container and geometry blobs"
group: vector
order: 13
readingMinutes: 5
updated: 2026-11-23
---

GeoPackage (`.gpkg`) is the modern OGC vector container, and underneath it is a SQLite database. One file holds multiple layers, several geometry types, styles and metadata. It is steadily replacing Shapefile.

OGC maintains the standard publicly, and revisions stay backward compatible. The approach is the opposite of Shapefile: rather than a dedicated file type for each kind of data, it reuses general-purpose SQLite and adds a layer of convention. Transactions, indexes and views come for free; readers just have to understand the convention.

## Minimum working example

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

A minimal vector GeoPackage has three metadata tables and at least one feature table. The metadata records which layers exist, the geometry column name and the coordinate system; the feature table holds the data. Remove any one of them and GIS software rejects the file, though SQLite itself opens it fine.

Besides feature tables, a GeoPackage may hold tile tables (`data_type` of `tiles`) and attribute-only tables (`attributes`). Vector data and a raster basemap can share one file, which Shapefile cannot do.

## Structure and fields

| Table | Key columns | Required | Common values |
|---|---|---|---|
| `gpkg_spatial_ref_sys` | `srs_id`, `srs_name`, `organization`, `definition` | Yes | `srs_id` 4326, `organization` EPSG |
| `gpkg_contents` | `table_name`, `data_type`, `srs_id`, extent columns | Yes | `features`, `tiles`, `attributes` |
| `gpkg_geometry_columns` | `table_name`, `column_name`, `geometry_type_name`, `srs_id` | With vector layers | `GEOMETRY`, `POINT`, `POLYGON` |
| Feature table | `fid`, `geom`, business columns | One per layer | Integer primary key, blob `geom` |
| `rtree_<table>_<column>` | `id`, `minx`, `maxx`, `miny`, `maxy` | Optional | Maintained by triggers |
| `gpkg_tile_matrix` | `table_name`, `zoom_level`, matrix size | With tiles | Tile levels and grid sizes |

Next to real coordinate systems, `gpkg_spatial_ref_sys` carries rows for an undefined geographic and an undefined planar system, used for drawings without a geographic meaning. If a layer points at one of those rows, do not treat its coordinates as longitude and latitude.

The extent columns in `gpkg_contents` are the layer bounding box; many tools use them for quick positioning. When they disagree with the data, zooming shows blank areas or jumps to the wrong place. Update them after edits.

`geometry_type_name` may be `GEOMETRY`, meaning points, lines and polygons can share one column. That is looser than Shapefile, but it also means a reader cannot assume a single type.

## How geometry is stored

The `geom` column is not raw WKB but carries a GeoPackage header:

- magic `GP` (2 bytes)
- version number
- flags (envelope present, byte order and so on)
- `srs_id`
- optional envelope (minx, maxx, miny, maxy)
- then the WKB geometry

This is why an ordinary SQLite table cannot be used as a GeoPackage directly: the system tables and the geometry header are missing.

The `srs_id` in the header lets each row declare its coordinate system. In theory one table could mix SRS values, but in practice keep them uniform or extent queries and rendering will go wrong. The envelope is optional and writers may leave it out, so a decoder has to read the flags and skip the header before handing the rest to a WKB parser.

## Strengths

- **Multiple layers in one file**, so a whole project can be delivered at once.
- **Spatial indexing** (R-tree) for fast extent queries.
- **Field names and types are free of Shapefile limits**.
- **Transactions and concurrency** come from SQLite, which suits data management.
- **A mature ecosystem**: QGIS, GDAL, GeoServer and mobile libraries all support it.

The R-tree index is not automatic. After creating a table you have to build the index table with SQLite's `rtree` module and add triggers so inserts, updates and deletes keep it current. Most tools do this for you, which is exactly why hand-written SQL forgets it.

## Limits

- **Files are usually larger than FlatGeobuf**.
- **Needs a SQLite engine**; pure browser reading requires a wasm build.
- **SRS consistency matters on write**, since layers may use different `srs_id` values.
- **Not plain text**, so you cannot inspect or diff it directly.

SQLite also allows only one writer at a time. Several people writing the same file, or keeping it on a network share, quickly leads to lock waits and `database is locked`. It suits single-machine editing and distribution, not a server with concurrent writers.

## Common errors and traps

**Renaming an ordinary SQLite file to `.gpkg`.** QGIS refuses it, or calls it an invalid GeoPackage, because the metadata tables and the GeoPackage file identity are missing. No GIS will read the result, so the data has to be exported again.

**Copying only the `.gpkg` and leaving `-wal` and `-shm` behind.** Recently written features go missing when the copy opens. In WAL mode the latest commits still sit in the sidecar files, so the copy is incomplete. Close the database and copy the whole set.

**Editing geometry with SQL and getting no extent hits.** Features exist but spatial filters miss them. The R-tree is maintained by triggers, so writes that bypass them leave the index stale. Query results come back incomplete until you rebuild it.

**Exporting a multi-layer file to a single-layer format.** One layer appears and the rest disappear without a word. Shapefile and FlatGeobuf hold a single layer, so the output is incomplete and nothing reports an error.

**A declared CRS that does not match the coordinates.** Features shift or scale to the wrong place. Either projected coordinates were written as `srs_id` 4326, or the metadata came from a template. The layer will not overlay, and again there is no warning.

## Comparison with nearby formats

| Dimension | GeoPackage | Shapefile | FlatGeobuf | GeoJSON |
|---|---|---|---|---|
| Container | SQLite database | Several files with one name | One binary file | One text file |
| Layers | Multiple, features and tiles | Single layer, single type | Single layer | One collection, mixed types |
| Fields | Almost unrestricted | 10 characters, few types | Fuller type set | Whatever JSON carries |
| CRS | SRS per layer | Optional `.prj` | Optional header | WGS84 by convention |
| Spatial index | R-tree tables | Separate index file | Packed Hilbert R-tree | None |
| Transactions | Yes, single writer | No | No | No |
| Size | Moderate to large | Moderate | Small | Largest |

## Conversion and tools

Exporting a multi-layer GeoPackage to Shapefile or FlatGeobuf requires splitting the layers; exporting to a single-layer GeoPackage keeps only one.

Before converting, list the layers and read each `srs_id`. With Shapefile as the target, field names are cut to 10 characters and geometry types are forced to one; with FlatGeobuf, only one layer survives. In the other direction, several Shapefiles can be written into one GeoPackage as long as table and field names stay valid.

Use the [vector format converter](/en/tools/format-convert/) for conversion, and the [projection converter](/en/tools/epsg-convert/) when layers disagree on CRS. See [Shapefile](/en/guide/shapefile/) for the differences and [FlatGeobuf](/en/guide/flatgeobuf/) for the web delivery case.

## Sample data and parser script

[sample.gpkg](/examples/data/sample.gpkg) is a minimal example: one feature table called `features`, geometry type `GEOMETRY`, `srs_id` 4326, plus the three standard metadata tables.

[geopackage_parser.py](/examples/python/geopackage_parser.py) opens the database read-only with the standard `sqlite3` module, takes the first feature table and decodes each blob with `shapely`, writing GeoJSON. Null and empty geometries are skipped; style and non-feature tables are ignored.

```text
python geopackage_parser.py sample.gpkg -o out.geojson
```

If the script reports no feature table, query `gpkg_contents` and check that `data_type` is `features`; if the coordinates look wrong, compare the `srs_id` in `gpkg_geometry_columns` with the data.

## References

- [GeoPackage](https://www.geopackage.org/)
- [GeoPackage Specification](https://www.geopackage.org/spec/)