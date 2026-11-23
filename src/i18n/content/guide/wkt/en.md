---
title: "WKT explained: geometry text, dimensions and SRID | GeoToolbox"
description: How WKT writes POINT, LINESTRING, POLYGON and MULTIPOLYGON, the Z and M dimensions, ring closure rules, and the difference between standard WKT and PostGIS EWKT.
heading: "WKT explained: geometry text, dimensions and SRID"
group: vector
order: 10
readingMinutes: 1
updated: 2026-11-09
---

WKT (Well-Known Text) is the OGC text notation for geometry. It describes geometry only, with no attributes, which makes it ideal for database columns, logs and exchanging a single shape.

## Five common forms

```text
POINT (116.3974 39.9088)
LINESTRING (116.39 39.90, 116.40 39.91, 116.41 39.92)
POLYGON ((116.39 39.90, 116.41 39.90, 116.41 39.92, 116.39 39.90))
MULTIPOLYGON (((116.39 39.90, 116.41 39.90, 116.41 39.92, 116.39 39.90)))
GEOMETRYCOLLECTION (POINT (116.3974 39.9088), LINESTRING (116.39 39.90, 116.40 39.91))
```

- **Coordinate order is x y**, which in geographic data usually means longitude then latitude.
- **Polygons use double parentheses**: the outer pair holds the ring list, the inner pair one ring; the first ring is the exterior, the rest are holes.
- **Rings must close**, with identical first and last coordinates.
- **Z and M are supported**: `POINT Z (116.3974 39.9088 44)`.

## SRID and EWKT

Standard WKT carries no coordinate system. What you often see in databases:

```text
SRID=4326;POINT (116.3974 39.9088)
```

is PostGIS's EWKT extension. When you see the SRID prefix, check that the target tool accepts it; parsers without support reject the whole string as invalid.

## Limits

- **One geometry at a time**: multiple features need multiple lines or records.
- **No attributes**: business fields must be stored separately.
- **No styling and no time**.
- **Precision depends entirely on the written string**, so do not truncate survey measurements to a fixed number of decimals.

## When converting

Converting WKT to GeoJSON drops the SRID or interprets it as WGS84; if the source SRID is not 4326, reproject first. Use the [vector format converter](/en/tools/format-convert/) for conversion, and see [GML](/en/guide/gml/) for the XML form of geometry.