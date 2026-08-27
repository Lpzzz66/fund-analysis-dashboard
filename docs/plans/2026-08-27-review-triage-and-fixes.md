# Review Triage And Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify the supplied code-review findings against the current repository and implement only fixes for confirmed correctness, concurrency, security, performance, and user-visible state bugs.

**Architecture:** Preserve the existing SQLAlchemy, Alembic, React, and Ant Design patterns. Backend fixes will address invariants at the database or service boundary; frontend fixes will preserve current request and URL-state conventions. Findings that depend on an unverified product contract or would require broad redesign will be documented as not confirmed rather than changed speculatively.

**Tech Stack:** Python 3.12+, SQLAlchemy, Alembic, pytest, TypeScript, React, Ant Design, Vitest.

---

### Task 1: Establish the review baseline

**Files:**
- Inspect: `backend/app`, `backend/tests`, `frontend/src`, `frontend/package.json`
- Modify: `docs/plans/2026-08-27-review-triage-and-fixes.md`

**Step 1:** Map each reported issue to current code, migrations, tests, and database dialect support.

**Step 2:** Classify each item as confirmed, false positive, contract-dependent, or valid but nonessential.

**Step 3:** Record the confirmed fix set before editing implementation files.

**Review outcome:** Confirmed and addressed: H3, H4, H6, H7, M1, M2, M3, M7, M10, M12, M13, M14, M15, L1, L2, L3, L4, L5, L9, and L12. H2 has a real concurrency risk, but the proposed three-column unique constraint is incompatible with the existing evidence-change history behavior; analysis now serializes reconciliation per fund on PostgreSQL. H1 is already serialized by the existing PostgreSQL fund-row lock, while SQLite is rejected for production. H5, M4, M5, M6, M8, M9, M11, L6, L7, L8, and L10 are not changed because current code, tests, or product contracts do not establish the reported behavior as a bug. N-series items remain contract-dependent.

### Task 2: Fix confirmed backend data-integrity and hot-path issues

**Files:**
- Modify: `backend/app/imports/processor.py`
- Modify: `backend/app/db/models/analytics.py`
- Modify: `backend/app/publishing/service.py`
- Modify: `backend/app/api/catalog_shared.py`
- Modify: `backend/app/analytics/service.py`
- Create: `backend/alembic/versions/0007_review_integrity_fixes.py` when schema changes are required
- Test: focused backend regression tests under `backend/tests`

**Step 1:** Add regression coverage for alias exclusion, event reopening, released-detail guard query count where practical, and version allocation behavior.

**Step 2:** Implement fixes using the repository's existing transaction and migration conventions.

**Step 3:** Verify SQLite behavior and inspect PostgreSQL-specific paths before claiming concurrency coverage.

### Task 3: Fix confirmed mail-ingestion correctness and boundary validation

**Files:**
- Modify: `backend/app/mail/service.py`
- Modify: related mail models/API only if status or summary contracts require it
- Test: focused mail tests under `backend/tests`

**Step 1:** Add regression coverage for partial outcomes, attachment counters, filename bounds, received-date sanity, and source-message persistence on attachment failure.

**Step 2:** Implement only behavior supported by existing API and database contracts.

**Step 3:** Run the mail test subset and inspect public status rendering before adding a new persisted status.

### Task 4: Fix confirmed frontend request and URL-state bugs

**Files:**
- Modify: `frontend/src/pages/AdminAudit.tsx`
- Modify: `frontend/src/pages/AdminUsers.tsx`
- Modify: `frontend/src/pages/RiskOverview.tsx`
- Modify: `frontend/src/pages/FundDetail/index.tsx`
- Modify: `frontend/src/pages/Imports.tsx`
- Modify: `frontend/src/components/index.tsx`
- Modify: `frontend/src/utils/format.ts`
- Add or update: focused frontend tests beside existing test conventions

**Step 1:** Add regression coverage for debounced/search audit filtering, URL changes, tab parameter preservation, polling cleanup, and date/decimal formatting.

**Step 2:** Implement the smallest changes consistent with existing hooks and API helpers.

**Step 3:** Run TypeScript build and frontend tests.

### Task 5: Review and verify the complete change

**Files:**
- Inspect: all modified files and migration history

**Step 1:** Run backend lint, format check, and tests.

**Step 2:** Run frontend tests and build.

**Step 3:** Perform a five-axis review for correctness, readability, architecture, security, and performance; report confirmed findings, intentionally deferred findings, and any test gaps.
