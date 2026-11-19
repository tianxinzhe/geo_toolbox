"""GeoJSON parser (RFC 7946).

GeoJSON is already the internal model of this package, so parsing is mostly
validation:

* a full ``FeatureCollection`` is returned as-is (unknown members are kept);
* a single ``Feature`` or a bare ``Geometry`` is wrapped into a collection,
  because many hand-written files contain only one object;
* coordinates are longitude first, latitude second, in decimal degrees.

No reprojection is performed. A ``"crs"`` member, if present, is ignored.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .common import ParseError, collection, feature

GEOMETRY_TYPES = {
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
    "GeometryCollection",
}


def parse_bytes(data: bytes) -> dict[str, Any]:
    try:
        doc = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ParseError(f"invalid JSON: {exc}") from exc
    return _normalize(doc)


def parse(path: str | Path) -> dict[str, Any]:
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
        features = doc.get("features")
        if not isinstance(features, list):
            raise ParseError("FeatureCollection.features must be an array")
        return doc

    if kind == "Feature":
        return collection([doc])

    if kind in GEOMETRY_TYPES:
        return collection([feature(doc)])

    raise ParseError(f"unsupported GeoJSON type: {kind!r}")