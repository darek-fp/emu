# Core Domain Schema — Plan Brief

> Full plan: `context/changes/core-domain-schema/plan.md`

## What & Why

Create all Supabase migration files for the EMU Parking Manager domain model. This is Foundation F-02 — the data contract that every user-facing slice (S-01 through S-05) depends on. Getting the schema right here is far cheaper than a structural migration mid-way through S-03 (the north star slice).

## Starting Point

No domain tables exist today. The only database rows are `auth.users` and `auth.identities` inserted by `supabase/seed.sql`. The `supabase/migrations/` directory does not exist and must be created. Role model (F-01) is already wired: roles live in JWT `app_metadata.role`, which RLS policies must read via `auth.jwt()`.

## Desired End State

Four domain tables exist in the `public` schema with RLS enabled: `sectors`, `pricing_tiers`, `reservations`, `cancellation_log`. A generated `src/database.types.ts` gives every downstream slice full TypeScript coverage. `npx supabase db reset` applies all migrations and the existing admin seed cleanly.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Spots model | No `spots` table — `sectors.spot_count` is capacity | Operators never pick a specific spot; overbooking is count-based | Plan |
| Overbooking enforcement | SELECT FOR UPDATE on `sectors` row + count check | Serialises concurrent inserts at sector level; no extension required | Plan |
| Duration storage | `arrival_at` / `departure_at` as TIMESTAMPTZ; integer minutes in app layer | Avoids float rounding; satisfies "no rounding errors" NFR | Plan |
| Discount schedule | JSONB array on `pricing_tiers` | No JOIN needed; matches how S-02 will present an editable list | Plan |
| Tier multiplicity | Single active tier (`is_active` + partial unique index) | PRD scope is "a pricing tier" (singular); simplest correct model | Plan |
| Price at booking | `price_total NUMERIC(10,2)` on reservation, no tier FK | Agreed price doesn't change if Admin updates the tier later | Plan |
| Reservation status | `confirmed → arrived → departed`; `canceled` from any; `is_paid` boolean | Payment is orthogonal to physical lifecycle (FR-010/011/012) | Plan |
| RLS granularity | Role-based; all authenticated users see all rows | All Operators manage the same lot; no per-user row scoping in PRD | Plan |
| GDPR | `anonymized_at TIMESTAMPTZ` nullable on reservations | Schema-ready from day one; redaction logic deferred | Plan |
| Cancellation | Both Admin and Operator; `canceled_by = auth.uid()` | Admins need emergency cancel capability; log captures who acted | Plan |
| Timestamps | `created_at` + `updated_at` on all mutable tables | Zero cost now; prevents painful retrofits in S-01–S-05 | Plan |

## Scope

**In scope:**
- `supabase/migrations/` directory creation
- 5 migration files: helpers, sectors, pricing_tiers, reservations, cancellation_log
- RLS policies (per-operation, per-role) on all four domain tables
- `updated_at` trigger function + `current_user_role()` RLS helper
- `src/database.types.ts` generation

**Out of scope:**
- `spots` table (no named spots; capacity via `sectors.spot_count`)
- Any UI, API routes, or business logic
- Operator provisioning (S-02)
- Price calculation logic (S-03)
- PII anonymization implementation (future)
- Seed data for `sectors` or `pricing_tiers`

## Architecture / Approach

Five migration files in dependency order. A shared-helpers migration (file 1) defines `set_updated_at()` and `current_user_role()` — the latter reads `auth.jwt() -> 'app_metadata' ->> 'role'` and is used by every subsequent RLS policy. Reference tables with no FK dependencies (`sectors`, `pricing_tiers`) land in phases 2–3; `reservations` (FK to `sectors`) in phase 4; `cancellation_log` (FK to `reservations`) in phase 5. TypeScript types are generated last from the running local instance.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Helpers + reference tables | `set_updated_at()`, `current_user_role()`, `sectors`, `pricing_tiers` with RLS | `current_user_role()` JWT path must exactly match F-01's path or all policies silently fail |
| 2. Reservations | `reservations` with all fields, constraints, and RLS | CHECK constraints must cover the status enum and departure > arrival |
| 3. Cancellation log + types | `cancellation_log` with RLS; `src/database.types.ts` generated | Generated types must be committed so CI doesn't need a running Supabase |

**Prerequisites:** F-01 (`auth-rbac-scaffold`) must be complete — specifically, `app_metadata.role` values `"admin"` and `"operator"` must be the canonical role strings, as RLS policies hard-code them.  
**Estimated effort:** ~1 session across 3 phases (mostly SQL authoring + Studio verification)

## Open Risks & Assumptions

- `current_user_role()` depends on the JWT claim path established by F-01 (`app_metadata.role`). If that path ever changes, all RLS policies break silently.
- The partial unique index on `is_active = true` prevents more than one active pricing tier at the DB level, but does not prevent the *only* active tier from being deactivated, leaving zero active tiers. S-02 must handle that UX case.
- `src/database.types.ts` is generated from the local Supabase instance and must be regenerated whenever the schema changes.

## Success Criteria (Summary)

- `npx supabase db reset` applies all five migrations and the existing seed without error
- All four domain tables exist in Studio with RLS enabled and correct column types
- `src/database.types.ts` reflects the full schema and `npm run build` passes with it
