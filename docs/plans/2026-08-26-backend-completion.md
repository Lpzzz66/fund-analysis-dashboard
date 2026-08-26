# Backend Completion Implementation Plan

**Implementation status (2026-08-26):** Tasks 1-4 are implemented. Task 5 quality gates cover the complete backend suite, Ruff, ty, Alembic round trips, both Compose configurations, secret inspection, and branch push.

Status summary:

- [x] Task 1: published analysis execution, persisted metrics, risk evaluation, and worker dispatch.
- [x] Task 2: safe business CSV exports.
- [x] Task 3: maintenance entry points and operational health.
- [x] Task 4: audited production bootstrap and migration preflight.
- [x] Task 5: local quality gates and final branch audit; remote push remains the final handoff action.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the documented backend gaps so published valuation data is analyzed in the background, business data can be exported safely, routine maintenance is runnable and observable, and a new deployment can be initialized without hard-coded business secrets.

**Architecture:** Keep the existing modular monolith, PostgreSQL task table, one worker, and existing service boundaries. Publishing creates an idempotent analysis job; the worker calculates and replaces only derived rows for the affected range, then evaluates risk rules. Exports stream CSV from database queries. Maintenance is invoked by a small CLI/worker job rather than a new scheduler or queue. Bootstrap consumes an operator-supplied JSON file and is safe to preview before writing.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, PostgreSQL/SQLite test backend, Python CSV streaming, pytest, ruff, ty, Docker Compose.

---

### Task 1: Published analysis execution and worker dispatch

**Files:**
- Create/modify: `backend/app/analytics/service.py`, `backend/app/analytics/tasks.py`
- Modify: `backend/app/db/models/analytics.py`, `backend/app/db/models/imports.py`, `backend/app/publishing/service.py`, `backend/app/worker.py`, `backend/app/api/dashboard.py`, `backend/app/api/risk.py`
- Create: `backend/alembic/versions/0004_analysis_job_link.py` only if the existing schema cannot express idempotency
- Test: `backend/tests/test_analysis_service.py`, `backend/tests/test_worker.py`, `backend/tests/test_publishing.py`, `backend/tests/test_dashboard.py`

**Steps:**

1. Write tests proving each publication creates at most one queued analysis job for its analysis run, the worker claims and dispatches `process_analysis_run`, success marks the run finished and writes `FundMetricDaily`/`CompanyMetricDaily`, and failure marks the run failed without changing the published version.
2. Run the focused tests and verify they fail for the missing dispatch/execution behavior.
3. Implement the smallest analysis service around the existing pure functions and models. Load published snapshots for the affected date range, replace derived rows for the run/range transactionally, and use existing `source_analysis_run_id` to prevent stale rows from appearing current.
4. Add risk evaluation after successful metric persistence. Match existing open events by rule/fund/date/evidence before inserting, so reruns are idempotent; do not add a new notification system.
5. Make publishing enqueue one background job linked to the analysis run, and add the worker dispatch branch while preserving existing lease, retry, and failure semantics.
6. Make dashboard queries report `pending`/`stale` when the latest published input has no successful analysis run, otherwise prefer persisted metric rows; retain request-time calculation only as an explicit compatibility fallback.
7. Run focused tests, then commit `feat: execute published analysis runs`.

### Task 2: Safe business CSV exports

**Files:**
- Create: `backend/app/api/exports.py`, `backend/tests/test_exports.py`
- Modify: `backend/app/main.py`, `backend/app/api/__init__.py`, `docs/05-API-接口草案.md`

**Steps:**

1. Write endpoint tests for company overview, fund list/detail, NAV series, allocation, positions, share data, and import report exports; cover role authorization, date/fund filters, empty results, UTF-8 BOM/CSV headers, and formula-injection escaping.
2. Run focused tests and verify the new routes are absent/failing.
3. Implement one small CSV response helper and database-backed generators. Stream rows instead of building a workbook or a large in-memory list. Include export time and data-as-of metadata in the CSV preamble or response headers, and query only published/released data.
4. Reuse existing endpoint permission dependencies and write a compact audit record per export without logging row contents or sensitive configuration.
5. Register routes, document request/response contracts, run tests, and commit `feat: add business csv exports`.

### Task 3: Maintenance entry points and operational health

**Files:**
- Create/modify: `backend/app/system/maintenance.py`, `backend/app/system/health.py`, `backend/app/maintenance_cli.py`, `backend/tests/test_maintenance.py`, `backend/tests/test_health.py`
- Modify: `backend/app/worker.py`, `backend/app/api/system.py`, `backend/app/main.py`, `docs/runbook.md`, `deploy/README.md` if present

**Steps:**

1. Write tests for one-shot maintenance execution: mail sync, database backup, source retention, failed-job retry/summary, disk threshold status, worker heartbeat, and safe failure reporting.
2. Run focused tests and verify the new entry points fail before implementation.
3. Implement a direct maintenance command with explicit subcommands/flags. Reuse existing mail, backup, retention, and job services; do not introduce a scheduler, Redis, or a second worker abstraction.
4. Add an authenticated operational summary endpoint exposing worker heartbeat, queue counts, last successful/failed maintenance runs, backup status, and disk usage with no secrets or raw paths beyond configured safe labels.
5. Add documented host scheduling examples and default intervals: mail sync every 5 minutes, database backup daily, retention daily after backup, and a lightweight health check every minute. Make thresholds/settings configurable through existing safe system settings/environment variables.
6. Run tests and commit `feat: add maintenance commands and health status`.

### Task 4: Audited production bootstrap and migration readiness

**Files:**
- Create: `backend/app/bootstrap.py`, `backend/tests/test_bootstrap.py`, `deploy/bootstrap.example.json`
- Modify: `backend/app/main.py` only if command registration requires it, `docs/runbook.md`, `docs/migration/README.md`, `docs/05-API-接口草案.md`

**Steps:**

1. Write tests for JSON validation, dry-run output, refusal when business data already exists, idempotent rerun, audit entries, and rejection of password/secret fields.
2. Run focused tests and verify they fail before implementation.
3. Implement `python -m app.bootstrap --config ... [--dry-run]` for funds, aliases, share classes, subject mappings, risk rules, and safe system settings. Never create an administrator password from the file; keep that through `/api/v1/auth/initialize`.
4. Add a preflight report for required products, unresolved aliases/mappings, database connectivity, storage roots, and migration manifest status. Do not read, move, or delete the real historical source directory.
5. Document sample-first then full migration procedure, manual handling of six known gz conflicts, rollback boundaries, and report locations. Run tests and commit `feat: add audited production bootstrap`.

### Task 5: Unified quality gate and final audit

**Files:**
- Modify only backend/docs/CI files needed by findings; never modify the active frontend Agent files.

**Steps:**

1. Run the complete backend test suite, ruff check, ruff format check, ty, package/import checks, and both Compose configuration checks.
2. Fix only verified regressions or documented quality findings, keeping each fix in a focused commit.
3. Run a final code-quality review against the product and architecture documents, confirm the working tree contains no frontend files, inspect staged files for secrets, and push the feature branch through the configured proxy.
