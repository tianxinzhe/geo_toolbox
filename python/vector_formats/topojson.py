"""TopoJSON parser.

TopoJSON stores shared boundaries once as ``arcs`` and lets geometries refer to
them by index. Decoding therefore has three steps:

1. undo the delta encoding of every arc in a **quantized** topology (each
   point after the first is stored as a delta); unquantized arcs are absolute;
2. apply the optional ``transform`` (quantization scale/translate);
3. stitch arc indices into LineString / Polygon coordinates, reversing arcs
   whose index is negative and dropping the duplicated joint point.

Supported object types: Point, MultiPoint, LineString, MultiLineString,
Polygon, MultiPolygon, GeometryCollection. Object names are not kept, matching
the behaviour of the site's TypeScript decoder.

Reference: https://github.com/topojson/topojson-specification
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from .common import (
    ParseError,
    collection,
    feature,
    linestring,
    multilinestring,
    multipoint,
    multipolygon,
    point,
    polygon,
)

Arcs = list[list[list[float]]]


def parse_bytes(data: bytes) -> dict[str, Any]:
    try:
        doc = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ParseError(f"invalid JSON: {exc}") from exc

    if not isinstance(doc, dict) or doc.get("type") != "Topology":
        raise ParseError("not a TopoJSON Topology")

    objects = doc.get("objects")
    if not isinstance(objects, dict) or not objects:
        raise ParseError("Topology has no objects")

    arcs = _decode_arcs(doc.get("arcs") or [], doc.get("transform"))
    transform = doc.get("transform")
    features: list[dict[str, Any]] = []
    for obj in objects.values():
        features.extend(_object_features(obj, arcs, transform))

    return collection(features)


def parse(path: str | Path) -> dict[str, Any]:
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


# ---------------------------------------------------------------------------
# Arc decoding
# ---------------------------------------------------------------------------


def _decode_arcs(raw_arcs: list[Any], transform: Any) -> Arcs:
    scale = None
    translate = None
    if isinstance(transform, dict):
        scale = transform.get("scale")
        translate = transform.get("translate")

    decoded: Arcs = []
    quantized = bool(scale and translate)
    for raw in raw_arcs:
        if not isinstance(raw, list):
            raise ParseError("each arc must be an array of points")
        arc: list[list[float]] = []
        x = y = 0.0
        for pair in raw:
            if not isinstance(pair, (list, tuple)) or len(pair) < 2:
                raise ParseError("arc points must be [x, y] pairs")
            if quantized:
                # Only quantized topologies store arcs as deltas.
                x += float(pair[0])
                y += float(pair[1])
                arc.append([x * float(scale[0]) + float(translate[0]),
                            y * float(scale[1]) + float(translate[1])])
            else:
                # Unquantized arcs are absolute positions.
                arc.append([float(pair[0]), float(pair[1])])
        decoded.append(arc)
    return decoded


def _arc_points(index: int, arcs: Arcs) -> list[list[float]]:
    if index < 0:
        return list(reversed(arcs[-index - 1]))
    return list(arcs[index])


def _stitch(indices: Iterable[int], arcs: Arcs) -> list[list[float]]:
    """Join arcs into one line, avoiding duplicated joint points."""
    out: list[list[float]] = []
    for i, index in enumerate(indices):
        segment = _arc_points(int(index), arcs)
        if not segment:
            continue
        if i == 0:
            out.extend(segment)
        else:
            out.extend(segment[1:])
    return out


# ---------------------------------------------------------------------------
# Geometry objects
# ---------------------------------------------------------------------------


def _project_point(coords: Any, transform: Any) -> list[float]:
    """Point coordinates are absolute but still quantized by the transform."""
    x, y = float(coords[0]), float(coords[1])
    if isinstance(transform, dict):
        scale = transform.get("scale")
        translate = transform.get("translate")
        if scale and translate:
            x = x * float(scale[0]) + float(translate[0])
            y = y * float(scale[1]) + float(translate[1])
    return [x, y]


def _object_features(obj: Any, arcs: Arcs, transform: Any = None) -> list[dict[str, Any]]:
    if not isinstance(obj, dict):
        raise ParseError("Topology object must be an object")

    kind = obj.get("type")
    props = obj.get("properties") or {}
    geometry = None

    if kind == "GeometryCollection":
        out: list[dict[str, Any]] = []
        for child in obj.get("geometries") or []:
            out.extend(_object_features(child, arcs, transform))
        return out

    if kind == "Point":
        geometry = point(_project_point(obj["coordinates"], transform))
    elif kind == "MultiPoint":
        geometry = multipoint(_project_point(c, transform) for c in obj["coordinates"])
    elif kind == "LineString":
        geometry = linestring(_stitch(obj.get("arcs") or [], arcs))
    elif kind == "MultiLineString":
        geometry = multilinestring(_stitch(line, arcs) for line in obj.get("arcs") or [])
    elif kind == "Polygon":
        geometry = polygon(_stitch(ring, arcs) for ring in obj.get("arcs") or [])
    elif kind == "MultiPolygon":
        geometry = multipolygon(
            [_stitch(ring, arcs) for ring in rings] for rings in obj.get("arcs") or []
        )
    else:
        raise ParseError(f"unsupported TopoJSON geometry: {kind!r}")

    feat = feature(geometry, dict(props))
    if "id" in obj:
        feat["id"] = obj["id"]
    return [feat]