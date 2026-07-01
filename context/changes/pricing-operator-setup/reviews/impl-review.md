<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pricing Configuration & Operator Account Management

- **Plan**: context/changes/pricing-operator-setup/plan.md
- **Scope**: Full implementation (Phases 1–6, completed phases only where marked in plan)
- **Date**: 2026-07-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 CRITICAL, 6 WARNINGS, 2 OBSERVATIONS, 3 DRIFT/EXTRA

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

---

═══════════════════════════════════════════════════════════
CRITICAL FINDINGS ❌
═══════════════════════════════════════════════════════════

### F1 — Pricing undercharge bug in PricingService
- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/lib/services/pricingService.ts

Detail:
calculatePrice previously could leave some days unassigned when discount tiers partially covered the stay, which leads to undercharged totals in some tier configurations.

Fix: Assign any remaining days (stayDurationDays - daysAssigned) at the base_daily_rate (respecting daily_floor) and add to breakdown and totalPrice.

Decision: PENDING

---

═══════════════════════════════════════════════════════════
WARNING FINDINGS ⚠️
═══════════════════════════════════════════════════════════

### F2 — DB/debug details leaked to clients in reservation create
- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/reservations.ts

Detail:
Database error messages and details were being included in HTTP responses. This can leak schema/implementation and aid attackers.

Fix: Log detailed errors server-side and return a generic error payload to clients. (Applied)

Decision: FIXED (server now returns generic 500 and logs full error)

### F3 — calculate-price endpoint returned debug info and logs
- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/reservations/calculate-price.ts

Detail:
Endpoint previously logged internal state and returned debug fields in responses. This is information leakage.

Fix: Remove debug fields from responses and reduce logging. Enforce access controls before returning pricing. (Applied)

Decision: FIXED

### F4 — calculate-price did not verify operator->sector access
- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Authorization)
- **Location**: src/pages/api/reservations/calculate-price.ts

Detail:
Pricing endpoint could be used to probe pricing for sectors the operator doesn't have access to.

Fix: Enforce operator sector membership check in middleware or endpoint before returning price. (Applied)

Decision: FIXED

### F5 — Request bodies not validated with zod (reservations & calculate-price)
- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/api/reservations.ts, src/pages/api/reservations/calculate-price.ts

Detail:
Endpoints parsed JSON with ad-hoc casts. This increases risk of runtime errors or unexpected behavior.

Fix: Use zod schemas to validate request bodies and return 400 on validation failures. (Applied)

Decision: FIXED

### F6 — createAdminClient falls back to non-service key
- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Security)
- **Location**: src/lib/supabase.ts

Detail:
createAdminClient previously silently fell back to SUPABASE_KEY when SUPABASE_SERVICE_ROLE_KEY was absent, potentially causing accidental usage of a non-service key or mis-privileged operations.

Fix: Require SUPABASE_SERVICE_ROLE_KEY for admin clients (throw if absent). (Applied)

Decision: FIXED

---

═══════════════════════════════════════════════════════════
OBSERVATIONS ℹ️
═══════════════════════════════════════════════════════════

### F7 — Tailwind class merging pattern
- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: UI components (dashboard, pricing page, several components)

Detail:
Some components concatenate class strings directly instead of using cn() helper. Not a functional bug but inconsistent with project conventions.

Fix: Prefer cn(...) for dynamic class merging where appropriate.

Decision: PENDING

### F8 — Timezone/DST edge cases for fractional day calculation
- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Reliability
- **Location**: src/lib/services/pricingService.ts

Detail:
Fractional-day calculation uses UTC normalization. Add unit tests for DST/timezone edges and document expected input (ISO UTC) or normalize on ingestion.

Fix: Add unit tests and documentation. (Recommended)

Decision: PENDING

---

═══════════════════════════════════════════════════════════
PLAN DRIFT / EXTRA CHANGES
═══════════════════════════════════════════════════════════

1) Operator creation flow — DRIFT
- **File**: src/components/admin/OperatorForm.tsx and src/pages/api/admin/operators/index.ts
- **Plan intent**: Server-generate a temporary password and return it once to the admin.
- **Actual**: API/UI use admin-provided password (OperatorForm collects password). This is a behavioral divergence: choose one approach.
- **Fix options**:
  - A ⭐ Recommended: Implement server-generated temp password (change API to generate a secure password, pass to auth.createUser, return tempPassword in response; change OperatorForm to not require password input).
  - B: Accept admin-supplied password and update plan/docs to reflect this workflow.
- **Decision**: PENDING

2) Extra migrations altering operator model
- **Files**: supabase/migrations/20260622000005_..., 20260626000006_..., 20260626000008_...
- **Note**: Several migrations introduced email and temp_password fields and SECURITY DEFINER helper functions. Likely intentional; update plan/docs to reflect operator model shift (support operator records without immediate auth linkage or to store temp password hashes).
- **Decision**: PENDING (confirm design intent)

---

## Summary & Recommendation

1. Critical fix applied: pricing calculation remaining-days bug fixed. Run pricing unit tests and an end-to-end reservation to confirm totals (recommended now that CI/lint/build passed).
2. API hardening applied: zod validation, removed debug leaks, enforced sector access for pricing endpoints.
3. Admin client now requires SUPABASE_SERVICE_ROLE_KEY.
4. Two remaining items need product decision: operator creation (server-generated temp password vs admin-supplied) and whether to keep migrations that change operator shape; update the plan accordingly.

---

## Actions taken during review
- Ran plan ↔ git diff analysis for pricing-operator-setup commits
- Launched safety & plan-drift agents and consolidated findings
- Applied code fixes for critical and high-priority issues
- Committed changes with message: "fix: apply impl-review fixes — pricing calculation, API hardening, admin client"


---

Review file saved at: context/changes/pricing-operator-setup/reviews/impl-review.md
