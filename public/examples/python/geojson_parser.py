"""GeoJSON parser (RFC 7946).

GeoJSON is a JSON encoding of geographic features: a ``FeatureCollection``
holds ``Feature`` objects, each with a geometry (Point, LineString, Polygon and
their multi/collection variants) and a properties object. Coordinates are
longitude first, latitude second, in decimal degrees.

Install: none (uses only the Python standard library).

This file is standalone: copy it anywhere and run it. A bare ``Feature`` or a
bare geometry is wrapped into a collection, because many hand-written files
contain only one object. No reprojection is performed; a ``crs`` member, if
present, is ignored.

    python geojson_parser.py input.geojson
    python geojson_parser.py input.geojson -o out.geojson --indent 0
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
    "GeometryCollection",
}


class ParseError(ValueError):
    """Raised when a file cannot be parsed."""


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def parse_bytes(data: bytes) -> dict[str, Any]:
    """Parse GeoJSON bytes into a FeatureCollection dict."""
    try:
        doc = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ParseError(f"invalid JSON: {exc}") from exc
    return _normalize(doc)


def parse(path: str | Path) -> dict[str, Any]:
    """Read and parse a GeoJSON file."""
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


def _normalize(doc: Any) -> dict[str, Any]:
    if not isinstance(doc, dict):
        raise ParseError("GeoJSON root must be a JSON object")

    kind = doc.get("type")
    if kind == "FeatureCollection":
        if not isinstance(doc.get("features"), list):
            raise ParseError("FeatureCollection.features must be an array")
        return doc
    if kind == "Feature":
        return collection([doc])
    if kind in GEOMETRY_TYPES:
        return collection([feature(doc)])
    raise ParseError(f"unsupported GeoJSON type: {kind!r}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert GeoJSON to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .geojson file")
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