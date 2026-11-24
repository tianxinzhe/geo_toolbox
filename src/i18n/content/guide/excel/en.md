---
title: 'Excel coordinate traps: XLSX and XLS | GeoToolbox'
description: 'The ZIP + XML structure of XLSX, how legacy XLS differs, and why date serials, scientific notation, leading zeros or merged cells corrupt coordinates.'
heading: Excel (XLSX / XLS) coordinate data
group: vector
order: 9
readingMinutes: 6
updated: 2026-11-23
---

Excel is where most coordinate data starts, and about the worst format to move it programmatically. It is pleasant to edit, and it quietly changes values while saving and displaying them.

Nothing in Excel is broken. The trouble is that it separates display from storage: a cell may hold a number and display a date, hold a formula and cache an old result, or sit inside a merged range where only the top-left cell has a value. A program reads the storage layer while a person sees the display layer, and when the two disagree the sheet still looks perfectly normal.

## What is inside an XLSX

An XLSX is not plain text but a ZIP container:

```text
example.xlsx
├─ [Content_Types].xml
├─ xl/workbook.xml
├─ xl/worksheets/sheet1.xml
├─ xl/sharedStrings.xml
└─ xl/styles.xml
```

Sheet data lives in `sheet1.xml`, and text is usually stored in a shared string table. Legacy `.xls` uses the binary BIFF structure, which is entirely incompatible with XLSX and usually needs an extra library to read.

The layout is defined by the Office Open XML specification (ECMA-376). `workbook.xml` lists the worksheets, their order and whether they are hidden; each sheet maps to a `worksheets/sheetN.xml` part; `sharedStrings.xml` stores every string once so cells can hold an index; `styles.xml` stores number formats, which is why a date looks like a date — the cell holds a number and the format does the rest. Cells also carry a `t` attribute for their type: no `t` means a number, `s` is a shared string, `inlineStr` an inline string, `str` a formula result that is text, `b` a boolean and `e` an error.

## Minimal example: holding coordinates

| Layout | Columns | Suits |
|---|---|---|
| Longitude and latitude | `name, lng, lat` | Point data only |
| WKT column | `name, geom` | Lines, polygons, mixed geometry |

Keep coordinate columns numeric, with no units or direction letters. Make sure a WKT column is formatted as text, or Excel will wrap or truncate it.

Excel has no CRS field either. Writing `lng, lat` in a workbook says the columns are longitude and latitude, not whether they are WGS84, CGCS2000 or a projected grid. State the EPSG code in a note or in a separate worksheet; do not expect anyone to infer it from the numbers. For a WKT column, set the format to Text before pasting, or values starting with `+`, `-` or `=` may be treated as formulas.

## Structure and fields

| Part or field | Purpose | Required | Common values |
|---|---|---|---|
| `[Content_Types].xml` | declares part types | yes | XML |
| `xl/workbook.xml` | sheet list and order | yes | `sheet1`, `Sheet1` |
| `xl/worksheets/sheetN.xml` | cell values | at least one | A1 references, row and column indices |
| `xl/sharedStrings.xml` | shared text table | optional | string array |
| `xl/styles.xml` | number formats, fonts, borders | optional | date formats, decimal places |
| cell `t` | value type | optional, defaults to number | `s`, `inlineStr`, `str`, `b`, `e` |
| `date1904` | date system switch | optional | `0` or `1` |

Two things are easy to miss when reading XLSX. First, cells are sparse: an empty cell simply does not appear in the XML, so a reader that walks rows and columns must insert the gaps itself or every later column shifts left. Second, there are two date systems. The default 1900 system starts in January 1900; older Mac files may set `date1904="1"`, and the same serial then differs by 1462 days. A reader that ignores the switch places every date about four years off.

## Six things that corrupt data

### Dates become serial numbers

**Symptom**: `2026-11-09` reads as `46335`, or the column lands near `1900-01-00`.

**Cause**: the cell never held date text, only a number with a date format applied. A reader that takes the value without the format gets the serial.

**Consequence**: every timestamp becomes a five-digit number, and filtering, sorting or computing intervals all go wrong.

### Long numbers become scientific notation

**Symptom**: parcel ID `1101050010030000123` displays as `1.10105E+18`, with the last digits replaced by zeros.

**Cause**: Excel stores numbers as double-precision floats and guarantees roughly 15 significant digits. Anything longer is converted to a number on open or paste, and the extra digits are gone.

**Consequence**: IDs stop being unique and two tables can no longer be joined on them. The loss happens at import time; reformatting the column afterwards does not restore it.

### Leading zeros disappear

**Symptom**: administrative code `00123` becomes `123`.

**Cause**: the column was treated as numeric, where a leading zero has no meaning.

**Consequence**: codes no longer match the official code list and every lookup fails. If leading zeros matter, set the column to Text before importing, or choose Text in the import wizard.

### Formulas are not evaluated

**Symptom**: a distance or area column reads as `=B2*111320`, or as an empty value.

**Cause**: XLSX stores both the formula text and a cached result. A reader may take the formula, or the cached result may be missing because the file was written by a library rather than by Excel.

**Consequence**: properties are wrong or absent. Before delivery, copy the formula column and paste it back as values.

### Merged cells break the header

**Symptom**: only the first header cell has a value and the rest read as empty, or data rows shift sideways.

**Cause**: a merged range keeps its value in the top-left cell only; the other cells are empty in the file. Two-row headers and cross-column titles create exactly this structure.

**Consequence**: column matching fails and the remaining columns become nameless; rows have inconsistent width, so coordinates land in the wrong field.

### Multiple sheets and hidden columns

**Symptom**: the data read is not the sheet you meant, or some columns are missing.

**Cause**: a workbook can hold many sheets and most readers take only the first; hidden rows and columns still occupy space, but some export flows skip them.

**Consequence**: data is shifted or absent, and nothing looks unusual when the file is opened, because a person sees whichever tab is selected.

## How to deliver it properly

- Finish editing in Excel, then **save as CSV UTF-8** and hand that to the converter. Note that Save As CSV exports only the active sheet.
- If XLSX is mandatory, state the sheet name, header row and coordinate columns explicitly.
- Do not open a generated CSV in Excel and save it again, or the encoding and number formats may be rewritten.

Two further habits help: convert formula columns to values before delivery, and make date columns either text or explicit ISO dates. If the sheet contains title rows, notes and blank lines, clean them up in Excel instead of asking a parser to guess which row is the header.

## Compared with neighbours

| Format | Structure | Geometry | CRS | Suits |
|---|---|---|---|---|
| XLSX | ZIP + XML | points; lines and polygons via WKT | none | manual editing, review, sign-off |
| CSV / TSV | plain text | points; lines and polygons via WKT | none | programmatic exchange, bulk import |
| GeoJSON | JSON text | points, lines, polygons | WGS84 by default | web maps, APIs |
| GeoPackage | SQLite database | points, lines, polygons, many layers | SRS table | GIS projects, offline data |

Excel is the better place to edit. Colour, comments, frozen panes and side-by-side sheets have no equivalent in plain text. It is the worse place to exchange data: a binary container, hidden formatting and the gap between formula and display can each make a program read something different from what a person sees. CSV holds up better for long-term storage and machine reading; GeoJSON or GeoPackage is better once geometry and a CRS matter.

## Converting and tools

To turn Excel or CSV into vector data, use the [vector format converter](/en/tools/format-convert/); it reads the first worksheet only and takes cached formula values. If the coordinates are projected, convert to EPSG:4326 first with the [projection converter](/en/tools/epsg-convert/). The plain-text alternative is covered in [CSV and TSV](/en/guide/csv-tsv/), and the wider choice in the [15-format overview](/en/guide/vector-formats/).

## Sample data and parser

- [sample.xlsx](/examples/data/sample.xlsx), [xlsx_parser.py](/examples/python/xlsx_parser.py)

The sample has one worksheet with columns `lng,lat,name,kind`, matching the CSV and TSV samples. The script needs openpyxl:

```bash
pip install openpyxl
python xlsx_parser.py sample.xlsx -o out.geojson
```

It reads the first worksheet, takes cached formula values, and turns every other column into a feature property. Styles, comments and other sheets are ignored.

## References

- [ECMA-376: Office Open XML file formats](https://ecma-international.org/publications-and-standards/standards/ecma-376/)
- [SheetJS documentation](https://docs.sheetjs.com/)
- [Microsoft: Open XML SDK](https://learn.microsoft.com/en-us/office/open-xml/open-xml-sdk)