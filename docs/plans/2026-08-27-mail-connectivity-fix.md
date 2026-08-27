# Mail Connectivity Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore production IMAP connectivity and expose safe, actionable mail connection errors.

**Architecture:** Keep the database on the internal backend network and attach API/worker to a separate egress network for outbound IMAP traffic. Correct the secret directory ownership for the non-root runtime user, then classify connection failures with stable safe error codes and map them in the UI.

**Tech Stack:** Docker Compose, FastAPI, Python standard logging, React/TypeScript, pytest.

---

### Task 1: Restore production network and secret permissions

**Files:** `deploy/compose.prod.yml`, `docs/runbook.md`

1. Add a non-internal egress network to `api` and `worker`, leaving database traffic on `backend`.
2. Define the egress network in Compose.
3. Restore UID/GID 10001 ownership in runbook secret setup commands.

### Task 2: Add safe backend diagnostics

**Files:** `backend/app/api/mail.py`, `backend/tests/mail/test_sync.py`

1. Add a module logger and log only stable error codes plus host/port, never credentials.
2. Return distinct safe details for unconfigured, credential-unavailable, timeout, DNS, and generic connection failures.
3. Add regression tests for the public error details and credential-unavailable path.

### Task 3: Show actionable frontend errors

**Files:** `frontend/src/pages/Mail.tsx`, `frontend/src/test/mail.test.tsx`

1. Use `ApiError` details from the API.
2. Map known safe mail error codes to Chinese user-facing messages and retain a generic fallback.
3. Add a focused UI test.

### Task 4: Verify

Run backend mail tests and frontend tests/build where dependencies are available, plus Compose config validation.
