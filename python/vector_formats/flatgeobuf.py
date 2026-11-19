"""FlatGeobuf (.fgb) parser.

FlatGeobuf stores features as FlatBuffers and may append a packed R-tree for
spatial filtering. One file holds exactly one layer.

The ``flatgeobuf`` Python package ships a ``Reader`` that always queries the
R-tree. Many writers (including the JavaScript serializer used by the site)
emit **no index** at all, and that Reader then fails with "Node size must be at
least 2". This module therefore decodes the file sequentially instead:

    magic(8) | header length(4) | header | [index] | feature* 
    feature = length(4) + Feature flatbuffer

Sequential reading is valid for both indexed and unindexed files; it simply
ignores the index. Attributes come from the header column metadata, and the
result is the same FeatureCollection contract as every other parser.

No reprojection is performed.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .common import ParseError, collection, feature


def parse(path: str | Path) -> dict[str, Any]:
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise ParseError(f"cannot read {path}: {exc}") from exc
    return parse_bytes(data)


def parse_bytes(data: bytes) -> dict[str, Any]:
    try:
        from flatgeobuf.constants import SIZE_PREFIX_LEN, magicbytes
        from flatgeobuf.FlatGeobuf.Feature import Feature
        from flatgeobuf.geojson.feature import from_feature
        from flatgeobuf.header_meta import from_byte_buffer
        from flatgeobuf.packedrtree import calc_tree_size
    except ImportError as exc:  # pragma: no cover - dependency hint
        raise ParseError("flatgeobuf is required: pip install flatgeobuf") from exc

    if not data.startswith(magicbytes):
        raise ParseError("not a FlatGeobuf file (bad magic bytes)")

    header_length = int.from_bytes(data[8:12], "little")
    if header_length <= 0 or 12 + header_length > len(data):
        raise ParseError("invalid FlatGeobuf header length")

    try:
        header = from_byte_buffer(bytearray(data[12 : 12 + header_length]))
    except Exception as exc:
        raise ParseError(f"cannot decode FlatGeobuf header: {exc}") from exc

    # index_node_size == 0 means the file has no spatial index. calc_tree_size
    # assumes a real node size and returns a bogus length for 0, so skip it.
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
        # GeoJsonFeature is a TypedDict, but keep a defensive branch for
        # future versions that may return an object with __geo_interface__.
        item = dict(item) if hasattr(item, "keys") else {"geometry": None}
    properties = item.get("properties") or {}
    return feature(item.get("geometry"), dict(properties))