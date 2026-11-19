# Vector format parsers (Python)

Sixteen vector formats, one output contract: every parser returns a GeoJSON
`FeatureCollection` as plain Python dictionaries, ready for `json.dumps`.

```
python/
├── parse_formats.py        # CLI: parse one file, print or save GeoJSON
├── requirements.txt        # shapely, pyshp, ezdxf, openpyxl, flatgeobuf
└── vector_formats/
    ├── common.py           # geometry helpers, ParseError
    ├── geojson.py          # GeoJSON
    ├── topojson.py         # TopoJSON (arc stitching)
    ├── kml.py              # KML
    ├── kmz.py              # KMZ (zip -> kml)
    ├── gpx.py              # GPX
    ├── gml.py              # GML
    ├── csv_tsv.py          # CSV, TSV
    ├── xlsx.py             # Excel
    ├── wkt.py              # WKT
    ├── gmt.py              # GMT plain text
    ├── dxf.py              # DXF
    ├── mif_mid.py          # MapInfo MIF/MID
    ├── shapefile.py        # ESRI Shapefile
    ├── flatgeobuf.py       # FlatGeobuf
    └── geopackage.py       # GeoPackage
```

## Install

Requires Python 3.10 or newer.

```bash
pip install -r requirements.txt
```

Parsers that need no third-party package (GeoJSON, TopoJSON, KML, KMZ, GPX,
GML, CSV, TSV, GMT) work with a bare interpreter.

## Use

```bash
python parse_formats.py data.geojson                     # GeoJSON to stdout
python parse_formats.py roads.shp --out roads.geojson    # write a file
python parse_formats.py tile.kml --limit 5                # first 5 features
python parse_formats.py points.csv --format csv --indent 0
python parse_formats.py --list                            # supported formats
```

As a library:

```python
from vector_formats import parse_file, detect_format

fmt = detect_format("data.gpkg")        # "gpkg"
fc = parse_file("data.gpkg")            # FeatureCollection dict
print(len(fc["features"]))
```

## Output contract

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [116.3974, 39.9088] },
      "properties": { "name": "Times Square" }
    }
  ]
}
```

* Positions are two-dimensional `[longitude, latitude]` in decimal degrees.
* No parser reprojects data. A projected source stays in its own units.
* Coordinates that cannot be parsed are skipped, never guessed.
* Errors raise `vector_formats.ParseError` with a readable message.

## Formats

| Format | Module | Library | Geometry produced | Notable behaviour |
|---|---|---|---|---|
| GeoJSON | `geojson.py` | stdlib | all | Accepts a single Feature or Geometry and wraps it |
| TopoJSON | `topojson.py` | stdlib | all | Undoes delta encoding and quantization, stitches arcs |
| KML | `kml.py` | stdlib | point, line, area, collection | Reads `coordinates` lon,lat,alt; drops altitude |
| KMZ | `kmz.py` | stdlib | same as KML | Unzips the first `.kml` entry |
| GPX | `gpx.py` | stdlib | point, line | `wpt` points, `trk`/`rte` lines; no areas exist |
| GML | `gml.py` | stdlib | all | Supports `pos`, `posList`, `coordinates`; ignores srsName |
| CSV | `csv_tsv.py` | stdlib | point | Longitude/latitude columns found by header aliases |
| TSV | `csv_tsv.py` | stdlib | point | Same pipeline, tab delimiter |
| XLSX | `xlsx.py` | openpyxl | point | First worksheet, then the CSV column rules |
| WKT | `wkt.py` | shapely | all | One geometry per line, or one pretty-printed geometry |
| GMT | `gmt.py` | stdlib | point, line, area | `>` starts a segment; closed rings become polygons |
| DXF | `dxf.py` | ezdxf | point, line, area | Circle = 72-gon, arc = 36 segments; layer kept |
| MIF/MID | `mif_mid.py` | stdlib | point, line, area | Reads `.mif` + `.mid`, or a ZIP containing both |
| Shapefile | `shapefile.py` | pyshp | all | Reads the `.shp` set or a zipped set; DBF fields kept |
| FlatGeobuf | `flatgeobuf.py` | flatgeobuf | all | Sequential decode; works with or without the spatial index |
| GeoPackage | `geopackage.py` | shapely + sqlite3 | all | First feature table; decodes `GP` blob + WKB |

## Format detection

`detect_format()` looks at content first and the extension last:

1. `SQLite format 3` → GeoPackage; `fgb` magic → FlatGeobuf; `PK` → inspect the ZIP
   (`.kml` → KMZ, `.shp` → Shapefile, `.mif` → MIF);
2. `{` → TopoJSON when `"Topology"` appears, otherwise GeoJSON;
3. `<` → KML / GPX / GML by root element;
4. `0` + `SECTION` → DXF;
5. a geometry keyword → WKT; `>` → GMT; `Version` + `Columns` → MIF;
6. tabs without commas → TSV;
7. otherwise the file extension.

## Limitations worth knowing

* **No reprojection anywhere.** Shapefile `.prj`, GeoPackage `srs_id` and GML
  `srsName` are read as metadata at most; coordinates are never transformed.
* **Shapefile field names** are capped at 10 characters by the DBF format.
* **GeoPackage** reads the first feature table only; style tables and rtree
  indexes are ignored.
* **FlatGeobuf** is decoded sequentially, which also covers files written
  without a spatial index (the upstream `Reader` rejects those).
* **MIF/MID** decorative objects (`Text`, `Rect`, `Ellipse`, `RoundRect`, `Arc`)
  are skipped, so MID rows can shift when they appear before real geometry.
  Only UTF-8 is supported.
* **DXF** handles 2D entities only; blocks, hatches and text are skipped, and a
  drawing in metres is returned in metres.
* **GPX** cannot express polygons; **KML** styles are dropped.
* **XLSX** reads the first worksheet only, with formulas as cached values.
* **CSV/TSV** requires a recognisable longitude/latitude header; otherwise the
  parser raises instead of guessing the column order.