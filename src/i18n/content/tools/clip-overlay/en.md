---
title: 'Clip & Overlay — clip, intersect, difference'
description: 'Load two vector layers and run Clip, Intersect or Difference, or simplify with a metre tolerance. Results export as GeoJSON.'
updated: 2026-11-23
readingMinutes: 7
faq:
  - q: 'How does this relate to the QGIS overlay tools?'
    a: 'The operations follow QGIS semantics: Clip keeps the part of the input layer inside the overlay layer, Intersect keeps the shared area, Difference subtracts the overlay from the input, and Simplify runs Douglas–Peucker. The differences are that this tool handles polygons only and keeps the input layer attributes, and everything runs in the browser without installing desktop software.'
  - q: 'Why are only polygons supported?'
    a: 'Points and lines behave differently in an overlay: points must be filtered by containment, lines must be split at the boundary, and the result is harder to explain. This tool runs boolean operations on polygons only. Points and lines are skipped and reported as “Skipped” rather than being dropped silently. Use the format converter to turn them into polygons, or view them with Map Preview.'
  - q: 'Which formats can I load?'
    a: 'The same set as the format converter: GeoJSON / TopoJSON, KML / KMZ, GPX, CSV / TSV, Excel, Shapefile (zipped), FlatGeobuf, GeoPackage, WKT, GML, DXF, MIF/MID and GMT. Parsing happens locally and files are never uploaded.'
  - q: 'What unit is the simplify tolerance in?'
    a: 'Metres. Coordinates are projected to an equidistant plane using the layer’s mean latitude before Douglas–Peucker runs, so the tolerance corresponds to roughly the same ground distance at different latitudes. A larger tolerance removes more vertices; zero or a negative value does nothing.'
---

## What this tool solves

You have two vector layers and want to combine them: cut a study area out with an administrative boundary, take the shared area of two layers, subtract a protected area from parcels, or thin out an over-dense dataset. In QGIS these are Clip, Intersect, Difference and Simplify. This tool brings them to the browser: choose two files, run the operation, and see the result on the map with a GeoJSON export.

There is no desktop GIS to install and nothing to upload. Parsing, boolean operations and area statistics all happen in the page.

## Choosing an operation

- **Clip** keeps the part of layer A that falls inside layer B. The usual case is clipping a data layer by a boundary layer.
- **Intersect** keeps the area shared by A and B. With two polygon layers the geometric result equals Clip; it is listed separately to match QGIS and to leave room for line/polygon intersection later.
- **Difference** subtracts the part of A that overlaps B, which removes rivers, protected areas or already-developed land from parcels.
- **Simplify** uses layer A only and reduces vertices by the given tolerance. It is useful for shrinking GeoJSON while keeping the shape recognisable, or for bringing survey-grade data down to display precision.

Clip, Intersect and Difference need both layers; Simplify only needs A, and the B picker is disabled.

## Attributes and geometry rules

- Results keep **layer A attributes only**. Layer B may contain several features, and one result polygon can overlap more than one of them, so there is no consistent way to merge their attributes; QGIS Clip also keeps the clipped layer’s attributes.
- Polygon boolean operations are handled by polygon-clipping, which copes with holes, multi-part polygons and common self-intersections. Features that cannot be processed are counted under “Skipped” instead of failing the whole run.
- Output is always MultiPolygon (Simplify preserves the original geometry type), and the total area is computed on the sphere.
- Simplified rings stay closed, and rings with fewer than three vertices are dropped.

## Limits and precision

- Up to 20 MB and 50,000 features per file. Crop or simplify larger datasets first.
- Coordinates are read as WGS84 longitude/latitude. If the file stores projected metres, convert it with the EPSG converter first.
- The simplify tolerance is metres converted to degrees using the layer’s mean latitude; data spanning a wide latitude range will see slightly different ground tolerances at the north and south edges.
- Everything runs locally: files are never uploaded, and nothing reaches server logs.

## Common questions

**The result is empty. Why?** Check that the layers actually overlap. If one of them contains only points or lines, all of its features are counted as skipped. Also verify the data is WGS84 longitude/latitude. Projected coordinates put the geometry in a completely different place.

**Can I process more than two layers?** Each run takes two layers. Export the result and feed it back as A or B to continue stacking operations.

**How does this work with the buffer tool?** Generate a buffer polygon, export it, then use it as layer B for Clip or Difference.

## Inputs and outputs

Each side is one layer file, parsed locally. Supported formats are GeoJSON, TopoJSON, KML, KMZ, GPX, CSV, Excel, zipped Shapefile, FlatGeobuf, GeoPackage, WKT, GML, DXF, MIF/MID and GMT. When a GeoPackage or zipped Shapefile contains several layers, only the first layer is read and the page says so; to process another layer, extract it with the format converter first. A and B may come from different formats, but their coordinates must share one longitude/latitude system.

Boolean results are always written as MultiPolygon, even when the input was a plain Polygon. If B cuts one input feature into two pieces, both pieces stay in one result feature and the attributes are stored once. See [GeoJSON explained](/en/guide/geojson/) for rings and multi-part layout. Attributes come from layer A only and are copied shallowly: no renaming, no merging, no default values. Layer B attributes never enter the result, by design rather than by omission.

Simplify reads A only and keeps the original geometry type: Polygon stays Polygon, MultiPolygon stays MultiPolygon, LineString stays LineString. Points have no vertices to thin and remain in the result unchanged. The exported GeoJSON contains the result collection only, not the original A and B layers.

## Boundaries and limits

Coordinates are read as WGS 84 longitude and latitude. A Shapefile with a `.prj` file is converted to WGS 84 first, but a GeoPackage SRID and projected coordinates in other formats are not converted; the page warns or the geometry simply lands in the wrong place. If the two layers use different coordinate systems, they may not overlap at all even when both look local, and the result will be empty.

Boolean operations handle Polygon and MultiPolygon only. Points, lines and empty geometries are counted as skipped and the count is shown, so nothing disappears silently. A ring with a non-finite value, or one with fewer than three vertices after the closing point is removed, is invalid; a plain Polygon with any invalid ring is skipped entirely, while a MultiPolygon drops the invalid parts and keeps the rest.

An empty result is not an error. When A lies completely outside B, both Intersect and Clip return an empty feature collection, and those A features are not counted as skipped: their geometry is valid, it simply has no shared area. Self-intersecting input is usually handled by polygon-clipping; cases it cannot process raise an error, that feature is counted as skipped, and the remaining features continue.

The simplify tolerance is in metres and must be positive; zero or a negative value leaves the geometry untouched. The tolerance is converted to degrees using the layer's mean latitude, so data spanning a wide latitude range is thinned slightly differently at the north and south edges. Rings with fewer than three vertices after thinning are dropped, and a very small polygon can disappear entirely.

## Performance and trade-offs

Boolean cost depends mainly on the total vertex count, not the feature count. A few very dense polygons are harder than many simple ones. polygon-clipping must cope with holes, collinear edges, multi-part polygons and self-intersections, and each of those adds work; every A feature is intersected with or subtracted from the combined B mask, so a fragmented B with many features makes the mask more complex.

50,000 features is a file-level ceiling, not a promise of smooth completion. A few thousand simple rectangles usually finish acceptably; tens of thousands of small polygons against a complex boundary will stall the page and can fail on memory. In that case, crop by extent, simplify vertices or split the job into batches.

Simplify runs a recursive vertex reduction and is usually faster than a boolean operation, but a single line with hundreds of thousands of vertices can still stall the page. Local browser work suits one-off, mid-sized cleanup. Topology rules, batch pipelines, reprojection and loading results into a database belong in a desktop GIS or a command-line tool.

## Compared with alternatives

| Aspect | This tool | Desktop GIS | Command line |
| --- | --- | --- | --- |
| Install | None | Install and learn | Environment and scripts |
| Input formats | Common vector and table formats | Nearly all formats | Depends on drivers and libraries |
| Attribute policy | Layer A only | Keep or merge, configurable | Script-controlled |
| Topology repair | Limited, skips features | Full toolchain | Must be orchestrated |
| Batch work | Two layers per run | Model-based batches | Best for pipelines |
| Typical size | Small to medium | Large, complex topology | Large and repetitive |

Cutting a study area, or subtracting a protected zone, is fastest here. Repairing self-intersections, unifying coordinate systems or chaining dozens of layers is safer in QGIS. A fixed daily overlay is more reliable as a GDAL or PostGIS script.

## A worked example

Let layer A contain three parcels: P1 lies fully inside district B, P2 is half inside and half outside, and P3 lies fully outside. Layer B is a single district polygon.

Run Clip and the result holds two features. P1 keeps its shape, becomes a MultiPolygon with one polygon, and keeps P1's attributes. P2 keeps only the part inside B; if the boundary cuts it into two pieces, both pieces sit in the same MultiPolygon and still count as one result feature. P3 has no shared area, so it is absent from the result and is not counted as skipped.

The total area in the result panel is the sum of the spherical areas of those result polygons, with holes subtracted. The exported GeoJSON works in any tool that accepts MultiPolygon; a downstream system that only accepts single polygons needs a multi-part split first.

Switch to Difference: P1 disappears, P2 keeps the part outside B, and P3 is preserved. Attributes are still A's fields only, so B's district name never appears in the result. If that name is needed, write it into A before the operation or join it separately with the attribute join tool.

## References

- [OGC Simple Features: overlay and set operations](https://www.ogc.org/publications/standard/sfa/)
- [Turf.js: reference implementations of browser-side geometry operations](https://turfjs.org/)
