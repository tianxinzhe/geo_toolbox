---
title: 'How vector formats are parsed: 16 inputs explained | GeoToolbox'
description: How GeoJSON, TopoJSON, KML, KMZ, GPX, GML, CSV, XLSX, WKT, GMT, DXF, MIF/MID, Shapefile, FlatGeobuf and GeoPackage are detected, parsed and written, each with a minimal example.
heading: 'How vector formats are parsed: 16 inputs with minimal examples'
group: vector
order: 19
readingMinutes: 11
updated: 2026-11-18
faq:
  - q: 'Why does the coordinate system stay the same after conversion?'
    a: 'Format conversion changes how data is organised, not where it sits. Only a Shapefile .prj is read and reprojected to WGS84; every other format is interpreted as WGS84 longitude and latitude. If your source is in projected units such as UTM metres, convert it to EPSG:4326 first, then come back to change formats.'
  - q: 'Why do polygons disappear when I convert KML to GPX?'
    a: 'GPX only defines waypoints, tracks and routes; there is no polygon type. The converter does not drop them silently: it reports how many geometries the target cannot hold and waits for you to confirm skipping before writing anything.'
  - q: 'Why did a DXF circle become a polygon?'
    a: 'GeoJSON has no circle type, only points, lines and polygons. A CIRCLE is flattened into a closed polygon of 72 vertices and an ARC into a 36-segment polyline, so any target format can carry it. At small radii you will not notice; at large radii the segments become visible.'
  - q: 'Why does CSV say it cannot find longitude and latitude columns?'
    a: 'The parser only accepts explicit column names such as lat, latitude, y and lng, lon, longitude, x. When nothing matches it does not guess that the first column is longitude; it shows the header so you can pick the columns yourself and avoid swapping the axis order.'
---

The same points, lines and polygons can arrive as GeoJSON, Shapefile, Excel, DXF and a dozen other formats. The reliable way to convert between them is not one converter per pair, but a single intermediate model that every input is translated into and every output is translated from.

This article covers that pipeline: **how a format is detected, how it is parsed, and what survives the trip**. Each format comes with a minimal example you can compare against your own file.

## The three-step pipeline

### Step 1: detect the format

Detection looks at content first and treats the extension as a fallback, because `.json` can be GeoJSON or TopoJSON and `.txt` can be CSV or WKT. The order is:

1. starts with `{`: parse as JSON; `"type": "Topology"` means TopoJSON, otherwise GeoJSON;
2. starts with `<`: inspect the root element — `gml:FeatureCollection` is GML, `<kml>` is KML, `<gpx>` is GPX;
3. first group code is `0 / SECTION`: DXF;
4. starts with a geometry keyword such as `POINT`, `LINESTRING` or `POLYGON`: WKT;
5. starts with `>` and spans more than one line: GMT;
6. starts with something like `Version 300`: MapInfo MIF;
7. only then use the extension, and finally fall back to "tabs but no commas = TSV, commas = CSV".

If nothing matches, the tool reports it instead of guessing.

### Step 2: parse into one feature collection

Every format ends up as the same structure: a **feature collection**, where each feature has a geometry and properties, and the geometry is limited to points, lines, polygons, their multi-forms and geometry collections. The rules:

- **Syntax errors stop the parse**: unbalanced brackets, broken XML or invalid JSON produce an error, never half a dataset;
- **Geometry problems are recorded**: unclosed rings, too few points, out-of-range coordinates and empty geometries go into an issue list while conversion continues;
- **No coordinate system guessing**: apart from reading a Shapefile `.prj`, numbers are treated as WGS84 longitude/latitude;
- **No silent data loss**: entities that cannot be represented (DXF text, dimensions) are skipped with a warning.

### Step 3: write the target format

Before serialising, three things happen uniformly: coordinates are rounded to the requested number of decimals, empty properties can be removed, and features with no geometry are dropped and counted. Then the serialiser runs.

If the target cannot hold a geometry type — polygons into GPX, for example — conversion stops and asks before skipping. That is deliberate: the dangerous failure mode is not an error, it is losing half the data quietly.

## All 16 inputs at a glance

| Family | Format | Parsed by | Carries | Usually lost |
|---|---|---|---|---|
| JSON | GeoJSON | native parse | points, lines, polygons | nothing (highest fidelity) |
| JSON | TopoJSON | arcs expanded | points, lines, polygons | object names, quantisation |
| XML | KML | DOM + feature mapping | points, lines, polygons | styles, icons, balloons |
| XML | KMZ | unzip, first KML | points, lines, polygons | same as KML |
| XML | GPX | DOM + feature mapping | points, lines | polygons, styles |
| XML | GML | DOM + geometry walk | points, lines, polygons | complex schemas; non-4326 only warns |
| Tabular | CSV / TSV | header column matching | points | lines and polygons (use a WKT column) |
| Tabular | XLSX | first sheet, then CSV path | points | styles, formulas, other sheets |
| Text geometry | WKT | custom tokenizer | points, lines, polygons | properties, SRID |
| Text geometry | GMT | segmented ASCII | points, lines, polygons | inner rings, properties |
| Text geometry | DXF | group-code stream | points, lines, polygons | blocks, text, attributes |
| Text geometry | MIF/MID | MIF geometry + MID rows | points, lines, polygons | text, decorative objects |
| Binary | Shapefile | shpjs + proj4 | points, lines, polygons | field names (10 chars), mixed geometry layers |
| Binary | FlatGeobuf | FlatBuffers | points, lines, polygons | multi-layer flattened, mixed columns become text |
| Binary | GeoPackage | sql.js over SQLite | points, lines, polygons | only one layer read, style tables |

## JSON family

### GeoJSON

The most direct format: every `Feature` in a `FeatureCollection` has a `geometry` and `properties`. Three inputs are accepted — a full collection, a single Feature, or a single Geometry; the last two are wrapped as one feature. Coordinates are longitude first, in degrees. The examples use Times Square, New York: longitudes in the western hemisphere are negative, which changes nothing about parsing.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Times Square" },
      "geometry": { "type": "Point", "coordinates": [-73.9855, 40.7580] }
    }
  ]
}
```

Unknown geometry types are dropped and the feature is flagged. `GeometryCollection` keeps its nesting here and is flattened only when a target format requires it.

### TopoJSON

TopoJSON extracts shared boundaries into `arcs`; geometries reference arc indices, which can shrink a boundary-heavy dataset several times over. Parsing expands every object under `objects` and merges the results into one collection.

```json
{
  "type": "Topology",
  "objects": {
    "stations": {
      "type": "GeometryCollection",
      "geometries": [
        { "type": "Point", "coordinates": [-73.9855, 40.7580], "properties": { "name": "Times Square" } }
      ]
    }
  },
  "arcs": []
}
```

`arcs` is an array of arrays precisely so a shared boundary is stored once. Multiple objects are concatenated in order; the object names are not preserved.

## XML family

### KML and KMZ

KML stores coordinates in `<coordinates>` as **longitude,latitude,altitude** — different from GPX, which uses `lon` / `lat` attributes. Styles, colours, icons and line widths are discarded; geometry, name and description text are kept.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Times Square</name>
      <Point><coordinates>-73.9855,40.7580,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>
```

KMZ is just a ZIP: unzip, take the first `.kml` and parse it as KML. Files exported here always use `doc.kml`.

### GPX

GPX only has waypoints, tracks and routes. `wpt` becomes a point, `trk` and `rte` become lines; elevation and time tags become properties.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Geo Toolbox" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="40.7580" lon="-73.9855"><name>Times Square</name></wpt>
  <trk>
    <name>Walk</name>
    <trkseg>
      <trkpt lat="40.7580" lon="-73.9855"/>
      <trkpt lat="40.7527" lon="-73.9772"/>
    </trkseg>
  </trk>
</gpx>
```

GPX cannot express polygons; writing them reports how many are unsupported and waits for confirmation. Properties are limited too: apart from `name`, fields are merged into the `desc` text.

### GML

GML is the OGC XML encoding. The parser finds the feature element inside `featureMember` (or `member`), then looks for the first geometry inside it, accepting `gml:pos`, `gml:posList` and `gml:coordinates`. Other child elements become properties as "tag name → text".

```xml
<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="urn:app">
  <gml:featureMember>
    <app:station>
      <app:name>Times Square</app:name>
      <app:geom>
        <gml:Point srsName="EPSG:4326"><gml:pos>-73.9855 40.7580</gml:pos></gml:Point>
      </app:geom>
    </app:station>
  </gml:featureMember>
</gml:FeatureCollection>
```

An `srsName` other than EPSG:4326 / CRS84 only raises a warning — no reprojection is attempted. Curves, surfaces and nested application schemas are not expanded.

## Tabular family

### CSV and TSV

Delimited text only carries points. Two columns are matched by header name:

- latitude: `lat`, `latitude`, `纬度`, `緯度`, `wgs84lat`, `latdeg`, `gpslat`, `y`
- longitude: `lng`, `lon`, `long`, `longitude`, `经度`, `經度`, `wgs84lng`, `lngdeg`, `gpslng`, `x`

Matching ignores case, spaces, underscores, hyphens and brackets. If nothing matches, the tool stops and asks you to pick the columns instead of guessing.

```csv
lng,lat,name
-73.9855,40.7580,Times Square
-73.9772,40.7527,Grand Central
```

Values must be decimal degrees; degrees-minutes-seconds is not accepted here (convert it first). Rows with a missing or unparsable coordinate are skipped and counted. TSV is the same thing with tabs, and a file containing tabs but no commas is detected as TSV.

On export the output depends on the data: **all points** produces `lng,lat` plus property columns; **any line or polygon** switches to a `wkt` column so nothing is lost.

### Excel (XLSX / XLS)

An XLSX file is a ZIP of XML parts. Only the **first worksheet** is read, turned into a matrix, then handed to the CSV pipeline — so column picking and bad-row handling behave exactly as they do for CSV.

| lng | lat | name |
|---|---|---|
| -73.9855 | 40.7580 | Times Square |
| -73.9772 | 40.7527 | Grand Central |

Export writes a single worksheet with no styles, formulas, extra sheets or charts, which keeps the file small and readable everywhere.

## Text geometry family

### WKT

WKT describes one geometry per line, using brackets for nesting. The tokenizer is custom, so an unbalanced bracket reports **which column** is wrong instead of a generic error.

```wkt
POINT (-73.9855 40.7580)
LINESTRING (-73.9855 40.7580, -73.9772 40.7527)
POLYGON ((-73.9864 40.7572, -73.9846 40.7572, -73.9846 40.7586, -73.9864 40.7586, -73.9864 40.7572))
```

Seven geometry types and the XY / XYZ / XYM / XYZM dimensions are supported; M values are dropped with a warning. An unclosed ring is closed automatically, also with a warning. Input is read line by line, so several geometries can be pasted at once. Output carries no properties and no SRID prefix — the coordinate system is a separate concern.

### GMT

GMT does not have a formal specification; the common convention is a `>` header line followed by `x y` rows. One segment becomes one feature and the header text becomes its name. A single point becomes a point, a closed segment of at least four points becomes a polygon, anything else becomes a line.

```
> Times Square
-73.9855 40.7580
> Walk
-73.9855 40.7580
-73.9772 40.7527
```

Plain text cannot express holes, so inner rings are dropped with a warning; multiple parts of one feature are split into separate segments.

### DXF

DXF is a stream of "group code, value" pairs: `0` is the entity type, `8` the layer, `10` / `20` the X / Y coordinates. Only basic 2D entities are handled:

- `POINT` → point
- `LINE`, `LWPOLYLINE`, `POLYLINE` (with following `VERTEX`) → line or polygon
- `CIRCLE` → closed polygon of 72 vertices
- `ARC` → 36-segment polyline

```
0
SECTION
2
ENTITIES
0
POINT
8
0
10
-73.9855
20
40.7580
0
ENDSEC
0
EOF
```

A layer other than `0` becomes a `layer` property; other attributes cannot be written to basic entities, so export warns that they were dropped. DXF does not declare a CRS, so numbers are taken as-is; projected CAD coordinates need converting first.

### MIF/MID

MapInfo uses a pair of files: `.mif` holds geometry and the table schema, `.mid` holds one row of attributes per record. `Point`, `Line`, `Pline` and `Region` are supported; `Text`, `Rect`, `Ellipse` and similar decorative objects are skipped.

```text
Version 300
Charset "UTF-8"
Delimiter ","
Columns 1
  name Char(254)
Data
Point -73.9855 40.7580
```

```
Times Square
```

To keep a single download, export bundles `data.mif` and `data.mid` into a ZIP; import accepts that ZIP and also a lone `.mif`, which has no attributes.

## Binary containers

### Shapefile

A Shapefile is a set of files, so it must be zipped to upload in one go:

```
stations.zip
├── stations.shp   # geometry
├── stations.shx   # index
├── stations.dbf   # attributes
├── stations.prj   # coordinate system
└── stations.cpg   # encoding
```

Parsing uses shpjs. A `.prj` is read and the data is reprojected to WGS84 — the **only** reprojection in the whole pipeline; without a `.prj` the data is treated as WGS84 and flagged. If the ZIP contains several `.shp` files, only the first layer is read, again with a warning.

Export splits layers by geometry type, because one Shapefile layer can hold only one kind, and writes `.prj` and `.cpg`. DBF limits field names, so they are truncated to 10 characters.

### FlatGeobuf (.fgb)

FlatGeobuf stores features as FlatBuffers and appends a packed R-tree, which suits streaming reads and large datasets. It is a **single-layer** container, so multiple layers are flattened into one collection.

Before writing, property columns are aligned to their union: missing values become null, and a column mixing numbers and text is downgraded to text with a warning.

### GeoPackage (.gpkg)

GeoPackage is a SQLite database where geometry lives in an ordinary table as a `GP` magic number plus WKB, so it can be queried and indexed with SQL.

```
gpkg_contents          -- layers, extents, SRS
gpkg_geometry_columns  -- geometry column and type
features               -- id | geom(BLOB) | business columns…
```

Reading opens the database with sql.js inside the browser and converts the blobs. Export always writes one table `features` with geometry column `geom` and SRS 4326; property types are inferred across features, mixed types become TEXT, and empty geometries become NULL with a warning.

## Checks shared by every format

Once inside the intermediate model, the same validation runs for all inputs and feeds the issue list:

- **unclosed ring**: a polygon's first and last points differ, or it has fewer than four points;
- **out of range**: longitude beyond ±180 or latitude beyond ±90, which usually means the file is projected;
- **empty geometry**: a feature without geometry;
- **bad rows**: CSV rows with a missing or unparsable coordinate are skipped.

At most 200 issues are shown, so large files cannot flood the page. None of them stops the conversion, but they are worth reading before downloading.

## Limits

- 20 MB per file and 50,000 features; exceeding either is reported clearly;
- the preview shows the first 20 features or 200 lines, while the download contains everything;
- text formats can be pasted, while Shapefile, KMZ, XLSX, FlatGeobuf and GeoPackage must be uploaded as files;
- the converter does not transform coordinate systems. Convert to WGS84 first, then change format.

## Runnable Python example per format

Every format has a **standalone** Python script. No package to install from this repository — download one file and run it:

```bash
python kml_parser.py data.kml                 # print GeoJSON
python kml_parser.py data.kml -o out.geojson  # write a file
```

Each script prints a GeoJSON `FeatureCollection` and has an English docstring. WKT, XLSX, DXF, Shapefile, FlatGeobuf and GeoPackage need one third-party library; the rest use the standard library only.

Every format also ships a **ready-to-download sample**. All samples describe the same content — a point at Times Square, a line to Grand Central and a rectangular area — so you can run the scripts against them directly:

| Format | Script | Sample data |
|---|---|---|
| GeoJSON | [geojson_parser.py](/examples/python/geojson_parser.py) | [sample.geojson](/examples/data/sample.geojson) |
| TopoJSON | [topojson_parser.py](/examples/python/topojson_parser.py) | [sample.topojson](/examples/data/sample.topojson) |
| KML | [kml_parser.py](/examples/python/kml_parser.py) | [sample.kml](/examples/data/sample.kml) |
| KMZ | [kmz_parser.py](/examples/python/kmz_parser.py) | [sample.kmz](/examples/data/sample.kmz) |
| GPX | [gpx_parser.py](/examples/python/gpx_parser.py) | [sample.gpx](/examples/data/sample.gpx) |
| GML | [gml_parser.py](/examples/python/gml_parser.py) | [sample.gml](/examples/data/sample.gml) |
| CSV | [csv_parser.py](/examples/python/csv_parser.py) | [sample.csv](/examples/data/sample.csv) |
| TSV | [tsv_parser.py](/examples/python/tsv_parser.py) | [sample.tsv](/examples/data/sample.tsv) |
| XLSX | [xlsx_parser.py](/examples/python/xlsx_parser.py) | [sample.xlsx](/examples/data/sample.xlsx) |
| WKT | [wkt_parser.py](/examples/python/wkt_parser.py) | [sample.wkt](/examples/data/sample.wkt) |
| GMT | [gmt_parser.py](/examples/python/gmt_parser.py) | [sample.gmt](/examples/data/sample.gmt) |
| DXF | [dxf_parser.py](/examples/python/dxf_parser.py) | [sample.dxf](/examples/data/sample.dxf) |
| MIF/MID | [mif_parser.py](/examples/python/mif_parser.py) | [sample.mif](/examples/data/sample.mif) + [sample.mid](/examples/data/sample.mid) |
| Shapefile | [shapefile_parser.py](/examples/python/shapefile_parser.py) | [sample-shapefile.zip](/examples/data/sample-shapefile.zip) |
| FlatGeobuf | [flatgeobuf_parser.py](/examples/python/flatgeobuf_parser.py) | [sample.fgb](/examples/data/sample.fgb) |
| GeoPackage | [geopackage_parser.py](/examples/python/geopackage_parser.py) | [sample.gpkg](/examples/data/sample.gpkg) |

A Shapefile layer can hold only one geometry type, so that sample is a point layer with two points. MIF/MID is a pair of files: download both into the same folder.

## Further reading

- [Overview of 15 vector formats](/en/guide/vector-formats/)
- [GeoJSON](/en/guide/geojson/), [TopoJSON](/en/guide/topojson/)
- [KML and KMZ](/en/guide/kml/), [GPX](/en/guide/gpx/), [GML](/en/guide/gml/)
- [CSV and TSV](/en/guide/csv-tsv/), [Excel](/en/guide/excel/)
- [WKT](/en/guide/wkt/), [DXF](/en/guide/dxf/), [GMT](/en/guide/gmt/), [MIF/MID](/en/guide/mif-mid/)
- [Shapefile](/en/guide/shapefile/), [GeoPackage](/en/guide/geopackage/), [FlatGeobuf](/en/guide/flatgeobuf/)