"""GPX parser (GPS Exchange Format).

GPX is the XML format produced by GPS devices and fitness apps. Only three
elements carry geometry: ``wpt`` (a waypoint, one Point), ``trk`` (a track
whose ``trkseg`` segments become LineStrings) and ``rte`` (a route whose
``rtept`` points form a LineString). Elevation, time and name/description
become properties.

Install: none (uses only the Python standard library).

This file is standalone. Elevation is not written into the position, so
GeoJSON positions remain two-dimensional. GPX has no polygon type by design.
No reprojection is performed.

    python gpx_parser.py input.gpx
    python gpx_parser.py input.gpx -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


class ParseError(ValueError):
    """Raised when a file cannot be parsed."""


def _xy(coords: Any) -> list[list[float]]:
    return [[float(x), float(y)] for x, y in coords]


def point(coords: Any) -> dict[str, Any]:
    return {"type": "Point", "coordinates": [float(coords[0]), float(coords[1])]}


def linestring(coords: Any) -> dict[str, Any]:
    return {"type": "LineString", "coordinates": _xy(coords)}


def multilinestring(lines: Any) -> dict[str, Any]:
    return {"type": "MultiLineString", "coordinates": [_xy(line) for line in lines]}


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def local_name(tag: str) -> str:
    """Strip the XML namespace from a tag or attribute name."""
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag.split(":")[-1]


def to_float(value: Any) -> float | None:
    """Parse a numeric cell; returns None for blanks and unparsable values."""
    if value is None:
        return None
    try:
        return float(str(value).strip())
    except ValueError:
        return None


def parse_bytes(data: bytes) -> dict[str, Any]:
    """Parse GPX bytes into a FeatureCollection dict."""
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ParseError(f"invalid GPX XML: {exc}") from exc

    features: list[dict[str, Any]] = []
    for node in root.iter():
        kind = local_name(node.tag)
        if kind == "wpt":
            coords = _coord(node)
            if coords:
                features.append(feature(point(coords), _properties(node)))
        elif kind == "trk":
            lines: list[list[list[float]]] = []
            for segment in _children(node, "trkseg"):
                coords = [c for c in (_coord(p) for p in _children(segment, "trkpt")) if c]
                if len(coords) >= 2:
                    lines.append(coords)
            if lines:
                geometry = linestring(lines[0]) if len(lines) == 1 else multilinestring(lines)
                features.append(feature(geometry, _properties(node)))
        elif kind == "rte":
            line = [c for c in (_coord(p) for p in _children(node, "rtept")) if c]
            if len(line) >= 2:
                features.append(feature(linestring(line), _properties(node)))
    return collection(features)


def parse(path: str | Path) -> dict[str, Any]:
    """Read and parse a GPX file."""
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


def _children(element: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in element if local_name(child.tag) == name]


def _coord(element: ET.Element) -> list[float] | None:
    try:
        return [float(element.get("lon", "")), float(element.get("lat", ""))]
    except ValueError:
        return None


def _text(element: ET.Element, name: str) -> str | None:
    for child in element:
        if local_name(child.tag) == name and child.text:
            return child.text.strip()
    return None


def _properties(element: ET.Element) -> dict[str, Any]:
    props: dict[str, Any] = {}
    for key in ("name", "desc", "type", "time"):
        value = _text(element, key)
        if value:
            props[key] = value
    elevation = to_float(_text(element, "ele"))
    if elevation is not None:
        props["ele"] = elevation
    return props


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert GPX to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .gpx file")
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