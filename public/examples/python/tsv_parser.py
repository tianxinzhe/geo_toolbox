"""TSV parser: tab-delimited text with one point per row.

A TSV file is read as a header row followed by data rows, one point per row. The
longitude and latitude columns are found by header name -- lat/latitude/y for
latitude and lng/lon/long/longitude/x for longitude, including their Chinese
equivalents -- ignoring case, spaces, underscores and hyphens. Rows with a
missing or unparsable coordinate are skipped, and every other column becomes a
feature property under its original header.

Install: none (uses only the Python standard library).

This file is standalone. Coordinates are assumed to be WGS84 longitude/latitude;
no reprojection is performed.

    python tsv_parser.py input.tsv
    python tsv_parser.py input.tsv -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from pathlib import Path
from typing import Any, Iterable, Sequence

LAT_ALIASES = {"lat", "latitude", "y", "纬度"}
LNG_ALIASES = {"lng", "lon", "long", "longitude", "x", "经度"}


class ParseError(ValueError):
    """Raised when a file cannot be parsed."""


def point(coords: Sequence[float]) -> dict[str, Any]:
    return {"type": "Point", "coordinates": [float(coords[0]), float(coords[1])]}


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def collection(features: Iterable[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


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


def parse_bytes(data: bytes, delimiter: str = "\t") -> dict[str, Any]:
    """Parse TSV bytes into a FeatureCollection dict."""
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ParseError(f"file is not UTF-8: {exc}") from exc
    return parse_text(text, delimiter)


def parse(path: str | Path) -> dict[str, Any]:
    """Read and parse a TSV file."""
    try:
        text = Path(path).read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_text(text, "\t")


def parse_text(text: str, delimiter: str = "\t") -> dict[str, Any]:
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    try:
        header = next(reader)
    except StopIteration:
        raise ParseError("file is empty") from None

    rows = [
        dict(zip(header, row))
        for row in reader
        if any(cell.strip() for cell in row)
    ]
    return rows_to_points(header, rows)


def rows_to_points(header: Sequence[str], rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Turn a header and records into a point FeatureCollection."""
    lat_key = _find_column(header, LAT_ALIASES)
    lng_key = _find_column(header, LNG_ALIASES)
    if lat_key is None or lng_key is None:
        raise ParseError(
            "cannot find longitude/latitude columns; headers are: "
            + ", ".join(repr(name) for name in header)
        )

    features: list[dict[str, Any]] = []
    for row in rows:
        lat = to_float(row.get(lat_key))
        lng = to_float(row.get(lng_key))
        if lat is None or lng is None:
            continue
        props = {
            key: value
            for key, value in row.items()
            if key not in (lat_key, lng_key) and value not in (None, "")
        }
        features.append(feature(point([lng, lat]), props))
    return collection(features)


def _normalise(name: str) -> str:
    text = name.strip().lower()
    for char in " _-()[]":
        text = text.replace(char, "")
    return text


def _find_column(header: Sequence[str], aliases: set[str]) -> str | None:
    for name in header:
        if _normalise(name) in aliases:
            return name
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert TSV to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .tsv file")
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