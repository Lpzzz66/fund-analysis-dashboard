from pathlib import Path

import pytest
from openpyxl import Workbook

from app.parser import ValuationParser

KNOWN_PRODUCTS = {
    "千金一号": ["千金一号"],
    "天策上将": ["天策上将"],
    "梦一号": ["梦一号"],
}


@pytest.mark.parametrize(
    ("filename", "product", "valuation_date"),
    [
        ("千金一号 03月06日.xls", "千金一号", "2026-03-06"),
        ("天策上将 04月02日.xls", "天策上将", "2026-04-02"),
        ("梦一号 05月09日.xls", "梦一号", "2025-05-09"),
    ],
)
def test_real_xls_samples_are_stable(
    filename: str, product: str, valuation_date: str
) -> None:
    path = Path("C:/Users/jzcan/Desktop") / filename
    if not path.exists():
        pytest.skip("desktop sample is not available in this checkout")
    parsed = ValuationParser(KNOWN_PRODUCTS).parse(path)
    assert parsed.product_name == product
    assert parsed.valuation_date.isoformat() == valuation_date
    assert parsed.net_asset_value is not None
    assert parsed.unit_nav is not None
    assert parsed.available_headroom is not None
    assert parsed.qtd_return is not None
    assert parsed.cumulative_payout is not None
    assert parsed.share_classes
    assert all(item.paid_in_capital is not None for item in parsed.share_classes)
    assert all(item.daily_return is not None for item in parsed.share_classes)
    assert any(
        item.standard_field == "net_asset_value" and item.column == 8
        for item in parsed.provenance
    )
    assert parsed.subjects
    assert parsed.positions
    assert parsed.provenance


def test_unknown_product_is_not_guessed(tmp_path: Path) -> None:
    path = tmp_path / "unknown.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["证券投资基金估值表"])
    sheet.append(["未知产品___专用表"])
    sheet.append(["估值日期：2026-08-25"])
    sheet.append(
        [
            "科目代码",
            "科目名称",
            "数量",
            "单位成本",
            "成本",
            "成本占净值%",
            "市价",
            "市值",
            "市值占净值%",
            "估值增值",
            "停牌信息",
        ]
    )
    sheet.append(["1002", "银行存款", "", "", 100, 1, "", 100, 1, "", ""])
    sheet.append(["资产类合计", 100])
    sheet.append(["负债类合计", 0])
    sheet.append(["基金资产净值", 100])
    sheet.append(["基金单位净值", 1])
    workbook.save(path)

    parsed = ValuationParser(KNOWN_PRODUCTS).parse(path)
    assert parsed.product_name is None
    assert "product_unrecognized" in parsed.warnings


def test_position_metadata_comes_only_from_explicit_ancestor_names(
    tmp_path: Path,
) -> None:
    path = tmp_path / "position-metadata.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "估值表"
    sheet.append(["证券投资基金估值表"])
    sheet.append(["未知产品___专用表"])
    sheet.append(["估值日期：2026-08-25"])
    sheet.append(
        [
            "科目代码",
            "科目名称",
            "数量",
            "单位成本",
            "成本",
            "成本占净值%",
            "市价",
            "市值",
            "市值占净值%",
            "估值增值",
            "停牌信息",
        ]
    )
    sheet.append(["1102", "股票投资"])
    sheet.append(["110201", "上交所_信用账户"])
    sheet.append(["11020101", "股票成本_上交所_信用账户"])
    sheet.append(["11020101600001", "明确证券", 10, 10, 100, 10, 11, 110, 11, 10, ""])
    sheet.append(["1103", "普通股票投资"])
    sheet.append(
        [
            "11030101600002",
            "深交所信用账户测试证券",
            10,
            10,
            100,
            10,
            11,
            110,
            11,
            10,
            "",
        ]
    )
    sheet.append(["1104", "普通股票投资"])
    sheet.append(["110401", "上海市场策略"])
    sheet.append(["11040101", "多层股票成本"])
    sheet.append(["11040101600003", "多层证券", 10, 10, 100, 10, 11, 110, 11, 10, ""])
    sheet.append(["资产类合计", "", "", "", "", "", "", 330])
    sheet.append(["负债类合计", "", "", "", "", "", "", 0])
    sheet.append(["基金资产净值", "", "", "", "", "", "", 330])
    sheet.append(["基金单位净值", 1])
    workbook.save(path)

    parsed = ValuationParser().parse(path)
    positions = {item.source_subject_code: item for item in parsed.positions}

    explicit = positions["11020101600001"]
    assert explicit.market == "上交所"
    assert explicit.account == "信用账户"
    assert explicit.source_row == 8

    leaf_name_only = positions["11030101600002"]
    assert leaf_name_only.market is None
    assert leaf_name_only.account is None

    ambiguous_ancestor = positions["11040101600003"]
    assert ambiguous_ancestor.market is None
    assert ambiguous_ancestor.account is None
