"""KML parser (OGC Keyhole Markup Language).

KML is XML. This parser walks every ``Placemark`` and converts its geometry:

* ``Point`` / ``LineString`` / ``LinearRing`` / ``Polygon``;
* ``MultiGeometry`` is flattened into a ``GeometryCollection``;
* ``gx:Track`` (Google extension) is treated as a LineString of its
  ``gx:coord`` points.

Coordinates always use the order **longitude,latitude[,altitude]** and are
whitespace separated inside ``<coordinates>``. Altitude is dropped: GeoJSON
positions here are two-dimensional.

Styles, icons, balloons and ``<description>`` remain properties, not geometry.
Shared styles and overlays are ignored.
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
    point,
    polygon,
)


def parse_bytes(data: bytes) -> dict[str, Any]:
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ParseError(f"invalid KML XML: {exc}") from exc

    features: list[dict[str, Any]] = []
    for placemark in root.iter():
        if local_name(placemark.tag) != "Placemark":
            continue
        props = _properties(placemark)
        geometry = _geometry_of(placemark)
        features.append(feature(geometry, props))
    return collection(features)


def parse(path: str | Path) -> dict[str, Any]:
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------


def _text_of(element: ET.Element, name: str) -> str | None:
    for child in element:
        if local_name(child.tag) == name and child.text:
            return child.text.strip()
    return None


def _properties(placemark: ET.Element) -> dict[str, Any]:
    props: dict[str, Any] = {}
    name = _text_of(placemark, "name")
    if name:
        props["name"] = name
    description = _text_of(placemark, "description")
    if description:
        props["description"] = description
    if placemark.get("id"):
        props["id"] = placemark.get("id")
    return props


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------


def _children(element: ET.Element, names: set[str]) -> list[ET.Element]:
    return [child for child in element if local_name(child.tag) in names]


def _coordinates(element: ET.Element) -> list[list[float]]:
    """Read the first <coordinates> descendant as lon/lat pairs."""
    for node in element.iter():
        if local_name(node.tag) != "coordinates":
            continue
        points: list[list[float]] = []
        for token in (node.text or "").replace("\n", " ").split():
            parts = token.split(",")
            if len(parts) < 2:
                continue
            try:
                points.append([float(parts[0]), float(parts[1])])
            except ValueError:
                raise ParseError(f"invalid KML coordinate: {token!r}") from None
        return points
    return []


def _geometry_of(element: ET.Element) -> dict[str, Any] | None:
    """Return the first supported geometry below ``element``."""
    for node in element.iter():
        kind = local_name(node.tag)
        if kind == "Point":
            coords = _coordinates(node)
            return point(coords[0]) if coords else None
        if kind == "LineString":
            coords = _coordinates(node)
            return linestring(coords) if coords else None
        if kind == "LinearRing":
            coords = _coordinates(node)
            return polygon([coords]) if coords else None
        if kind == "Polygon":
            return _polygon(node)
        if kind == "MultiGeometry":
            geometries = [g for g in (_geometry_of(c) for c in node) if g]
            if not geometries:
                return None
            if len(geometries) == 1:
                return geometries[0]
            return {"type": "GeometryCollection", "geometries": geometries}
        if kind == "Track":
            coords = _track(node)
            return linestring(coords) if coords else None
    return None


def _polygon(node: ET.Element) -> dict[str, Any] | None:
    rings: list[list[list[float]]] = []
    for child in node:
        role = local_name(child.tag)
        if role not in {"outerBoundaryIs", "innerBoundaryIs"}:
            continue
        ring = _coordinates(child)
        if ring:
            rings.append(ring)
    if not rings:
        return None
    # KML does not guarantee ring order; the first ring is the exterior by spec.
    return polygon(rings)


def _track(node: ET.Element) -> list[list[float]]:
    """gx:Track stores one "lon lat alt" string per <gx:coord>."""
    coords: list[list[float]] = []
    for child in node:
        if local_name(child.tag) != "coord" or not child.text:
            continue
        parts = child.text.split()
        if len(parts) >= 2:
            coords.append([float(parts[0]), float(parts[1])])
    return coords