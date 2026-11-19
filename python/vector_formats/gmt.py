"""GMT plain-text parser ("segment" format).

GMT's ASCII format has no formal specification, but the convention is stable:

    > optional segment name
    lon lat
    lon lat
    > next segment
    ...

Rules used here:

* a line starting with ``>`` starts a new feature; the remaining text becomes
  the ``name`` property;
* coordinate lines may carry extra columns (z, weight); only the first two are
  used as longitude and latitude;
* one point becomes a Point, a closed ring of four or more points becomes a
  Polygon, anything else becomes a LineString;
* a file without any ``>`` header is treated as one segment.

Holes cannot be expressed; inner rings are not detected. A polygon with holes
exported to GMT becomes two separate segments.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .common import ParseError, collection, feature, linestring, point, polygon


def parse_bytes(data: bytes) -> dict[str, Any]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ParseError(f"file is not UTF-8: {exc}") from exc
    return parse_text(text)


def parse(path: str | Path) -> dict[str, Any]:
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


def parse_text(text: str) -> dict[str, Any]:
    segments: list[tuple[str, list[list[float]]]] = []
    name = ""
    coords: list[list[float]] = []

    def flush() -> None:
        if coords:
            segments.append((name, list(coords)))
        coords.clear()

    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if line == "" or line.startswith("#"):
            continue
        if line.startswith(">"):
            flush()
            name = line[1:].strip()
            continue
        parts = line.split()
        if len(parts) < 2:
            raise ParseError(f"line {number}: expected at least two numbers")
        try:
            coords.append([float(parts[0]), float(parts[1])])
        except ValueError:
            raise ParseError(f"line {number}: invalid coordinate {line!r}") from None
    flush()

    features: list[dict[str, Any]] = []
    for segment_name, points in segments:
        props = {"name": segment_name} if segment_name else {}
        if len(points) == 1:
            features.append(feature(point(points[0]), props))
        elif len(points) >= 4 and points[0] == points[-1]:
            features.append(feature(polygon([points]), props))
        else:
            features.append(feature(linestring(points), props))
    return collection(features)