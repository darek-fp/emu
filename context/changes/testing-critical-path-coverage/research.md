---
date: 2026-08-04T14:48:09.140+02:00
researcher: "Darek Sowada"
git_commit: b5a9fd11eaad17aa00462aff45facf1dbacb8593
branch: main
repository: "darek-fp/emu"
topic: "testing-critical-path-coverage"
tags: [research, testing, reservations, pricing, integration]
status: complete
last_updated: 2026-08-04
last_updated_by: "Darek Sowada"
---

# Research: testing-critical-path-coverage

**Date**: 2026-08-04T14:48:09.140+02:00
**Researcher**: Darek Sowada
**Git Commit**: b5a9fd11eaad17aa00462aff45facf1dbacb8593
**Branch**: main
**Repository**: darek-fp/emu

## Research Question

How to ensure critical-path coverage for two risks recorded in context/changes/testing-critical-path-coverage/change.md:
- Risk #2: Two concurrent reservations cannot both succeed (overbooking)
- Risk #3: Pricing calculation correctness (matches independent calculations across windows)

## Summary

- Test framework: Vitest (package.json scripts: `test`, `test:run`). Existing unit tests for pricing and integration tests for reservations are present.
- Code findings: pricing logic implemented in src/lib/services/pricingService.ts (unit tests exist). Reservation creation occurs in src/pages/api/reservations.ts with no DB transaction/locking — overbooking race is possible.
- CI gap: .github/workflows/ci.yml runs build/lint but does not run tests. No coverage configuration found.
- Recommendation: add targeted integration tests that run against a real Postgres/Supabase instance to validate transactionally-protected reservation creation, plus parametrized unit tests for pricing; update CI to run tests and (optionally) coverage for critical modules.

## Detailed Findings

### Tests & CI
- Test framework and scripts (package.json): `npm run test` → Vitest; `npm run test:run` for CI.
  - Permalink: https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/package.json
- Vitest config: vitest.config.ts includes test patterns (see config around line 8).
  - Permalink: https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/vitest.config.ts#L1
- Coverage: no coverage tool/config detected (nyc/c8/.coverage). Consider enabling Vitest coverage provider and thresholds for critical modules.
- CI: .github/workflows/ci.yml runs install, lint, and build but does not run tests. Add a test step after services/migrations are ready.
  - Permalink: https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/.github/workflows/ci.yml#L1

### Reservation & transaction risks
- Reservation creation handler: src/pages/api/reservations.ts inserts reservations without transactional locking or "SELECT FOR UPDATE" style row locks. Race condition risk exists if multiple concurrent requests observe availability and insert simultaneously.
  - Permalink: https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacf1dbacb8593/src/pages/api/reservations.ts#L11-L157
- Sector-level availability checks compute concurrency in application memory (src/lib/services/sectorService.ts) but are not used atomically with inserts.
  - Permalink: https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/src/lib/services/sectorService.ts#L19-L110
- Repo plans mention SELECT FOR UPDATE as an intended protection (context/changes/core-domain-schema/plan-brief.md) but not implemented.
  - Permalink: https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/context/changes/core-domain-schema/plan-brief.md#L21

### Pricing calculation
- Pricing logic implemented in src/lib/services/pricingService.ts; robust unit tests exist under src/lib/services/pricingService.test.ts exercising fractional-day rounding, floors, tiering, and discounts. These are good foundations for correctness tests.
  - Permalink: https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/src/lib/services/pricingService.ts#L43-L120
  - Tests: https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/src/lib/services/pricingService.test.ts

## Code References
- src/pages/api/reservations.ts: reservation POST handler (inserts reservation without transaction) — see lines ~11-157
  - https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/src/pages/api/reservations.ts#L11-L157
- src/lib/services/pricingService.ts: calculatePrice & helpers — see lines ~43-120
  - https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/src/lib/services/pricingService.ts#L43-L120
- src/lib/services/pricingService.test.ts: unit tests exercising pricing rules
  - https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/src/lib/services/pricingService.test.ts
- tests/integration/reservations.test.ts: existing integration-style tests around the reservation endpoint (simulate handler + assertions)
  - https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/tests/integration/reservations.test.ts
- .github/workflows/ci.yml: current CI doesn't run tests; add test steps and service startup
  - https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacf1dbacb8593/.github/workflows/ci.yml#L1
- context/changes/testing-critical-path-coverage/change.md: change intent and planned test types
  - https://github.com/darek-fp/emu/blob/b5a9fd11eaad17aa00462aff45facf1dbacb8593/context/changes/testing-critical-path-coverage/change.md

## Architecture Insights
- The codebase favors handler-level API routes (Astro/SSR pages as API endpoints) and service helpers for domain logic (pricingService, sectorService). Business rules are implemented in services but availability enforcement lacks DB-atomic operations.
- Recommended pattern: enforce availability with a DB-level transaction that locks the relevant sector/resource row (SELECT FOR UPDATE) and updates/validates counts within the same transaction; fall back to application-level optimistic locking only if DB-level locking is impossible.

## Historical Context
- The change's notes (context/changes/testing-critical-path-coverage/change.md) call out Risk #2 and #3 and intend unit + integration tests; this matches the code/test coverage findings (pricing unit tests present; integration tests present but may not prove transactional safety).
- A prior plan recommended SELECT FOR UPDATE for overbooking protection but it's not implemented (context/changes/core-domain-schema/plan-brief.md).

## Recommendations (next steps)
1. Add an integration test that simulates concurrent reservation attempts against a real Postgres/Supabase DB:
   - Start two parallel clients that attempt to create a reservation for the same sector/slot simultaneously and assert only one succeeds and the other fails with 409/overbook error.
   - Implement the handler change to perform the reservation insert inside a DB transaction with proper row locking (SELECT FOR UPDATE on sector or availability row) before asserting availability and inserting.
2. Harden pricing tests:
   - Add parametrized unit tests that compute expected totals using an independent calculation fixture (not derived from implementation) for sample windows, including discounts and rounding edge cases.
3. CI updates:
   - Modify .github/workflows/ci.yml to start a Supabase/Postgres service (or run supabase CLI), apply migrations/seeds, then run `npm run test:run -- --threads=false`.
   - Add coverage for pricingService and reservation integration tests; set thresholds for these critical modules.
4. Short-term mitigation: if DB transaction change cannot be landed immediately, add hermetic tests simulating mid-sequence failures and ensure the API returns a safe error and reconciler monitors for overbooking.

## Example test sketches
- Concurrent reservation integration (Vitest + node-postgres or supabase-js):
  - Pseudocode: spawn two async requests to POST /api/reservations with same sector/time; await both; expect one 201 and one 409.
- Pricing unit parametrized tests (Vitest): provide arrays of {arrival, departure, discounts, expected_total} and assert calculatePrice(input) === expected_total.

## Open Questions
- Are DB-level migrations and Supabase secrets available in CI (SUPABASE_URL, SUPABASE_KEY)? current CI build references secrets for build but not tests — confirm.
- Is altering reservation handler to use SELECT FOR UPDATE acceptable for performance at scale, or is an optimistic approach preferred?

## Related Research
- context/changes/core-domain-schema/plan-brief.md — contains a note recommending `SELECT FOR UPDATE` for overbooking protection.
- context/foundation/test-plan.md — general guidance for test rollout and integration gating.


---

(End of research draft.)
