---
title: 'Extract by Attribute — Filter vector features online | GeoToolbox'
description: 'Load a GeoJSON, KML, Shapefile or Excel file, choose a field and condition (equals, contains, greater than, is empty and more), then export matching features as GeoJSON.'
updated: 2026-11-23
readingMinutes: 8
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

## Inputs and outputs

Input is one vector file or a coordinate table: GeoJSON, TopoJSON, KML, GPX, CSV, TSV, Excel, zipped Shapefile, FlatGeobuf, GeoPackage, WKT, GML, DXF, MIF/MID and GMT. Parsing runs in the browser and nothing is uploaded. For CSV and Excel the geometry comes from the longitude and latitude columns and every other column becomes a property; vector files are read with their geometry and attributes intact. CSV header text is kept exactly, including leading or trailing spaces, which then become part of the field name; loose normalisation happens only when looking for coordinate columns.

Output is a GeoJSON FeatureCollection containing the matching features only. Geometry is unchanged, every attribute is copied, and source order is preserved. Filtering never changes types: a CSV value of `"9"` compared as a number is still written as the string `"9"` on export. Use the format converter afterwards if a field must change type.

The field picker lists every property name and attaches up to three non-empty sample values. "Choose an existing value" reads up to 200 distinct values, sorts them and offers them for selection; a value outside the list can still be typed. These aids never change the comparison rules.

## Empty values, case and numbers

Empty covers a missing property, `null`, an empty string and a string containing only whitespace. "Is empty" matches all of these, while every other condition ignores empty values. A field that is missing on some features is treated as empty rather than raising an error.

Text comparison is case-sensitive and does not trim whitespace. "Equals" requires an exact string, so one extra space at either end breaks the match. "Contains" is different: it lowercases both the stored value and the query and then tests for a substring, and the query itself is trimmed. It suits names and categories.

The numeric decision is made for the whole column. A column counts as numeric only when every non-empty value parses as a number; a single `N/A`, a unit such as `12 km` or a thousands separator such as `1,234` pushes the whole column back to text. On a numeric column, equals, not-equals, greater and less compare numerically, so `9` equals `9.0` and `007` equals `7`. When the whole column is classified as text, the page warns that greater and less are unreliable; only individual values that parse as numbers can match numerically, values containing letters do not, and the comparison never falls back to lexicographic order.

Booleans display as `true` or `false` and take part in comparison as non-empty text. Objects and arrays display as JSON strings, so "contains" tests that text and is not a structured query.

## Boundaries and limits

One field and one condition are applied at a time. For AND or OR, extract once and export, then feed the result into a second pass; there is no hidden state between runs, and the exported GeoJSON is the complete intermediate result.

Files are capped at 20 MB and 50,000 features; larger input is refused. Coordinates are read as WGS 84 longitude and latitude; a Shapefile with a `.prj` file is converted first, while projected data in other formats lands in the wrong place and must be converted beforehand. CSV is decoded as UTF-8, a UTF-8 BOM is recognised and removed, and other encodings such as GBK appear as garbled text and should be converted beforehand. See [CSV and TSV for coordinates](/en/guide/csv-tsv/) for layout and encoding traps. RFC 4180 quoting is handled by the parser, so commas, line breaks and escaped quotes inside a field do not split columns.

The tool does not repair geometry, deduplicate or clean attributes. Overlapping points may look like one on the map while the data still holds several; deduplicate separately or after export. Duplicate field names and empty headers are left to the parser's existing rules, so it is best to tidy the source file first.

## Performance and data volume

Loading scans the attribute table once to collect fields, sample values and the numeric flag, and "choose an existing value" scans the chosen field again. Cost grows with features multiplied by fields; tens of thousands of rows with a few dozen columns are usually fine, while hundreds of wide columns become noticeably slower.

Filtering itself is one linear pass and lighter than loading. Parsing is often the real bottleneck: large GeoJSON or Excel files use more memory, and approaching 50,000 features the page can stall. Very long property values or many nested objects also slow display and serialisation.

This tool suits one-off filtering, data-quality checks and handing a result to the next step. Multi-condition logic, regular expressions, spatial predicates, grouped statistics or repeated queries belong in QGIS, a spatial database or a script.

## Compared with alternatives

| Aspect | This tool | Desktop GIS | SQL or a script |
| --- | --- | --- | --- |
| Install | None | Install and learn | Database or runtime |
| Conditions | One field, one condition | Expressions and multiple conditions | Arbitrary queries |
| Type handling | Whole-column numeric detection | Field types and expressions | Schema and casts |
| Output | GeoJSON in the browser | Layers and many formats | Tables, files or services |
| Repetition | Manual | Models and batch runs | Best for automation |
| Typical size | Small to medium files | Large data, complex rules | Big data and fixed pipelines |

Checking one category or confirming that a column is empty is fastest here. Multiple conditions, regular expressions or joins are better served by QGIS expressions. Repeating the same filter into a database every day is more reliable as SQL or a script.

## A worked example

Take a UTF-8 CSV with the header `name,category,lng,lat,area_m2` and five rows: one `name` contains a comma and is wrapped in double quotes, and one `area_m2` is empty.

Choose the `category` field, the "Contains" condition and the value `park`. Case and surrounding spaces do not affect the result, so `National Park` and `city park` both match. The result panel shows the match count and the map highlights the points.

Then choose `area_m2`, the "Greater than" condition and the value `1000`. Because every non-empty value in that column is numeric, the comparison is numeric: `900` does not match and `12000` does; the empty row matches no greater-than condition. Switch the condition to "Is empty" to find that row.

The exported GeoJSON contains only the matching features, with `name`, `category` and `area_m2` preserved; `area_m2` is still a string. Turn it into a real numeric field in the format converter or a later step rather than rewriting the source during filtering.

## References

- [RFC 4180: CSV format specification](https://datatracker.ietf.org/doc/html/rfc4180)
- [RFC 7946: GeoJSON format specification](https://datatracker.ietf.org/doc/html/rfc7946)
