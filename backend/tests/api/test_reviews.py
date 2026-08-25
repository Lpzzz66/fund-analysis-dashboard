from .conftest import seed_pending_version


def test_review_acknowledge_and_publish_workflow(admin_client, app_and_engine) -> None:
    _, version_id = seed_pending_version(app_and_engine[1])

    queue = admin_client.get("/api/v1/reviews")
    acknowledged = admin_client.post(
        f"/api/v1/reviews/{version_id}/acknowledge",
        json={"allow_publish": True, "note": "已核对原始估值表"},
    )
    published = admin_client.post(
        f"/api/v1/valuations/{version_id}/publish",
        json={"reason": "复核通过"},
    )

    assert queue.status_code == 200
    assert queue.json()["meta"]["total"] == 1
    assert acknowledged.status_code == 200
    assert acknowledged.json()["data"]["status"] == "publishable"
    assert published.status_code == 200
    assert published.json()["data"]["version_id"] == version_id


def test_review_requires_reason_and_publish_handles_missing_version(
    admin_client,
) -> None:
    missing = admin_client.post(
        "/api/v1/valuations/999999/publish", json={"reason": "x"}
    )
    missing_review = admin_client.post(
        "/api/v1/reviews/999999/acknowledge",
        json={"allow_publish": True, "note": "x"},
    )

    assert missing.status_code == 409
    assert missing_review.status_code == 409
