---
change_id: reservation-review-followups
title: Address remaining warnings from testing-critical-path-coverage implementation review
status: new
created: 2026-08-05
updated: 2026-08-05
archived_at: null
---

## Notes

Follow-up fixes for the WARNING and OBSERVATION findings (F2–F5) from the implementation review of testing-critical-path-coverage. F1 (CRITICAL, RLS bypass) is tracked separately in context/changes/reservation-rpc-authz-hardening/. Full finding detail: context/changes/testing-critical-path-coverage/reviews/impl-review.md.

- F2 (WARNING, src/pages/api/reservations.ts:131-145): only Postgres error code P0001 is mapped to a client response (409); create_reservation_locked also raises P0002 for "sector not found," which currently collapses to a generic 500. Fix: branch on rpcResp.error?.code and map P0002 to 404 ("Sector not found"), keeping the existing 500 fallback for unmapped codes.

- F3 (WARNING, tests/integration/concurrency.reservations.test.ts:79-86): afterAll cleanup deletes reservations/assignments/operator/user/pricing-tier/sector but never checks the returned { error } from each Supabase call, so a failed delete silently orphans fixture rows across test runs. Fix: capture and assert (or at minimum console.error) the error from each cleanup call.

- F4 (WARNING, tests/integration/concurrency.reservations.test.ts:97-157): the second it() block ("reports the pricing_tier id...") depends on fixture state left behind by the first test rather than seeding its own data, so it breaks if run in isolation or reordered. Separately, vi.doUnmock("@/lib/supabase") at the end of the first test only runs if every preceding assertion passes, so a failed assertion leaks the mock into later tests. Fix: wrap the mock/unmock pair in try/finally, and either merge the tier assertion into the first test or seed an independent fixture for it.

- F5 (OBSERVATION, scripts/test-integration.ps1 / scripts/test-integration.sh): the plan's contract implies the scripts start the DB, run tests, then tear down, but both scripts only stop the local Supabase stack when an explicit -StopAfter / STOP_AFTER=1 flag is passed — by default the stack keeps running after the script exits. Decide whether to flip the default to tear down (with an explicit opt-out flag to keep it running) or update the plan/README to document that teardown is opt-in.
