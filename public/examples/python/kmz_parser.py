"""KMZ parser.

KMZ is a ZIP archive whose first ``.kml`` entry is the document; it usually
also contains icons and textures that are irrelevant to the geometry. This
file unzips the archive in memory and runs a compact local KML reader, so no
other module is required. If several KML files are present, the first one in
ZIP order is used.

Install: none (uses only the Python standard library).

This file is standalone. Supported geometry: Point, LineString, Polygon and
MultiGeometry (nested collections are flattened). Coordinates are
``longitude,latitude[,altitude]``; altitude is dropped and no reprojection is
performed.

    python kmz_parser.py input.kmz
    python kmz_parser.py input.kmz -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any


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


def local_name(tag: str) -> str:
    """Strip the XML namespace from a tag or attribute name."""
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag.split(":")[-1]


def parse_bytes(data: bytes) -> dict[str, Any]:
    """Open a KMZ archive in memory and parse its first .kml entry."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = [
                name for name in archive.namelist()
                if name.lower().endswith(".kml") and not name.startswith("__MACOSX/")
            ]
            if not names:
                raise ParseError("KMZ archive contains no .kml file")
            with archive.open(names[0]) as entry:
                return _parse_kml(entry.read())
    except zipfile.BadZipFile as exc:
        raise ParseError(f"invalid KMZ archive: {exc}") from exc


def parse(path: str | Path) -> dict[str, Any]:
    """Read and parse a KMZ file."""
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


# ---------------------------------------------------------------------------
# Local KML reader
# ---------------------------------------------------------------------------


def _parse_kml(data: bytes) -> dict[str, Any]:
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ParseError(f"invalid KML XML inside KMZ: {exc}") from exc

    features = [
        feature(_geometry(placemark), _properties(placemark))
        for placemark in root.iter()
        if local_name(placemark.tag) == "Placemark"
    ]
    return collection(features)


def _text_of(element: ET.Element, name: str) -> str | None:
    for child in element:
        if local_name(child.tag) == name and child.text:
            return child.text.strip()
    return None


def _properties(placemark: ET.Element) -> dict[str, Any]:
    props: dict[str, Any] = {}
    for key in ("name", "description"):
        value = _text_of(placemark, key)
        if value:
            props[key] = value
    if placemark.get("id"):
        props["id"] = placemark.get("id")
    return props


def _coordinates(element: ET.Element) -> list[list[float]]:
    """Read the first <coordinates> descendant as lon/lat pairs."""
    for node in element.iter():
        if local_name(node.tag) != "coordinates":
            continue
        points: list[list[float]] = []
        for token in (node.text or "").replace("\n", " ").split():
            parts = token.split(",")
            if len(parts) < 2:
                continue
            try:
                points.append([float(parts[0]), float(parts[1])])
            except ValueError:
                raise ParseError(f"invalid KML coordinate: {token!r}") from None
        return points
    return []


def _geometry(element: ET.Element) -> dict[str, Any] | None:
    """Return the first supported geometry below ``element``."""
    for node in element.iter():
        kind = local_name(node.tag)
        if kind == "Point":
            coords = _coordinates(node)
            return point(coords[0]) if coords else None
        if kind == "LineString":
            coords = _coordinates(node)
            return linestring(coords) if coords else None
        if kind == "Polygon":
            rings = [_coordinates(child) for child in node
                     if local_name(child.tag) in {"outerBoundaryIs", "innerBoundaryIs"}]
            rings = [ring for ring in rings if ring]
            return polygon(rings) if rings else None
        if kind == "MultiGeometry":
            geometries = [g for g in (_geometry(child) for child in node) if g]
            if not geometries:
                return None
            return geometries[0] if len(geometries) == 1 else {
                "type": "GeometryCollection", "geometries": geometries}
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert KMZ to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .kmz file")
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