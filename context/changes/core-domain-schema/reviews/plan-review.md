<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Core Domain Schema Implementation Plan

- **Plan**: context/changes/core-domain-schema/plan.md
- **Mode**: Deep
- **Date**: 2026-06-08
- **Verdict**: REVISE
- **Findings**: 1 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | FAIL |
| Plan Completeness | PASS |

## Grounding

4/6 key paths exist: `supabase/config.toml` ✓, `supabase/seed.sql` ✓, `src/middleware.ts` ✓, `src/lib/supabase.ts` ✓. Missing (expected): `supabase/migrations/` (to be created), `src/database.types.ts` (to be generated). Middleware role resolution from `app_metadata.role` ✓. Helper functions not yet present in codebase (expected, will be created in Phase 1).

## Findings

### F1 — Roadmap expects `spots` but plan omits it

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase overview / roadmap cross-check
- **Detail**: The project roadmap (`context/foundation/roadmap.md`) and PRD references list a `spots` table with sector FK for per-spot reservation tracking. This plan intentionally omits `spots` in favor of `sectors.spot_count` and count-based overbooking. Downstream slices (S-01, S-03) mention spots in the outcome summary, creating misalignment. Skipping `spots` now risks requiring a disruptive schema migration mid-project if the UX later needs per-spot tracking.
- **Fix A ⭐ Recommended**: Reconcile with product owners before proceeding. Either (1) confirm that overbooking is count-only (no per-spot reservation needed) and update roadmap language, or (2) include `spots` now as a Phase 1 addition.
  - Strength: Aligns schema with roadmap expectations; prevents late-stage migration.
  - Tradeoff: Adding `spots` increases schema scope and migration complexity.
  - Confidence: HIGH — roadmap text explicitly mentions spots.
  - Blind spot: Product owner's intent on per-spot vs. count-based UX not verified in this session.
- **Fix B**: Proceed without `spots` but add a documented migration path (out-of-scope TODO for S-01) and update roadmap language to clarify count-based model.
  - Strength: Keeps F-02 focused and faster.
  - Tradeoff: Leaves migration risk to downstream slices.
  - Confidence: MEDIUM — viable if product confirms no per-spot UX requirement.
  - Blind spot: May require disruptive schema migration if UX later needs spots.
- **Decision**: ACCEPTED — proceeding without immediate fix; risk accepted by reviewer.

### F2 — `current_user_role()` as SECURITY DEFINER: owner/privilege risk

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Helper functions migration
- **Detail**: The plan requires `current_user_role()` to be SECURITY DEFINER so it can read `auth.jwt()` in RLS policy evaluation context. SECURITY DEFINER functions execute with the function owner's privileges, which can pose security risks if the owner is overly privileged or search_path is not properly constrained. The plan does not specify function owner, explicit privilege checks, or tests to validate RLS-context behavior with the helper.
- **Fix**: Add to Phase 1 implementation: (1) set function owner to a restricted role (supabase_owner or postgres), (2) add `SET search_path = public` inside the function to prevent search-path injection, (3) document and add a manual smoke test that confirms policy evaluation succeeds for admin/operator tokens and fails for anon.
  - Strength: Mitigates privilege escalation and search_path risks while preserving the helper abstraction.
  - Tradeoff: Requires documentation and testing discipline; must be preserved across deploys.
  - Confidence: MEDIUM — best practice but requires environment verification.
  - Blind spot: CI/deployment process must preserve function owner; reassignment during schema migrations could weaken security.
- **Decision**: ACCEPTED — proceeding without immediate fix; security posture to be validated during implementation.

### F3 — Overbooking flow lacks transaction pseudocode / concurrency proof

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 / Critical Implementation Details
- **Detail**: The plan prescribes SELECT FOR UPDATE on `sectors` to serialize concurrent reservation inserts but does not provide explicit transaction pseudocode or concurrency verification. Without the exact sequence (BEGIN; SELECT...FOR UPDATE; check count; conditional INSERT; COMMIT/ROLLBACK), implementers may write a non-atomic flow and observe race conditions under load or high contention.
- **Fix**: Add explicit transaction pseudocode to Phase 2 success criteria. Example:
  ```
  BEGIN;
  SELECT spot_count FROM public.sectors WHERE id = $sector_id FOR UPDATE;
  SELECT COUNT(*) FROM public.reservations 
    WHERE sector_id = $sector_id AND status != 'canceled' 
    AND (arrival_at, departure_at) OVERLAPS (requested_arrival, requested_departure);
  IF count < spot_count THEN 
    INSERT INTO reservations (...) RETURNING id; 
    COMMIT; 
  ELSE 
    ROLLBACK; 
  END IF;
  ```
  Document that overlaps() enforces atomicity and that lock contention under high concurrency is a known tradeoff (not mitigated in F-02, addressed in NFR testing).
  - Strength: Makes atomicity and lock semantics explicit and testable.
  - Tradeoff: Slightly prescriptive; may increase lock contention under peak load.
  - Confidence: HIGH — standard reliable serialization pattern.
  - Blind spot: Performance under high contention not measured; NFR testing in S-03 will verify.
- **Decision**: ACCEPTED — proceeding without immediate pseudocode; implementation to verify atomicity during S-03 availability feature.

### F4 — Generated TypeScript types & CI expectations

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 / Migration Notes
- **Detail**: Plan notes that `src/database.types.ts` should be generated and committed to the repo so CI passes without a running Supabase instance. However, Migration Notes and Success Criteria don't explicitly state the CI expectation or a step to generate-and-commit types before opening a PR.
- **Fix**: Add to Phase 3 Migration Notes: "After `npx supabase db reset` succeeds, generate types with `npx supabase gen types typescript --local > src/database.types.ts` and commit to the repository. CI will not run a Supabase instance — the generated file must be present for builds to pass."
- **Decision**: SKIPPED — noted but not critical; implementation will follow the stated contract.
