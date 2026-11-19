"""WKT parser (Well-Known Text).

WKT is a text notation for a single geometry. Parsing is delegated to
``shapely``, which already implements the full grammar and returns a
GeoJSON-ready mapping.

Two input shapes are supported:

* one geometry, possibly pretty-printed over several lines;
* several geometries separated by newlines, one per line (a convenience used
  by the site's converter).

An optional ``SRID=4326;`` prefix is accepted and stripped; the SRID itself is
not used for reprojection. WKT carries no attributes, so properties stay empty.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .common import ParseError, collection, feature


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
    if text.strip() == "":
        raise ParseError("input is empty")

    # 1. Try the whole document first, so pretty-printed WKT stays intact.
    document = _parse_one(text)
    if document is not None:
        return collection([feature(document)])

    # 2. Fall back to one geometry per line.
    features: list[dict[str, Any]] = []
    for number, line in enumerate(text.splitlines(), start=1):
        if line.strip() == "":
            continue
        geometry = _parse_one(line)
        if geometry is None:
            raise ParseError(f"invalid WKT on line {number}: {line.strip()[:60]!r}")
        features.append(feature(geometry))
    if not features:
        raise ParseError("no valid WKT geometry found")
    return collection(features)


def _parse_one(wkt: str) -> dict[str, Any] | None:
    text = wkt.strip()
    if not text:
        return None
    if text.upper().startswith("SRID=") and ";" in text:
        text = text.split(";", 1)[1].strip()

    try:
        from shapely import from_wkt
        from shapely.geometry import mapping
    except ImportError as exc:  # pragma: no cover - dependency hint
        raise ParseError("shapely is required: pip install shapely") from exc

    try:
        geometry = from_wkt(text)
    except Exception:
        return None
    if geometry is None or geometry.is_empty:
        return None
    return dict(mapping(geometry))