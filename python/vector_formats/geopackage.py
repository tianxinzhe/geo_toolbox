"""GeoPackage (.gpkg) parser.

GeoPackage is a SQLite database with a small metadata schema:

* ``gpkg_contents`` lists layers (``data_type = 'features'``);
* ``gpkg_geometry_columns`` names the geometry column and its type;
* each feature row stores geometry as a blob: ``b"GP"`` + version + flags +
  srs_id + optional envelope + WKB.

This parser opens the file read-only, takes the **first feature table**, reads
its attribute columns, and decodes the geometry blob with ``shapely.from_wkb``.
The envelope is skipped using the flags byte, so all four envelope variants are
handled without hard-coded offsets.

Only geometry is reprojected if the table declares something other than
EPSG:4326 -- it is not: coordinates are returned in the layer's own CRS.
Style tables, rtree indexes and non-feature tables are ignored.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .common import ParseError, collection, feature


def parse(path: str | Path) -> dict[str, Any]:
    path = Path(path)
    try:
        connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.Error as exc:
        raise ParseError(f"cannot open GeoPackage {path}: {exc}") from exc

    try:
        return _read(connection)
    except sqlite3.Error as exc:
        raise ParseError(f"invalid GeoPackage: {exc}") from exc
    finally:
        connection.close()


def _read(connection: sqlite3.Connection) -> dict[str, Any]:
    try:
        import shapely
        from shapely.geometry import mapping
    except ImportError as exc:  # pragma: no cover - dependency hint
        raise ParseError("shapely is required: pip install shapely") from exc

    layer = connection.execute(
        """
        SELECT c.table_name, g.column_name
        FROM gpkg_contents AS c
        JOIN gpkg_geometry_columns AS g ON g.table_name = c.table_name
        WHERE c.data_type = 'features'
        ORDER BY c.table_name
        LIMIT 1
        """
    ).fetchone()

    if layer is None:
        raise ParseError("GeoPackage contains no feature table")

    table, geometry_column = layer
    quoted_table = _quote(table)
    quoted_geometry = _quote(geometry_column)

    column_names = [
        row[1]
        for row in connection.execute(f"PRAGMA table_info({quoted_table})")
        if row[1] != geometry_column
    ]

    select_columns = ", ".join(
        [quoted_geometry] + [_quote(name) for name in column_names]
    )
    features: list[dict[str, Any]] = []

    for row in connection.execute(f"SELECT {select_columns} FROM {quoted_table}"):
        blob = row[0]
        if blob is None:
            continue
        geometry = _decode_geometry(blob, shapely, mapping)
        if geometry is None:
            continue
        properties = {
            name: value
            for name, value in zip(column_names, row[1:])
            if value is not None
        }
        features.append(feature(geometry, properties))

    return collection(features)


def _decode_geometry(blob: bytes, shapely: Any, mapping: Any) -> dict[str, Any] | None:
    if len(blob) < 8 or blob[0:2] != b"GP":
        raise ParseError("geometry blob is not a GeoPackage geometry")

    flags = blob[3]
    empty = bool(flags & 0x10)
    envelope_type = (flags >> 1) & 0x07
    envelope_size = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get(envelope_type, 0)

    if empty:
        return None

    # Header: magic(2) + version(1) + flags(1) + srs_id(4) = 8 bytes.
    offset = 8 + envelope_size
    wkb = blob[offset:]
    if not wkb:
        return None

    try:
        geometry = shapely.from_wkb(wkb)
    except Exception as exc:
        raise ParseError(f"invalid WKB in GeoPackage: {exc}") from exc

    if geometry is None or geometry.is_empty:
        return None
    return dict(mapping(geometry))


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'