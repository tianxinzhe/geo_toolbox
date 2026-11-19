"""KMZ parser: a ZIP archive whose first ``.kml`` entry is the document.

KMZ is not a separate data model, only a container. This module unzips the
archive in memory and delegates to :mod:`vector_formats.kml`.

If the archive contains several KML files, the first one in ZIP order is used
and the others are ignored, which matches what most viewers do.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path
from typing import Any

from . import kml
from .common import ParseError


def parse_bytes(data: bytes) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = [
                name
                for name in archive.namelist()
                if name.lower().endswith(".kml") and not name.startswith("__MACOSX/")
            ]
            if not names:
                raise ParseError("KMZ archive contains no .kml file")
            with archive.open(names[0]) as entry:
                return kml.parse_bytes(entry.read())
    except zipfile.BadZipFile as exc:
        raise ParseError(f"invalid KMZ archive: {exc}") from exc


def parse(path: str | Path) -> dict[str, Any]:
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)