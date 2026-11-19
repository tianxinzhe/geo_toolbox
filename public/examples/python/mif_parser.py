"""MapInfo MIF/MID parser.

MIF stores geometry plus a table schema, and MID stores one attribute row per
object as delimited text; both files normally share a base name. Point, Line,
Pline and Region are converted, a ZIP with .mif and .mid is accepted, and other
objects are skipped. Coordinates are used as stored with no reprojection.

Install: none (uses only the Python standard library).

    python mif_parser.py input.mif
    python mif_parser.py input.zip -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import csv, io, json, sys, zipfile
from pathlib import Path
from typing import Any

OBJECT_KEYWORDS = {"Point", "Line", "Pline", "Region",
                   "Text", "Rect", "Ellipse", "RoundRect", "Arc", "None"}

class ParseError(ValueError):
    """Raised when a file cannot be parsed."""

def point(coords: list[float]) -> dict[str, Any]:
    return {"type": "Point", "coordinates": [float(coords[0]), float(coords[1])]}

def linestring(coords: list[list[float]]) -> dict[str, Any]:
    return {"type": "LineString", "coordinates": [[float(x), float(y)] for x, y in coords]}

def multilinestring(lines: list[list[list[float]]]) -> dict[str, Any]:
    return {"type": "MultiLineString", "coordinates":
            [[[float(x), float(y)] for x, y in line] for line in lines]}

def polygon(rings: list[list[list[float]]]) -> dict[str, Any]:
    return {"type": "Polygon", "coordinates":
            [[[float(x), float(y)] for x, y in ring] for ring in rings]}

def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}

def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def parse(path: str | Path) -> dict[str, Any]:
    """Read a .mif file (with its .mid sibling) or a ZIP containing both."""
    path = Path(path)
    if path.suffix.lower() == ".zip":
        try:
            with zipfile.ZipFile(path) as archive:
                names = archive.namelist()
                mif = next((n for n in names if n.lower().endswith(".mif")), None)
                if not mif:
                    raise ParseError("archive contains no .mif file")
                mid = next((n for n in names if n.lower().endswith(".mid")), None)
                return _parse_texts(
                    archive.read(mif).decode("utf-8-sig"),
                    archive.read(mid).decode("utf-8-sig") if mid else "",
                )
        except zipfile.BadZipFile as exc:
            raise ParseError(f"invalid ZIP archive: {exc}") from exc
    try:
        mif_text = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    mid_path = path.with_suffix(".mid")
    mid_text = mid_path.read_text(encoding="utf-8-sig", errors="replace") if mid_path.exists() else ""
    return _parse_texts(mif_text, mid_text)
def _parse_texts(mif_text: str, mid_text: str = "") -> dict[str, Any]:
    lines = mif_text.splitlines()
    delimiter, columns, index = _read_header(lines)
    records: list[list[str]] = []
    if mid_text.strip():
        reader = csv.reader(io.StringIO(mid_text), delimiter=delimiter, quotechar='"')
        records = [row for row in reader if row]
    features: list[dict[str, Any]] = []
    row = 0
    while index < len(lines):
        tokens = lines[index].strip().split()
        index += 1
        if not tokens or tokens[0] not in OBJECT_KEYWORDS:
            continue
        kind = tokens[0]
        if kind == "Point":
            coords = _coords(tokens[1:], "Point object")
            geometry = point(coords[0]) if coords else None
        elif kind == "Line":
            coords = _coords(tokens[1:], "Line object")
            geometry = linestring(coords) if len(coords) >= 2 else None
        elif kind in {"Pline", "Region"}:
            sections, index = _sections(lines, index, tokens)
            if not sections:
                geometry = None
            elif kind == "Pline":
                geometry = linestring(sections[0]) if len(sections) == 1 else multilinestring(sections)
            else:
                geometry = polygon(sections)
        else:
            geometry = None
        props = {}
        if row < len(records):
            props = {name: value for name, value in zip(columns, records[row]) if value != ""}
        row += 1
        if geometry is not None:
            features.append(feature(geometry, props))
    return collection(features)
def _read_header(lines: list[str]) -> tuple[str, list[str], int]:
    delimiter, columns, index = ",", [], 0
    while index < len(lines):
        line = lines[index].strip()
        index += 1
        lower = line.lower()
        if lower == "data":
            return delimiter, columns, index
        if lower.startswith("delimiter"):
            delimiter = line.split(maxsplit=1)[1].strip().strip('"')[:1] or ","
        elif lower.startswith("columns"):
            parts = line.split()
            for _ in range(int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0):
                if index < len(lines) and lines[index].strip():
                    columns.append(lines[index].split()[0])
                index += 1
    raise ParseError("MIF header has no Data section")
def _coords(tokens: list[str], context: str) -> list[list[float]]:
    if len(tokens) < 2 or len(tokens) % 2 != 0:
        raise ParseError(f"{context}: expected x/y pairs")
    try:
        numbers = [float(token) for token in tokens]
    except ValueError:
        raise ParseError(f"{context}: invalid coordinate") from None
    return [[numbers[i], numbers[i + 1]] for i in range(0, len(numbers), 2)]
def _sections(lines: list[str], index: int, tokens: list[str]) -> tuple[list[list[list[float]]], int]:
    try:
        section_count = int(tokens[1])
    except (IndexError, ValueError):
        raise ParseError("Pline/Region is missing its section count") from None
    sections: list[list[list[float]]] = []
    for _ in range(section_count):
        while index < len(lines) and not lines[index].strip():
            index += 1
        if index >= len(lines):
            break
        try:
            point_count = int(lines[index].strip())
        except ValueError:
            raise ParseError("Pline/Region section is missing its point count") from None
        index += 1
        ring: list[list[float]] = []
        for _ in range(point_count):
            while index < len(lines) and not lines[index].strip():
                index += 1
            if index >= len(lines):
                break
            pair = lines[index].split()
            index += 1
            try:
                ring.append([float(pair[0]), float(pair[1])])
            except (IndexError, ValueError):
                raise ParseError(f"invalid coordinate: {' '.join(pair)!r}") from None
        sections.append(ring)
    return sections, index
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert MapInfo MIF/MID to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .mif file or .zip archive")
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