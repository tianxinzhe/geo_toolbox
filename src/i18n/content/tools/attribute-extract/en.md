---
title: 'Extract by Attribute — Filter vector features online | GeoToolbox'
description: 'Load a GeoJSON, KML, Shapefile or Excel file, choose a field and condition (equals, contains, greater than, is empty and more), then export matching features as GeoJSON.'
updated: 2026-11-10
faq:
  - q: 'How does this compare with QGIS Extract by Attribute?'
    a: 'The semantics are the same: read the attribute table, filter features by one field and condition, and keep geometry and all attributes. This tool applies a single condition at a time, uploads nothing and needs no desktop install. To combine conditions, export the result and filter it again.'
  - q: 'Will numeric comparison treat 9 as greater than 10?'
    a: 'No. When every non-empty value in a field parses as a number, equals, not-equals, greater and less compare numerically, so text "9" and "10" from a CSV are ordered correctly. If a field contains non-numeric text, numeric comparisons match nothing and the page says so.'
  - q: 'How are empty values handled?'
    a: '“Is empty” matches a missing property, null and an empty string. Every other condition ignores empty values. A field that does not exist at all is treated as empty rather than raising an error.'
  - q: 'Which formats can I load?'
    a: 'The same set as the format converter: GeoJSON / TopoJSON, KML / KMZ, GPX, CSV / TSV, Excel, Shapefile (zipped), FlatGeobuf, GeoPackage, WKT, GML, DXF, MIF/MID and GMT.'
---

## What this tool solves

Parcels, POIs and road networks carry an attribute table: land use, district name, population, area, status. To look at one category you would normally reach for “Extract by Attribute” in a desktop GIS, or write a WHERE clause in a database. This tool turns it into three choices — field, condition, value — highlights the matching features on the map and lets you export them as a new GeoJSON.

Typical uses: pull one POI category out of a city-wide dataset, keep parcels above an area threshold, retain a single district or status, or inspect records where a field is empty.

## Choosing a condition

- **Equals / does not equal**: numeric when the field is numeric, otherwise an exact text match.
- **Contains**: case-insensitive text containment, useful for names and categories.
- **Greater than / greater or equal / less than / less or equal**: numeric comparison. If the field is not numeric, nothing matches and the page shows a hint.
- **Is empty / is not empty**: no value needed; they match missing, null and empty strings, or everything else.

The field picker shows up to three sample values to confirm the right column. Changing the field or condition clears the previous result so it is never mistaken for the new query.

**Choosing an existing value**: the value box reads every distinct value of the selected field (up to 200), sorts them numerically or alphabetically, and offers them as a datalist. Pick one, or type a value that is not in the list.

**Multi-layer files**: GeoPackage and Shapefile ZIP archives expose their real layers. GeoJSON has no native layers, so it is split by geometry type into points, lines, polygons and other features. When two or more groups exist, a Layer picker appears below the file name; choose “All features” to skip the split. Switching the layer refreshes the fields, condition and result.

## Types and results

- Attributes imported from CSV or Excel are strings. Before comparing, the tool checks whether the whole column is numeric and switches to numeric comparison, avoiding lexicographic mistakes such as "9" > "10".
- Results keep the original geometry and every attribute, in source order, and export as GeoJSON.
- Display and deduplication of points are handled by the map; this tool does not repair or generalise geometry.

## Limits and precision

- Up to 20 MB and 50,000 features per file. Crop larger datasets first.
- One condition per run. For AND / OR logic, export the result and extract again.
- Coordinates are read as WGS84 longitude/latitude. Projected coordinates land in the wrong place; convert them with the EPSG tool first.
- Everything runs locally in the browser. Files are never uploaded and nothing is written to server logs.

## Common questions

**Why did nothing match?** Check that the field is correct (the sample values help), then compare the value with the data. “Contains” ignores case, but “Equals” requires an exact text match. For numeric fields, enter a plain number rather than text with units.

**Can I filter on several fields?** One condition runs at a time. Extract once, export the GeoJSON, then feed it back as the input for a second pass.

**How is this different from the clip tool?** Clip filters by spatial extent; this tool filters by attribute value. They chain well: extract a land-use category first, then clip it with a district boundary.