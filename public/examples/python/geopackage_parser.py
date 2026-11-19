"""GeoPackage (.gpkg) parser.

A GeoPackage is a SQLite database with a small metadata schema: ``gpkg_contents``
lists the layers, ``gpkg_geometry_columns`` names each layer's geometry column,
and feature rows store geometry as a blob ("GP" + version + flags + srs_id +
optional envelope + WKB). This file opens the database read-only, takes the
first feature table and decodes every geometry with ``shapely.from_wkb``.

Install: pip install shapely

No reprojection is performed: coordinates stay in the layer's declared CRS.
Null and empty geometries are skipped, and style, index and non-feature tables
are ignored.

    python geopackage_parser.py input.gpkg
    python geopackage_parser.py input.gpkg -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any


class ParseError(ValueError):
    """Raised when a file cannot be parsed."""


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def parse(path: str | Path) -> dict[str, Any]:
    """Read the first feature table of a GeoPackage into a FeatureCollection."""
    path = Path(path)
    try:
        connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.Error as exc:
        raise ParseError(f"cannot open GeoPackage {path}: {exc}") from exc

    try:
        return _read(connection)
    except sqlite3.Error as exc:
        raise ParseError(f"invalid GeoPackage: {exc}") from exc
    finally:
        connection.close()


def _read(connection: sqlite3.Connection) -> dict[str, Any]:
    try:
        import shapely
        from shapely.geometry import mapping
    except ImportError as exc:
        raise ParseError("shapely is required: pip install shapely") from exc

    layer = connection.execute(
        "SELECT c.table_name, g.column_name "
        "FROM gpkg_contents AS c "
        "JOIN gpkg_geometry_columns AS g ON g.table_name = c.table_name "
        "WHERE c.data_type = 'features' "
        "ORDER BY c.table_name LIMIT 1"
    ).fetchone()

    if layer is None:
        raise ParseError("GeoPackage contains no feature table")

    table, geometry_column = layer
    quoted_table, quoted_geometry = _quote(table), _quote(geometry_column)

    column_names = [
        row[1]
        for row in connection.execute(f"PRAGMA table_info({quoted_table})")
        if row[1] != geometry_column
    ]

    select_columns = ", ".join([quoted_geometry] + [_quote(name) for name in column_names])
    features: list[dict[str, Any]] = []

    for row in connection.execute(f"SELECT {select_columns} FROM {quoted_table}"):
        blob = row[0]
        if blob is None:
            continue
        geometry = _decode_geometry(blob, shapely, mapping)
        if geometry is None:
            continue
        properties = {
            name: value for name, value in zip(column_names, row[1:]) if value is not None
        }
        features.append(feature(geometry, properties))

    return collection(features)


def _decode_geometry(blob: bytes, shapely: Any, mapping: Any) -> dict[str, Any] | None:
    if len(blob) < 8 or blob[0:2] != b"GP":
        raise ParseError("geometry blob is not a GeoPackage geometry")

    flags = blob[3]
    if flags & 0x10:  # empty geometry
        return None
    envelope_size = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get((flags >> 1) & 0x07, 0)

    # Header: magic(2) + version(1) + flags(1) + srs_id(4) = 8 bytes.
    wkb = blob[8 + envelope_size :]
    if not wkb:
        return None

    try:
        geometry = shapely.from_wkb(wkb)
    except Exception as exc:
        raise ParseError(f"invalid WKB in GeoPackage: {exc}") from exc

    if geometry is None or geometry.is_empty:
        return None
    return dict(mapping(geometry))


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert a GeoPackage to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .gpkg file")
    parser.add_argument("-o", "--out", help="write JSON to this file instead of stdout")
    parser.add_argument("--indent", type=int, default=2, help="JSON indentation (default: 2)")
    args = parser.parse_args(argv)

    try:
        result = parse(args.input)
        text = json.dumps(result, ensure_ascii=False, indent=args.indent)
        if args.out:
            Path(args.out).write_text(text, encoding="utf-8")
        else:
            print(text)
    except (ParseError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())