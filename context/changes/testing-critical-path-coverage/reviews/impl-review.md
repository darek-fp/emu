<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testing critical path coverage

- **Plan**: context/changes/testing-critical-path-coverage/plan.md
- **Scope**: Phase 1 of 3 (full plan review)
- **Date**: 2026-08-05
- **Verdict**: REJECTED
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — `create_reservation_locked` RPC bypasses reservation RLS with no internal authz

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260804220000_add_reservation_capacity_lock.sql:8-88
- **Detail**: The function is `SECURITY DEFINER` and `GRANT EXECUTE ... TO authenticated`. The existing `reservations_insert` RLS policy (supabase/migrations/20260622000004_update_reservations_sector_rls.sql) requires `operator_has_sector_access(sector_id)`, but `SECURITY DEFINER` runs the function's own `INSERT` with the function owner's privileges, bypassing that RLS policy entirely. The function itself performs no `auth.uid()` check, no sector-assignment check, and trusts caller-supplied `p_created_by_operator_id` and `p_price_total` verbatim. `src/pages/api/reservations.ts` enforces operator/sector-assignment/pricing checks before calling the RPC, but Supabase RPCs are exposed directly via PostgREST — any authenticated user holding a valid JWT can call `supabase.rpc('create_reservation_locked', {...})` directly from a browser/script, bypassing the Astro route entirely, and: (1) create reservations for sectors they aren't assigned to, (2) impersonate any `created_by_operator_id`, (3) set an arbitrary `price_total`. This closes the concurrency/overbooking bug the plan targeted but reopens a broader authorization hole that predates this change (the plain `INSERT` this replaced was RLS-protected; this RPC is not).
- **Fix A ⭐ Recommended**: Enforce authorization inside the function body before the capacity check — verify `auth.uid()` resolves to an active operator matching `p_created_by_operator_id`, and call the existing `operator_has_sector_access(p_sector_id)` helper (or equivalent), raising an exception if either check fails.
  - Strength: Reuses the helper function already established as the codebase's RLS-bypass-safe authorization pattern (`operator_has_sector_access`, used by the reservations RLS policies themselves); closes the gap for every caller, not just this API route.
  - Tradeoff: Duplicates a subset of the checks `reservations.ts` already performs; two places to keep in sync if authorization rules change.
  - Confidence: HIGH — `auth.uid()` and `operator_has_sector_access()` work identically inside `SECURITY DEFINER` functions (they read the request JWT, not table state), and this is the same pattern the RLS policies already rely on.
  - Blind spot: Haven't verified whether other existing `SECURITY DEFINER` functions in this codebase (e.g. `is_admin()`, `operator_has_sector_access()`) are meant to be called directly by clients or only used internally by policies — worth confirming GRANT scope conventions before replicating.
- **Fix B**: Drop `SECURITY DEFINER` and rely on the existing `reservations_insert` RLS policy to gate the `INSERT`, keeping the `SELECT ... FOR UPDATE` lock under the caller's own privileges.
  - Strength: No duplicated authorization logic — one source of truth (RLS policies).
  - Tradeoff: Requires verifying the `sectors` table's own RLS/grants allow the calling role to `SELECT ... FOR UPDATE`, and that a non-`SECURITY DEFINER` function still gets atomic lock+insert semantics — unverified, larger blast radius.
  - Confidence: MEDIUM — plausible but not confirmed against `sectors` table RLS in this review.
  - Blind spot: Have not read `sectors` table RLS policies to confirm the lock step would still succeed for a non-elevated role.
- **Decision**: DEFERRED — tracked in new change `reservation-rpc-authz-hardening` (context/changes/reservation-rpc-authz-hardening/change.md)

### F2 — Only `P0001` is mapped to a client error; other RPC errors collapse to 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/reservations.ts:131-145
- **Detail**: `create_reservation_locked` also raises `P0002` for "sector not found," but the handler only branches on `P0001`; every other error code (including `P0002`) returns a generic 500 instead of a more accurate 404.
- **Fix**: Add a `switch`/additional `if` on `rpcResp.error?.code` mapping `P0002` to 404 (`"Sector not found"`), keeping the existing 500 fallback for unmapped codes.
- **Decision**: DEFERRED — tracked in new change `reservation-review-followups` (context/changes/reservation-review-followups/change.md)

### F3 — Integration test `afterAll` cleanup ignores errors, risking orphaned fixtures

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/concurrency.reservations.test.ts:79-86
- **Detail**: `afterAll` deletes reservations/assignments/operator/user/pricing-tier/sector but never checks the `{ error }` each Supabase call returns. A failed delete (e.g. an FK constraint) silently leaves orphaned rows in the local DB across test runs instead of failing loudly.
- **Fix**: Capture and assert (or at least `console.error`) the `error` from each cleanup call so a failed teardown is visible instead of silent.
- **Decision**: DEFERRED — tracked in new change `reservation-review-followups` (context/changes/reservation-review-followups/change.md)

### F4 — Second test depends on first test's fixture state; `vi.doUnmock` not in `finally`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/concurrency.reservations.test.ts:97-157
- **Detail**: The second `it` block ("reports the pricing_tier id...") only passes because the first test already inserted a reservation — it isn't independently seeded, so reordering or running it in isolation breaks it. Separately, `vi.doUnmock("@/lib/supabase")` at the end of the first test only runs if every preceding assertion passes; if an `expect` throws first, the mock of `@/lib/supabase` leaks into later tests in the same file/run.
- **Fix**: Wrap the mock/unmock pair in `try { ... } finally { vi.doUnmock(...) }`, and either merge the tier assertion into the first test or seed its own fixture row independently.
- **Decision**: DEFERRED — tracked in new change `reservation-review-followups` (context/changes/reservation-review-followups/change.md)

### F5 — `scripts/test-integration.*` don't tear down the local stack by default

- **Severity**: ⚪ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: scripts/test-integration.ps1, scripts/test-integration.sh
- **Detail**: The plan's contract says the scripts should start the DB, run tests, and "teardown." Both scripts only stop the local Supabase stack when an explicit `-StopAfter` / `STOP_AFTER=1` flag is passed; by default the stack keeps running after the script exits. This is a reasonable local-dev default (avoids restart cost on repeated runs) but diverges from the plan's literal wording.
- **Fix**: Either update the plan/README to note teardown is opt-in, or flip the default to tear down and require an explicit `-KeepRunning` flag if that's preferred.
- **Decision**: DEFERRED — tracked in new change `reservation-review-followups` (context/changes/reservation-review-followups/change.md)
