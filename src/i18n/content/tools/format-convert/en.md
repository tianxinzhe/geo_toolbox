---
title: 'Vector Format Converter: GeoJSON, KML, GPX, FGB, GPKG | GeoToolbox'
description: 'Convert vector data between GeoJSON, KML, GPX, CSV, TopoJSON, WKT, FlatGeobuf and GeoPackage. Files stay in your browser; properties preserved, coordinates rounded.'
updated: 2026-11-09
faq:
  - q: 'Are my files uploaded to a server?'
    a: 'No. The browser File API reads the file into the current tab, and the conversion runs locally. There is no upload request. Closing or refreshing the page discards the data, and the file is not written to local storage. That is the fundamental difference between this tool and most online converters.'
  - q: 'Why are the converted coordinates in the wrong place?'
    a: 'This tool converts formats only; it does not transform coordinate systems. GeoJSON, KML and GPX are treated as WGS 84. If your source is a CGCS2000 projection or a Japanese plane rectangular grid, a format conversion keeps the original numbers and the position will be misplaced on a map. Convert to WGS 84 first with the EPSG converter, then come back.'
  - q: 'Why does GPX not support polygons?'
    a: 'The GPX specification defines waypoints, routes and tracks only; it has no polygon representation. When GPX is the target and the data contains polygons, the tool lists the affected feature count and geometry types and waits for you to choose “skip these features”. Nothing is dropped silently.'
  - q: 'What does the CSV output look like?'
    a: 'If every feature is a point, the output has lng and lat columns followed by the original properties. As soon as any line or polygon is present, the geometry moves into a single WKT column plus the properties. That way no geometry type is lost. The result panel states which form was used before you download.'
  - q: 'How complete is FlatGeobuf and GeoPackage support?'
    a: 'Both are handled as a single layer: FGB reads or writes one feature collection, while GPKG reads only the first feature layer and reports how many others were present. GPKG export is fixed to EPSG:4326 with a features table and a geom column; attribute types are inferred across features, mixed types fall back to text, and nested objects become JSON strings. FGB infers columns from the first feature, so the tool aligns property keys across all features first and coerces inconsistent types to text. Both are binary with no in-page preview, and empty geometries are written as NULL with a warning.'
---

## What this tool solves

The same geographic dataset is often required in different file formats: GIS desktop software prefers GeoJSON or TopoJSON, Google Earth wants KML/KMZ, GPS devices and sports apps use GPX, spreadsheets and reports need CSV, and databases or development work often use WKT. For large datasets and GIS databases, FlatGeobuf and GeoPackage are increasingly the exchange formats. The conversion itself is not hard. Finding a tool that requires no account, does not upload your data, and preserves both geometry and attributes is the hard part.

This tool keeps the whole chain in the browser: choose the source and target formats, read, parse, summarise and validate, preview, download. The file never leaves your device.

## Supported formats

Input includes GeoJSON, KML, KMZ, GPX, CSV/TSV, Excel (XLSX/XLS), GML, DXF, GMT, MIF/MID, TopoJSON, WKT, FlatGeobuf (FGB) and GeoPackage (GPKG), plus Shapefile archives (`.shp/.dbf/.shx/.prj`) packaged as a ZIP. Output includes GeoJSON, KML, KMZ, GPX, CSV, XLSX, GML, DXF, GMT, MIF/MID, TopoJSON, WKT, FlatGeobuf, GeoPackage and a Shapefile ZIP. Submitting the same input and output format is allowed and behaves as a formatting and validation pass, stated explicitly in the result panel.

Know the boundaries up front: Excel reads the first worksheet and follows the same longitude/latitude column rules as CSV; GML covers common simple features (Point, LineString, Polygon and their Multi forms) and does not expand complex application schemas; DXF handles ASCII 2D entities only (POINT, LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC), carries no attributes, and its CAD coordinates declare no geographic CRS; GMT is a plain-text convention and cannot express polygon holes; MIF/MID output is packaged as a ZIP containing `data.mif` and `data.mid`; select MIF/MID explicitly as the source format when reading such a ZIP, otherwise `.zip` is treated as a Shapefile. These cases produce warnings in the result panel instead of silent loss.

The source and target formats are selected independently at the top of the page. The source defaults to automatic detection based on the file extension and content, and can also be set explicitly. When the same text has two plausible readings — comma-separated content that could be CSV or a coordinate list, a `.json` file that could be GeoJSON or TopoJSON, or XML that is hard to tell between KML and GPX — choosing the source format avoids a wrong guess. Once set, the tool parses strictly as that format and never falls back to auto-detection, so mismatches are reported instead of hidden. The target format only controls the output and does not re-parse the input.

For Shapefile input, zip `.shp`, `.dbf`, `.shx` and `.prj` together before uploading; only the first layer is read. If the ZIP contains a `.prj`, coordinates are reprojected to WGS 84 according to its declared CRS. Without a `.prj`, coordinates are treated as WGS 84 and the summary says so.

Shapefile export produces a ZIP containing `.shp/.shx/.dbf/.prj/.cpg`, with coordinates in WGS 84 and attributes written to DBF as UTF-8. Because one Shapefile layer can hold only one geometry type, mixed points, lines and polygons are split into multiple layers. DBF field names are limited to 10 characters, so long or non-ASCII names are renamed automatically and reported in the result panel. Shapefile is binary and has no in-page text preview; open the download in QGIS or ArcGIS.

FlatGeobuf (`.fgb`) and GeoPackage (`.gpkg`) are also binary and load their decoders only when needed; neither has an in-page preview. Both are treated as a single layer: FGB writes one collection, while GPKG reads only the first feature layer and reports how many others were present. GPKG export creates a SQLite database with a `features` table, a `geom` column and EPSG:4326. Attribute column types are inferred across features; mixed numbers and booleans, or nested objects, fall back to text, with objects and arrays stored as JSON strings. FGB infers its column layout from the first feature, so the tool aligns property keys across all features and coerces inconsistent types to text with a warning. Both formats keep every feature, write empty geometries as NULL, and report that count instead of dropping rows silently.

For CSV and TSV, common longitude and latitude column names are detected automatically, including `lat/lng`, `latitude/longitude`, `纬度/经度` and `y/x`. If detection fails, the tool does not guess: it lists the headers and asks you to choose. Files are decoded as UTF-8 by default, with a GBK / GB18030 option for legacy Chinese data.

## Properties, geometry and degradation

All properties are preserved by default. When the target format has limited attribute support, the tool offers explicit options: GPX can carry a name and description, so you can either merge the remaining properties into the description or keep the name only.

When a target format cannot store a geometry type — for example polygons in GPX — the tool does not drop them silently. It reports the number of affected features and their geometry types, and only continues after you choose to skip them. Empty geometries, out-of-range coordinates and unclosed polygon rings are collected into an issues list, but they do not block conversion. You can convert first and clean the data afterwards.

## Coordinates, rounding and preview

No coordinate system transformation is performed. A permanent warning in the summary says that non-WGS 84 data may be misplaced and should be converted first with the coordinate or EPSG tool.

Advanced options provide three switches: pretty-print versus compact output, coordinate rounding (0–12 decimals, default 7) and removal of empty properties. The text preview shows the first 200 lines only, while the download contains the full output. The feature structure tree shows the first 20 features to keep large files responsive.

## Limits and privacy

A single file is limited to 20 MB and 50,000 features; pasted text is limited to 200,000 characters. When a limit is exceeded, the tool reports the actual value and the limit and does not attempt the conversion. File content exists only in the current tab’s memory: it is not uploaded, not written to local storage, and is destroyed when the page closes.