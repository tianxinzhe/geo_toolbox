"""GPX parser (GPS Exchange Format).

GPX only has three geometry-bearing elements:

* ``wpt`` — waypoint, one point;
* ``trk`` — track, containing one or more ``trkseg`` segments, each a line;
* ``rte`` — route, a list of ``rtept`` forming a line.

Elevation (``ele``), ``time`` and ``name``/``desc`` become properties; elevation
is not written into the GeoJSON position, so positions stay two-dimensional.

GPX has no polygon type: areas cannot be represented and are absent from the
format by design.
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
    point,
)


def parse_bytes(data: bytes) -> dict[str, Any]:
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
                geometry = (
                    linestring(lines[0]) if len(lines) == 1 else multilinestring(lines)
                )
                features.append(feature(geometry, _properties(node)))
        elif kind == "rte":
            line = [c for c in (_coord(p) for p in _children(node, "rtept")) if c]
            if len(line) >= 2:
                features.append(feature(linestring(line), _properties(node)))

    return collection(features)


def parse(path: str | Path) -> dict[str, Any]:
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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
    elevation = _text(element, "ele")
    if elevation:
        try:
            props["ele"] = float(elevation)
        except ValueError:
            props["ele"] = elevation
    return props