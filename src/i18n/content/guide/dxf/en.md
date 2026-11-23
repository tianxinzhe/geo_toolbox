---
title: "DXF explained: group codes, entities and coordinate limits | GeoToolbox"
description: How DXF pairs group codes with values, the SECTION/ENTITIES structure, POINT, LINE and LWPOLYLINE entities, and why CRS declarations, arcs and attributes go missing.
heading: "DXF explained: group codes, entities and coordinate limits"
group: vector
order: 15
readingMinutes: 6
updated: 2026-11-23
---

DXF (Drawing Exchange Format) is AutoCAD's exchange format, widely used to move data between CAD and GIS. The ASCII version is plain text made of paired group codes and values.

It exists to solve a compatibility problem: DWG is AutoCAD's native binary format, its structure is not published, and other software struggles to read or write it. DXF expresses the same drawing content in an open structure and became the de facto exchange standard. The cost is that it is built for drafting, not for geographic data: attributes, coordinate systems and topology have no natural place in the format.

DXF comes in ASCII and binary encodings. The ASCII version can be opened in a text editor; the binary version is more compact but starts with a binary marker and cannot be parsed as text.

## Minimum working example

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

From a reader's point of view, the smallest file can hold only an `ENTITIES` section with one entity, plus `EOF`. Real drawings nearly always include `HEADER` and `TABLES`, because units, extents and layer definitions live there. In the ASCII version each group code and value sits on its own line, always in that order: code first, value second.

## Structure and fields

| Section | Content | Required | Common values |
|---|---|---|---|
| `HEADER` | Drawing variables: units, extents, version | Usually present | `$INSUNITS`, `$EXTMIN` |
| `TABLES` | Layer, linetype and text style definitions | Usually present | `LAYER` table |
| `BLOCKS` | Block definitions | When blocks are referenced | `BLOCK` |
| `ENTITIES` | Drawing entities | Yes | `POINT`, `LINE`, `LWPOLYLINE` |
| `OBJECTS` | Non-graphical objects | Optional | Dictionaries, extension data |

Common group codes:

| Code | Meaning | Common values |
|---|---|---|
| `0` | Section or entity type | `SECTION`, `POINT`, `EOF` |
| `2` | Name | `ENTITIES`, layer name |
| `8` | Layer | `0`, `roads` |
| `10` / `20` / `30` | Start or point X/Y/Z | Numbers |
| `11` / `21` / `31` | End X/Y/Z | Numbers |
| `42` | Bulge, describing an arc segment | `0` means a straight segment |
| `62` | Colour number | Colour index |
| `70` | Flag or count | Integer |

Layers are not stored on each entity. They are defined once in the `LAYER` table inside `TABLES`, and entities reference a layer name through group code `8`. The table holds the name, colour and linetype; the entity holds only the name. Cut out the `ENTITIES` section alone and the layer definitions disappear, which is why converted drawings often end up with a single default layer.

Entities are told apart by group code. `POINT` carries one coordinate, `LINE` a start and an end, and `LWPOLYLINE` a list of vertices where the bulge value describes arc segments. `CIRCLE` and `ARC` are stored as centre plus radius, not as polylines. `INSERT` references a block definition from `BLOCKS` and may add scale, rotation and array parameters.

DXF has no concept of fields. Everything is either geometry or a fixed property such as layer name, colour or text content. There are no user-defined columns for name, area or ID, and no NULL. Any attribute-based querying in GIS requires building an attribute table elsewhere.

## Coordinates and units

DXF **has no mandatory coordinate system declaration**. Coordinates may be longitude and latitude, or engineering coordinates in metres. There are only two ways to tell: ask the data provider, or check whether the values fall inside the longitude/latitude range.

`$INSUNITS` in `HEADER` states whether the drawing unit is metres, millimetres or inches, but says nothing about where those coordinates sit on the earth. Survey and planning drawings often use a local planar system whose origin may be a corner of the site, with values nowhere near longitude and latitude. A few drawings ship with a note or a world file, but that is not part of DXF itself.

The magnitude of the numbers is a useful clue: geographic coordinates sit in the tens and hundreds, while engineering coordinates often run into the hundreds of thousands or millions. Known landmarks can confirm the guess, but that needs an external reference, never the file alone.

## Known limits

- **Arcs and splines get discretised**: after conversion to GeoJSON or Shapefile they usually become polylines, with the point count set by export options.
- **Text and block attributes do not become fields automatically**: `TEXT`, `MTEXT` and `ATTRIB` must be extracted separately.
- **Layers and styles are lost**: a target format without layers can only demote them to attributes or drop them.
- **Binary DXF** cannot be parsed as text, so save it as ASCII first.

On top of that, DXF has no topology, no CRS and no notion of null. One layer may mix points, lines, polygons and text, which is normal in drafting but has to be split into separate layers or geometry types before GIS use.

## Common errors and traps

**Reading binary DXF as text**: garbage appears at the start and the parser fails on the first group code; the cause is the binary marker and compact encoding; the result is a trip back to CAD to save an ASCII copy.

**Using CAD coordinates as longitude and latitude**: data lands in the ocean or far outside any map; the cause is that DXF declares no CRS and engineering coordinates have a completely different magnitude; the result is a layer that will not overlay until the origin and projection are established.

**Ignoring the bulge on polylines**: boundaries with arcs turn into faceted lines and area and length drift; the cause is that `LWPOLYLINE` uses group code `42` for arc segments while simple parsers read only the vertices; the result is altered geometry, and the loss is usually irreversible.

**Never exploding block references**: only insertion points appear and the geometry inside the block is missing; the cause is that `INSERT` references geometry stored in `BLOCKS`; the result is a wrong feature count, fixed by exploding or recursively reading block definitions.

**Leaving every entity on layer `0`**: after conversion nothing can be filtered by category and everything sits in one pile; the cause is drafting without layers, or an export that merges them into the default; the result is lost classification that has to be inferred from geometry or text.

## Comparison with nearby formats

| Dimension | DXF | GeoJSON | Shapefile | GeoPackage |
|---|---|---|---|---|
| Attribute model | No user fields | Arbitrary JSON properties | DBF fields, 10-character names | Full table schema |
| CRS | Not declared | WGS84 by convention | Optional `.prj` | SRS per layer |
| Geometry | Entities, including arcs and blocks | Points, lines, polygons, collections | One type per file | Multiple types as WKB |
| Layers | Layers, but no fields | None | None | Multiple layers |
| Size | Large as text, smaller as binary | Largest | Moderate | Moderate to large |
| Human readable | ASCII yes | Yes | Partly | Needs SQLite |
| Typical use | Drafting and design | Web transfer | Traditional GIS delivery | Data management and delivery |

### Where it fits

| Scenario | Advice |
|---|---|
| Extract parcel boundaries from CAD | DXF → GeoJSON / GeoPackage |
| Keep editing the drawing | Stay in DXF |
| Need an attribute table | Put text and block attributes into CSV, then join to the geometry |
| Need a coordinate system | Confirm with the provider, or convert from the known engineering CRS |

## Conversion and tools

Converting DXF to a GIS format usually keeps only geometry and layer names; text, dimensions and hatches are dropped or reduced to points. If the text matters, join it to the geometry by position before converting and export a separate attribute table.

The usual workflow has three steps: confirm the unit and the nature of the coordinates, transform engineering coordinates into the target CRS, then split entities by geometry type. Arc and spline resolution has to be decided at the first step: too coarse distorts the shape, too fine inflates the feature count.

Use the [vector format converter](/en/tools/format-convert/) for conversion, and run projected coordinates through the [projection converter](/en/tools/epsg-convert/) to WGS84 first. See [GMT](/en/guide/gmt/) and [MIF/MID](/en/guide/mif-mid/) for the other mapping formats, and [GeoJSON](/en/guide/geojson/) for the field and geometry model.

## Sample data and parser script

[sample.dxf](/examples/data/sample.dxf) is a minimal ASCII example with one `POINT`, one `LINE` and one `LWPOLYLINE`, small enough to read the group code structure in a text editor.

[dxf_parser.py](/examples/python/dxf_parser.py) uses ezdxf to turn `POINT` into a point, `LINE` into a line and `LWPOLYLINE` into a line or closed polygon, discretising circles and arcs at fixed vertex counts and keeping the layer name as a property; other entities are skipped.

```text
python dxf_parser.py sample.dxf -o out.geojson
```

The script reads no CRS and does not reproject. If the output coordinates are very large, the drawing uses engineering coordinates; if a layer is missing, check whether its entities live inside a block reference and need exploding.

## References

- [AutoCAD DXF Reference](https://help.autodesk.com/view/OARX/2024/ENU/)
- [GDAL DXF driver](https://gdal.org/en/stable/drivers/vector/dxf.html)