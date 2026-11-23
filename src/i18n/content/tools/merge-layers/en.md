---
title: 'Merge Layers — Combine vector files into one layer | GeoToolbox'
description: 'Select several GeoJSON, KML, Shapefile or GeoPackage files, choose a layer for multi-layer containers, merge features while keeping attributes, review geometry counts and export GeoJSON locally.'
updated: 2026-11-13
faq:
  - q: 'How is merging different from dissolve?'
    a: 'Merging only appends features from several files and keeps geometry and attributes as they are, so overlapping records remain separate. Dissolve groups features that share a field value and genuinely combines their geometry, including polygon unions. Use merge for raw records and dissolve for summaries.'
  - q: 'Does merging remove duplicates or change coordinates?'
    a: 'No. It does not deduplicate, repair geometry or reproject. Features are appended in file order, and duplicate records from different files are both kept.'
  - q: 'Can one broken file stop the whole merge?'
    a: 'No. Each file is parsed and reported separately. A failed file shows its reason on its own card while the remaining files can still be merged and exported.'
---

## What this tool solves

Data that was split by district, month or map sheet usually needs to become one complete layer at the end. Desktop GIS calls this Merge or Append, and a database calls it UNION ALL. Joining files by hand is slow and easy to get wrong.

This tool lets you select several vector files at once, choose a layer for any multi-layer container, and merge everything with one click. The result reports the number of files, the total feature count and the geometry-type distribution, and can be exported as GeoJSON for map preview, attribute joins, clipping or dissolve.

Typical uses include combining parcel layers from several districts into a city-wide layer, merging monthly POI exports into a yearly dataset, stitching contour sheets into one map, collecting KML tracks into a single file, and inspecting layers from different sources that share a similar schema.

## How to use

Click Add files and select several files in the picker at once; you can also click again later to append more. Each file is parsed on its own and shown on a card with its name, detected format and feature count. GeoPackage and Shapefile ZIP archives expose their real layers through a layer picker. GeoJSON has no native layers, so it is split by geometry type into points, lines, polygons and other features, and the picker appears when more than one group exists.

Use Remove on a card to drop one file, or Clear all at the top to remove every file and reset the result. Changing the file list or a layer selection clears the previous merge result, so click Merge layers again.

Click Merge layers and the result card reports the number of contributing files, the total feature count and a breakdown by points, lines, polygons, other and features without geometry. Green features on the map are the merged result, and the map zooms to their extent. Download GeoJSON saves the merged collection.

Files do not need to share a format: GeoJSON, KML, GPX, Shapefile, GeoPackage and CSV point data can be mixed as long as they parse. Fields may also differ between files. A missing field simply does not exist on that feature; it is not filled with an empty string.

## Types and results

- Features are appended in file-list order, preserving the order inside each file. Nothing is sorted, deduplicated or simplified.
- Every feature keeps its own attributes. If a feature has no source field, the source file name is written into one; if source already exists, the original value is preserved and never overwritten.
- Geometry counts group Point and MultiPoint as points, LineString and MultiLineString as lines, Polygon and MultiPolygon as polygons, and everything else as other. Features without geometry are counted separately, which makes wrong types easy to spot.
- Coordinates and geometry are kept as they are. Files from different coordinate systems will land in different places on the map; this tool does not reproject them.
- The merged result exports as standard GeoJSON with WGS84 longitude/latitude coordinates.

## Limits and precision

- Up to 20 MB and 50,000 features per file. With very large totals, drawing and exporting become slower, so merge in batches.
- A failed file does not block the others: its reason appears on its own card while the remaining files still participate. Common causes are a damaged file, an extension that does not match the content, or an archive with no readable layer.
- Only features are appended. Fields are not mapped or renamed, so identical names naturally merge into one column and different names stay separate, possibly with many empty values.
- Shapefile ZIP and GeoPackage are parsed from raw bytes and must be complete. Uploading only a .shp file loses attributes or the coordinate-system declaration.
- All parsing and merging run locally in the browser. Files are never uploaded and nothing is written to server logs.

## Common questions

**Why did one file fail to parse?** Check that the extension matches the content, for example that a KML file was not saved as .json. For Shapefile, upload a zip containing .shp, .dbf and .shx. For GeoPackage, make sure it contains at least one feature layer. Damaged files and files over 20 MB also fail.

**Why do the fields not line up after merging?** Merging does not map fields: name in file A and title in file B remain separate columns. Rename them in the source data, or complete them with an attribute join afterwards.

**Can files with different geometry types be merged?** Yes. Points, lines and polygons can coexist in the result and are counted separately. If a downstream tool accepts only one geometry type, split the result with extract-by-attribute or by geometry type first.

**Why are some features in the wrong place on the map?** This tool does not reproject. A file in projected coordinates, such as UTM metres, is shown as if it were longitude/latitude. Convert it to WGS84 with the EPSG tool before merging.

## References

- [RFC 7946: GeoJSON format specification](https://datatracker.ietf.org/doc/html/rfc7946)
- [OGC Simple Features: geometry type definitions](https://www.ogc.org/publications/standard/sfa/)
