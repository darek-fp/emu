# Testing critical path coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

We need to prevent two high-risk regressions: (1) overbooking from concurrent reservation requests and (2) pricing calculation errors. The plan adds parametrized unit tests for pricing correctness and local, Docker-backed integration tests that prove reservation creation is transactionally safe.

## Starting Point

- Pricing logic exists in `src/lib/services/pricingService.ts` and has unit tests.
- Reservation creation (POST `/api/reservations`) currently inserts without a DB-level lock and can race.
- Vitest is configured; CI currently does not run tests.

## Desired End State

- Parametrized unit tests (Vitest) assert pricing outputs against independent fixtures.
- A local integration harness (Docker Postgres) runs a deterministic concurrency scenario: two simultaneous reservation attempts result in one success and one conflict, proving transactional protection.
- CI runs unit tests; integration tests remain local-on-demand with clear runbook.

## Key Decisions Made

| Decision                      | Choice                                                       | Why (1 sentence)                             | Source  |
|-------------------------------|--------------------------------------------------------------|-----------------------------------------------|---------|
| Test scope                    | Reservations + Pricing (unit + integration) ⭐ Recommended     | Covers both critical risks end-to-end         | Plan    |
| Integration execution         | Local-on-demand only                                          | Keeps CI fast while allowing high-fidelity local verification | Plan    |
| DB for integration            | Docker Postgres + migrations (local) ⭐ Recommended           | Mirrors production semantics for transactions | Plan    |
| CI gating                     | Unit tests gated; integration tests not gated                | Fast CI feedback while preserving local fidelity | Plan    |
| Concurrency level for tests   | Low (2–4 clients)                                             | Deterministic, fast, sufficient to reveal race windows | Plan    |
| Flakiness mitigation          | Retry + idempotent teardown in fixtures ⭐ Recommended        | Reduces false positives in local runs         | Plan    |

## Scope

**In scope:**
- Parametrized unit tests for pricingService
- Local integration concurrency test harness and scripts
- CI update to run unit tests and fail on regressions
- Documentation/runbook for running integration tests locally

**Out of scope:**
- CI-gating heavy integration tests (left local-on-demand)
- E2E UI-driven reservation tests

## Architecture / Approach

- Pricing: fast, deterministic unit tests using Vitest. Use an independent expected-value fixture to avoid mirroring implementation.
- Reservation concurrency: run two parallel clients against the API with a Docker Postgres database. The recommended fix is to perform availability checks and insertion inside a DB transaction using `SELECT FOR UPDATE` (or equivalent) to avoid overbooking.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. Pricing unit tests | Parametrized unit vectors and CI gating for pricingService | Missing edge cases in price calc |
| 2. Local integration tests | Docker harness + concurrency test proving single-success behaviour | Flaky local runs or infra friction |
| 3. Docs & CI | CI runs unit tests; docs + runbook for local integration runs | Developers miss running local tests before merge |

**Prerequisites:** local Docker (or Supabase CLI) available; migrations runnable locally; developer access to run scripts.
**Estimated effort:** ~1–2 developer-days: pricing unit tests (0.5–1d), integration harness + concurrency test (0.5–1d), docs/CI tweaks (0.25–0.5d).

## Open Risks & Assumptions

- CI does not currently expose SUPABASE_URL / SUPABASE_KEY for spawning a Supabase instance; integration will be local-only unless CI secrets / infra are added.
- SELECT FOR UPDATE changes may affect performance under high write load; assumption: current scale tolerates row-level locking on sector rows.

## Success Criteria (Summary)

- Unit tests for pricingService are added and pass in CI.
- Local integration concurrency test reliably demonstrates one success and one conflict for concurrent booking attempts.
- Documentation and scripts allow any developer to reproduce the concurrency test locally.
