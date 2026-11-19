"""GML parser (OGC Geography Markup Language).

GML is a large family of XML schemas; this file targets the common
``FeatureCollection`` profile used by WFS responses and desktop exports. Each
feature is taken from a ``gml:featureMember`` or ``gml:member``, its first
geometry descendant is converted, and coordinates are read from ``gml:pos``,
``gml:posList`` or the legacy ``gml:coordinates``. Other direct children become
properties from their text.

Install: none (uses only the Python standard library).

This file is standalone. Supported geometry: Point, LineString, LinearRing,
Polygon, MultiPoint, MultiLineString, MultiPolygon and the ``curve``/``surface``
aliases. A ``srsName`` other than EPSG:4326 is ignored, not converted, so no
reprojection is performed. App-schema nesting and mathematically defined curves
are out of scope.

    python gml_parser.py input.gml
    python gml_parser.py input.gml -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

GEOMETRY_NAMES = {
    "Point",
    "LineString",
    "LinearRing",
    "Polygon",
    "MultiPoint",
    "MultiLineString",
    "MultiPolygon",
    "curve",
    "surface",
}


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


def multipoint(coords: Any) -> dict[str, Any]:
    return {"type": "MultiPoint", "coordinates": _xy(coords)}


def polygon(rings: Any) -> dict[str, Any]:
    return {"type": "Polygon", "coordinates": [_xy(ring) for ring in rings]}


def multipolygon(polys: Any) -> dict[str, Any]:
    return {"type": "MultiPolygon", "coordinates": [[_xy(ring) for ring in rings] for rings in polys]}


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def local_name(tag: str) -> str:
    """Strip the XML namespace from a tag or attribute name."""
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag.split(":")[-1]


def parse_bytes(data: bytes) -> dict[str, Any]:
    """Parse GML bytes into a FeatureCollection dict."""
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ParseError(f"invalid GML XML: {exc}") from exc

    features: list[dict[str, Any]] = []
    for node in root.iter():
        if local_name(node.tag) not in {"featureMember", "member"}:
            continue
        for child in node:
            if isinstance(child.tag, str):
                features.append(_feature(child))
    return collection(features)


def parse(path: str | Path) -> dict[str, Any]:
    """Read and parse a GML file."""
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


def _feature(element: ET.Element) -> dict[str, Any]:
    props: dict[str, Any] = {}
    for child in element:
        if not isinstance(child.tag, str):
            continue
        name = local_name(child.tag)
        if name in {"boundedBy", "location", "geometry"} or _find_geometry(child) is not None:
            continue
        text = (child.text or "").strip()
        if text:
            props[name] = text
    return feature(_find_geometry(element), props)


def _find_geometry(element: ET.Element) -> dict[str, Any] | None:
    for node in element.iter():
        if isinstance(node.tag, str) and local_name(node.tag) in GEOMETRY_NAMES:
            return _geometry(node)
    return None


def _geometry(element: ET.Element) -> dict[str, Any] | None:
    kind = local_name(element.tag)
    if kind == "Point":
        coords = _line_coords(element)
        return point(coords[0]) if coords else None
    if kind in {"LineString", "LinearRing", "curve"}:
        coords = _line_coords(element)
        return linestring(coords) if coords else None
    if kind in {"Polygon", "surface"}:
        rings = _rings(element)
        return polygon(rings) if rings else None
    if kind == "MultiPoint":
        coords = [line[0] for line in (_line_coords(n) for n in _descendants(element, {"Point"})) if line]
        return multipoint(coords) if coords else None
    if kind == "MultiLineString":
        lines = [line for line in (_line_coords(n) for n in _descendants(element, {"LineString"})) if line]
        return multilinestring(lines) if lines else None
    if kind == "MultiPolygon":
        polys = [p["coordinates"] for p in
                 (_geometry(n) for n in _descendants(element, {"Polygon", "surface"})) if p]
        return multipolygon(polys) if polys else None
    return None


def _rings(element: ET.Element) -> list[list[list[float]]]:
    rings: list[list[list[float]]] = []
    for boundary in element:
        if not isinstance(boundary.tag, str):
            continue
        if local_name(boundary.tag) not in {"outerBoundaryIs", "innerBoundaryIs", "exterior", "interior"}:
            continue
        for ring in _descendants(boundary, {"LinearRing"}) or [boundary]:
            coords = _line_coords(ring)
            if coords:
                rings.append(coords)
    if not rings:
        # Some encoders put <posList> directly under <Polygon>.
        coords = _line_coords(element)
        if coords:
            rings.append(coords)
    return rings


def _descendants(element: ET.Element, names: set[str]) -> list[ET.Element]:
    return [node for node in element.iter()
            if isinstance(node.tag, str) and local_name(node.tag) in names]


def _line_coords(element: ET.Element) -> list[list[float]]:
    """Read a coordinate sequence from pos / posList / coordinates."""
    for node in element.iter():
        if not isinstance(node.tag, str):
            continue
        name = local_name(node.tag)
        if name == "posList":
            return _pos_list(node)
        if name == "coordinates":
            return _coordinates(node)
        if name == "pos":
            numbers = _numbers(node.text or "")
            return [[numbers[0], numbers[1]]] if len(numbers) >= 2 else []
    return []


def _pos_list(element: ET.Element) -> list[list[float]]:
    numbers = _numbers((element.text or "").replace("\n", " "))
    return [[numbers[i], numbers[i + 1]] for i in range(0, len(numbers) - 1, 2)]


def _coordinates(element: ET.Element) -> list[list[float]]:
    """Read legacy <gml:coordinates> with cs="," ts=" " separators."""
    decimal = element.get("decimal") or "."
    cs = element.get("cs") or ","
    ts = element.get("ts") or " "
    points: list[list[float]] = []
    for tuple_text in (element.text or "").replace("\n", ts).split(ts):
        parts = tuple_text.strip().split(cs)
        if len(parts) < 2:
            continue
        try:
            points.append([float(parts[0].replace(decimal, ".")), float(parts[1].replace(decimal, "."))])
        except ValueError:
            raise ParseError(f"invalid GML coordinate: {tuple_text!r}") from None
    return points


def _numbers(text: str) -> list[float]:
    values: list[float] = []
    for token in text.split():
        try:
            values.append(float(token))
        except ValueError:
            raise ParseError(f"invalid GML number: {token!r}") from None
    return values


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert GML to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .gml file")
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