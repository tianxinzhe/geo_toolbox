"""FlatGeobuf (.fgb) parser.

FlatGeobuf stores one layer of features as FlatBuffers, optionally followed by
a packed R-tree index. The byte layout is: magic(8) | header length(4) |
header | [spatial index] | feature*, where each feature is a uint32 length
followed by a Feature flatbuffer. This file decodes that stream sequentially
instead of using the library's ``Reader``, because many writers (including
browser exporters) emit no index at all and ``Reader`` then fails with
"Node size must be at least 2".

Install: pip install flatgeobuf

No reprojection is performed; coordinates are returned in the CRS declared by
the file header.

    python flatgeobuf_parser.py input.fgb
    python flatgeobuf_parser.py input.fgb -o out.geojson --indent 0
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

MAGIC = b"fgb\x03fgb\x00"
SIZE_PREFIX_LEN = 4


class ParseError(ValueError):
    """Raised when a file cannot be parsed."""


def feature(geometry: dict[str, Any] | None, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def parse(path: str | Path) -> dict[str, Any]:
    """Read and parse a FlatGeobuf file."""
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


def parse_bytes(data: bytes) -> dict[str, Any]:
    """Parse FlatGeobuf bytes into a FeatureCollection dict."""
    try:
        from flatgeobuf.FlatGeobuf.Feature import Feature
        from flatgeobuf.geojson.feature import from_feature
        from flatgeobuf.header_meta import from_byte_buffer
        from flatgeobuf.packedrtree import calc_tree_size
    except ImportError as exc:
        raise ParseError("flatgeobuf is required: pip install flatgeobuf") from exc

    if not data.startswith(MAGIC):
        raise ParseError("not a FlatGeobuf file (bad magic bytes)")

    header_length = int.from_bytes(data[8:12], "little")
    if header_length <= 0 or 12 + header_length > len(data):
        raise ParseError("invalid FlatGeobuf header length")

    try:
        header = from_byte_buffer(bytearray(data[12 : 12 + header_length]))
    except Exception as exc:
        raise ParseError(f"cannot decode FlatGeobuf header: {exc}") from exc

    # index_node_size < 2 means there is no usable spatial index; calc_tree_size
    # assumes a real node size and would return a bogus length.
    index_length = (
        0
        if header.index_node_size < 2
        else calc_tree_size(header.features_count, header.index_node_size)
    )
    offset = 12 + header_length + index_length

    features: list[dict[str, Any]] = []
    for _ in range(header.features_count):
        if offset + SIZE_PREFIX_LEN > len(data):
            raise ParseError("FlatGeobuf is truncated")
        length = int.from_bytes(data[offset : offset + SIZE_PREFIX_LEN], "little")
        offset += SIZE_PREFIX_LEN
        if length <= 0 or offset + length > len(data):
            raise ParseError("invalid FlatGeobuf feature length")

        flatbuffer = bytearray(data[offset : offset + length])
        offset += length

        try:
            decoded = from_feature(Feature.GetRootAsFeature(flatbuffer), header)
        except Exception as exc:
            raise ParseError(f"cannot decode FlatGeobuf feature: {exc}") from exc
        features.append(_normalise(decoded))

    return collection(features)


def _normalise(item: Any) -> dict[str, Any]:
    if not isinstance(item, dict):
        # Future versions may return an object exposing keys() instead.
        item = dict(item) if hasattr(item, "keys") else {"geometry": None}
    properties = item.get("properties") or {}
    return feature(item.get("geometry"), dict(properties))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert a FlatGeobuf file to a GeoJSON FeatureCollection.")
    parser.add_argument("input", help="input .fgb file")
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