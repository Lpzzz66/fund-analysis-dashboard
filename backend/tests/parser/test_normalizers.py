from datetime import date
from decimal import Decimal

from app.parser.normalizers import decimal, parse_date, ratio


def test_normalize_amount_and_percentage_text() -> None:
    assert decimal("10,824,713.18") == Decimal("10824713.18")
    assert decimal("-") is None
    assert ratio("2.0481") == Decimal("0.020481")


def test_parse_supported_valuation_dates() -> None:
    assert parse_date("估值日期：2026-03-06") == date(2026, 3, 6)
    assert parse_date("估值日期：20260402") == date(2026, 4, 2)
    assert parse_date("估值日期：2026年5月9日") == date(2026, 5, 9)
