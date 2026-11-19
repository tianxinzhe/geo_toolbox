"""GMT plain-text parser ("segment" format).

GMT's ASCII format has no formal specification, but the convention is stable: a
line starting with ``>`` opens a new feature (the rest of the line becomes its
name) and the following lines are ``lon lat`` pairs, optionally with extra
columns. A single point becomes a Point, a closed ring of four or more points
becomes a Polygon, and anything else becomes a LineString.

Install: none (uses only the Python standard library).

This file is standalone. A file without any ``>`` header is treated as one
segment. Holes cannot be expressed, and coordinates are used as stored with no
reprojection.

    python gmt_parser.py input.gmt
    python gmt_parser.py input.gmt -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


class ParseError(ValueError):
    """Raised when a file cannot be parsed."""


def point(coords: list[float]) -> dict[str, Any]:
    return {"type": "Point", "coordinates": [float(coords[0]), float(coords[1])]}


def linestring(coords: list[list[float]]) -> dict[str, Any]:
    return {"type": "LineString", "coordinates": [[float(x), float(y)] for x, y in coords]}


def polygon(rings: list[list[list[float]]]) -> dict[str, Any]:
    return {
        "type": "Polygon",
        "coordinates": [
            [[float(x), float(y)] for x, y in ring]
            for ring in rings
        ],
    }


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def parse_bytes(data: bytes) -> dict[str, Any]:
    """Parse GMT bytes into a FeatureCollection dict."""
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ParseError(f"file is not UTF-8: {exc}") from exc
    return parse_text(text)


def parse(path: str | Path) -> dict[str, Any]:
    """Read and parse a GMT text file."""
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


def parse_text(text: str) -> dict[str, Any]:
    segments: list[tuple[str, list[list[float]]]] = []
    name = ""
    coords: list[list[float]] = []

    def flush() -> None:
        if coords:
            segments.append((name, list(coords)))
        coords.clear()

    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if line == "" or line.startswith("#"):
            continue
        if line.startswith(">"):
            flush()
            name = line[1:].strip()
            continue
        parts = line.split()
        if len(parts) < 2:
            raise ParseError(f"line {number}: expected at least two numbers")
        try:
            coords.append([float(parts[0]), float(parts[1])])
        except ValueError:
            raise ParseError(f"line {number}: invalid coordinate {line!r}") from None
    flush()

    features: list[dict[str, Any]] = []
    for segment_name, points in segments:
        props = {"name": segment_name} if segment_name else {}
        if len(points) == 1:
            features.append(feature(point(points[0]), props))
        elif len(points) >= 4 and points[0] == points[-1]:
            features.append(feature(polygon([points]), props))
        else:
            features.append(feature(linestring(points), props))
    return collection(features)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert GMT to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .gmt file")
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