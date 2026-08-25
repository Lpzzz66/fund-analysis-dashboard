"""Adapters for the two Excel formats accepted by the intake module."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import xlrd
from openpyxl import load_workbook


@dataclass(frozen=True, slots=True)
class WorksheetData:
    name: str
    rows: tuple[tuple[object, ...], ...]


def read_workbook(path: Path) -> tuple[WorksheetData, ...]:
    """Read values only, keeping the parser independent from workbook objects."""

    extension = path.suffix.lower()
    if extension == ".xls":
        return _read_xls(path)
    if extension == ".xlsx":
        return _read_xlsx(path)
    raise ValueError("unsupported_extension")


def _read_xls(path: Path) -> tuple[WorksheetData, ...]:
    workbook = xlrd.open_workbook(str(path), on_demand=True)
    try:
        return tuple(
            WorksheetData(
                sheet.name,
                tuple(
                    tuple(
                        sheet.cell_value(row, column) for column in range(sheet.ncols)
                    )
                    for row in range(sheet.nrows)
                ),
            )
            for sheet in (
                workbook.sheet_by_index(index) for index in range(workbook.nsheets)
            )
        )
    finally:
        workbook.release_resources()


def _read_xlsx(path: Path) -> tuple[WorksheetData, ...]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        worksheets: list[WorksheetData] = []
        for sheet in workbook.worksheets:
            worksheets.append(
                WorksheetData(
                    sheet.title,
                    tuple(tuple(row) for row in sheet.iter_rows(values_only=True)),
                )
            )
        return tuple(worksheets)
    finally:
        workbook.close()
