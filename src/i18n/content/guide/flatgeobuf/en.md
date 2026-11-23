---
title: "FlatGeobuf explained: FlatBuffers and spatial indexing | GeoToolbox"
description: The FlatGeobuf file header, layer schema, packed R-tree spatial index and streaming reads, plus its single-layer and unreadable-file limits and where it fits.
heading: "FlatGeobuf explained: FlatBuffers and spatial indexing"
group: vector
order: 14
readingMinutes: 5
updated: 2026-11-23
---

FlatGeobuf (`.fgb`) is a binary vector format designed for fast reads, streaming and filtering by spatial extent. Built on FlatBuffers, it is often used as a transport format for web maps and large datasets.

It is not an OGC standard but an open specification maintained by an open-source community, with implementations in several languages. The goal is narrow: one file, no sidecars, and immediate access to features by extent. Compared with a database container it gives up multiple layers and in-place editing in exchange for sequential reads and efficient transfer over the network.

## Minimum working example

1. **File header**: magic identifier, version, feature count and layer schema (field names and types).
2. **Spatial index**: a packed R-tree by default, recording each feature's bounding box.
3. **Feature data**: geometry and attributes stored one after another, readable sequentially.

Because the index comes first, a client can read it, work out which features fall inside the current view, and download only those. That is valuable for web maps: no need to fetch the whole file first.

Byte by byte, the layout looks like this:

```text
magic "fgb\x03fgb\x00"   8 bytes
header length            4 bytes, little endian
header                   FlatBuffers: schema, feature count, geometry type, optional CRS
[spatial index]          packed Hilbert R-tree, optional
feature records          4-byte length + FlatBuffers feature, repeated to end of file
```

A minimum working file needs only the magic, the header and the feature records. The spatial index is optional: readers can jump by extent only when the writer generated one; without it they scan from the beginning.

## Structure and fields

| Part | Content | Required | Notes |
|---|---|---|---|
| magic | 8-byte file identifier | Yes | Separates it from other binary formats |
| header | Schema, feature count, geometry type, optional CRS | Yes | FlatBuffers encoded, length stored first |
| spatial index | Packed Hilbert R-tree | Optional | Stores bounding boxes and offsets |
| feature records | 4-byte length + feature body | Yes | Sequential, streamable |
| feature body | Geometry, properties, optional id | Yes | Geometry as FlatBuffers structures |

The header schema defines field names and types. The type set is richer than Shapefile, covering integers of several widths, floats, booleans, strings and JSON. Field names have no 10-character limit, and non-ASCII names survive.

Coordinate system information is optional. The spec allows a CRS description in the header, but many writers leave it empty, so readers fall back to judging by the numeric range. If the file will be laid over a web basemap, declare the CRS at export time and convert to WGS84 first.

Geometry is expressed as a FlatBuffers union: points, lines, polygons, multi-part shapes and collections each have their own structure, with coordinates stored as double arrays. It is not WKB, so WKB bytes cannot be pasted in; conversion has to go through a geometry library.

## Characteristics

- **No 10-character field name limit**, with a more complete type system.
- **One file, one layer**; multiple layers need multiple files.
- **Streaming support**, which suits large data and on-demand loading.
- **Smaller than GeoJSON**, and faster to parse.
- **Has a spatial index**, so extent queries avoid a full scan.

Placing the index at the front is what makes streaming work. A client reads the header and index, computes the byte ranges of matching features and fetches only those with HTTP Range requests. Any server that supports Range can serve a large file as a queryable source without a database.

## Limits

- **Not readable**: no text editor will open it, so problems require dedicated tools.
- **Single layer**: unlike GeoPackage, one file cannot hold several layers.
- **Awkward to modify after writing**: usually the whole file is rewritten, so it suits infrequent editing.
- **A smaller ecosystem than Shapefile or GeoPackage**, so older software may not support it.

The index is usually generated but the spec allows omitting it, so files with the same extension can behave differently: with an index, extent reads are fast; without one, a reader may error out or fall back to a full scan. Check whether a `.fgb` carries an index instead of assuming it does.

## Common errors and traps

**Opening it in a text editor and seeing garbage**: the screen fills with unreadable characters and the file looks corrupt; the cause is that the content is binary; the result is wasted debugging time, when GDAL or a dedicated library is the right tool.

**Assuming a spatial index is always present**: some reader fails with an error about node size; the cause is that certain exporters write only the header and features, leaving the index node size unset; the result is that extent reads fail and you must parse sequentially or rebuild the index.

**A web server that ignores Range requests**: the front end still downloads the whole file when loading by extent; the cause is that the server returns a full response and ignores the Range header; the result is that on-demand loading stops working and bandwidth and first paint suffer.

**Exporting several layers into one `.fgb`**: only the first layer survives; the cause is that the format holds a single layer; the result is silent loss of the rest, so split the layers before exporting.

**No declared CRS and a direct overlay**: data appears in the wrong place or at the wrong scale; the cause is an empty CRS in the header, so the reader treats coordinates as longitude and latitude; the result is a misaligned overlay, fixed only by converting the coordinates at the source.

## Comparison with nearby formats

| Dimension | FlatGeobuf | GeoPackage | Shapefile | GeoJSON |
|---|---|---|---|---|
| File count | One | One database file | Several with one name | One text file |
| Layers | Single | Multiple, plus tiles | Single | One collection |
| Spatial index | Packed Hilbert R-tree | R-tree tables | Separate index file | None |
| Streaming and Range | Yes | No | No | No |
| Size | Small | Moderate to large | Moderate | Largest |
| Human readable | No | No, needs SQLite | Binary plus text | Yes |
| Editing | Whole file rewrite | In-place update | Limited | Direct edit |

### Where it fits

| Scenario | Suitable |
|---|---|
| Loading web map data by viewport | Yes |
| Read-only data with hundreds of thousands of features | Yes |
| Multi-layer data management | No, use GeoPackage |
| Inspecting file contents by hand | No, use GeoJSON |
| Traditional GIS delivery | Confirm support first |

## Conversion and tools

FlatGeobuf to GeoJSON expands into an ordinary feature collection with attributes intact; in the other direction, multiple layers and complex styles cannot be written.

Export one layer at a time and check that the file size and feature count make sense afterwards. If downstream clients load by extent, also confirm the index was written and that the server honours Range requests. Use the [vector format converter](/en/tools/format-convert/) for conversion, see [GeoPackage](/en/guide/geopackage/) for the comparison, and [GeoJSON](/en/guide/geojson/) for the field and geometry model.

## Sample data and parser script

[sample.fgb](/examples/data/sample.fgb) is a minimum example of a few hundred bytes, with a header, a spatial index and a handful of features, enough to verify the read order.

[flatgeobuf_parser.py](/examples/python/flatgeobuf_parser.py) parses the bytes directly: it checks the magic, reads the header length, decides from the index node size whether to skip an index, then decodes features one by one into GeoJSON. It does not rely on a reader's index validation, so files without an index still work.

```text
python flatgeobuf_parser.py sample.fgb -o out.geojson
```

If the script reports bad magic, check that the file was not treated as text in transit; if the feature count is zero, the header is probably truncated.

## References

- [FlatGeobuf](https://flatgeobuf.org/)
- [FlatGeobuf on GitHub](https://github.com/flatgeobuf/flatgeobuf)