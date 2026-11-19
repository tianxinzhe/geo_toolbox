#!/usr/bin/env python3
"""Command line entry point for the vector format parsers.

Examples
--------
    python parse_formats.py data.geojson
    python parse_formats.py tile.kml --out tile.geojson
    python parse_formats.py roads.shp --limit 5
    python parse_formats.py points.csv --format csv --indent 0
    python parse_formats.py --list

GeoJSON goes to stdout by default, so the script composes with `jq`:

    python parse_formats.py data.gpkg | jq '.features | length'
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vector_formats import FORMATS, detect_format, parse_file  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Parse 16 vector formats into a GeoJSON FeatureCollection."
    )
    parser.add_argument("input", nargs="?", help="path to the source file")
    parser.add_argument(
        "-f",
        "--format",
        default="auto",
        choices=["auto", *FORMATS],
        help="source format (default: detect from content and extension)",
    )
    parser.add_argument("-o", "--out", help="write GeoJSON to this file")
    parser.add_argument(
        "--indent", type=int, default=2, help="JSON indent, 0 for compact output"
    )
    parser.add_argument(
        "--limit", type=int, help="keep only the first N features (for a quick look)"
    )
    parser.add_argument("--list", action="store_true", help="list supported formats")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.list:
        for name in FORMATS:
            print(name)
        return 0

    if not args.input:
        parser.error("input file is required unless --list is used")

    try:
        resolved = detect_format(args.input) if args.format == "auto" else args.format
        if resolved is None:
            parser.error(
                f"cannot detect the format of {args.input}; "
                f"use --format with one of: {', '.join(FORMATS)}"
            )
        result = parse_file(args.input, resolved)
    except Exception as exc:  # single error surface for every format
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.limit is not None:
        result = {
            **result,
            "features": result["features"][: max(args.limit, 0)],
        }

    indent = None if args.indent == 0 else args.indent
    text = json.dumps(result, ensure_ascii=False, indent=indent)

    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
        print(
            f"{resolved}: {len(result['features'])} feature(s) -> {args.out}",
            file=sys.stderr,
        )
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())