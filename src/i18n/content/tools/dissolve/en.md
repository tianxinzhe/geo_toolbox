---
title: 'Dissolve by Field — Merge features sharing a field value | GeoToolbox'
description: 'Load a vector file, choose a field and dissolve features with the same value: polygons are unioned, lines and points become multi-geometries, mixed groups become collections. Export GeoJSON.'
updated: 2026-11-13
faq:
  - q: 'How is dissolve different from merging layers?'
    a: 'Merging layers only appends features from several files and keeps same-category records separate. Dissolve groups features that share a field value and combines their geometry into one feature; polygons are genuinely unioned so internal boundaries disappear. Use merge for detail and dissolve for summaries.'
  - q: 'Do empty values form their own group?'
    a: 'Yes. A missing field, null and an empty string are grouped together and shown as “(empty)” in the result table. They are never mixed with the text "0" or with whitespace-only values.'
  - q: 'What happens to the other attributes after dissolving?'
    a: 'Features in one group can have different attributes, so they cannot all be kept. The result keeps only the dissolve field and feature_count. Aggregate other values first, for example with an attribute join, if you need them in the output.'
---

## What this tool solves

A parcel dataset stores one record per parcel and every record has a land-use class. A road dataset stores one record per segment and every segment has a road class. When you only care about the extent of each class, you need to combine parcels or segments of the same class into one feature; otherwise the map is full of small adjacent polygons and duplicated boundaries. Desktop GIS calls this Dissolve.

This tool reads one vector file, groups features by the field you choose, combines the geometry of each group and reports the feature count and geometry type per result. The dissolved layer can be exported as GeoJSON for cartography, preparing area summaries, or further clipping and buffering.

Typical uses include dissolving parcels into a land-use map, dissolving road segments by class, dissolving districts into provinces, combining POIs by category into a single multipoint layer, and merging linear records of one facility into a single multiline.

## How to use

First, choose the vector file. Accepted formats include GeoJSON, TopoJSON, KML / KMZ, GPX, CSV / TSV, Excel, zipped Shapefile, FlatGeobuf, GeoPackage, WKT, GML, DXF, MIF / MID and GMT. GeoPackage and Shapefile ZIP expose their real layers. GeoJSON is split by geometry type into points, lines, polygons and other features, with a layer picker when more than one group exists.

Second, choose the dissolve field. The list contains every attribute field present in the active layer, and up to three sample values are shown below it to confirm the column. Values are converted to text and trimmed before grouping; missing values, null and empty strings all go into the empty group.

Third, click Dissolve. The result card shows the number of groups and a table of value, feature count and geometry type, ordered by the first appearance of each value. More than 2,000 groups are still processed, but a hint warns that drawing and exporting may be slow. Zero groups produces an empty state.

On the map, green features are the dissolved result and blue features are the source layer, with the view fitted to the result extent.

## Types and results

- Polygons (Polygon / MultiPolygon): features in a group are unioned with polygon-clipping, so adjacent or overlapping polygons really lose their internal boundaries and the output is a MultiPolygon. Invalid polygons that make the union fail fall back to being kept side by side rather than being lost.
- Lines (LineString / MultiLineString): all lines in a group become one MultiLineString. Endpoints are not snapped and dangling nodes are not removed.
- Points (Point / MultiPoint): all points in a group become one MultiPoint.
- Mixed geometry in one group: each kind is processed separately and combined into a GeometryCollection, for example a polygon union plus a multipoint.
- Features without geometry still count towards feature_count but produce no geometry.
- Each result carries only the dissolve field and feature_count. The field keeps the first original value; the empty group writes an empty string.
- Group order follows the first appearance of each value, so dissolving the same data twice produces the same order.

## Limits and precision

- Up to 20 MB and 50,000 features per run. Many groups produce many output features, so filter or crop first.
- Polygon union works on two-dimensional longitude/latitude rings. It does not repair topology, remove dangling edges or handle complex errors beyond self-intersection; tiny gaps and overlaps are judged from coordinate values.
- Line dissolve does not connect end-to-end segments into one line and does not split at intersections. Use a dedicated network tool for connectivity.
- The result does not compute area. Export it and summarise area together with feature_count and the class field if needed.
- Coordinates are read as WGS84 longitude/latitude and are not reprojected. Projected coordinates appear in the wrong place; convert them with the EPSG tool first.
- Everything runs locally in the browser. Files are never uploaded and nothing is written to server logs.

## Common questions

**Why is there only one feature after dissolving?** The chosen field may have a single value across the dataset, or you may have picked a constant column. Check the sample values and the result table to confirm the grouping.

**Why do internal boundaries remain after a polygon dissolve?** A boolean union only removes boundaries that are truly shared or overlapping. Tiny gaps, coordinates that do not match exactly, or self-intersecting polygons can leave several parts. Simplify or repair the geometry and dissolve again.

**What is the empty group?** A missing field, null and an empty string are grouped together and shown as “(empty)”. This is intentional, so blanks do not scatter into many single-feature groups.

**Can I dissolve by two fields at once?** One field per run. Build a combined helper field first, such as class plus level, and dissolve on that field.