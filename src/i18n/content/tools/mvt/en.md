---
title: 'MVT Vector Tile Decoder - PBF and Base64 | GeoToolbox'
description: 'Decode a .pbf or .mvt vector tile or a base64 string: inspect layers, version, extent, attributes and geometry, convert to WGS84 with z/x/y, and export GeoJSON locally.'
updated: 2026-11-18
faq:
  - q: 'Why do I need z/x/y to get longitude and latitude?'
    a: 'MVT geometry uses integers local to the tile (0 to extent), and the file does not record which tile it belongs to. The same numbers mean different places at zoom 14 and zoom 16, so the caller must supply z/x/y. Without it the tool keeps the raw tile coordinates so you can still inspect shapes and attributes.'
  - q: 'Why does a whole .mbtiles or .pmtiles file fail to parse?'
    a: 'Both are tile containers, not single tiles. The decoder expects a Tile message, so a container header is rejected as invalid protobuf. Extract one tile by z/x/y first, then decode it here.'
  - q: 'Why were some features skipped?'
    a: 'Three common causes: a feature without a geometry type (UNKNOWN), truncated geometry commands or an unknown command, and an odd tag count that leaves the last key without a value. The first two cannot be reconstructed, the third loses one property. Counts appear in the warning list.'
  - q: 'Why did polygon winding change in the GeoJSON?'
    a: 'MVT uses screen-space winding (y down) to separate exterior rings from holes, while GeoJSON convention is counter-clockwise exteriors. The decoder classifies rings first, then normalises the winding, so the coordinate order may be reversed while the shape and hole assignment stay correct.'
  - q: 'Is anything stored on a server?'
    a: 'No. Files are read into memory through the browser File API and base64 is decoded in the page. There are no network requests, and a refresh clears everything.'
---

MVT (Mapbox Vector Tile) is the de facto standard for vector tiles. Instead of a rendered image, the client receives a compact binary containing several layers, each with features, attributes and geometry encoded as integers. This tool turns that binary back into readable layer structure and GeoJSON, which helps when debugging tile services, verifying exports, or feeding tile content into another pipeline.

## Inputs

Two entry points, used one at a time:

- **File**: `.pbf` or `.mvt`, optionally gzip-compressed, which many servers return by default. The limit is 20 MB.
- **Base64**: paste the tile bytes as text. A `data:application/octet-stream;base64,` prefix, line breaks, spaces and base64url `-` / `_` characters are all accepted.

If the file name looks like `14_4823_6160.pbf`, `14-4823-6160.mvt` or `14/4823/6160.pbf`, z/x/y is filled in automatically. For other naming schemes, type the numbers yourself.

## Why z/x/y is needed

MVT only describes positions inside one tile: coordinates run from 0 to `extent` (usually 4096) with y pointing down. It does not say which zoom level, column or row it belongs to — that comes from the request URL or the container metadata.

| z/x/y | Output coordinates | Use |
|---|---|---|
| filled in | WGS84 longitude and latitude (EPSG:4326) | Drop into a GeoJSON viewer, database or GIS |
| empty | tile units (0 to extent) | Inspect shapes and compare tiles internally |

The conversion follows the Web Mercator XYZ scheme: longitude comes from `(x + pixel/extent) / 2^z`, latitude from the inverse Mercator formula. This matches the tile numbering used by Google Maps, OpenStreetMap and Mapbox.

## Reading the result

The summary line reports layer count, feature count and file size, followed by a layer table:

- **Layer name**: the Layer `name`, which is how tile services separate roads, water and POIs;
- **Version**: the Layer `version`, usually 2; older v1 tiles decode too;
- **Extent**: the Layer `extent`, the upper bound of geometry coordinates, 4096 by default;
- **Features**: number of features in that layer;
- **Point / Line / Area**: counts by geometry kind, a quick sanity check.

Below the table you get a GeoJSON preview and any warnings. The preview shows the first 200 lines; copy or download returns the complete collection. Properties come from the MVT `keys` and `values`, with strings, integers, floats and booleans restored to their JSON types.

## How decoding works

The decoder is written from scratch instead of pulling in a protobuf runtime, which keeps every error under control:

- **protobuf layer**: only the varint and length-delimited wire types are handled, and unknown fields are skipped by wire type, so newer encoders stay compatible;
- **geometry commands**: `MoveTo(1)`, `LineTo(2)`, `ClosePath(7)`, with zigzag-encoded deltas accumulated into absolute coordinates;
- **multi-part geometry**: consecutive `MoveTo` commands start new lines or rings; a point `MoveTo` with a larger count becomes `MultiPoint`;
- **polygons and holes**: rings are separated by signed area. The spec puts exterior rings clockwise in screen space, but a few encoders reverse that, so the decoder adapts to the majority direction and then normalises to GeoJSON winding;
- **tolerance**: rings without `ClosePath` are closed with a warning, while unknown geometry types, broken commands and odd tag counts are counted instead of aborting the whole tile.

Layer version, extent and value types follow the Mapbox Vector Tile 2.x specification. MVT has no `srsName` concept, so no reprojection is attempted.

## Typical uses

- **Debug a tile service**: when a road is missing, check whether it exists in the tile, which layer it belongs to and what its attributes say;
- **Verify an export**: compare a self-built tile pipeline output against the source data;
- **Extract a sample**: convert one tile to GeoJSON and open it in QGIS or the site's preview tool;
- **Learn the format**: see the actual layer structure and geometry encoding instead of only reading the spec.

## Limits

- One tile only. `.mbtiles`, `.pmtiles` and `.zip` containers must be unpacked first;
- no coordinate transformation: tile coordinates are treated as Web Mercator and written as WGS84;
- no map rendering. This page focuses on structure; take the GeoJSON to the preview or drawing tool to see shapes;
- 20 MB per file. Oversized tiles usually mean data was not split by layer, so trim on the server first.

## FAQ

### Why do I need z/x/y to get longitude and latitude?

MVT geometry uses integers local to the tile (0 to extent), and the file does not record which tile it belongs to. The same numbers mean different places at zoom 14 and zoom 16, so the caller must supply z/x/y. Without it the tool keeps the raw tile coordinates so you can still inspect shapes and attributes.

### Why does a whole .mbtiles or .pmtiles file fail to parse?

Both are tile containers, not single tiles. The decoder expects a Tile message, so a container header is rejected as invalid protobuf. Extract one tile by z/x/y first, then decode it here.

### Why were some features skipped?

Three common causes: a feature without a geometry type (UNKNOWN), truncated geometry commands or an unknown command, and an odd tag count that leaves the last key without a value. The first two cannot be reconstructed, the third loses one property. Counts appear in the warning list.

### Why did polygon winding change in the GeoJSON?

MVT uses screen-space winding (y down) to separate exterior rings from holes, while GeoJSON convention is counter-clockwise exteriors. The decoder classifies rings first, then normalises the winding, so the coordinate order may be reversed while the shape and hole assignment stay correct.

### Is anything stored on a server?

No. Files are read into memory through the browser File API and base64 is decoded in the page. There are no network requests, and a refresh clears everything.