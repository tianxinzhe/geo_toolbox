---
title: "Map projections and EPSG codes: choosing UTM or Gauss-Krüger | GeoToolbox"
description: What happens between longitude/latitude and planar coordinates, how UTM differs from Gauss-Krüger, how to read EPSG codes, and the zone, axis-order and unit traps.
heading: Map projections and EPSG codes
group: projection
order: 2
readingMinutes: 2
updated: 2026-11-09
---

Longitude and latitude are angles on a sphere, so you cannot measure distance or area with them directly. Surveying, planning and map production all require flattening the sphere first, which is what a projection does.

## Every projection distorts something

You cannot preserve angles, distances and areas at the same time. A projection chooses what to keep:

- **Conformal**: local shape and direction are preserved, but area grows with latitude. Mercator is conformal.
- **Equal-area**: area is accurate, shapes stretch. Useful for statistics and thematic maps.
- **Equidistant**: distance is correct only along specific directions, suitable for small extents.

If an area result is off by tens of square metres, check the projection before blaming the formula.

## UTM versus Gauss-Krüger

Both are transverse Mercator variants with zones. The differences are the zone width and scale factor:

| | UTM | Gauss-Krüger |
|---|---|---|
| Zone width | 6° | 3° or 6° |
| Central meridian scale | 0.9996 | 1 |
| False easting | 500,000 m | 500,000 m (zone prefix varies) |
| Typical use | Global | China, Japan and others |

UTM has globally consistent zone numbers, which simplifies cross-border data. Gauss-Krüger is common in Chinese and Japanese surveying, and the zone number and central meridian must match what the data provider used.

## What an EPSG code means

EPSG codes identify a coordinate reference system. One code fixes the datum, projection method, units and parameters:

- `EPSG:4326`: WGS84 longitude/latitude
- `EPSG:3857`: Web Mercator, used by web map tiles
- `EPSG:32650`: WGS84 / UTM zone 50N
- `EPSG:4547`: CGCS2000 / 3-degree Gauss-Krüger, central meridian 114°E

“UTM zone 50” alone is not enough: the datum could be WGS84 or CGCS2000, and the planar coordinates differ by metres.

## Three traps

1. **Zone edges**: data spanning two 3-degree zones should not be forced into one zone; distortion grows quickly at the edges.
2. **Axis order**: Japan's plane rectangular coordinate system uses X for northing and Y for easting, the opposite of the usual convention. Field labels must follow the CRS.
3. **Units**: projected coordinates are in metres, geographic coordinates in degrees. Mixing them in one column produces wrong results.

## How to choose

- Display only, no measurement: use `EPSG:4326` or `EPSG:3857`.
- Engineering measurement or area statistics: pick a projection that covers the extent, preferably equal-area or locally equidistant.
- Cross-border data: UTM. Chinese deliverables: the CGCS2000 3-degree or 6-degree zone required by the project.
- Japan: JGD2011 with one of the 19 plane rectangular zones.

For the coverage and use cases of each projection group, see [map projections at a glance](/en/guide/projection-types/). For actual conversions, use the [EPSG converter](/en/tools/epsg-convert/), which labels fields in the correct axis order.

A projection is not “whatever works”: it must be accurate enough for the extent in question. Choosing the wrong one raises no error; the numbers simply drift.