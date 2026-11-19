"""WKT parser (Well-Known Text).

WKT is a text notation for a single geometry such as POINT, LINESTRING,
POLYGON, MULTIPOLYGON or GEOMETRYCOLLECTION. Parsing is delegated to
``shapely``, which implements the full grammar, and the result is converted with
``shapely.geometry.mapping``. The input may be one geometry (possibly
pretty-printed over several lines) or one geometry per line.

Install: pip install shapely

This file is standalone. An optional ``SRID=4326;`` prefix is stripped; WKT
carries no attributes, so properties stay empty, and no reprojection is
performed.

    python wkt_parser.py input.wkt
    python wkt_parser.py input.wkt -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


class ParseError(ValueError):
    """Raised when a file cannot be parsed."""


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def parse_bytes(data: bytes) -> dict[str, Any]:
    """Parse WKT bytes into a FeatureCollection dict."""
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ParseError(f"file is not UTF-8: {exc}") from exc
    return parse_text(text)


def parse(path: str | Path) -> dict[str, Any]:
    """Read and parse a WKT file."""
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


def parse_text(text: str) -> dict[str, Any]:
    if text.strip() == "":
        raise ParseError("input is empty")

    # Try the whole document first, so pretty-printed WKT stays intact.
    document = _parse_one(text)
    if document is not None:
        return collection([feature(document)])

    # Fall back to one geometry per line.
    features: list[dict[str, Any]] = []
    for number, line in enumerate(text.splitlines(), start=1):
        if line.strip() == "":
            continue
        geometry = _parse_one(line)
        if geometry is None:
            raise ParseError(f"invalid WKT on line {number}: {line.strip()[:60]!r}")
        features.append(feature(geometry))
    if not features:
        raise ParseError("no valid WKT geometry found")
    return collection(features)


def _parse_one(wkt: str) -> dict[str, Any] | None:
    text = wkt.strip()
    if not text:
        return None
    if text.upper().startswith("SRID=") and ";" in text:
        text = text.split(";", 1)[1].strip()

    try:
        from shapely import from_wkt
        from shapely.geometry import mapping
    except ImportError as exc:
        raise ParseError("shapely is required: pip install shapely") from exc

    try:
        geometry = from_wkt(text)
    except Exception:
        return None
    if geometry is None or geometry.is_empty:
        return None
    return dict(mapping(geometry))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert WKT to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .wkt file")
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