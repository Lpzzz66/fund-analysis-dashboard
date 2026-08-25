from datetime import UTC, datetime, timedelta

from app.db.base import JobStatus
from app.db.models import BackgroundJob
from app.imports.tasks import claim_next_job, fail_job, finish_job
from sqlalchemy.orm import Session


def test_claim_job_and_finish(app_and_engine: tuple[object, object]) -> None:
    _, engine = app_and_engine
    now = datetime(2026, 8, 26, 12, 0, tzinfo=UTC)
    with Session(engine) as session:
        job = BackgroundJob(job_type="process_import_batch", resource_id="1")
        session.add(job)
        session.commit()

        claimed = claim_next_job(session, now=now)
        assert claimed is not None
        assert claimed.status == JobStatus.RUNNING
        assert claimed.attempts == 1
        assert claimed.started_at == now

        finish_job(session, claimed, now=now + timedelta(seconds=10))
        assert claimed.status == JobStatus.SUCCEEDED
        assert claimed.finished_at == now + timedelta(seconds=10)


def test_retryable_failure_uses_limited_backoff(
    app_and_engine: tuple[object, object],
) -> None:
    _, engine = app_and_engine
    now = datetime(2026, 8, 26, 12, 0, tzinfo=UTC)
    with Session(engine) as session:
        job = BackgroundJob(
            job_type="process_import_batch", resource_id="1", max_attempts=2
        )
        session.add(job)
        session.commit()

        claimed = claim_next_job(session, now=now)
        fail_job(session, claimed, "temporary_io", retryable=True, now=now)
        assert claimed.status == JobStatus.RETRY_DUE
        assert claimed.next_retry_at is not None
        assert claim_next_job(session, now=now) is None

        retry = claim_next_job(session, now=claimed.next_retry_at)
        fail_job(
            session,
            retry,
            "temporary_io",
            retryable=True,
            now=claimed.next_retry_at,
        )
        assert retry.status == JobStatus.FAILED


def test_non_retryable_failure_is_terminal(
    app_and_engine: tuple[object, object],
) -> None:
    _, engine = app_and_engine
    now = datetime(2026, 8, 26, 12, 0, tzinfo=UTC)
    with Session(engine) as session:
        job = BackgroundJob(job_type="process_import_batch", resource_id="1")
        session.add(job)
        session.commit()

        claimed = claim_next_job(session, now=now)
        fail_job(session, claimed, "invalid_format", retryable=False, now=now)

        assert claimed.status == JobStatus.FAILED
        assert claimed.error_code == "invalid_format"
