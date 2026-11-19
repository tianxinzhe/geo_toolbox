"""MapInfo MIF/MID parser.

MIF holds geometry and the table schema, MID holds one attribute row per object
(delimited text). Both files usually travel together, and an archive with
``data.mif`` / ``data.mid`` is also accepted.

Supported MIF objects:

* ``Point``
* ``Line``
* ``Pline`` (one or more sections -> LineString / MultiLineString)
* ``Region`` (first ring exterior, remaining rings treated as holes)

``Text``, ``Rect``, ``Ellipse``, ``RoundRect``, ``Arc`` and ``None`` have no
GeoJSON equivalent and are skipped, which shifts MID rows if such objects
appear before real geometry. Coordinates are read as stored; a ``CoordSys``
line is parsed for nothing (no reprojection).

Encoding: UTF-8 (with BOM). Non-UTF-8 charsets such as ``WindowsCyrillic``
need transcoding beforehand.
"""

from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path
from typing import Any

from .common import (
    ParseError,
    collection,
    feature,
    linestring,
    multilinestring,
    point,
    polygon,
)

OBJECT_KEYWORDS = {
    "Point",
    "Line",
    "Pline",
    "Region",
    "Text",
    "Rect",
    "Ellipse",
    "RoundRect",
    "Arc",
    "None",
}


def parse(path: str | Path) -> dict[str, Any]:
    path = Path(path)

    if path.suffix.lower() == ".zip":
        try:
            with zipfile.ZipFile(path) as archive:
                names = archive.namelist()
                mif_name = next((n for n in names if n.lower().endswith(".mif")), None)
                if not mif_name:
                    raise ParseError("archive contains no .mif file")
                mid_name = next((n for n in names if n.lower().endswith(".mid")), None)
                mif_text = archive.read(mif_name).decode("utf-8-sig")
                mid_text = (
                    archive.read(mid_name).decode("utf-8-sig") if mid_name else ""
                )
        except zipfile.BadZipFile as exc:
            raise ParseError(f"invalid ZIP archive: {exc}") from exc
        return parse_texts(mif_text, mid_text)

    try:
        mif_text = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc

    mid_path = path.with_suffix(".mid")
    mid_text = ""
    if mid_path.exists():
        mid_text = mid_path.read_text(encoding="utf-8-sig", errors="replace")
    return parse_texts(mif_text, mid_text)


def parse_texts(mif_text: str, mid_text: str = "") -> dict[str, Any]:
    lines = mif_text.splitlines()
    delimiter, columns, data_start = _read_header(lines)
    records = _read_mid(mid_text, delimiter)

    features: list[dict[str, Any]] = []
    index = data_start
    feature_index = 0

    while index < len(lines):
        raw = lines[index].strip()
        index += 1
        if raw == "":
            continue

        tokens = raw.split()
        kind = tokens[0]

        if kind not in OBJECT_KEYWORDS:
            continue

        if kind in {"Point", "Line"}:
            coords = _coord_pairs(tokens[1:], f"{kind} object")
            if kind == "Point":
                geometry = point(coords[0]) if coords else None
            else:
                geometry = linestring(coords) if len(coords) >= 2 else None
        elif kind in {"Pline", "Region"}:
            sections, index = _read_sections(lines, index, tokens)
            if not sections:
                geometry = None
            elif kind == "Pline":
                geometry = (
                    linestring(sections[0])
                    if len(sections) == 1
                    else multilinestring(sections)
                )
            else:
                geometry = polygon(sections)
        else:
            # Decorative objects: skip their payload until the next object.
            while index < len(lines) and not _starts_object(lines[index]):
                index += 1
            geometry = None

        props: dict[str, Any] = {}
        if feature_index < len(records):
            props = {
                name: value
                for name, value in zip(columns, records[feature_index])
                if value != ""
            }
        feature_index += 1

        if geometry is not None:
            features.append(feature(geometry, props))

    return collection(features)


# ---------------------------------------------------------------------------
# Header, attributes, coordinates
# ---------------------------------------------------------------------------


def _read_header(lines: list[str]) -> tuple[str, list[str], int]:
    delimiter = ","
    columns: list[str] = []
    index = 0

    while index < len(lines):
        line = lines[index].strip()
        index += 1
        if line.lower() == "data":
            return delimiter, columns, index
        upper = line.lower()
        if upper.startswith("delimiter"):
            value = line.split(maxsplit=1)[1].strip().strip('"')
            delimiter = value[:1] or ","
        elif upper.startswith("columns"):
            try:
                count = int(line.split()[1])
            except (IndexError, ValueError):
                count = 0
            for _ in range(count):
                if index >= len(lines):
                    break
                definition = lines[index].strip()
                index += 1
                if definition:
                    columns.append(definition.split()[0])

    raise ParseError("MIF header has no Data section")


def _read_mid(text: str, delimiter: str) -> list[list[str]]:
    if text.strip() == "":
        return []
    reader = csv.reader(io.StringIO(text), delimiter=delimiter, quotechar='"')
    return [row for row in reader if row]


def _coord_pairs(tokens: list[str], context: str) -> list[list[float]]:
    if len(tokens) < 2 or len(tokens) % 2 != 0:
        raise ParseError(f"{context}: expected x/y pairs")
    try:
        numbers = [float(token) for token in tokens]
    except ValueError:
        raise ParseError(f"{context}: invalid coordinate") from None
    return [[numbers[i], numbers[i + 1]] for i in range(0, len(numbers), 2)]


def _read_sections(
    lines: list[str], index: int, tokens: list[str]
) -> tuple[list[list[list[float]]], int]:
    try:
        section_count = int(tokens[1])
    except (IndexError, ValueError):
        raise ParseError("Pline/Region is missing its section count") from None

    sections: list[list[list[float]]] = []
    for _ in range(section_count):
        while index < len(lines) and lines[index].strip() == "":
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
            while index < len(lines) and lines[index].strip() == "":
                index += 1
            if index >= len(lines):
                break
            pair = lines[index].strip().split()
            index += 1
            if len(pair) < 2:
                raise ParseError("Pline/Region coordinate line needs x and y")
            try:
                ring.append([float(pair[0]), float(pair[1])])
            except ValueError:
                raise ParseError(f"invalid coordinate: {' '.join(pair)!r}") from None
        if ring:
            sections.append(ring)
    return sections, index


def _starts_object(line: str) -> bool:
    tokens = line.strip().split()
    return bool(tokens) and tokens[0] in OBJECT_KEYWORDS