"""ESRI Shapefile parser (via pyshp).

A Shapefile is a set of files: ``.shp`` holds the shapes, ``.shx`` an offset
index and ``.dbf`` the attribute table. ``pyshp`` reads the whole set from
either the ``.shp`` path or a ``.zip`` archive containing it, and each shape is
turned into a GeoJSON geometry through ``__geo_interface__``. DBF fields become
properties (names stay limited to 10 characters) and null shapes are skipped.

Install: pip install pyshp

No reprojection is performed: the ``.prj`` file is ignored and coordinates are
returned exactly as stored, so a projected shapefile needs external
reprojection before being treated as longitude/latitude.

    python shapefile_parser.py input.shp
    python shapefile_parser.py input.zip -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

GEOMETRY_TYPES = {
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
}


class ParseError(ValueError):
    """Raised when a file cannot be parsed."""


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def parse(path: str | Path) -> dict[str, Any]:
    """Read a .shp or .zip shapefile set into a FeatureCollection dict."""
    try:
        import shapefile
    except ImportError as exc:
        raise ParseError("pyshp is required: pip install pyshp") from exc

    try:
        reader = shapefile.Reader(str(path))
    except Exception as exc:
        raise ParseError(f"cannot read shapefile {path}: {exc}") from exc

    try:
        field_names = [field[0] for field in reader.fields[1:]]
        features: list[dict[str, Any]] = []

        for shape_record in reader.iterShapeRecords():
            geometry = _geometry(shape_record.shape)
            if geometry is None:
                continue

            record = shape_record.record
            properties = {
                name: _value(record[index])
                for index, name in enumerate(field_names)
                if index < len(record)
            }
            features.append(feature(geometry, properties))

        return collection(features)
    finally:
        reader.close()


def _geometry(shape: Any) -> dict[str, Any] | None:
    if shape is None or getattr(shape, "shapeType", 0) == 0:
        return None

    raw = shape.__geo_interface__
    kind = raw.get("type")
    if kind not in GEOMETRY_TYPES:
        return None
    return {"type": kind, "coordinates": _lists(raw.get("coordinates"))}


def _lists(value: Any) -> Any:
    """Make pyshp's nested tuples JSON friendly."""
    if isinstance(value, (list, tuple)):
        return [_lists(item) for item in value]
    return value


def _value(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace").strip()
    if isinstance(value, str):
        return value.strip()
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert a Shapefile to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .shp file or .zip shapefile set")
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