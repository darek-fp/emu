# Core Domain Schema Implementation Plan

## Overview

Create all Supabase migration files for the EMU Parking Manager domain model — `sectors`, `pricing_tiers`, `reservations`, and `cancellation_log` — with Row-Level Security policies on every table and generated TypeScript types. This is Foundation F-02; it is the data contract that every downstream slice (S-01 through S-05) depends on. No UI, no API routes.

## Current State Analysis

- `supabase/migrations/` does **not exist** — directory must be created
- No domain tables exist anywhere; only `auth.users` and `auth.identities` (inserted by `supabase/seed.sql`)
- No generated TypeScript database types (`src/database.types.ts` absent)
- `supabase/config.toml`: PostgreSQL 17, seed enabled (`./seed.sql`), schema_paths unconfigured (Supabase CLI auto-discovers `supabase/migrations/*.sql`)
- Role model (F-01): roles live in `app_metadata.role` inside the JWT — RLS policies must use `(auth.jwt() -> 'app_metadata' ->> 'role')`, not a separate roles table

## Desired End State

After this plan completes:

- Five migration files exist under `supabase/migrations/` and apply cleanly via `npx supabase db reset`
- Tables: `sectors`, `pricing_tiers`, `reservations`, `cancellation_log` — all in the `public` schema with RLS enabled
- `src/database.types.ts` reflects the current schema (generated from local Supabase)
- `npm run lint` and `npm run build` pass
- The existing `supabase/seed.sql` continues to run without error

### Key Discoveries

- `supabase/config.toml:11` — `[api].schemas` exposes `public`; no change needed for domain tables to be accessible
- `src/lib/supabase.ts:1-24` — server client uses the `anon` key via `@supabase/ssr`; RLS is enforced (not bypassed) in all app requests
- `src/types.ts:1` — role vocabulary `"admin" | "operator"` is already defined; RLS policies must mirror this exactly
- `src/middleware.ts:23` — role read from `user.app_metadata.role`; the `current_user_role()` DB helper must use the same JWT path: `auth.jwt() -> 'app_metadata' ->> 'role'`
- No `spots` table — overbooking prevention is count-based (`sectors.spot_count` vs count of non-canceled reservations overlapping the requested window); the SELECT FOR UPDATE lock targets the `sectors` row

## What We're NOT Doing

- Not creating any UI pages or API routes (S-01 through S-05)
- Not implementing the Operator provisioning flow (S-02)
- Not implementing the overbooking check logic in application code (S-03)
- Not implementing price calculation logic (S-03)
- Not implementing PII anonymization / GDPR retention jobs (future)
- Not adding the `spots` table — capacity is tracked via `sectors.spot_count`
- Not adding any data to `pricing_tiers` or `sectors` — that's S-01 and S-02
- Not modifying `supabase/seed.sql` — the existing admin seed remains unchanged

## Implementation Approach

Five migration files in dependency order, preceded by a shared-helpers migration. Each migration is independently verifiable via `npx supabase db reset`. A `current_user_role()` helper function centralises the JWT claim lookup so RLS policies are DRY and easy to audit. TypeScript types are generated last, after all migrations are in place.

## Critical Implementation Details

**RLS role check via JWT**: Supabase RLS policies cannot call `current_setting()` or session variables to get the app role — the only reliable source is `auth.jwt()`. The helper function `public.current_user_role()` must be `SECURITY DEFINER` so it can read the JWT in all execution contexts. Every policy in this plan uses it; changing the JWT path in one place is sufficient.

**SELECT FOR UPDATE for overbooking**: The lock in S-03 must target the `sectors` row (`SELECT ... FROM sectors WHERE id = $sector_id FOR UPDATE`), not the reservations rows. This serialises concurrent insertions for the same sector. The `reservations` schema supports this pattern: `sector_id` is a non-nullable FK, and the status enum excludes `canceled` from the overlap count.

**Partial unique index on active tier**: `CREATE UNIQUE INDEX one_active_tier ON public.pricing_tiers(is_active) WHERE is_active = true` enforces at most one active tier at the DB level. The application can safely assume `SELECT * FROM pricing_tiers WHERE is_active = true` returns zero or one row without extra locking.

---

## Phase 1: Helper functions and reference tables

### Overview

Create the `supabase/migrations/` directory, a shared-helpers migration (updated_at trigger + role helper), and migrations for `sectors` and `pricing_tiers` — the two tables with no foreign-key dependencies.

### Changes Required

#### 1. Helper functions migration

**File**: `supabase/migrations/20260605120000_create_domain_helpers.sql`

**Intent**: Define two reusable database functions shared by all subsequent migrations: `set_updated_at()` (trigger function that stamps `updated_at = now()` on every UPDATE) and `current_user_role()` (stable helper that reads the role claim from the current session's JWT). Centralising these here means every subsequent migration can attach the trigger and write policies without repeating the implementation.

**Contract**: Two functions in the `public` schema:

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::TEXT;
$$;
```

`SECURITY DEFINER` on `current_user_role` is required so it can access `auth.jwt()` in RLS policy evaluation context.

---

#### 2. Sectors migration

**File**: `supabase/migrations/20260605120001_create_sectors.sql`

**Intent**: Create the `sectors` table — the top-level organisational unit for parking capacity. Enable RLS with policies that allow any authenticated user (Admin or Operator) to read sectors, but restrict writes to Admin only. Attach the updated_at trigger.

**Contract**: `sectors(id UUID PK DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, spot_count INTEGER NOT NULL CHECK (spot_count > 0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`.

RLS policies:
- `SELECT` — `public.current_user_role() IN ('admin', 'operator')`
- `INSERT`, `UPDATE`, `DELETE` — `public.current_user_role() = 'admin'`

---

#### 3. Pricing tiers migration

**File**: `supabase/migrations/20260605120002_create_pricing_tiers.sql`

**Intent**: Create the `pricing_tiers` table with the discount schedule stored as a JSONB array. Add a partial unique index that enforces at most one active tier at any time. Enable RLS with the same Admin-write / Operator-read split as `sectors`. Attach the updated_at trigger.

**Contract**: `pricing_tiers(id UUID PK DEFAULT gen_random_uuid(), base_daily_rate NUMERIC(10,2) NOT NULL CHECK (base_daily_rate > 0), daily_floor NUMERIC(10,2) NOT NULL CHECK (daily_floor >= 0), discount_steps JSONB NOT NULL DEFAULT '[]', is_active BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`.

Partial unique index: `CREATE UNIQUE INDEX one_active_tier ON public.pricing_tiers(is_active) WHERE is_active = true`.

`discount_steps` shape (for reference only — validated by the application, not the DB): `[{"from_day": 4, "rate_multiplier": 0.90}, ...]` where `from_day` is an integer and `rate_multiplier` is a decimal ≤ 1.

RLS policies:
- `SELECT` — `public.current_user_role() IN ('admin', 'operator')`
- `INSERT`, `UPDATE`, `DELETE` — `public.current_user_role() = 'admin'`

---

### Success Criteria

#### Automated Verification

- Migrations apply cleanly: `npx supabase db reset` exits 0
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- `sectors` and `pricing_tiers` tables visible in Supabase Studio (http://localhost:54323)
- RLS is enabled on both tables (visible in Studio → Table Editor → RLS column)
- `updated_at` trigger fires: UPDATE a row and confirm `updated_at` changes
- Partial unique index enforced: inserting two rows with `is_active = true` into `pricing_tiers` produces a unique violation

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Reservations table

### Overview

Create the `reservations` table — the central business record. Includes all booking fields, the full status enum, GDPR placeholder column, and per-operation RLS policies. This table has a FK dependency on `sectors` (Phase 1) and must be created after it.

### Changes Required

#### 1. Reservations migration

**File**: `supabase/migrations/20260605120003_create_reservations.sql`

**Intent**: Create the `reservations` table with all fields required by FR-005 through FR-013. Enforce the departure-after-arrival constraint and status enum at the DB level. Add the `anonymized_at` GDPR placeholder column. Enable RLS allowing both Admin and Operator to read and write reservations (all Operators share the same lot; no per-user row scoping). Attach the updated_at trigger.

**Contract**:

```sql
CREATE TABLE public.reservations (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id      UUID         NOT NULL REFERENCES public.sectors(id),
  customer_name  TEXT         NOT NULL,
  license_plate  TEXT         NOT NULL,
  arrival_at     TIMESTAMPTZ  NOT NULL,
  departure_at   TIMESTAMPTZ  NOT NULL,
  price_total    NUMERIC(10,2) NOT NULL CHECK (price_total >= 0),
  price_override BOOLEAN      NOT NULL DEFAULT false,
  status         TEXT         NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('confirmed', 'arrived', 'departed', 'canceled')),
  is_paid        BOOLEAN      NOT NULL DEFAULT false,
  arrived_at     TIMESTAMPTZ,
  departed_at    TIMESTAMPTZ,
  anonymized_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT departure_after_arrival CHECK (departure_at > arrival_at)
);
```

RLS policies:
- `SELECT` — `public.current_user_role() IN ('admin', 'operator')`
- `INSERT` — `public.current_user_role() IN ('admin', 'operator')`
- `UPDATE` — `public.current_user_role() IN ('admin', 'operator')`
- No `DELETE` policy — reservations are never deleted; cancellation uses `status = 'canceled'`

---

### Success Criteria

#### Automated Verification

- Migrations apply cleanly: `npx supabase db reset` exits 0
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- `reservations` table visible in Studio with all columns present and correct types
- CHECK constraint enforced: attempt to INSERT a row with `departure_at <= arrival_at` — expect a check violation error
- Status enum enforced: attempt to INSERT a row with `status = 'pending'` — expect a check violation error
- `updated_at` trigger fires on UPDATE

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Cancellation log and TypeScript types

### Overview

Create the `cancellation_log` table (append-only audit log; no updated_at), enable RLS, then generate `src/database.types.ts` from the running local Supabase instance so downstream slices have full TypeScript coverage of the schema.

### Changes Required

#### 1. Cancellation log migration

**File**: `supabase/migrations/20260605120004_create_cancellation_log.sql`

**Intent**: Create the append-only cancellation audit log that records who canceled a reservation and when (FR-009). This table has no `updated_at` — records are immutable once written. Both Admin and Operator can insert (either may cancel a reservation); both can read the log.

**Contract**: `cancellation_log(id UUID PK DEFAULT gen_random_uuid(), reservation_id UUID NOT NULL REFERENCES public.reservations(id), canceled_by UUID NOT NULL REFERENCES auth.users(id), canceled_at TIMESTAMPTZ NOT NULL DEFAULT now())`.

RLS policies:
- `SELECT` — `public.current_user_role() IN ('admin', 'operator')`
- `INSERT` — `public.current_user_role() IN ('admin', 'operator')`
- No `UPDATE` or `DELETE` policies — records are immutable

---

#### 2. Generate TypeScript database types

**File**: `src/database.types.ts`

**Intent**: Generate strongly-typed schema definitions from the running local Supabase instance so every downstream slice (S-01 through S-05) has full TypeScript coverage of table columns, constraints, and relationships. The generated file is the single source of truth for schema types in the application layer.

**Contract**: Run after `npx supabase start` and all migrations applied:

```bash
npx supabase gen types typescript --local > src/database.types.ts
```

The generated file exports a `Database` interface. Downstream code imports from it as: `import type { Database } from "@/database.types"`.

---

### Success Criteria

#### Automated Verification

- All migrations apply cleanly: `npx supabase db reset` exits 0
- TypeScript types generated without error: `npx supabase gen types typescript --local > src/database.types.ts`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- `cancellation_log` table visible in Studio with RLS enabled
- All five tables (`sectors`, `pricing_tiers`, `reservations`, `cancellation_log`) visible in Studio with RLS enabled on each
- `src/database.types.ts` exists and contains type definitions for all four domain tables
- `npx supabase db reset` (which re-runs all migrations + seed) completes without error — confirming the existing seed is still compatible

**Implementation Note**: After completing this phase and all automated verification passes, this foundation is complete. Confirm with the user before declaring F-02 done and proceeding to S-01 / S-02.

---

## Testing Strategy

### No Automated Test Suite

The project has no test suite (per project baseline). Success criteria rely on `npx supabase db reset` (migration correctness), lint + build (TypeScript correctness), and manual Studio inspection.

### Manual Testing Scenarios

1. **Migration idempotency** — run `npx supabase db reset` twice in sequence; second run must succeed without errors
2. **CHECK constraints** — attempt invalid inserts (departure ≤ arrival, invalid status, negative price) and confirm DB rejects them
3. **Unique active tier** — insert two rows with `is_active = true`; confirm second insert fails with unique violation
4. **RLS smoke test** — using the Supabase SQL editor as the seeded admin user, confirm SELECT succeeds on all tables; confirm the anon role cannot access any table
5. **Seed compatibility** — `npx supabase db reset` must leave `auth.users` and `auth.identities` seeded correctly (admin@emu.dev / admin1234 still works)

## Migration Notes

- `supabase/migrations/` must be created before any files are added — Supabase CLI does not auto-create it
- Migration files are applied in filename sort order; the timestamp prefixes guarantee dependency order: helpers (120000) → sectors (120001) → pricing_tiers (120002) → reservations (120003) → cancellation_log (120004)
- `supabase/config.toml` does not need changes — the CLI discovers `supabase/migrations/*.sql` automatically
- After `npx supabase db seed` is deprecated in newer CLI versions, use `npx supabase db reset` which runs both migrations and seed in sequence
- The generated `src/database.types.ts` should be committed to the repository so CI has type coverage without needing a running Supabase instance

## References

- Roadmap F-02: `context/foundation/roadmap.md` (lines 76–89)
- PRD functional requirements: `context/foundation/prd.md` (FR-001, FR-003, FR-006, FR-009)
- F-01 role model: `context/changes/auth-rbac-scaffold/plan.md`
- Supabase RLS with JWT: https://supabase.com/docs/guides/auth/row-level-security

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Helper functions and reference tables

#### Automated

- [x] 1.1 Migrations apply cleanly (npx supabase db reset exits 0) — 18a04af3
- [x] 1.2 Lint passes — 18a04af3
- [x] 1.3 Build passes — 18a04af3

#### Manual

- [ ] 1.4 sectors and pricing_tiers visible in Studio with RLS enabled
- [ ] 1.5 updated_at trigger fires on UPDATE
- [ ] 1.6 Partial unique index enforced (two active tiers rejected)

### Phase 2: Reservations table

#### Automated

- [x] 2.1 Migrations apply cleanly (npx supabase db reset exits 0)
- [x] 2.2 Lint passes
- [x] 2.3 Build passes

#### Manual

- [ ] 2.4 reservations table visible in Studio with all columns
- [ ] 2.5 departure_after_arrival CHECK constraint enforced
- [ ] 2.6 Status enum CHECK constraint enforced

### Phase 3: Cancellation log and TypeScript types

#### Automated

- [ ] 3.1 All migrations apply cleanly (npx supabase db reset exits 0)
- [ ] 3.2 TypeScript types generated without error
- [ ] 3.3 Lint passes
- [ ] 3.4 Build passes

#### Manual

- [ ] 3.5 All four domain tables visible in Studio with RLS enabled on each
- [ ] 3.6 src/database.types.ts exists and contains domain table types
- [ ] 3.7 npx supabase db reset completes with seed intact (admin@emu.dev still works)
