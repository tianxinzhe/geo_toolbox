---
title: "GMT explained: multi-segment ASCII and plotting conventions | GeoToolbox"
description: How GMT multi-segment ASCII marks segments with >, writes longitude, latitude and z values, how -R and -J control extent and projection, and what it cannot express.
heading: "GMT explained: multi-segment ASCII and plotting conventions"
group: vector
order: 16
readingMinutes: 5
updated: 2026-11-09
---

The GMT (Generic Mapping Tools) format is a simple ASCII structure widely used for scientific plotting. It has no official standard; the rules come from GMT conventions: a `>` starts a segment, followed by coordinate lines.

## Basic form

```text
> first point
116.3974 39.9088
> a line
116.39 39.90
116.40 39.91
116.41 39.92
> a polygon
116.39 39.90
116.41 39.90
116.41 39.92
116.39 39.90
```

- **A leading `>` starts a segment**, and free text may follow it.
- **Each line is `longitude latitude [z]`**, separated by spaces or tabs.
- **Coordinates with no segment header** are treated as one continuous record.
- **Polygons are expressed by closing the first and last point**; there is no polygon keyword.

## Coordinate system and plotting parameters

A GMT file **declares no coordinate system**. It is set on the command line at plot time:

- `-R`: the region, for example `-R116/117/39/40`.
- `-J`: the projection, for example `-JM15c` for a Mercator map 15 cm wide.
- `-B`: frame and ticks.

The same file drawn with a different `-J` produces a different shape, so exchanging a GMT file means passing the region and projection along with it.

## Limits

- **No attribute table**: everything must go into segment header text.
- **No geometry type declaration**: a point is one line, a line is consecutive lines, a polygon is closed by matching endpoints.
- **No coordinate system**: it cannot be interpreted without the plotting parameters.
- **No styling**: colours and symbols come from the plotting command, not the file.

## Where it fits

| Scenario | Advice |
|---|---|
| Quick point, line and polygon plots in GMT | Use it directly |
| Export from GIS to a GMT plot | Export as GMT text |
| Need attributes or layers | Use GeoJSON or GeoPackage |
| Need an exact coordinate system | Record the EPSG code separately |

Use the [vector format converter](/en/tools/format-convert/) for conversion; for projected plotting, first unify the coordinate system with the [projection converter](/en/tools/epsg-convert/).