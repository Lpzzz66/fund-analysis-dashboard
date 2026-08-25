from datetime import date
from decimal import Decimal

from app.analytics.company import calculate_company_index


def test_company_index_uses_previous_day_net_asset_weights() -> None:
    metrics = calculate_company_index(
        [
            {"date": date(2026, 1, 1), "fund_id": "A", "net_asset_value": Decimal(100)},
            {"date": date(2026, 1, 1), "fund_id": "B", "net_asset_value": Decimal(300)},
            {
                "date": date(2026, 1, 2),
                "fund_id": "A",
                "net_asset_value": Decimal(110),
                "daily_return": Decimal("0.1"),
            },
            {
                "date": date(2026, 1, 2),
                "fund_id": "B",
                "net_asset_value": Decimal(270),
                "daily_return": Decimal("-0.1"),
            },
        ],
        fund_ids=["A", "B"],
    )

    assert metrics[0].company_index == Decimal("1.0000")
    assert metrics[0].effective_fund_count == 2
    assert metrics[0].coverage == Decimal(1)
    assert metrics[1].company_daily_return == Decimal("-0.05")
    assert metrics[1].company_index == Decimal("0.95")
    assert metrics[1].effective_fund_count == 2
    assert metrics[1].coverage == Decimal(1)


def test_company_index_marks_missing_fund_in_coverage_without_forward_fill() -> None:
    metrics = calculate_company_index(
        [
            {"date": date(2026, 1, 1), "fund_id": "A", "net_asset_value": Decimal(100)},
            {"date": date(2026, 1, 1), "fund_id": "B", "net_asset_value": Decimal(300)},
            {
                "date": date(2026, 1, 2),
                "fund_id": "A",
                "net_asset_value": Decimal(110),
                "daily_return": Decimal("0.1"),
            },
            {
                "date": date(2026, 1, 2),
                "fund_id": "B",
                "net_asset_value": Decimal(270),
                "daily_return": Decimal("-0.1"),
            },
            {
                "date": date(2026, 1, 3),
                "fund_id": "A",
                "net_asset_value": Decimal(121),
                "daily_return": Decimal("0.1"),
            },
        ],
        fund_ids=["A", "B"],
    )

    assert metrics[2].effective_fund_count == 1
    assert metrics[2].coverage == Decimal("0.5")
    assert metrics[2].company_daily_return == Decimal("0.02894736842105263157894736842")


def test_company_index_does_not_carry_index_across_uncomputable_day() -> None:
    metrics = calculate_company_index(
        [
            {"date": date(2026, 1, 1), "fund_id": "A", "net_asset_value": Decimal(100)},
            {"date": date(2026, 1, 2), "fund_id": "A", "net_asset_value": Decimal(100)},
            {
                "date": date(2026, 1, 3),
                "fund_id": "A",
                "net_asset_value": Decimal(110),
                "daily_return": Decimal("0.1"),
            },
        ],
        fund_ids=["A"],
    )

    assert metrics[1].company_daily_return is None
    assert metrics[1].company_index is None
    assert metrics[2].company_daily_return == Decimal("0.1")
    assert metrics[2].company_index is None


def test_company_index_rejects_duplicate_fund_date() -> None:
    import pytest

    with pytest.raises(ValueError, match="duplicate fund record"):
        calculate_company_index(
            [
                {
                    "date": date(2026, 1, 1),
                    "fund_id": "A",
                    "net_asset_value": Decimal(100),
                },
                {
                    "date": date(2026, 1, 1),
                    "fund_id": "A",
                    "net_asset_value": Decimal(101),
                },
            ]
        )
