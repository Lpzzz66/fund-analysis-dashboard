# UX Design Guide Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a durable, implementation-agnostic UX baseline for the fund valuation dashboard and connect it to the repository documentation.

**Architecture:** Derive user journeys, state semantics, permissions, safety boundaries, and accessibility requirements from the current frontend, backend, and authoritative docs. Keep visual and component choices open to the future designer while making data provenance and high-impact actions non-negotiable.

**Tech Stack:** Markdown documentation, React/TypeScript frontend, FastAPI/Python backend, PostgreSQL-backed jobs and versioned valuation data.

---

### Task 1: Establish the UX evidence base

**Files:**
- Read: `README.md`, `docs/*.md`, `frontend/README.md`
- Read: `frontend/src/app`, `frontend/src/pages`, `frontend/src/api`, `backend/app/api`, `backend/app/db/models`
- Read: `C:\Users\jzcan\.agents\skills\ui-ux-pro-max\SKILL.md` and relevant references

**Step 1:** Map roles, routes, version states, job states, data states, and high-impact operations from the repository.

**Step 2:** Search the UI/UX knowledge base for dashboard, workflow, accessibility, error recovery, navigation, and chart guidance.

**Step 3:** Record the evidence and separate current facts from future design recommendations.

### Task 2: Write the implementation-agnostic UX guide

**Files:**
- Create: `docs/UX设计指南.md`

**Step 1:** Define product positioning, user models, experience goals, and measurable success criteria.

**Step 2:** Specify information architecture, key journeys, state/feedback language, data-display rules, form/error behavior, and accessibility requirements.

**Step 3:** Explicitly mark non-negotiable safety/data boundaries and leave visual/component implementation choices open.

### Task 3: Connect and validate documentation

**Files:**
- Modify: `docs/README.md`
- Modify: `README.md`

**Step 1:** Add the UX guide to the documented entry points and correct any statements that enumerate the long-term documentation set.

**Step 2:** Search documentation for sensitive values, broken references, and claims that conflict with the current route/API/state model.

**Step 3:** Commit the guide and documentation index changes, then run the repository's proportional checks.

### Task 4: Independent consistency review

**Files:**
- Review: all tracked Markdown and code under the repository

**Step 1:** Dispatch an independent subagent to compare every document against code and report findings with severity and evidence.

**Step 2:** Correct documentation when code is authoritative; report code defects separately when the documentation expresses the intended product contract.

**Step 3:** Re-run consistency, status, and secret checks, commit any corrections, and verify the remote branch.

