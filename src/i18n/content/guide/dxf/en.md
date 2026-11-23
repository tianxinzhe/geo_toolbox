---
title: "DXF explained: group codes, entities and coordinate limits | GeoToolbox"
description: How DXF pairs group codes with values, the SECTION/ENTITIES structure, POINT, LINE and LWPOLYLINE entities, and why CRS declarations, arcs and attributes go missing.
heading: "DXF explained: group codes, entities and coordinate limits"
group: vector
order: 15
readingMinutes: 1
updated: 2026-11-09
---

DXF (Drawing Exchange Format) is AutoCAD's exchange format, widely used to move data between CAD and GIS. The ASCII version is plain text made of paired group codes and values.

## Basic structure

```text
0
SECTION
2
ENTITIES
0
POINT
8
0
10
116.3974
20
39.9088
0
LINE
8
0
10
116.39
20
39.90
11
116.40
21
39.91
0
ENDSEC
0
EOF
```

- `0/SECTION` + `2/ENTITIES` opens the entity section.
- `0/POINT` starts a point entity: `8` is the layer, `10/20` are X/Y.
- For `0/LINE`, the start point is `10/20` and the end point is `11/21`.
- `0/ENDSEC` and `0/EOF` close the file.

Other common entities include `LWPOLYLINE` (lightweight polyline), `CIRCLE`, `ARC`, `TEXT` and `INSERT` (block reference).

## Coordinates and units

DXF **has no mandatory coordinate system declaration**. Coordinates may be longitude and latitude, or engineering coordinates in metres. There are only two ways to tell: ask the data provider, or check whether the values fall inside the longitude/latitude range.

## Known limits

- **Arcs and splines get discretised**: after conversion to GeoJSON or Shapefile they usually become polylines, with the point count set by export options.
- **Text and block attributes do not become fields automatically**: `TEXT`, `MTEXT` and `ATTRIB` must be extracted separately.
- **Layers and styles are lost**: a target format without layers can only demote them to attributes or drop them.
- **Binary DXF** cannot be parsed as text, so save it as ASCII first.

## Where it fits

| Scenario | Advice |
|---|---|
| Extract parcel boundaries from CAD | DXF → GeoJSON / GeoPackage |
| Keep editing the drawing | Stay in DXF |
| Need an attribute table | Put text and block attributes into CSV, then join to the geometry |
| Need a coordinate system | Confirm with the provider, or convert from the known engineering CRS |

Use the [vector format converter](/en/tools/format-convert/) for conversion, and run projected coordinates through the [projection converter](/en/tools/epsg-convert/) to WGS84 first. See [GMT](/en/guide/gmt/) and [MIF/MID](/en/guide/mif-mid/) for the other mapping formats.