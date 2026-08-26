from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.db.base import FundStatus

from .conftest import seed_published_fund


def test_dashboard_overview_and_fund_queries_are_published_only(
    admin_client, app_and_engine
) -> None:
    fund_id, version_id = seed_published_fund(app_and_engine[1])

    overview = admin_client.get("/api/v1/dashboard/overview")
    funds = admin_client.get("/api/v1/funds", params={"page": 1, "page_size": 20})
    detail = admin_client.get(f"/api/v1/funds/{fund_id}")
    nav = admin_client.get(f"/api/v1/funds/{fund_id}/nav-series")
    positions = admin_client.get(f"/api/v1/funds/{fund_id}/positions")
    quality = admin_client.get(f"/api/v1/funds/{fund_id}/quality")

    assert overview.status_code == 200
    assert overview.json()["data"]["total_net_assets"] == "90000.0000000000"
    assert overview.json()["meta"]["coverage"] == {"available": 1, "total": 1}
    assert funds.json()["meta"]["total"] == 1
    assert funds.json()["data"][0]["id"] == fund_id
    assert detail.json()["data"]["current_version_id"] == version_id
    assert nav.json()["data"]["points"][0]["unit_nav"] == "1.2500000000"
    assert positions.json()["meta"]["total"] == 1
    assert quality.json()["data"]["validation"][0]["rule_code"] == "test_rule"


def test_dashboard_has_date_and_pagination_filters(
    admin_client, app_and_engine
) -> None:
    seed_published_fund(app_and_engine[1], name="梦一号")
    seed_published_fund(
        app_and_engine[1],
        name="千金一号",
        valuation_date=date(2026, 8, 24),
        unit_nav=Decimal("1.10"),
    )

    response = admin_client.get(
        "/api/v1/funds",
        params={"q": "千金", "as_of": "2026-08-24", "page": 1, "page_size": 1},
    )
    overview = admin_client.get(
        "/api/v1/dashboard/overview", params={"as_of": "2026-08-24"}
    )

    assert response.status_code == 200
    assert response.json()["meta"]["total"] == 1
    assert response.json()["data"][0]["name"] == "千金一号"
    assert overview.status_code == 200
    assert overview.json()["data"]["total_net_assets"] == "90000.0000000000"


def test_fund_list_reports_total_and_empty_out_of_range_page(
    admin_client, app_and_engine
) -> None:
    for name in ("甲产品", "乙产品", "丙产品"):
        seed_published_fund(app_and_engine[1], name=name)

    last_page = admin_client.get("/api/v1/funds", params={"page": 2, "page_size": 2})
    out_of_range = admin_client.get("/api/v1/funds", params={"page": 3, "page_size": 2})

    assert last_page.status_code == 200
    assert len(last_page.json()["data"]) == 1
    assert last_page.json()["meta"] == {"page": 2, "page_size": 2, "total": 3}
    assert out_of_range.status_code == 200
    assert out_of_range.json()["data"] == []
    assert out_of_range.json()["meta"] == {
        "page": 3,
        "page_size": 2,
        "total": 3,
    }


def test_positions_report_total_and_empty_out_of_range_page(
    admin_client, app_and_engine
) -> None:
    fund_id, _ = seed_published_fund(app_and_engine[1], position_count=3)

    last_page = admin_client.get(
        f"/api/v1/funds/{fund_id}/positions",
        params={"page": 2, "page_size": 2},
    )
    out_of_range = admin_client.get(
        f"/api/v1/funds/{fund_id}/positions",
        params={"page": 3, "page_size": 2},
    )

    assert last_page.status_code == 200
    assert len(last_page.json()["data"]) == 1
    assert last_page.json()["meta"]["total"] == 3
    assert out_of_range.status_code == 200
    assert out_of_range.json()["data"] == []
    assert out_of_range.json()["meta"]["total"] == 3


def test_dashboard_uses_exact_date_and_excludes_inactive_funds(
    admin_client, app_and_engine
) -> None:
    seed_published_fund(
        app_and_engine[1],
        name="停用产品",
        fund_status=FundStatus.INACTIVE,
    )
    seed_published_fund(
        app_and_engine[1],
        name="较晚产品",
        valuation_date=date(2026, 8, 25),
    )

    response = admin_client.get(
        "/api/v1/dashboard/overview", params={"as_of": "2026-08-24"}
    )

    assert response.status_code == 200
    assert response.json()["data"]["fund_count"] == 0
    assert response.json()["data"]["total_net_assets"] is None
    assert response.json()["meta"]["coverage"] == {"available": 0, "total": 1}


def test_viewer_can_read_dashboard_but_cannot_operate(
    admin_client, app_and_engine
) -> None:
    seed_published_fund(app_and_engine[1])
    created = admin_client.post(
        "/api/v1/users",
        json={
            "username": "viewer",
            "password": "correct horse",
            "role": "viewer",
        },
    )
    assert created.status_code == 201

    from fastapi.testclient import TestClient

    viewer = TestClient(admin_client.app)
    viewer.post(
        "/api/v1/auth/login",
        json={"username": "viewer", "password": "correct horse"},
    )

    assert viewer.get("/api/v1/dashboard/overview").status_code == 200
    assert viewer.get("/api/v1/reviews").status_code == 403
    assert (
        viewer.post("/api/v1/imports", json={"source_type": "upload"}).status_code
        == 403
    )


def test_login_navigation_and_user_list_are_role_scoped(admin_client) -> None:
    created = admin_client.post(
        "/api/v1/users",
        json={
            "username": "operator",
            "password": "correct horse",
            "role": "operator",
        },
    )
    listed = admin_client.get(
        "/api/v1/users", params={"role": "operator", "page": 1, "page_size": 10}
    )

    assert "users" in admin_client.get("/api/v1/auth/me").json()["data"]["navigation"]
    assert created.status_code == 201
    assert listed.status_code == 200
    assert listed.json()["meta"]["total"] == 1
    assert listed.json()["data"][0]["username"] == "operator"


def test_admin_protection_returns_conflict_not_not_found(admin_client) -> None:
    user_id = admin_client.get("/api/v1/auth/me").json()["data"]["id"]

    disable = admin_client.post(f"/api/v1/users/{user_id}/disable")
    downgrade = admin_client.patch(
        f"/api/v1/users/{user_id}/role", json={"role": "operator"}
    )

    assert disable.status_code == 409
    assert disable.json()["detail"] == "admin_cannot_disable_self"
    assert downgrade.status_code == 409
    assert downgrade.json()["detail"] == "admin_cannot_downgrade_self"
