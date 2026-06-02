---
project: "EMU Parking Manager"
version: 1
status: draft
created: 2026-06-02
updated: 2026-06-02
prd_version: 1
main_goal: quality
top_blocker: time
---

# Roadmap: EMU Parking Manager

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Parking managers at small-to-medium lots today track availability and reservations on notepads, producing errors and making instant availability queries impossible. EMU Parking Manager replaces the notepad with a single source of truth: structured occupancy data, date-range availability checks, reservation recording with tiered pricing, and one-click lifecycle confirmations (arrival, departure, payment). The commercial hypothesis — the core bet this product makes — is that a market of parking operators exists who will replace manual processes with a purpose-built, affordable web tool.

## North star

**S-03: Operator can check availability and create a priced reservation** — the first end-to-end slice that validates the product's two correctness-critical invariants: the overbooking prevention engine (FR-013, hour-level overlap check) and the pricing calculation engine (FR-007, tiered pricing with discount schedule). If this slice is provably correct, the product's core hypothesis holds; everything else is additive.

> "North star" here means the smallest end-to-end slice whose successful delivery proves the product can do the one thing it exists to do — placed as early as its Prerequisites allow because all downstream slices are only meaningful if this one is right.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | `auth-rbac-scaffold` | (foundation) Admin and Operator roles wired into auth; role-scoped middleware protecting all routes | — | Access Control section | ready |
| F-02 | `core-domain-schema` | (foundation) Supabase migrations landed for sectors, spots, pricing tiers, reservations, and cancellation audit log | — | FR-001, FR-003, FR-006, FR-009 | ready |
| S-01 | `parking-structure-setup` | Admin can define sectors and spot counts, and update the structure with conflict warnings for active reservations | F-01, F-02 | FR-001, FR-002 | proposed |
| S-02 | `pricing-and-operator-management` | Admin can configure pricing tiers (base rate, discount schedule, floor) and create/deactivate Operator accounts | F-01, F-02 | FR-003, FR-004 | proposed |
| S-03 | `reservation-creation-core` | Operator can check spot availability for a date range, create a reservation with auto-calculated price (override flagged), and see it immediately in the reservations list; submission rejected if no spot is available | F-01, F-02, S-01, S-02 | FR-005, FR-006, FR-007, FR-008, FR-013, US-01 | proposed |
| S-04 | `reservation-cancellation` | Operator can cancel a reservation; cancellation is logged with the operator's identity and timestamp | S-03 | FR-009 | proposed |
| S-05 | `reservation-lifecycle-confirmations` | Operator can confirm vehicle arrival, departure, and payment for a reservation, each in a single action | S-03 | FR-010, FR-011, FR-012 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Setup prerequisites | `F-01` / `F-02` (parallel) | Both are immediately `ready`; running them in parallel is the fastest path through the bottleneck. F-01 wires security; F-02 lays the data contracts. Everything in Stream B waits for both. |
| B | Operator workflow | `S-01` / `S-02` → `S-03` → `S-04` / `S-05` | Requires both Stream A foundations. S-01 and S-02 run in parallel. North star `S-03` is the quality gate in this chain. `S-04` and `S-05` run in parallel after the north star lands. |

## Baseline

What's already in place in the codebase as of 2026-06-02 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro 6 + React 19 + Tailwind 4 + shadcn/ui installed (`astro.config.mjs`, `src/pages/`); only boilerplate/auth pages exist, no parking-manager UI.
- **Backend / API:** partial — Astro SSR framework in place; only auth routes exist (`src/pages/api/auth/`); no business logic routes.
- **Data:** absent — Supabase client installed (`@supabase/ssr`, `@supabase/supabase-js`); zero migration files, no domain schema.
- **Auth:** partial — Supabase auth wired (`src/lib/supabase.ts`, `src/middleware.ts`, auth API routes, `/dashboard` protected); RBAC (Admin vs Operator roles) absent.
- **Deploy / infra:** present — Cloudflare Workers via `@astrojs/cloudflare`, CI/CD in `.github/workflows/ci.yml` (lint + build + deploy jobs on push to `master`).
- **Observability:** absent — no logging, error tracking, or metrics tooling.

## Foundations

### F-01: Auth & RBAC scaffold

- **Outcome:** (foundation) Admin and Operator roles wired into Supabase auth; role claims available on the session; middleware enforces role-scoped access on all protected routes (Admin-only config routes vs. Operator action routes).
- **Change ID:** `auth-rbac-scaffold`
- **PRD refs:** Access Control section (two-role model: Admin full access, Operator day-to-day access; no self-registration)
- **Unlocks:** S-01, S-02, S-03, S-04, S-05 — every slice requires role-enforced routes. Also establishes the operator provisioning mechanism needed by FR-004 (S-02).
- **Prerequisites:** — (Supabase auth base already wired per baseline; this foundation extends it, not replaces it)
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first — under the `quality` goal, access control foundations are not deferred behind user-facing work. Wiring RBAC retroactively after slices are built risks leaving routes unprotected during development. Key design decision for `/10x-plan`: whether to store role as a Supabase custom JWT claim, a `user_metadata` field, or a separate `user_roles` table — the choice affects how the role is read in middleware and must be consistent across all slices.
- **Status:** ready

### F-02: Core domain schema

- **Outcome:** (foundation) Supabase migration files landed and applied for: `sectors` (name, spot count), `spots` (sector FK), `pricing_tiers` (base rate, discount steps, daily floor), `reservations` (customer name, license plate, spot FK, arrival/departure timestamps, price, override flag, status), and `cancellation_log` (reservation FK, cancelled-by user, timestamp). Row-Level Security policies present on all tables per project convention.
- **Change ID:** `core-domain-schema`
- **PRD refs:** FR-001 (sectors/spots structure), FR-003 (pricing tier fields), FR-006 (reservation fields: name, plate, arrival/departure), FR-009 (cancellation audit log)
- **Unlocks:** S-01 (needs `sectors`/`spots` tables), S-02 (needs `pricing_tiers` table), S-03 (needs `reservations` table with overlap-enforcing constraint); lays the correctness contract for the two NFR invariants (price precision, race-condition protection) that S-03 must satisfy.
- **Prerequisites:** — (Supabase project provisioned and secrets wired per deployment work; no prior migrations exist)
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:**
  - How should the overbooking-prevention constraint be enforced at the DB level — application-layer serializable transaction, advisory lock, or a partial unique index on overlapping ranges? Owner: developer. Block: no (design decision for `/10x-plan core-domain-schema`).
  - How should fractional-day pricing duration be stored — decimal days, PostgreSQL `interval`, or integer minutes? The choice affects pricing precision (NFR: no rounding errors). Owner: developer. Block: no.
- **Risk:** The schema is the single contract that binds every downstream slice; a structural schema change after S-01/S-02 are built risks cascading re-migrations. Specifically: the `pricing_tiers` discount schedule shape (step-based vs. linear interpolation) must be decided here, not left ambiguous. Getting this wrong at F-02 is far cheaper than a schema migration mid-way through S-03.
- **Status:** ready

## Slices

### S-01: Parking structure setup

- **Outcome:** Admin can define the parking structure — either a single undivided lot or multiple named sectors each with a spot count — and update the configuration later; the system warns the Admin if a structural change conflicts with active reservations for the affected spots.
- **Change ID:** `parking-structure-setup`
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** F-01 (Admin role enforcement on structure config routes), F-02 (`sectors`/`spots` schema)
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Must be completed before S-03 — the availability engine queries real sectors and spots. If the spot-count schema or the conflict-warning logic (FR-002) is incomplete here, S-03 inherits a broken availability surface. Keep the slice focused: structure CRUD + conflict warning, nothing else.
- **Status:** proposed

### S-02: Pricing configuration and operator account management

- **Outcome:** Admin can define a pricing tier (base per-day rate, discount schedule keyed to stay duration, daily minimum price floor) and manage Operator accounts (create, deactivate); no self-registration — accounts are provisioned by the Admin.
- **Change ID:** `pricing-and-operator-management`
- **PRD refs:** FR-003, FR-004
- **Prerequisites:** F-01 (Admin role enforcement; also provides the provisioning mechanism for Operator accounts), F-02 (`pricing_tiers` schema)
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The discount schedule must be fully specified in this slice — the shape of the pricing tier directly determines how the pricing engine in S-03 computes totals. A mismatch between the tier data model (F-02) and the pricing logic (S-03) is the most likely source of the "rounding errors or off-by-one day miscounts" NFR violation. Clarify the discount model here and document it clearly for S-03's implementer.
- **Status:** proposed

### S-03: Reservation creation — availability check, pricing, and list view *(north star)*

- **Outcome:** Operator can check available spots for a requested date range, create a reservation with customer name, license plate, arrival date+time, and departure date+time; system automatically calculates and displays the total price before confirmation; Operator may override the calculated price (override is flagged in the record); system rejects submission if no spot is available for the requested window (overbooking prevention at the hour level); new reservation appears immediately in the reservations list.
- **Change ID:** `reservation-creation-core`
- **PRD refs:** FR-005, FR-006, FR-007, FR-008, FR-013, US-01
- **Prerequisites:** F-01 (Operator role enforcement), F-02 (`reservations` schema + overlap constraint), S-01 (sectors/spots must exist in the DB for the availability query), S-02 (pricing tier must be configured for the price calculation)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Race condition: if two Operators submit overlapping reservations simultaneously and only one spot remains, how is atomicity guaranteed? (NFR: "only one booking must succeed; the second must receive a rejection.") Owner: developer. Block: no — solvable in `/10x-plan` via serializable transaction or DB-level advisory lock; choose an approach before writing the booking endpoint.
  - GDPR retention: what is the legally permissible retention window for customer name + license plate, and what constitutes sufficient "anonymization" for this use case? (NFR: GDPR personal data requirement.) Owner: developer/legal. Block: no — can ship with a placeholder policy; must resolve before onboarding real customers in production.
- **Risk:** This is the most complex slice in the roadmap — it assembles the availability engine, tiered pricing calculation, overbooking enforcement, and the reservation form + list view into one end-to-end flow. Any schema ambiguity from F-02 or pricing-model ambiguity from S-02 surfaces here as a correctness defect. The `quality` sequencing goal means this slice must be proven correct, not just functional — write verification cases for the pricing precision NFR and the race-condition NFR as part of `/10x-plan`.
- **Status:** proposed

### S-04: Reservation cancellation

- **Outcome:** Operator can cancel a reservation; the cancellation is recorded with the cancelling operator's identity and an exact timestamp in an audit log.
- **Change ID:** `reservation-cancellation`
- **PRD refs:** FR-009
- **Prerequisites:** S-03 (reservations must exist; the cancellation action operates on the reservations list from S-03)
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low complexity. The audit log write and the reservation status change must be atomic — a partial write (status changed, log not written) violates the accountability requirement. Use a single transaction in the cancellation endpoint.
- **Status:** proposed

### S-05: Reservation lifecycle confirmations — arrival, departure, payment

- **Outcome:** Operator can confirm vehicle arrival, vehicle departure, and payment for a reservation, each in a single action (one click, no multi-step form).
- **Change ID:** `reservation-lifecycle-confirmations`
- **PRD refs:** FR-010, FR-011, FR-012
- **Prerequisites:** S-03 (reservations must exist; confirmation actions operate on reservations from the list built in S-03)
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low complexity individually. The three state transitions (booked → arrived → departed; payment separate) must respect ordering — confirming departure before arrival, or payment before departure, should be prevented. Design the state machine in `/10x-plan` before implementing the three confirmation endpoints.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | `auth-rbac-scaffold` | Wire Admin/Operator RBAC into Supabase auth | yes | Run `/10x-plan auth-rbac-scaffold` |
| F-02 | `core-domain-schema` | Create core domain schema migrations (sectors, spots, pricing tiers, reservations, audit log) | yes | Run `/10x-plan core-domain-schema` |
| S-01 | `parking-structure-setup` | Admin: define and update parking structure with conflict warnings | no | Requires F-01 + F-02 done first |
| S-02 | `pricing-and-operator-management` | Admin: configure pricing tiers + manage Operator accounts | no | Requires F-01 + F-02 done first |
| S-03 | `reservation-creation-core` | Operator: check availability + create priced reservation (north star) | no | Requires S-01 + S-02 done; plan the race-condition and GDPR unknowns as part of `/10x-plan` |
| S-04 | `reservation-cancellation` | Operator: cancel reservation with audit trail | no | Requires S-03 done |
| S-05 | `reservation-lifecycle-confirmations` | Operator: confirm arrival, departure, and payment (single-action each) | no | Requires S-03 done |

## Open Roadmap Questions

No open questions. The PRD had zero open questions at generation time, and the framing interview surfaced none. Per-slice design questions (overbooking strategy, GDPR retention window, discount model shape) are scoped to their slices and owned by the developer — they are `/10x-plan` inputs, not roadmap blockers.

## Parked

- **FR-014: Traffic surge warnings** — Why parked: PRD §Functional Requirements explicitly scopes this as "nice-to-have"; the `time` blocker means the must-have path ships first.
- **Customer-facing self-service booking portal** — Why parked: PRD §Non-Goals; doubles product scope; MVP targets operators, not end customers.
- **Automatic vehicle detection / license plate recognition** — Why parked: PRD §Non-Goals; requires camera infrastructure beyond the web app.
- **Mobile app** — Why parked: PRD §Non-Goals; web-first for MVP validation; mobile follows once the product is validated with real operators.
- **Loyalty and discount programs for repeat customers** — Why parked: PRD §Non-Goals; adds pricing complexity without proving core value.
- **Parking zone optimization by stay duration** — Why parked: PRD §Non-Goals; operator-driven spot assignment in MVP.
- **Traffic congestion predictions** — Why parked: PRD §Non-Goals; FR-014 covers internal occupancy pattern warnings only, not external traffic data.
- **Observability stack (error tracking, structured logging)** — Why parked: no PRD NFR mandates observability at launch; `time` blocker makes it a post-MVP add-on. Add error tracking before onboarding the first real operator in production.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches a roadmap item is archived.)
