---
title: "CSV and TSV for coordinates: layout and traps | GeoToolbox"
description: Two ways to arrange longitude and latitude in CSV / TSV, when to use a WKT column, encoding and delimiter traps, and why spreadsheets are the most error-prone geodata format.
heading: CSV and TSV for coordinates
group: vector
order: 8
readingMinutes: 6
updated: 2026-11-23
---

CSV and TSV are ordinary tabular text, and the most error-prone way to deliver geodata: there is no CRS declaration and no geometry type, so everything depends on column names and convention.

CSV syntax has RFC 4180 to point at; TSV has only an IANA media type and long-standing habit, and neither says anything about geography. Whether a table becomes a map depends on three facts stated outside the file: which coordinate system applies, which two columns hold coordinates, and whether the geometry is a point or a WKT string. None of these makes the file unreadable. They make it wrong quietly.

## Minimal example: two layouts

**Two coordinate columns**, for point data:

```csv
name,lng,lat,category
Tiananmen,116.3974,39.9088,landmark
Forbidden City,116.3970,39.9163,landmark
```

This is the least demanding layout: any spreadsheet opens it and any language reads it. The cost is that it only carries points — one row per point, nowhere to put a line, a polygon or a geometry type. A header of `lng,lat` is much clearer than `x,y`, because x may mean longitude or a projected easting depending on the tool. The file records no EPSG code, so the delivery note has to say "WGS84 longitude and latitude, longitude first".

**One WKT geometry column plus attributes**, for mixed geometry:

```csv
name,geom,area_m2
Example extent,"POLYGON ((116.39 39.90, 116.41 39.90, 116.41 39.92, 116.39 39.90))",482000
Example road,"LINESTRING (116.39 39.90, 116.40 39.91)",0
```

As soon as a line or polygon appears, use a WKT column or the geometry will be flattened into points. The WKT value contains commas, so the whole cell must be quoted — the most frequently missed part of CSV quoting. The reader also needs to know which column is geometry; `geom`, `geometry` and `wkt` are the usual names.

## TSV

TSV uses tabs instead of commas under otherwise identical rules. Its advantage is that names and addresses may contain commas without quoting:

```tsv
name	lng	lat
Tiananmen	116.3974	39.9088
Forbidden City	116.3970	39.9163
```

The cost is that a literal tab cannot appear in a field, and copy-paste often replaces tabs with spaces. TSV also has no widely implemented escape convention of the CSV kind: when a field really does contain a tab or a newline, parsers disagree about what to do. It suits machine-written, machine-read files better than data pasted through a chat window.

## Structure and fields

| Item | Rule | Required | Common values |
|---|---|---|---|
| Record delimiter | one record per line; CRLF in RFC 4180 | yes | CRLF, LF |
| Field delimiter | comma for CSV, tab for TSV | yes | `,`, `\t`, `;` (European variant) |
| Header | should match the number of data fields | optional in the spec, required in practice | `lng,lat,name` |
| Coordinate columns | one longitude, one latitude, or one WKT column | yes | `lng`/`lon`/`x`, `lat`/`y` |
| Quoting | fields containing a delimiter, quote or newline | as needed | `"a,b"`, `"say ""hi"""` |
| Encoding | not specified; UTF-8 dominates in practice | required, often ignored | UTF-8, UTF-8 BOM, GBK |
| CRS | no such field exists | cannot be stored | state EPSG:4326 separately |

A few details are worth remembering separately. RFC 4180 allows the final record to end with or without a line break, so one trailing newline is not an error; two in a row, however, form an empty record, and whether it is skipped is up to the reader. Leading and trailing spaces belong to the field; the specification does not ask parsers to strip them, so ` 116.3974` needs trimming. A newline inside quotes is legal, so one record can span several lines and line count is not a reliable record count. Numbers have no type here: `116.3974` and `"116.3974"` are both text, and the reader decides whether to interpret them as numeric.

Encoding is outside RFC 4180. The registered `text/csv` type accepts a `charset` parameter, but when the file does not declare one the reader has to guess. UTF-8 and GBK disagree about the same bytes, and Chinese headers and labels are where it shows first.

## Common mistakes

### Encoding and BOM

**Symptom**: the first header reads `lng` with an invisible character in front, or every non-ASCII label turns into mojibake or question marks.

**Cause**: the file was saved as GBK, or as UTF-8 with a BOM. Read as UTF-8, the BOM becomes part of the first field; Excel on Windows falls back to the local codepage for UTF-8 CSV without a BOM.

**Consequence**: column matching fails and the tool reports that no coordinate columns were found. Even mapping by position breaks, because the first value now carries an invisible prefix. The damage is limited to the first column, which makes it easy to blame the data instead.

### Commas and quotes

**Symptom**: one row splits into more fields than the header, shifting every attribute to the right.

**Cause**: a field containing a comma (an address, WKT, a name) was not quoted, or an embedded quote was written once instead of twice.

**Consequence**: columns shift. Coordinates can land in an attribute column, and the row is either skipped or read with latitude in the longitude field, producing plausible but wrong points.

### Semicolons and decimal commas

**Symptom**: the whole file parses as a single column, or coordinates shift by thousands of kilometres.

**Cause**: European locale settings write semicolons between fields and commas as the decimal mark: `name;lng;lat`, `116,3974`.

**Consequence**: split on commas, `116,3974` becomes two values, `116` and `3974`; split on semicolons, the reader has to know in advance. Nothing in the file declares its delimiter.

### Coordinate order

**Symptom**: all points fall near the South Pole, in the western hemisphere, or mirrored along the diagonal.

**Cause**: the header says `x,y` or `lat,lng`, while the reader applies the usual "longitude first" rule.

**Consequence**: longitude and latitude are swapped. A latitude beyond ±90 is caught by range checks; a swap between two small angles is not, and among tens of thousands of rows it will not be spotted by eye.

### Blank rows, multi-row headers and trailing whitespace

**Symptom**: the first data row is treated as part of the header, or the feature count is lower than expected.

**Cause**: a title line, export timestamp or note at the top; blank lines in the middle; extra empty columns at the end.

**Consequence**: the column mapping shifts or bad rows are dropped silently. Skipping blank lines still produces a readable file, so the missing record surfaces only when the map is drawn.

### Missing CRS

**Symptom**: the numbers look reasonable but the layer sits hundreds of metres or several kilometres off when overlaid.

**Cause**: the source is in projected units such as UTM metres, or on a different datum, and a CSV has nowhere to record it.

**Consequence**: the file cannot explain itself and the error cannot be recovered from it. Metre values usually fail the range check; a datum shift of a few hundred metres looks perfectly normal and can only be resolved at the source.

## Compared with neighbours

| Format | Geometry | Attributes | CRS | Typical use |
|---|---|---|---|---|
| CSV / TSV | points; lines and polygons via WKT | any columns | none | exchange, bulk entry, database import |
| Excel (XLSX) | points; lines and polygons via WKT | any columns, with formatting | none | manual editing and review |
| WKT text | points, lines, polygons, one per line | none | optional SRID prefix | pasting a single geometry |
| GeoJSON | points, lines, polygons | yes | WGS84 by default | web maps, APIs |

Tables win on universality: databases, spreadsheets and scripts all read them. They lose on meaning, because they describe values and not intent. When geometry types, a declared CRS and nested attributes matter, GeoJSON is the better container; when the task is to describe one geometry, WKT is shorter; when a person must check every cell before delivery, Excel is easier, but it is not an interchange format.

## Converting and tools

To turn a table into vector data, use the [vector format converter](/en/tools/format-convert/): all points produce `lng,lat`, anything with lines or polygons produces a WKT column. If the source is projected, run it through the [projection converter](/en/tools/epsg-convert/) to EPSG:4326 first and then change format. The difference between tabular text and spreadsheets is covered in [Excel for coordinates](/en/guide/excel/); the wider choice is in the [15-format overview](/en/guide/vector-formats/).

## Sample data and parser

- [sample.csv](/examples/data/sample.csv), [csv_parser.py](/examples/python/csv_parser.py)
- [sample.tsv](/examples/data/sample.tsv), [tsv_parser.py](/examples/python/tsv_parser.py)

Both samples describe the same content: a point at Times Square and a short walking line. The scripts use only the Python standard library, find the coordinate columns by header name and print a GeoJSON `FeatureCollection`:

```bash
python csv_parser.py sample.csv -o out.geojson
python tsv_parser.py sample.tsv
```

Header matching ignores case, spaces, underscores and hyphens, and fails loudly instead of assuming the first column is longitude. Rows with a missing or unparsable coordinate are skipped.

## References

- [RFC 4180: Common Format and MIME Type for CSV Files](https://www.rfc-editor.org/rfc/rfc4180)
- [W3C: Model for Tabular Data and Metadata on the Web](https://www.w3.org/TR/tabular-data-model/)
- [IANA: text/csv media type](https://www.iana.org/assignments/media-types/text/csv)