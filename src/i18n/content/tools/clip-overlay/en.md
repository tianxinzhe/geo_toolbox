---
title: 'Clip & Overlay — Clip, intersect, difference, simplify | GeoToolbox'
description: 'Load two vector layers and run Clip, Intersect or Difference, or simplify with a metre-based tolerance. Results are drawn on the map and exported as GeoJSON.'
updated: 2026-11-10
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

No desktop GIS install and no upload: parsing, boolean operations and area statistics all happen in the page.

## Choosing an operation

- **Clip** keeps the part of layer A that falls inside layer B. The usual case is clipping a data layer by a boundary layer.
- **Intersect** keeps the area shared by A and B. With two polygon layers the geometric result equals Clip; it is listed separately to match QGIS and to leave room for line/polygon intersection later.
- **Difference** subtracts the part of A that overlaps B — removing rivers, protected areas or already-developed land from parcels.
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
- Everything runs locally, files are never uploaded, and nothing is written to server logs.

## Common questions

**The result is empty. Why?** Check that the layers actually overlap. If one of them contains only points or lines, all of its features are counted as skipped. Also verify the data is WGS84 longitude/latitude — projected coordinates put the geometry in a completely different place.

**Can I process more than two layers?** Each run takes two layers. Export the result and feed it back as A or B to continue stacking operations.

**How does this work with the buffer tool?** Generate a buffer polygon, export it, then use it as layer B for Clip or Difference.