---
title: 'Attribute Join — Attach CSV or Excel tables to vectors | GeoToolbox'
description: 'Load a vector file and a CSV, TSV or Excel table, match them by a shared field, merge the table columns into feature attributes and export GeoJSON. Everything runs locally in the browser.'
updated: 2026-11-13
faq:
  - q: 'How is this different from VLOOKUP in Excel?'
    a: 'The idea is the same: look up each value in another table and bring columns back. Here the result is GeoJSON with geometry, so you can see the matches on a map and feed them into clipping, extraction or dissolve tools. The file never leaves your browser.'
  - q: 'Does the number 1 match the text "1"?'
    a: 'Yes. Values are converted to text and trimmed before matching, so 1, "1" and " 1 " are the same key. Leading zeros are not normalised, so "01" and "1" remain different and need cleaning first.'
  - q: 'Which value wins when both sides share a field name?'
    a: 'The table value overwrites the feature value. The number of features affected is reported as field conflicts. The two join fields themselves are excluded from that count to avoid noise from a shared primary key.'
---

## What this tool solves

Vector files usually carry geometry and a few fields, while population, area, district codes and category names live in a separate CSV or Excel sheet. Putting them together is called a table join in a desktop GIS, a JOIN in a database and VLOOKUP in a spreadsheet.

This tool turns the operation into four choices: a vector layer, an attribute table, one field on each side and a Join button. Matched features appear on the map, every table column is merged into the feature properties, and the result can be downloaded as GeoJSON for previewing, clipping or further analysis.

Typical uses include attaching land-use classes to parcels, adding district names and population to POIs, matching survey points with an inventory sheet by identifier, and joining spreadsheet statistics to map units for thematic mapping.

## How to use

First, choose the vector file. The accepted formats match the format converter: GeoJSON, TopoJSON, KML / KMZ, GPX, CSV / TSV, Excel, zipped Shapefile, FlatGeobuf, GeoPackage, WKT, GML, DXF, MIF / MID and GMT. GeoPackage and Shapefile ZIP archives expose their real layers. GeoJSON has no native layers, so it is split by geometry type into points, lines, polygons and other features; a layer picker appears when more than one group exists.

Second, choose the attribute table. It only needs to be a rectangular table: a header row followed by one record per row. CSV, TSV and Excel are accepted, and only the first worksheet is read. The table does not need longitude or latitude columns and is never treated as point data.

Third, pick the two join fields. The left list contains fields from the vector features, the right list contains columns from the table. The table card also shows the row and column counts so you can confirm that the right sheet was loaded.

Fourth, decide whether to keep unmatched features. When checked, features with no matching row stay in the result with their geometry and original attributes untouched. When unchecked, they are removed. After clicking Join, the result card reports matched, unmatched and field-conflict counts, and duplicate keys are called out separately.

On the map, green features are the joined result and blue features are the original vector layer. Click any feature to inspect its full attribute set and confirm that the table values were attached.

## Types and results

- Join keys are converted to text and trimmed. The number 1 and the string "1" therefore match; booleans compare as true / false. Missing values, null and empty strings never match, so all blank keys cannot collapse into one record.
- When the table contains duplicate keys, the first row wins. The remaining rows are ignored and counted in the duplicate hint instead of overwriting the same feature repeatedly.
- If a table column has the same name as a feature field, the table value overwrites the feature value. The number of affected features is reported as field conflicts; the two join fields themselves are excluded.
- The result keeps the original geometry, feature order and every attribute, and exports as GeoJSON. Feature order follows the source vector layer, not the table.
- Numbers read from CSV or Excel arrive as text. This tool does not retype them, so exported values look exactly like the cells in the source table.

## Limits and precision

- Up to 20 MB and 50,000 features per vector file. Crop the extent or simplify geometry for larger datasets.
- Matching is a single-field equality join. Range joins, fuzzy matching and composite keys are not supported; build a helper column in the table if you need several fields combined.
- Attribute tables are read as UTF-8. If Chinese headers or values appear garbled, save the sheet as a UTF-8 CSV first.
- Only attributes are changed. Coordinates are not reprojected, so data that is not WGS84 longitude/latitude will sit in the wrong place; convert it with the EPSG tool first.
- Everything runs locally in the browser. Files are never uploaded and nothing is written to server logs.

## Common questions

**Why did nothing match?** Check that the vector field and table column are not swapped, then compare the actual values. The number 1 and the text "1" match, but "01" versus "1" or identifiers with and without spaces are different keys unless you clean them first.

**What happens with duplicate identifiers in the table?** The first occurrence wins and the rest are counted in the duplicate hint. If every row must be preserved, merge the duplicates in the spreadsheet first or give each key a single row.

**Can I join several Excel worksheets?** Only the first worksheet is read. Move the sheet you need to the front, or save it as a separate CSV.

**Can I continue with spatial analysis afterwards?** Yes. The exported GeoJSON can be used directly as input to clip, buffer, extract-by-attribute and dissolve tools.

## References

- [RFC 4180: CSV format specification](https://datatracker.ietf.org/doc/html/rfc4180)
- [RFC 7946: GeoJSON format specification](https://datatracker.ietf.org/doc/html/rfc7946)
