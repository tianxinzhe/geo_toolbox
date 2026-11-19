"""GML parser (OGC Geography Markup Language).

GML is a large family of schemas; this parser targets the common
``FeatureCollection`` profile used by WFS and desktop exports:

* features are found inside ``gml:featureMember`` or ``gml:member``;
* the first geometry descendant of each feature is converted;
* coordinates are read from ``gml:pos``, ``gml:posList`` or
  ``gml:coordinates`` (lon/lat order, degrees);
* every other direct child of the feature becomes a property using its text.

Supported geometry elements: Point, LineString, LinearRing, Polygon,
MultiPoint, MultiLineString, MultiPolygon, plus the ``surface``/``curve``
aliases. App-schema nesting, curves with mathematical definitions and CRS
reprojection are out of scope: a non-4326 ``srsName`` is ignored, not converted.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from .common import (
    ParseError,
    collection,
    feature,
    linestring,
    local_name,
    multilinestring,
    multipoint,
    multipolygon,
    point,
    polygon,
)

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

POS_NAMES = {"pos", "posList", "coordinates"}


def parse_bytes(data: bytes) -> dict[str, Any]:
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
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


# ---------------------------------------------------------------------------
# Feature and properties
# ---------------------------------------------------------------------------


def _feature(element: ET.Element) -> dict[str, Any]:
    props: dict[str, Any] = {}
    for child in element:
        if not isinstance(child.tag, str):
            continue
        if local_name(child.tag) in {"boundedBy", "location", "geometry"}:
            continue
        if _find_geometry(child) is not None:
            continue
        text = (child.text or "").strip()
        if text:
            props[local_name(child.tag)] = text

    geometry = _find_geometry(element)
    return feature(geometry, props)


def _find_geometry(element: ET.Element) -> dict[str, Any] | None:
    for node in element.iter():
        if not isinstance(node.tag, str):
            continue
        if local_name(node.tag) in GEOMETRY_NAMES:
            return _geometry(node)
    return None


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------


def _children(element: ET.Element, names: set[str]) -> list[ET.Element]:
    return [
        child
        for child in element
        if isinstance(child.tag, str) and local_name(child.tag) in names
    ]


def _descendants(element: ET.Element, names: set[str]) -> list[ET.Element]:
    return [
        node
        for node in element.iter()
        if isinstance(node.tag, str) and local_name(node.tag) in names
    ]


def _geometry(element: ET.Element) -> dict[str, Any] | None:
    kind = local_name(element.tag)

    if kind in {"curve", "LineString", "LinearRing"}:
        coords = _line_coords(element)
        return linestring(coords) if coords else None

    if kind == "Point":
        coords = _line_coords(element)
        return point(coords[0]) if coords else None

    if kind in {"surface", "Polygon"}:
        return _polygon(element)

    if kind == "MultiPoint":
        members = _descendants(element, {"Point"})
        coords = []
        for member in members:
            line = _line_coords(member)
            if line:
                coords.append(line[0])
        return multipoint(coords) if coords else None

    if kind == "MultiLineString":
        lines = [_line_coords(member) for member in _descendants(element, {"LineString"})]
        lines = [line for line in lines if line]
        return multilinestring(lines) if lines else None

    if kind == "MultiPolygon":
        polygons = []
        for member in _descendants(element, {"Polygon", "surface"}):
            poly = _polygon(member)
            if poly:
                polygons.append(poly["coordinates"])
        return multipolygon(polygons) if polygons else None

    return None


def _polygon(element: ET.Element) -> dict[str, Any] | None:
    rings: list[list[list[float]]] = []
    for boundary in _children(
        element, {"outerBoundaryIs", "innerBoundaryIs", "exterior", "interior"}
    ):
        ring_nodes = _descendants(boundary, {"LinearRing"})
        if not ring_nodes:
            ring_nodes = [boundary]
        for ring in ring_nodes:
            coords = _line_coords(ring)
            if coords:
                rings.append(coords)
    if not rings:
        # Some encoders put <posList> directly under <Polygon>.
        coords = _pos_list(element)
        if coords:
            rings.append(coords)
    return polygon(rings) if rings else None


# ---------------------------------------------------------------------------
# Coordinate readers
# ---------------------------------------------------------------------------


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
            pair = _numbers(node.text or "")
            return [[pair[0], pair[1]]] if len(pair) >= 2 else []
    return []


def _pos_list(element: ET.Element) -> list[list[float]]:
    numbers = _numbers((element.text or "").replace("\n", " "))
    points: list[list[float]] = []
    for i in range(0, len(numbers) - 1, 2):
        points.append([numbers[i], numbers[i + 1]])
    return points


def _coordinates(element: ET.Element) -> list[list[float]]:
    """Read legacy <gml:coordinates> with cs="," ts=" " separators."""
    decimal = element.get("decimal") or "."
    cs = element.get("cs") or ","
    ts = element.get("ts") or " "
    text = (element.text or "").replace("\n", ts).strip()
    points: list[list[float]] = []
    for tuple_text in text.split(ts):
        tuple_text = tuple_text.strip()
        if not tuple_text:
            continue
        parts = tuple_text.split(cs)
        if len(parts) < 2:
            continue
        try:
            points.append([
                float(parts[0].replace(decimal, ".")),
                float(parts[1].replace(decimal, ".")),
            ])
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