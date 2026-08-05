# Testing critical path coverage Implementation Plan

## Overview

Add targeted unit and integration tests to prevent two critical risks:
- Risk #2: Overbooking due to concurrent reservation requests
- Risk #3: Pricing calculation regressions

Plan delivers parametrized unit tests for pricing (CI-gated) and local, Docker-backed integration tests that prove reservation creation is transactionally safe under concurrent attempts.

## Current State Analysis

- Pricing logic lives in src/lib/services/pricingService.ts and already has unit tests under src/lib/services/pricingService.test.ts.
- Reservation creation handler (src/pages/api/reservations.ts) inserts without a DB-level lock/transaction that guarantees availability checks + insert are atomic.
- CI currently does not run tests; no coverage thresholds are configured.

## Desired End State

- PricingService has parametrized unit tests that verify expected totals against independent fixtures for representative windows and discount combinations.
- A local integration test harness (Docker Postgres) runs a deterministic concurrency scenario where two simultaneous reservation attempts for the same slot produce one success (201) and one conflict (409), proving transactional protection.
- Unit tests are required in CI; integration tests are documented and runnable locally on-demand.

### Key Discoveries:

- Pricing implementation: src/lib/services/pricingService.ts (good unit test foundations)
- Reservation handler lacks SELECT FOR UPDATE-style transaction; sector availability checks are non-atomic (risk of overbooking).
- Test infra: Vitest is configured; package.json scripts include `test` and `test:run` but CI does not invoke them.

## What We're NOT Doing

- Not gating heavy integration tests in CI (these remain local-on-demand per plan choices).
- Not adding UI E2E tests as part of this change.

## Implementation Approach

- Keep pricing correctness fast and deterministic via parametrized unit tests.
- Prove concurrency safety with focused integration tests run against a local Docker Postgres (or Supabase CLI) instance; make the reservation handler transactionally safe using a DB-level lock (SELECT FOR UPDATE on the sector/availability row) as the recommended fix.
- Update CI to run unit tests and fail on regressions; provide clear docs and scripts for running integration tests locally.

## Critical Implementation Details

- Integration tests run locally only. Use Docker Compose (Postgres) or the local Supabase CLI to start a DB, then run migrations before tests.
- Tests must use idempotent setup/teardown and include retry logic in fixtures to reduce flakiness (start/retry DB startup, clean database state between runs).
- Concurrency test orchestration: spawn N parallel clients with deterministic timing; assert one success and one failure for the targeted race window.

## Phase 1: Pricing unit tests

### Overview
Parametrized unit tests that verify calculatePrice() across representative windows, discounts, rounding, and floor rules.

### Changes Required:

#### 1. Unit tests for pricingService

**File**: `src/lib/services/pricingService.test.ts` (augment or add `pricingService.unit.test.ts`)

**Intent**: Add parametrized test table of {arrival, departure, discounts, expected_total} using an independent reference calculation (fixture) to avoid mirroring implementation logic.

**Contract**: `calculatePrice(input) -> numeric(10,2)` invariant must match the independent fixture outputs for supplied vectors. Tests use Vitest `it.each` / `describe.each` style.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test` (Vitest) — gated in CI
- Type checks pass: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Reviewer runs `npm run test` locally and inspects a sample set of parametrized vectors for correctness

**Implementation Note**: Pause for human confirmation after Phase 1 automated checks pass before changing reservation handler.

---

## Phase 2: Local integration tests for reservation concurrency

### Overview
Create a local integration harness (Docker Postgres or Supabase CLI) and a focused test that simulates concurrent reservation creation attempts to verify transactional safety.

### Changes Required:

#### 1. Integration test harness & concurrency test

**File**: `tests/integration/concurrency.reservations.test.ts`

**Intent**: Implement test that starts the local DB, applies migrations, and runs two simultaneous POST `/api/reservations` requests for the same sector/time window. Assert exactly one 201 and one 409 (or defined overbook error).

**Contract**: Test runner invokes migrations, starts the API in test mode, and issues concurrent HTTP requests. The handler must use a DB transaction with `SELECT FOR UPDATE` on the sector/availability row before inserting.

#### 2. Test infra scripts

**File**: `scripts/test-integration.ps1` (Windows) / `scripts/test-integration.sh` (cross-platform)

**Intent**: Convenience script to: start docker-compose (Postgres), wait for DB, run migrations, run `npm run test:integration`, then teardown.

**Contract**: `scripts/test-integration.*` exit code 0 on success. Document how to run locally in README/test-docs.

### Success Criteria:

#### Automated Verification:

- Integration test passes locally: `npm run test:integration` (manual/local-only)
- Migrations apply cleanly in the harness

#### Manual Verification:

- Developer runs test script locally and confirms that concurrent attempts yield one success and one conflict
- Inspect DB state to confirm no double bookings

---

## Phase 3: Docs, CI updates, and handoff

### Overview
Make unit tests mandatory in CI, document integration runbook, and provide a manual verification checklist for reviewers.

### Changes Required:

#### 1. CI updates

**File**: `.github/workflows/ci.yml`

**Intent**: Add a step to run `npm run test:run` (Vitest) after build/lint. Do NOT run heavy integration tests in CI by default.

**Contract**: CI step `Run unit tests` must run `npm run test:run -- --runInBand` (or project equivalent) and fail the workflow on non-zero exit.

#### 2. Docs & scripts

**File**: `context/changes/testing-critical-path-coverage/README.md` (or update the change folder README)

**Intent**: Document how to run integration tests locally (Docker compose commands, env variables, running migrations, running test script) and include the manual verification checklist.

### Success Criteria:

#### Automated Verification:

- CI shows unit tests run and pass on the change branch

#### Manual Verification:

- Developer follows docs and successfully runs integration concurrency test locally
- Reviewer verifies manual checklist during PR review

---

## Testing Strategy

### Unit Tests

- Parametrized vectors for pricingService covering fractional-day rounding, discount steps, floor application, and timezone/edge-case sample windows.
- Negative tests for invalid inputs.

### Integration Tests

- Focused concurrency test simulating parallel reservation attempts. Repeatable, deterministic orchestration with low concurrency (2–4 clients) per planning choices.
- Migration + seed step must be included in test harness.

### Manual Testing Steps

1. Start DB: `scripts/test-integration.sh` / `scripts/test-integration.ps1`
2. Run `npm run test:integration` locally
3. Confirm one success + one conflict in the concurrency test logs
4. Query DB to ensure only one reservation exists for the window

## Performance Considerations

- Integration concurrency tests will run locally and should use low concurrency (2–4) to keep runs fast and deterministic.
- CI remains fast because only unit tests run there.

## Migration Notes

- Running migrations in the integration harness must reflect production migrations; ensure migration scripts are idempotent and test DB is cleaned between runs.

## References

- Research: `context/changes/testing-critical-path-coverage/research.md`
- Pricing service: `src/lib/services/pricingService.ts`
- Reservation handler: `src/pages/api/reservations.ts`
- Existing integration tests: `tests/integration/reservations.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pricing unit tests

#### Automated

- [x] 1.1 Add parametrized unit tests for pricingService — 4a89765
- [x] 1.2 Ensure unit tests run and pass in CI - cd3d708

#### Manual

- [x] 1.3 Reviewer verifies sample vectors locally

### Phase 2: Local integration tests for reservation concurrency

#### Automated

- [x] 2.1 Provide Docker test-harness and migration runner — e5f1939
- [x] 2.2 Add concurrency integration test that demonstrates single-success/one-fail behavior — e5f1939

#### Manual

- [x] 2.3 Developer runs integration script locally and confirms DB state — e5f1939

### Phase 3: Docs & CI updates

#### Automated

- [x] 3.1 Update CI to run unit tests

#### Manual

- [x] 3.2 Add runbook/docs and manual verification checklist
