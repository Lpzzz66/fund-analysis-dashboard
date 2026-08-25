"""Strict normalizers used by the valuation parser."""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

DATE_PATTERN = re.compile(r"(?<!\d)(\d{4})[-/.年]?(\d{1,2})[-/.月]?(\d{1,2})日?")


def text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int | float):
        return Decimal(str(value))
    raw = text(value).replace(",", "").replace("，", "")
    if not raw or raw in {"-", "--", "N/A", "NA", "无"}:
        return None
    raw = raw.removesuffix("%")
    try:
        return Decimal(raw)
    except InvalidOperation:
        return None


def ratio(value: Any) -> Decimal | None:
    """Convert a percentage-point cell (for example 2.5) to a ratio (0.025)."""

    parsed = decimal(value)
    return parsed / Decimal(100) if parsed is not None else None


def parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    match = DATE_PATTERN.search(text(value))
    if not match:
        return None
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


def normalize_label(value: Any) -> str:
    return re.sub(r"[\s:：]+", "", text(value))
