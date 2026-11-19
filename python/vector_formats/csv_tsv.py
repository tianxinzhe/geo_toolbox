"""CSV and TSV parsers: delimited text with one point per row.

Both formats share one pipeline; only the delimiter differs (``,`` vs ``\\t``).
The longitude and latitude columns are found by header name:

* latitude:  lat, latitude, y, 纬度, 緯度, wgs84lat, latdeg, gpslat
* longitude: lng, lon, long, longitude, x, 经度, 經度, wgs84lng, lngdeg, gpslng

Matching ignores case, spaces, underscores, hyphens and brackets. When no
column matches, a ``ParseError`` is raised instead of guessing that the first
column is longitude -- swapping the axis order silently is the most common way
to produce wrong maps.

Rows with a missing or unparsable coordinate are skipped. Every other column
becomes a property with its original header name.
"""

from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any, Iterable, Sequence

from .common import ParseError, collection, feature, point, to_float

LAT_ALIASES = {
    "lat",
    "latitude",
    "y",
    "wgs84lat",
    "latdeg",
    "gpslat",
    "纬度",
    "緯度",
}
LNG_ALIASES = {
    "lng",
    "lon",
    "long",
    "longitude",
    "x",
    "wgs84lng",
    "lngdeg",
    "gpslng",
    "经度",
    "經度",
}


def parse(path: str | Path) -> dict[str, Any]:
    path = Path(path)
    return parse_tsv(path) if path.suffix.lower() == ".tsv" else parse_csv(path)


def parse_csv(path: str | Path) -> dict[str, Any]:
    return _parse_delimited(path, ",")


def parse_tsv(path: str | Path) -> dict[str, Any]:
    return _parse_delimited(path, "\t")


def _parse_delimited(path: str | Path, delimiter: str) -> dict[str, Any]:
    try:
        text = Path(path).read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_text(text, delimiter)


def parse_bytes(data: bytes, delimiter: str = ",") -> dict[str, Any]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ParseError(f"file is not UTF-8: {exc}") from exc
    return parse_text(text, delimiter)


def parse_text(text: str, delimiter: str = ",") -> dict[str, Any]:
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    try:
        header = next(reader)
    except StopIteration:
        raise ParseError("file is empty") from None

    rows = [dict(zip(header, row)) for row in reader if any(cell.strip() for cell in row)]
    return rows_to_points(header, rows)


def rows_to_points(
    header: Sequence[str], rows: Iterable[dict[str, str]]
) -> dict[str, Any]:
    """Turn a header + records into a point FeatureCollection.

    Shared with the XLSX parser so both behave identically.
    """
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