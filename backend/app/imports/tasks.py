"""Database-backed import job claiming and state transitions."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.db.base import JobStatus
from app.db.models import BackgroundJob


def claim_next_job(
    session: Session, *, now: datetime | None = None
) -> BackgroundJob | None:
    """Claim the oldest pending or due retry job in the current transaction."""

    current_time = now or datetime.now(UTC)
    statement = (
        select(BackgroundJob)
        .where(
            or_(
                BackgroundJob.status == JobStatus.PENDING,
                and_(
                    BackgroundJob.status == JobStatus.RETRY_DUE,
                    BackgroundJob.next_retry_at <= current_time,
                ),
            )
        )
        .order_by(BackgroundJob.id)
        .limit(1)
    )
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        statement = statement.with_for_update(skip_locked=True)

    job = session.scalar(statement)
    if job is None:
        return None
    job.status = JobStatus.RUNNING
    job.attempts += 1
    job.locked_at = current_time
    if job.started_at is None:
        job.started_at = current_time
    job.error_code = None
    job.next_retry_at = None
    session.flush()
    return job


def finish_job(
    session: Session, job: BackgroundJob, *, now: datetime | None = None
) -> None:
    current_time = now or datetime.now(UTC)
    job.status = JobStatus.SUCCEEDED
    job.finished_at = current_time
    job.locked_at = None
    job.error_code = None
    job.next_retry_at = None
    session.flush()


def fail_job(
    session: Session,
    job: BackgroundJob,
    error_code: str,
    *,
    retryable: bool,
    now: datetime | None = None,
) -> None:
    current_time = now or datetime.now(UTC)
    job.error_code = error_code
    job.locked_at = None
    if retryable and job.attempts < job.max_attempts:
        job.status = JobStatus.RETRY_DUE
        delay_seconds = 60 * (2 ** max(job.attempts - 1, 0))
        job.next_retry_at = current_time + timedelta(seconds=delay_seconds)
        job.finished_at = None
    else:
        job.status = JobStatus.FAILED
        job.next_retry_at = None
        job.finished_at = current_time
    session.flush()
