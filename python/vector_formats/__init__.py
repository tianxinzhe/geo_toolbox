"""Vector format parsers: 16 formats, one GeoJSON contract.

Each module exposes ``parse(path) -> FeatureCollection``. This package adds

* ``FORMATS`` — format slug to parser function;
* ``detect_format(path)`` — content-aware sniffing with extension fallback;
* ``parse_file(path, format="auto")`` — the convenience entry point.

All parsers return plain dictionaries that ``json.dumps`` can serialise:

    {
      "type": "FeatureCollection",
      "features": [
        {"type": "Feature", "geometry": {...}, "properties": {...}}
      ]
    }

Coordinates are WGS84 longitude/latitude unless a format module documents
otherwise. No parser reprojects data.

Formats: geojson, topojson, kml, kmz, gpx, gml, csv, tsv, xlsx, wkt, gmt, dxf,
mif, shapefile, fgb, gpkg.
"""

from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Any, Callable

from . import (
    csv_tsv,
    dxf,
    flatgeobuf,
    geojson,
    geopackage,
    gml,
    gmt,
    gpx,
    kml,
    kmz,
    mif_mid,
    shapefile,
    topojson,
    wkt,
    xlsx,
)

Parser = Callable[[str | Path], dict[str, Any]]

FORMATS: dict[str, Parser] = {
    "geojson": geojson.parse,
    "topojson": topojson.parse,
    "kml": kml.parse,
    "kmz": kmz.parse,
    "gpx": gpx.parse,
    "gml": gml.parse,
    "csv": csv_tsv.parse_csv,
    "tsv": csv_tsv.parse_tsv,
    "xlsx": xlsx.parse,
    "wkt": wkt.parse,
    "gmt": gmt.parse,
    "dxf": dxf.parse,
    "mif": mif_mid.parse,
    "shapefile": shapefile.parse,
    "fgb": flatgeobuf.parse,
    "gpkg": geopackage.parse,
}

EXTENSIONS: dict[str, str] = {
    ".geojson": "geojson",
    ".json": "geojson",
    ".topojson": "topojson",
    ".kml": "kml",
    ".kmz": "kmz",
    ".gpx": "gpx",
    ".gml": "gml",
    ".xml": "gml",
    ".csv": "csv",
    ".tsv": "tsv",
    ".xlsx": "xlsx",
    ".xlsm": "xlsx",
    ".wkt": "wkt",
    ".gmt": "gmt",
    ".dxf": "dxf",
    ".mif": "mif",
    ".shp": "shapefile",
    ".fgb": "fgb",
    ".gpkg": "gpkg",
}

WKT_STARTS = (
    "POINT",
    "LINESTRING",
    "POLYGON",
    "MULTIPOINT",
    "MULTILINESTRING",
    "MULTIPOLYGON",
    "GEOMETRYCOLLECTION",
)


def parse_file(path: str | Path, format: str = "auto") -> dict[str, Any]:
    """Parse ``path`` with the named format, or detect it when ``auto``."""
    resolved = detect_format(path) if format == "auto" else format
    if resolved is None or resolved not in FORMATS:
        raise ValueError(
            f"cannot determine the format of {path}; pass --format. "
            f"Supported: {', '.join(FORMATS)}"
        )
    return FORMATS[resolved](path)


def detect_format(path: str | Path) -> str | None:
    """Sniff the format from magic bytes and the first KB of text.

    Content wins over the extension, because ``.json`` can be GeoJSON or
    TopoJSON and ``.txt`` can be CSV, WKT or GMT.
    """
    path = Path(path)
    try:
        head = path.read_bytes()[:8192]
    except OSError:
        return EXTENSIONS.get(path.suffix.lower())

    if head.startswith(b"SQLite format 3\x00"):
        return "gpkg"
    if head.startswith(b"fgb"):
        return "fgb"
    if head.startswith(b"PK\x03\x04"):
        zipped = _zip_format(path)
        return zipped or EXTENSIONS.get(path.suffix.lower())

    text = head.decode("utf-8", errors="ignore").lstrip("\ufeff \t\r\n")

    if text.startswith("{"):
        return "topojson" if '"Topology"' in text[:2048] else "geojson"
    if text.startswith("<"):
        lowered = text[:2048].lower()
        if "<kml" in lowered:
            return "kml"
        if "<gpx" in lowered:
            return "gpx"
        if "featurecollection" in lowered or "gml:" in lowered:
            return "gml"
    if text.startswith("0") and "SECTION" in text[:512]:
        return "dxf"
    upper = text[:200].upper()
    if any(upper.startswith(name) for name in WKT_STARTS):
        return "wkt"
    if text.startswith(">"):
        return "gmt"
    first_line = text.splitlines()[0] if text else ""
    if first_line.lower().startswith("version") and "columns" in text[:2048].lower():
        return "mif"
    if "\t" in first_line and "," not in first_line:
        return "tsv"

    return EXTENSIONS.get(path.suffix.lower())


def _zip_format(path: Path) -> str | None:
    try:
        with zipfile.ZipFile(path) as archive:
            names = [name.lower() for name in archive.namelist()]
    except zipfile.BadZipFile:
        return None
    if any(name.endswith(".kml") for name in names):
        return "kmz"
    if any(name.endswith(".shp") for name in names):
        return "shapefile"
    if any(name.endswith(".mif") for name in names):
        return "mif"
    if any(name.endswith("xl/workbook.xml") for name in names):
        return "xlsx"
    return None