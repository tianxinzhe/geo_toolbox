"""Shared helpers for the vector format parsers.

Every parser in this package exposes one of:

    parse(path: str | Path) -> dict          # reads a file
    parse_bytes(data: bytes) -> dict         # reads in-memory bytes

and returns a GeoJSON ``FeatureCollection`` dict:

    {"type": "FeatureCollection", "features": [ ... ]}

Coordinates are WGS84 longitude/latitude unless the source format carries a
different CRS and the parser documents that it does not reproject.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

Point = tuple[float, float]
Ring = list[list[float]]


class ParseError(ValueError):
    """Raised when a file cannot be parsed.

    Parsers use this instead of letting library-specific exceptions leak out,
    so callers can catch one type regardless of the format.
    """


def point(coords: Sequence[float]) -> dict[str, Any]:
    return {"type": "Point", "coordinates": [float(coords[0]), float(coords[1])]}


def linestring(coords: Iterable[Sequence[float]]) -> dict[str, Any]:
    return {
        "type": "LineString",
        "coordinates": [[float(x), float(y)] for x, y in coords],
    }


def polygon(rings: Sequence[Sequence[Sequence[float]]]) -> dict[str, Any]:
    return {
        "type": "Polygon",
        "coordinates": [
            [[float(x), float(y)] for x, y in ring]
            for ring in rings
        ],
    }


def multipoint(coords: Iterable[Sequence[float]]) -> dict[str, Any]:
    return {
        "type": "MultiPoint",
        "coordinates": [[float(x), float(y)] for x, y in coords],
    }


def multilinestring(lines: Iterable[Sequence[Sequence[float]]]) -> dict[str, Any]:
    return {
        "type": "MultiLineString",
        "coordinates": [
            [[float(x), float(y)] for x, y in line] for line in lines
        ],
    }


def multipolygon(
    polygons: Iterable[Sequence[Sequence[Sequence[float]]]],
) -> dict[str, Any]:
    return {
        "type": "MultiPolygon",
        "coordinates": [
            [
                [[float(x), float(y)] for x, y in ring]
                for ring in rings
            ]
            for rings in polygons
        ],
    }


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": properties or {},
    }


def collection(features: Iterable[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def close_ring(ring: Sequence[Sequence[float]]) -> Ring:
    """Return a closed ring; GeoJSON requires the first and last point to match."""
    out: Ring = [[float(x), float(y)] for x, y in ring]
    if out and out[0] != out[-1]:
        out.append(out[0][:])
    return out


def signed_area(ring: Sequence[Sequence[float]]) -> float:
    """Shoelace area. Positive means counter-clockwise in a y-up plane."""
    total = 0.0
    n = len(ring)
    if n < 3:
        return 0.0
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        total += x1 * y2 - x2 * y1
    return total / 2.0


def to_float(value: Any) -> float | None:
    """Parse a numeric cell; returns None for blanks and unparsable values."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(" ", "")
    if text == "":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def local_name(tag: str) -> str:
    """Strip the XML namespace from a tag or attribute name."""
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag.split(":")[-1]