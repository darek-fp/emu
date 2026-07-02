# Reservation Creation Core — Plan Brief

> Full plan: `context/changes/reservation-creation-core/plan.md`
> Change: `context/changes/reservation-creation-core/change.md`

## What & Why

Implement a secure, validated reservation creation flow that avoids leaking DB internals, enforces operator-sector RLS checks, and simplifies the operator model to admin-supplied passwords. This reduces runtime errors, tightens security, and aligns the data model with the chosen operator creation flow.

## Starting Point

- Recent fixes restored core reservation flow and fixed pricingService bug; UI reset event exists but needs consistent empty-form behavior. Some migrations still contain `temp_password` fields and RLS helper functions need careful application.

## Desired End State

- Empty New Reservation form on open
- Strict zod validation server + client
- calculate-price returns 404 when no tier
- temp_password schema removed
- Unit + integration tests added

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---:|---|---|
| Operator creation flow | Admin-supplied password | Simple, lower immediate implementation cost; matches user's preference | Plan (user) |
| Default form values | Always empty | Safer: prevents accidental submissions | Plan (user) |
| Validation strictness | ⭐ Recommended: strict server+client zod | Prevents malformed requests & RLS errors | Plan (user) |
| Pricing fallback | 404 when missing tier | Explicit — avoids silent wrong charges | Plan (user) |
| Migrations for temp_password | Remove temp_password fields | Clean schema matching chosen flow | Plan (user) |
| Tests | Unit (pricing) + Integration (API) | Catches logic and API regressions efficiently | Plan (user) |

## Scope

**In scope:**
- API validation and sanitization
- calculate-price behavior and sector access checks
- Remove temp_password column via migration
- UI empty-form behavior and reset event
- Unit + integration test additions

**Out of scope:**
- Invite-based operator signup
- Auto-default pricing fallbacks

## Architecture / Approach

High-level: API (zod-validated endpoints) -> PricingService (deterministic calculation) -> DB (RLS enforced). UI issues a calculate-price call then posts to create; both endpoints sanitize errors. Migration removes legacy fields and RLS functions are validated for parameter ambiguity.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. API & Validation | zod validation, sanitized errors, sector access checks | Breaking existing clients if schema changes; mitigate via compatibility fields and clear errors |
| 2. Migration & RLS | Clean operator schema and verified policies | Migration ordering — must coordinate deploys |
| 3. UI polish | Empty form behavior, E2E test | UX regressions if listener timing broken |
| 4. Tests & CI | Unit + integration coverage | Test flakiness; need stable fixtures |

**Prerequisites:** DB backup & staging run, CI test runners, access to run migrations.
**Estimated effort:** ~2–4 dev days (1 dev) across 4 phases.

## Open Risks & Assumptions

- Assumes admin-supplied password model is acceptable long-term; if product changes to invite flow, migrations will need rework.
- Migration requires coordinated rollout to avoid production downtime.
- RLS function signatures are sensitive — tests must run against a DB clone before deploy.

## Success Criteria (Summary)

- New reservation form opens empty on repeated opens
- calculate-price returns 404 when no tier and UI surfaces that message
- Reservation creation endpoint validates input, enforces sector RLS, and does not leak DB internals
- PricingService unit tests cover edge cases; integration tests pass in CI

