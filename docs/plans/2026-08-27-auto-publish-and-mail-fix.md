# Automatic Publication and Mail Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically publish clean imported valuation versions, expose the remaining manual publication action for warning versions, and submit the verified mail integration repair.

**Architecture:** Keep critical and warning findings out of automatic publication. Clean versions are published through the existing transactional `PublishingService`; analysis runs are coalesced once per affected fund and import batch so historical imports do not create one analysis job per file. The mail repair remains limited to egress network access, safe connection diagnostics, development database configuration, and secret-file ownership documentation.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL/SQLite, React, TypeScript, Docker Compose, pytest, Ruff, ty.

---

### Task 1: Lock the automatic publication contract with tests

**Files:**
- Modify: `backend/tests/imports/test_processor.py`
- Modify: `backend/tests/publishing/test_versioning.py`

**Steps:**

1. Add tests proving clean imported versions are automatically published and warning/critical versions are not.
2. Add tests proving one import batch queues at most one analysis run per affected fund and that its date range covers all automatically published dates.
3. Add a regression test for publication audit metadata and the actor identity used by automatic publication.
4. Run the focused tests and confirm they fail before implementation.

### Task 2: Add coalesced automatic publication

**Files:**
- Modify: `backend/app/publishing/service.py`
- Modify: `backend/app/imports/processor.py`
- Modify: `backend/app/imports/tasks.py` only if result typing requires it

**Steps:**

1. Allow the existing publication transaction to skip immediate analysis scheduling for batch automation while preserving the normal API behavior.
2. Add one small publishing-service operation for queuing an analysis run with an explicit affected date range.
3. After each file is validated, automatically publish only reports with zero critical and zero warning findings.
4. At batch completion, queue one analysis run per affected fund using the minimum and maximum automatically published valuation dates.
5. Preserve idempotency, version replacement rules, audit records, lease transaction behavior, and failure rollback.
6. Run the focused tests and then the full backend test suite.

### Task 3: Make manual publication discoverable

**Files:**
- Modify: `frontend/src/pages/Reviews.tsx`
- Modify: `frontend/src/api/reviews.ts` only if request typing needs it
- Modify: `backend/tests/api/test_reviews.py`

**Steps:**

1. Add a `publishable` filter to the review page.
2. Add a visible publish action for publishable versions, requiring an audit reason and explicit warning confirmation when applicable.
3. Ensure the existing pending-review flow passes warning confirmation when a reviewed version also contains warnings.
4. Add API regression coverage for the publishable path and warning confirmation.
5. Run frontend type-check/build and focused API tests.

### Task 4: Review and document the mail repair

**Files:**
- Review existing changes: `backend/app/api/mail.py`, `backend/tests/mail/test_sync.py`, `deploy/compose.dev.yml`, `deploy/compose.prod.yml`, `docs/runbook.md`, `frontend/src/pages/Mail.tsx`
- Modify: `README.md`, `docs/API接口说明.md`, `docs/产品与功能范围.md` if behavior wording is now stale

**Steps:**

1. Verify the specified session's changes contain no secret values and preserve the existing credential isolation contract.
2. Keep API and worker on a non-internal egress network while retaining the internal database network.
3. Keep safe error classification and redacted logging; do not log credential contents.
4. Document that the runtime API uses the controlled secret file and that the production network must permit IMAP egress.

### Task 5: Quality gate and commit

**Files:**
- All files changed above

**Steps:**

1. Run backend tests, frontend checks, Ruff, ty, and `git diff --check`.
2. Review the final diff for secrets, unrelated artifacts, and accidental production-data changes.
3. Commit one coherent change with an informative message.

