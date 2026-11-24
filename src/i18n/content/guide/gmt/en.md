---
title: 'GMT explained: multi-segment ASCII and -R/-J | GeoToolbox'
description: 'How GMT multi-segment ASCII marks segments, writes lon/lat/z values, how -R and -J control extent and projection, and what it cannot express.'
heading: "GMT explained: multi-segment ASCII and plotting conventions"
group: vector
order: 16
readingMinutes: 6
updated: 2026-11-23
---

The GMT (Generic Mapping Tools) format is a simple ASCII structure widely used for scientific plotting. It has no official standard; the rules come from GMT conventions: a `>` starts a segment, followed by coordinate lines.

Strictly speaking it is not a separate data format at all, but the text layout that GMT's table reader accepts. The same file means different things to different modules: `gmt plot` treats the first two columns as coordinates and, with `-C`, may read the third as a colour value; `gmt surface` treats three columns as scattered data to interpolate. Nothing in the file declares a type, so the command decides.

## Minimal example: the basic form

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

The header line is the only structural marker. It cuts the file into segments, each a run of consecutive coordinates, and the text after `>` usually becomes the feature name. Blank lines do not open a new segment and are normally skipped, so omitting one `>` silently joins two segments into one line. Comment lines start with `#`; they are safe at the top of a file or segment, while a comment in the middle of coordinates is handled inconsistently between modules.

## Coordinate system and plotting parameters

A GMT file **declares no coordinate system**. It is set on the command line at plot time:

- `-R`: the region, for example `-R116/117/39/40`.
- `-J`: the projection, for example `-JM15c` for a Mercator map 15 cm wide.
- `-B`: frame and ticks.

The same file drawn with a different `-J` produces a different shape, so exchanging a GMT file means passing the region and projection along with it.

`-R` is ordered west, east, south, north, with western longitudes negative, so a region crossing 180° has to be split or handled with the 0–360 convention. `-J` decides how the sphere is flattened: geographic projections such as `-JM` and `-JN` assume longitude and latitude, while a linear projection such as `-JX` treats the numbers as plain planar coordinates. Feed projected metres to a geographic projection and every point falls outside the region, leaving a blank plot.

Column selection can override the default order. `-i` chooses which columns to use, for example taking the third as x and the second as y; it affects reading only, never the file, so one dataset can be interpreted differently by two commands. Use `-h` when the file has a header record. Gridded data such as netCDF is a separate model and cannot be read as a table.

## Structure and fields

| Line or field | Rule | Required | Common values |
|---|---|---|---|
| segment header `>` | starts a segment, free text follows | may be omitted in a single-segment file | `> Times Square` |
| coordinate line | several whitespace-separated numbers | yes | `-73.9855 40.758` |
| third column `z` | elevation, intensity or colour value | optional | height, temperature, weight |
| comment `#` | line is ignored | optional | `# lon lat` |
| blank line | skipped, does not split segments | optional | empty |
| column separator | spaces or tabs, may be mixed | yes | one or more spaces |
| geometry type | inferred from point count and closure | never declared | point, line, closed ring |
| attributes | no attribute table, only header text | cannot be expressed | none |
| CRS | does not exist in the file | cannot be expressed | set by `-R` and `-J` |

A coordinate line needs at least two columns. Extra columns are not an error; the module decides what to do with them and ignores the rest if it expects two. There is no marker for point, line or polygon: one line is a point, consecutive lines are a line, and only a ring whose first and last coordinate match, with at least four points, resembles a closed polygon. Plotting also needs `-L` before the polyline is closed and filled, because the file never tells the software "this is a polygon".

Styling is absent too. Colour, symbol and line width come from options such as `-W`, `-G` and `-C` on the plotting command, so the appearance changes with the command rather than with the data.

## Common mistakes

### Missing segment headers

Two separate lines get joined by a long stroke, or several polygons merge into one. The `>` line between segments is missing, and a blank line is not a separator, so the reader keeps appending coordinates to the same segment. The geometry is connected wrongly. The plot shows an obvious crossing, but the data raises no error and spot checks rarely catch it.

### Swapped axes or wrong units

The map comes out blank, every point sits outside the region, or all points stack in a corner. Either the columns are latitude then longitude, or the file holds projected metres while `-J` applies a geographic projection. Region and data do not intersect; the command succeeds but draws nothing. Confirm the column order and units, then fix them with `-i` or the right projection.

### Longitudes written as 0–360

Western-hemisphere points appear at the far side of the map, or a line crossing 180° circles the globe. Some sources write longitudes from 0 to 360, while geographic projections assume −180 to 180. Points shift and long lines sweep across the figure. Subtract 360 from values above 180, or settle on one convention for the whole dataset.

### Comma-separated values

The read fails, or the whole line is treated as one invalid record. GMT splits on whitespace, and a comma is not a delimiter; copying from CSV or a document often brings commas along. The module errors or skips the row, and data quietly goes missing. Replace commas with spaces or tabs before publishing.

### Writing attributes into the segment header

After conversion only the name survives; categories and numeric fields are gone. A GMT table has no attribute table. The header is a free-text label, not a key-value structure. You cannot colour or filter by attribute. Use GeoJSON or GeoPackage when attributes matter, or keep a separate table and rely on row order.

### Unclosed polygons

A filled area appears as an outline, or the fill is malformed. The first and last points differ, or the last point is wrong. Closure can only be judged from coordinates, since the file has no polygon type. `-L` closes the ring forcibly and may add an edge across the shape; without it the ring is treated as a line. Neither case reports an error.

## Where it fits

| Scenario | Advice |
|---|---|
| Quick point, line and polygon plots in GMT | Use it directly |
| Export from GIS to a GMT plot | Export as GMT text |
| Need attributes or layers | Use GeoJSON or GeoPackage |
| Need an exact coordinate system | Record the EPSG code separately |

## Compared with neighbours

| Format | Attributes | Geometry type | CRS | Ecosystem |
|---|---|---|---|---|
| GMT table | none, only header text | inferred | no declaration | GMT and a few scientific tools |
| CSV / TSV | any columns | points, or a WKT column | no declaration | universal |
| GeoJSON | yes | explicit points, lines, polygons | WGS84 by default | web maps and GIS |
| WKT | none | explicit, one per line | optional SRID | GIS and databases |

GMT's niche is narrow: preparing data for GMT plots, or reading coordinates back out. The format is simple enough to write by hand, and as a result carries no self-description at all. When data has to be exchanged, carry attributes or be understood by someone else, CSV or GeoJSON fits better.

## Converting and tools

Use the [vector format converter](/en/tools/format-convert/) for conversion; for projected plotting, first unify the coordinate system with the [projection converter](/en/tools/epsg-convert/). General table rules are in [CSV and TSV](/en/guide/csv-tsv/); the wider choice is in the [15-format overview](/en/guide/vector-formats/).

## Sample data and parser

- [sample.gmt](/examples/data/sample.gmt), [gmt_parser.py](/examples/python/gmt_parser.py)

The sample has three segments: a point at Times Square, a short walking line and a closed rectangle. The standard-library script splits on segments, writes a single point as a point, a closed ring of at least four points as a polygon and anything else as a line:

```bash
python gmt_parser.py sample.gmt -o out.geojson
```

Header text becomes a `name` property. A file with no `>` is treated as one segment. Holes cannot be expressed, coordinates are read as stored, and no reprojection is performed.

## References

- [GMT documentation](https://docs.generic-mapping-tools.org/latest/)
- [GMT: gmt command reference](https://docs.generic-mapping-tools.org/latest/gmt.html)