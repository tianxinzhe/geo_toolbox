"""XLSX parser: the first worksheet is read as a header row plus data rows.

An .xlsx file is a ZIP of XML parts, but there is no benefit in parsing the
SpreadsheetML by hand here: ``openpyxl`` already handles shared strings, inline
strings and cell types. Only the **first worksheet** is used, and formulas are
read as their cached values (``data_only=True``).

The resulting matrix is handed to :func:`vector_formats.csv_tsv.rows_to_points`,
so column detection, skipped rows and property names behave exactly like CSV.

Styles, comments, merged cells beyond the used range and other sheets are
ignored.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

from .common import ParseError
from .csv_tsv import rows_to_points


def parse(path: str | Path) -> dict[str, Any]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover - dependency hint
        raise ParseError("openpyxl is required: pip install openpyxl") from exc

    try:
        workbook = load_workbook(filename=str(path), read_only=True, data_only=True)
    except Exception as exc:
        raise ParseError(f"cannot open workbook {path}: {exc}") from exc

    try:
        sheet = workbook.worksheets[0]
        rows: Iterable[tuple[Any, ...]] = sheet.iter_rows(values_only=True)
        try:
            header_row = next(rows)
        except StopIteration:
            raise ParseError("workbook is empty") from None

        header = [
            str(cell).strip() if cell is not None else f"column_{index + 1}"
            for index, cell in enumerate(header_row)
        ]

        records: list[dict[str, Any]] = []
        for raw in rows:
            if raw is None or all(cell is None or str(cell).strip() == "" for cell in raw):
                continue
            record = {
                header[index]: cell
                for index, cell in enumerate(raw)
                if index < len(header)
            }
            records.append(record)

        return rows_to_points(header, records)
    finally:
        workbook.close()