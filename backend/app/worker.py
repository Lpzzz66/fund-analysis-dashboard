"""Small standalone worker process for database-backed import jobs."""

from __future__ import annotations

import argparse
import time
from collections.abc import Callable

from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db.session import create_engine
from .imports.tasks import process_next_job


def run_worker(
    settings: Settings | None = None,
    *,
    max_jobs: int | None = None,
    idle_sleep_seconds: float = 5.0,
    sleep: Callable[[float], None] = time.sleep,
) -> int:
    """Process jobs serially until the optional limit is reached.

    A new session is used for every job so a parser failure or a lost lease
    cannot contaminate the next claim.
    """

    runtime = settings or get_settings()
    engine = create_engine(runtime.database_url)
    completed = 0
    try:
        while max_jobs is None or completed < max_jobs:
            with Session(engine) as session:
                result = process_next_job(session, runtime)
            if result is None:
                if max_jobs is not None:
                    break
                sleep(idle_sleep_seconds)
                continue
            completed += 1
    finally:
        engine.dispose()
    return completed


def main() -> None:
    parser = argparse.ArgumentParser(description="Fund dashboard import worker")
    parser.add_argument("--max-jobs", type=int, default=None)
    parser.add_argument("--idle-sleep", type=float, default=5.0)
    args = parser.parse_args()
    if args.max_jobs is not None and args.max_jobs < 1:
        parser.error("--max-jobs must be positive")
    if args.idle_sleep < 0:
        parser.error("--idle-sleep must be non-negative")
    run_worker(max_jobs=args.max_jobs, idle_sleep_seconds=args.idle_sleep)


if __name__ == "__main__":
    main()
