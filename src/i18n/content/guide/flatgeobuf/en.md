---
title: "FlatGeobuf explained: FlatBuffers and spatial indexing | GeoToolbox"
description: The FlatGeobuf file header, layer schema, packed R-tree spatial index and streaming reads, plus its single-layer and unreadable-file limits and where it fits.
heading: "FlatGeobuf explained: FlatBuffers and spatial indexing"
group: vector
order: 14
readingMinutes: 1
updated: 2026-11-09
---

FlatGeobuf (`.fgb`) is a binary vector format designed for fast reads, streaming and filtering by spatial extent. Built on FlatBuffers, it is often used as a transport format for web maps and large datasets.

## File structure

1. **File header**: magic identifier, version, feature count and layer schema (field names and types).
2. **Spatial index**: a packed R-tree by default, recording each feature's bounding box.
3. **Feature data**: geometry and attributes stored one after another, readable sequentially.

Because the index comes first, a client can read it, work out which features fall inside the current view, and download only those. That is valuable for web maps: no need to fetch the whole file first.

## Characteristics

- **No 10-character field name limit**, with a more complete type system.
- **One file, one layer**; multiple layers need multiple files.
- **Streaming support**, which suits large data and on-demand loading.
- **Smaller than GeoJSON**, and faster to parse.
- **Has a spatial index**, so extent queries avoid a full scan.

## Limits

- **Not readable**: no text editor will open it, so problems require dedicated tools.
- **Single layer**: unlike GeoPackage, one file cannot hold several layers.
- **Awkward to modify after writing**: usually the whole file is rewritten, so it suits infrequent editing.
- **A smaller ecosystem than Shapefile or GeoPackage**, so older software may not support it.

## Where it fits

| Scenario | Suitable |
|---|---|
| Loading web map data by viewport | Yes |
| Read-only data with hundreds of thousands of features | Yes |
| Multi-layer data management | No, use GeoPackage |
| Inspecting file contents by hand | No, use GeoJSON |
| Traditional GIS delivery | Confirm support first |

## When converting

FlatGeobuf to GeoJSON expands into an ordinary feature collection with attributes intact; in the other direction, multiple layers and complex styles cannot be written. Use the [vector format converter](/en/tools/format-convert/) for conversion, and see [GeoPackage](/en/guide/geopackage/) for the comparison.