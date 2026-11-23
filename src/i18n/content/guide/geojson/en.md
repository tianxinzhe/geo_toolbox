---
title: "GeoJSON explained: structure, coordinate order and limits | GeoToolbox"
description: The FeatureCollection, Feature and Geometry structure of GeoJSON, its longitude-first WGS84 convention, polygon ring rules, and the size, attribute and CRS limits.
heading: "GeoJSON explained: structure and limits"
group: vector
order: 4
readingMinutes: 2
updated: 2026-11-09
---

GeoJSON is the de facto standard for geodata on the web. It expresses points, lines, polygons and attributes as JSON, can be read by every language, parsed directly by browsers, and understood by almost every GIS and mapping library.

## Basic structure

The top level is usually a `FeatureCollection` holding an array of `Feature` objects. Each feature has a `geometry` and a `properties` object.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [116.3974, 39.9088] },
      "properties": { "name": "Tiananmen", "category": "landmark" }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[116.39, 39.90], [116.41, 39.90], [116.41, 39.92], [116.39, 39.90]]]
      },
      "properties": { "name": "Example extent" }
    }
  ]
}
```

A single `Feature` or a bare Geometry is also legal at the top level, but `FeatureCollection` is the usual container for datasets.

## Coordinate rules

- **Longitude first, latitude second**: `[lng, lat]`. This is the most common GeoJSON mistake; swapping them raises no error but moves the point to the other side of the planet.
- **Always WGS84 longitude/latitude in degrees**. RFC 7946 removed the `crs` member; older files that still carry it must be read according to their declaration.
- **Polygons use nested arrays**: the outer list holds rings, the inner list holds coordinates for one ring.
- **Rings must close**: first and last coordinates are identical. Exterior/hole winding is a convention, not something every reader enforces.
- **A third dimension** (elevation) is allowed, but many tools ignore it.

## Supported types

Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon and GeometryCollection. A feature's `geometry` may be `null`, meaning attributes without a location.

## Limits

- **Large files**: brackets and commas per coordinate mean hundreds of thousands of points can reach tens of megabytes.
- **No topology**: shared edges between polygons are stored repeatedly.
- **No styling**: colours, icons and widths must be agreed by the application.
- **No projected coordinates by default**: industry data must be converted to WGS84, or use GeoPackage or Shapefile instead.

## Conversion notes

KML to GeoJSON loses styles and balloon descriptions. Shapefile to GeoJSON keeps field names, but the projection declared in `.prj` is not preserved automatically; convert coordinates first. Use the [vector format converter](/en/tools/format-convert/) for actual work, or return to the [15-format overview](/en/guide/vector-formats/).