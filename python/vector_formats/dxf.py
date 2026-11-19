"""DXF parser for 2D CAD drawings.

DXF is a stream of "group code / value" pairs. Reading it by hand is error
prone, so this module uses ``ezdxf`` and only converts basic 2D entities:

* POINT -> Point
* LINE -> LineString
* LWPOLYLINE / POLYLINE -> LineString, or Polygon when the entity is closed
* CIRCLE -> closed Polygon with 72 vertices
* ARC -> LineString with 36 segments

Other entities (TEXT, MTEXT, DIMENSION, INSERT/blocks, HATCH, SPLINE, ...) are
skipped because they have no direct GeoJSON equivalent. The layer name is kept
as a ``layer`` property when it is not ``"0"``.

DXF never declares a CRS. Coordinates are returned as stored; if the drawing is
in projected metres, reproject it before treating the output as lon/lat.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from .common import (
    ParseError,
    collection,
    feature,
    linestring,
    point,
    polygon,
)

CIRCLE_VERTICES = 72
ARC_SEGMENTS = 36


def parse(path: str | Path) -> dict[str, Any]:
    try:
        import ezdxf
    except ImportError as exc:  # pragma: no cover - dependency hint
        raise ParseError("ezdxf is required: pip install ezdxf") from exc

    try:
        document = ezdxf.readfile(str(path))
    except Exception as exc:
        raise ParseError(f"cannot read DXF {path}: {exc}") from exc

    features: list[dict[str, Any]] = []
    for entity in document.modelspace():
        kind = entity.dxftype()
        if kind == "POINT":
            location = entity.dxf.location
            features.append(feature(point([location.x, location.y]), _props(entity)))
        elif kind == "LINE":
            start, end = entity.dxf.start, entity.dxf.end
            features.append(
                feature(
                    linestring([[start.x, start.y], [end.x, end.y]]),
                    _props(entity),
                )
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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