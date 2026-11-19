"""XLSX parser: the first worksheet is read as a header row plus data rows.

An .xlsx file is a ZIP of XML parts; ``openpyxl`` handles shared strings, cell
types and formulas, so only the first worksheet is read, with formulas taken as
their cached values (``data_only=True``). The longitude and latitude columns are
detected by header name exactly like the CSV parser, rows with bad coordinates
are skipped, and other columns become feature properties.

Install: pip install openpyxl

This file is standalone. Coordinates are assumed to be WGS84 longitude/latitude;
no reprojection is performed. Other sheets, styles and comments are ignored.

    python xlsx_parser.py input.xlsx
    python xlsx_parser.py input.xlsx -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
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


def parse(path: str | Path) -> dict[str, Any]:
    """Read the first worksheet of an XLSX file."""
    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise ParseError("openpyxl is required: pip install openpyxl") from exc

    try:
        workbook = load_workbook(filename=str(path), read_only=True, data_only=True)
    except Exception as exc:
        raise ParseError(f"cannot open workbook {path}: {exc}") from exc
    return _from_workbook(workbook)


def parse_bytes(data: bytes) -> dict[str, Any]:
    """Parse XLSX bytes into a FeatureCollection dict."""
    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise ParseError("openpyxl is required: pip install openpyxl") from exc

    try:
        workbook = load_workbook(filename=io.BytesIO(data), read_only=True, data_only=True)
    except Exception as exc:
        raise ParseError(f"cannot open workbook: {exc}") from exc
    return _from_workbook(workbook)


def _from_workbook(workbook: Any) -> dict[str, Any]:
    try:
        sheet = workbook.worksheets[0]
        rows = sheet.iter_rows(values_only=True)
        try:
            header_row = next(rows)
        except StopIteration:
            raise ParseError("workbook is empty") from None

        header = [
            str(cell).strip() if cell is not None else f"column_{index + 1}"
            for index, cell in enumerate(header_row)
        ]
        records = [
            dict(zip(header, raw))
            for raw in rows
            if raw is not None and not all(cell is None or str(cell).strip() == "" for cell in raw)
        ]
        return rows_to_points(header, records)
    finally:
        workbook.close()


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
    parser = argparse.ArgumentParser(description="Convert XLSX to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .xlsx file")
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