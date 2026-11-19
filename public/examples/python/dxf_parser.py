"""DXF parser for 2D CAD drawings.

DXF is a stream of group code/value pairs; ``ezdxf`` handles the file structure,
so this script only converts basic 2D entities. POINT becomes a Point, LINE a
LineString, LWPOLYLINE/POLYLINE a LineString or closed Polygon, CIRCLE a
72-vertex Polygon, and ARC a 36-segment LineString. The layer name is kept as a
``layer`` property when it is not ``"0"``; other entities are skipped.

Install: pip install ezdxf

This file is standalone. DXF never declares a CRS, so coordinates are returned
as stored and no reprojection is performed.

    python dxf_parser.py input.dxf
    python dxf_parser.py input.dxf -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import io
import json
import math
import sys
from pathlib import Path
from typing import Any

CIRCLE_VERTICES = 72
ARC_SEGMENTS = 36


class ParseError(ValueError):
    """Raised when a file cannot be parsed."""


def _xy(coords: Any) -> list[list[float]]:
    return [[float(x), float(y)] for x, y in coords]


def point(coords: Any) -> dict[str, Any]:
    return {"type": "Point", "coordinates": [float(coords[0]), float(coords[1])]}


def linestring(coords: Any) -> dict[str, Any]:
    return {"type": "LineString", "coordinates": _xy(coords)}


def polygon(rings: Any) -> dict[str, Any]:
    return {"type": "Polygon", "coordinates": [_xy(ring) for ring in rings]}


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def parse(path: str | Path) -> dict[str, Any]:
    """Read and parse a DXF file."""
    try:
        import ezdxf
    except ImportError as exc:
        raise ParseError("ezdxf is required: pip install ezdxf") from exc

    try:
        document = ezdxf.readfile(str(path))
    except Exception as exc:
        raise ParseError(f"cannot read DXF {path}: {exc}") from exc
    return _from_document(document)


def parse_bytes(data: bytes) -> dict[str, Any]:
    """Parse DXF bytes into a FeatureCollection dict."""
    try:
        import ezdxf
    except ImportError as exc:
        raise ParseError("ezdxf is required: pip install ezdxf") from exc

    try:
        document = ezdxf.read(io.BytesIO(data))
    except Exception as exc:
        raise ParseError(f"cannot read DXF data: {exc}") from exc
    return _from_document(document)


def _from_document(document: Any) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    for entity in document.modelspace():
        kind = entity.dxftype()
        if kind == "POINT":
            location = entity.dxf.location
            features.append(feature(point([location.x, location.y]), _props(entity)))
        elif kind == "LINE":
            start, end = entity.dxf.start, entity.dxf.end
            features.append(
                feature(linestring([[start.x, start.y], [end.x, end.y]]), _props(entity))
            )
        elif kind in {"LWPOLYLINE", "POLYLINE"}:
            geometry = _polyline(entity)
            if geometry:
                features.append(feature(geometry, _props(entity)))
        elif kind == "CIRCLE":
            center = entity.dxf.center
            radius = float(entity.dxf.radius)
            ring = [
                [
                    center.x + radius * math.cos(2 * math.pi * i / CIRCLE_VERTICES),
                    center.y + radius * math.sin(2 * math.pi * i / CIRCLE_VERTICES),
                ]
                for i in range(CIRCLE_VERTICES)
            ]
            ring.append(ring[0][:])
            features.append(feature(polygon([ring]), _props(entity)))
        elif kind == "ARC":
            center = entity.dxf.center
            radius = float(entity.dxf.radius)
            start = math.radians(float(entity.dxf.start_angle))
            end = math.radians(float(entity.dxf.end_angle))
            if end <= start:
                end += 2 * math.pi
            coords = [
                [
                    center.x + radius * math.cos(start + (end - start) * i / ARC_SEGMENTS),
                    center.y + radius * math.sin(start + (end - start) * i / ARC_SEGMENTS),
                ]
                for i in range(ARC_SEGMENTS + 1)
            ]
            features.append(feature(linestring(coords), _props(entity)))
    return collection(features)


def _props(entity: Any) -> dict[str, Any]:
    layer = getattr(entity.dxf, "layer", None)
    return {"layer": layer} if layer and layer != "0" else {}


def _polyline(entity: Any) -> dict[str, Any] | None:
    try:
        if entity.dxftype() == "LWPOLYLINE":
            coords = [[float(x), float(y)] for x, y in entity.get_points("xy")]
        else:
            coords = [[float(v.x), float(v.y)] for v in entity.points()]
    except Exception as exc:
        raise ParseError(f"cannot read polyline vertices: {exc}") from exc

    if len(coords) < 2:
        return None
    if entity.closed:
        ring = coords if coords[0] == coords[-1] else coords + [coords[0][:]]
        return polygon([ring])
    return linestring(coords)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert DXF to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .dxf file")
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