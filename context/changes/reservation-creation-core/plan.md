# Reservation Creation Core Implementation Plan

## Overview

Implement a hardened, test-covered reservation creation flow: server + client validation, pricing calculation correctness, RLS-safe access checks, clean operator model (admin-supplied passwords), and UI behavior where the New Reservation form opens empty. Deliver a migration to remove temp_password fields and updates to API, pricingService, and tests.

## Current State Analysis

- Reservation flow works end-to-end after recent fixes, but some legacy migration fields (temp_password) and RLS helpers exist.
- PricingService bug fixed in prior change; remaining validation, migration alignment and UI polish remain.
- change scaffold exists at `context/changes/reservation-creation-core/change.md`.

## Desired End State

- New Reservation form opens empty and always resets on open.
- /api/reservations and /api/reservations/calculate-price validate inputs (zod) and return sanitized errors.
- PricingService covers all days and returns deterministic prices.
- Operator model simplified to admin-supplied password; temp_password fields removed via migration.
- Unit tests (pricingService) and integration API tests added.

### Key Discoveries

- RLS functions previously required parameter-name carefulness to avoid ambiguity; migrations must be applied carefully.
- Existing codebase uses zod for validation; follow pattern used in `src/pages/api/reservations.ts` and `calculate-price`.
- UI reset event pattern already implemented in ReservationForm; plan continues that pattern.

## What We're NOT Doing

- Implementing invite-link / email-based operator signup (out of scope per decision).
- Adding a default fallback pricing tier — the API will return 404 when a sector has no tier.

## Implementation Approach

Follow incremental, test-first changes:
1. API + validation and error-sanitization (server-side)
2. Database migration to remove temp_password fields and RLS verification
3. UI behavior and minor UX polishing (always-empty form)
4. Tests (unit + integration) and CI verification

## Critical Implementation Details

- Migration ordering: Deploy migration to remove `temp_password` only when all environments have new code that no longer references the field. Coordinate deployment window.
- RLS functions: do NOT rename input parameter identifiers in CREATE OR REPLACE when policies depend on exact signatures; use local variable copy to avoid "column/parameter ambiguous" errors.

## Phase 1: Server API & Validation

### Overview
Add/confirm strict zod validation on reservation creation and calculate-price endpoints, ensure sanitized error responses, and enforce operator-sector access checks.

### Changes Required:

#### 1. API handlers

**File**: `src/pages/api/reservations.ts`

**Intent**: Ensure request bodies are validated with zod; remove DB debug leakage; on DB errors log server-side and return generic messages; enforce that created_by_operator_id is validated from context (middleware).

**Contract**: POST `/api/reservations` accepts validated schema {sector_id: uuid, check_in: isoDate, check_out: isoDate, guest_count: number, pricing_tier_id: uuid?, notes?: string}. Returns 201 with reservation id or 4xx/5xx with sanitized JSON.

#### 2. Calculate price endpoint

**File**: `src/pages/api/reservations/calculate-price.ts`

**Intent**: Validate inputs, check operator has access to sector, return 404 if no pricing tier, return price breakdown.

**Contract**: POST `/api/reservations/calculate-price` uses same input validation. 404 when pricing tier missing.

### Success Criteria

#### Automated Verification:
- `npm run lint` passes
- `npm run build` passes
- New integration tests for calculate-price and create reservation pass

#### Manual Verification:
- UI obtains a 404 and shows a clear message when sector has no tier
- Reservation submission returns success and does not leak DB messages

---

## Phase 2: Database Migration & RLS

### Overview
Remove temp_password fields and adjust RLS helper functions if needed. Apply function signature safety fixes and ensure policies reference the updated functions.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/2026xxxx_remove_temp_password_from_operators.sql`

**Intent**: Drop temp_password columns and any supporting deprecated metadata.

**Contract**: Migration must run only after code that references temp_password is removed. Include an up and down stanza.

#### 2. RLS functions

**File**: `supabase/migrations/20260622000004_update_reservations_sector_rls.sql` (verify & apply)

**Intent**: Ensure `is_admin()` and `operator_has_sector_access()` use local variable copies for input params to avoid ambiguity and use `auth.jwt()::json` for role checks.

### Success Criteria

#### Automated Verification:
- Migration applies cleanly on local dev and CI DB clone
- `pg_dump`/restore of affected schemas succeeds (sanity check)

#### Manual Verification:
- Operators can create reservations in allowed sectors; RLS prevents cross-sector writes/reads

---

## Phase 3: UI Changes

### Overview
Ensure the New Reservation form always opens empty, reset any previous state, and validate inputs client-side with same zod schema.

### Changes Required:

#### 1. ReservationForm component

**File**: `src/components/ReservationForm.tsx`

**Intent**: On mount or on receiving the `resetReservationForm` window event, clear form state. Ensure no default prefills.

**Contract**: Behavior unchanged except default values removed; same submit flow.

#### 2. Dashboard wiring

**File**: `src/pages/dashboard.astro`

**Intent**: Dispatch `resetReservationForm` before showing modal.

### Success Criteria

#### Automated Verification:
- E2E reservation create test that opens form twice verifies no stale values

#### Manual Verification:
- Opening the New Reservation form shows empty fields every time

---

## Phase 4: Tests & CI

### Overview
Add unit tests for pricingService edge cases and API integration tests for reservations and calculate-price.

### Changes Required:

- Unit tests at `src/lib/services/__tests__/pricingService.test.ts` covering fractional days, discount tiers, and remaining-days assignment.
- Integration tests under `tests/integration/reservations.test.ts` covering success, validation errors, 404 pricing-tier, and RLS enforcement (with test fixtures).

### Success Criteria

#### Automated Verification:
- New tests pass in CI; coverage for pricingService critical paths added

#### Manual Verification:
- QA reproduces a create + view flow and checks logs for no DB-detail leaks

---

## Testing Strategy

### Unit Tests:
- pricingService: discount steps, remaining days, rounding rules, decimal edgecases
- validation: invalid dates, guest_count bounds

### Integration Tests:
- calculate-price returns 200 with breakdown
- calculate-price returns 404 when missing pricing tier
- create reservation returns 201 and persisted record
- create reservation returns 403/401 as appropriate when operator lacks sector access

### Manual Testing Steps:
1. Start local supabase and apply migrations
2. Create an operator with access to sector A
3. Open UI, open New Reservation, ensure empty form
4. Calculate price for sector without tier -> UI shows friendly missing-tier message
5. Create reservation and verify DB row and event

## Migration Notes

- Coordinate migration rollout: remove temp_password column only when all deployments reference the new code. Use a two-step deployment if needed (1) stop writes to temp_password (code path removed), (2) run migration to drop column.
- Backups: snapshot DB before running migration in staging/production.

## References
- `context/changes/reservation-creation-core/change.md`
- `src/pages/api/reservations.ts`
- `src/pages/api/reservations/calculate-price.ts`
- `src/lib/services/pricingService.ts`
- `supabase/migrations/20260622000004_update_reservations_sector_rls.sql`

## Progress

### Phase 1: Server API & Validation

#### Automated
- [ ] 1.1 npm run lint/build
- [ ] 1.2 Integration tests for calculate-price & reservations

#### Manual
- [ ] 1.3 UI verify sanitized errors and success

### Phase 2: Database Migration & RLS

#### Automated
- [ ] 2.1 Migration applies on local dev

#### Manual
- [ ] 2.2 RLS manual verification across sectors

### Phase 3: UI Changes

#### Automated
- [ ] 3.1 E2E test: open form twice, create reservation

#### Manual
- [ ] 3.2 Manual UI verification for empty form

### Phase 4: Tests & CI

#### Automated
- [ ] 4.1 Unit tests for pricingService
- [ ] 4.2 Integration tests pass in CI



