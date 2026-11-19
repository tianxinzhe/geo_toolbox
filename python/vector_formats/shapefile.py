"""ESRI Shapefile parser (via pyshp).

A Shapefile is a set of files; ``pyshp`` accepts either the ``.shp`` path (it
then looks for ``.shx`` and ``.dbf`` next to it) or a ``.zip`` containing the
whole set.

Each shape becomes a GeoJSON geometry using pyshp's ``__geo_interface__``:

* Point / MultiPoint
* LineString / MultiLineString (polyline parts)
* Polygon / MultiPolygon (rings)

DBF fields become properties. Field names are limited to 10 characters by the
format itself and are not renamed here.

The ``.prj`` file is ignored: coordinates are returned as stored. A shapefile
in a projected CRS needs external reprojection before being treated as lon/lat.
Null shapes are skipped.
"""

from __future__ import annotations

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
}


def parse(path: str | Path) -> dict[str, Any]:
    try:
        import shapefile
    except ImportError as exc:  # pragma: no cover - dependency hint
        raise ParseError("pyshp is required: pip install pyshp") from exc

    try:
        reader = shapefile.Reader(str(path))
    except Exception as exc:
        raise ParseError(f"cannot read shapefile {path}: {exc}") from exc

    try:
        field_names = [field[0] for field in reader.fields[1:]]
        features: list[dict[str, Any]] = []

        for shape_record in reader.iterShapeRecords():
            geometry = _geometry(shape_record.shape)
            if geometry is None:
                continue

            record = shape_record.record
            props = {
                name: _value(record[index])
                for index, name in enumerate(field_names)
                if index < len(record)
            }
            features.append(feature(geometry, props))

        return collection(features)
    finally:
        reader.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _geometry(shape: Any) -> dict[str, Any] | None:
    if shape is None or getattr(shape, "shapeType", 0) == 0:
        return None

    raw = shape.__geo_interface__
    kind = raw.get("type")
    if kind not in GEOMETRY_TYPES:
        return None
    return {"type": kind, "coordinates": _lists(raw.get("coordinates"))}


def _lists(value: Any) -> Any:
    """Make pyshp's nested tuples JSON friendly."""
    if isinstance(value, (list, tuple)):
        return [_lists(item) for item in value]
    return value


def _value(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace").strip()
    if isinstance(value, str):
        return value.strip()
    return value