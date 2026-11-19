"""TopoJSON parser.

TopoJSON stores shared boundaries once as ``arcs`` and lets geometries refer to
them by index, which keeps files with many shared borders small. Decoding
undoes the delta encoding of quantized arcs, applies the optional ``transform``
(quantization scale/translate), then stitches arc indices into LineString and
Polygon coordinates. A negative arc index means "walk that arc backwards".

Install: none (uses only the Python standard library).

This file is standalone. Supported objects: Point, MultiPoint, LineString,
MultiLineString, Polygon, MultiPolygon and GeometryCollection. Object names are
not kept. Positions are two-dimensional and no reprojection is performed.

    python topojson_parser.py input.topojson
    python topojson_parser.py input.topojson -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

Arcs = list[list[list[float]]]


class ParseError(ValueError):
    """Raised when a file cannot be parsed."""


def _xy(coords: Any) -> list[list[float]]:
    return [[float(x), float(y)] for x, y in coords]


def point(coords: Any) -> dict[str, Any]:
    return {"type": "Point", "coordinates": [float(coords[0]), float(coords[1])]}


def multipoint(coords: Any) -> dict[str, Any]:
    return {"type": "MultiPoint", "coordinates": _xy(coords)}


def linestring(coords: Any) -> dict[str, Any]:
    return {"type": "LineString", "coordinates": _xy(coords)}


def multilinestring(lines: Any) -> dict[str, Any]:
    return {"type": "MultiLineString", "coordinates": [_xy(line) for line in lines]}


def polygon(rings: Any) -> dict[str, Any]:
    return {"type": "Polygon", "coordinates": [_xy(ring) for ring in rings]}


def multipolygon(polys: Any) -> dict[str, Any]:
    return {"type": "MultiPolygon", "coordinates": [[_xy(ring) for ring in rings] for rings in polys]}


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def parse_bytes(data: bytes) -> dict[str, Any]:
    """Parse TopoJSON bytes into a FeatureCollection dict."""
    try:
        doc = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ParseError(f"invalid JSON: {exc}") from exc

    if not isinstance(doc, dict) or doc.get("type") != "Topology":
        raise ParseError("not a TopoJSON Topology")
    objects = doc.get("objects")
    if not isinstance(objects, dict) or not objects:
        raise ParseError("Topology has no objects")

    transform = doc.get("transform")
    arcs = _decode_arcs(doc.get("arcs") or [], transform)
    features: list[dict[str, Any]] = []
    for obj in objects.values():
        features.extend(_object_features(obj, arcs, transform))
    return collection(features)


def parse(path: str | Path) -> dict[str, Any]:
    """Read and parse a TopoJSON file."""
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


def _decode_arcs(raw_arcs: list[Any], transform: Any) -> Arcs:
    scale = translate = None
    if isinstance(transform, dict):
        scale, translate = transform.get("scale"), transform.get("translate")

    arcs: Arcs = []
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
        arcs.append(arc)
    return arcs


def _stitch(indices: list[int], arcs: Arcs) -> list[list[float]]:
    """Join arcs into one line, dropping the duplicated joint point."""
    out: list[list[float]] = []
    for i, index in enumerate(indices):
        index = int(index)
        segment = list(reversed(arcs[-index - 1])) if index < 0 else list(arcs[index])
        if not segment:
            continue
        out.extend(segment if i == 0 else segment[1:])
    return out


def _project(coords: Any, transform: Any) -> list[float]:
    """Point coordinates are absolute but still quantized by the transform."""
    x, y = float(coords[0]), float(coords[1])
    if isinstance(transform, dict):
        scale, translate = transform.get("scale"), transform.get("translate")
        if scale and translate:
            x = x * float(scale[0]) + float(translate[0])
            y = y * float(scale[1]) + float(translate[1])
    return [x, y]


def _object_features(obj: Any, arcs: Arcs, transform: Any = None) -> list[dict[str, Any]]:
    if not isinstance(obj, dict):
        raise ParseError("Topology object must be an object")

    kind = obj.get("type")
    if kind == "GeometryCollection":
        out: list[dict[str, Any]] = []
        for child in obj.get("geometries") or []:
            out.extend(_object_features(child, arcs, transform))
        return out

    if kind == "Point":
        geometry = point(_project(obj["coordinates"], transform))
    elif kind == "MultiPoint":
        geometry = multipoint(_project(c, transform) for c in obj["coordinates"])
    elif kind == "LineString":
        geometry = linestring(_stitch(obj.get("arcs") or [], arcs))
    elif kind == "MultiLineString":
        geometry = multilinestring(_stitch(line, arcs) for line in obj.get("arcs") or [])
    elif kind == "Polygon":
        geometry = polygon(_stitch(ring, arcs) for ring in obj.get("arcs") or [])
    elif kind == "MultiPolygon":
        geometry = multipolygon([_stitch(ring, arcs) for ring in rings] for rings in obj.get("arcs") or [])
    else:
        raise ParseError(f"unsupported TopoJSON geometry: {kind!r}")

    feat = feature(geometry, dict(obj.get("properties") or {}))
    if "id" in obj:
        feat["id"] = obj["id"]
    return [feat]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert TopoJSON to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .topojson file")
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