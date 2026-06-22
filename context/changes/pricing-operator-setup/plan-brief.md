# Pricing Configuration & Operator Account Management — Plan Brief

> Full plan: `context/changes/pricing-operator-setup/plan.md`
> Research: See session discovery summary for operator/pricing architecture decisions

## What & Why

We're building admin-configurable pricing tiers (per-sector, with discount schedules) and operator account management (creation, sector assignment, soft-delete deactivation). This enables parking operators to create reservations with automatically calculated prices based on stay duration and administrative pricing rules, with full audit trails for overrides and pricing history.

## Starting Point

- `pricing_tiers` table exists globally (single active tier) but lacks per-sector bucketing
- Reservations capture `price_total` and `price_override` but not the pricing tier used (no immutability)
- No `operators` table or sector-assignment tracking — all users are admin or generic operator roles
- Auth stores role in JWT `app_metadata.role` but no app-level operator records

## Desired End State

- **Pricing tiers**: Admins configure per-sector pricing with base rate, day-range discount steps (e.g., 1-3 days 100%, 4-7 days 90%, 8+ 80%), and per-tier floor. Tier history preserved for audit.
- **Operators**: Admins create operator accounts (email + temp password), assign to sectors (checkboxes), view list, soft-delete (deactivate). Deactivated operators can't log in but audit trails remain.
- **Price calculation**: Reservations capture the pricing tier at creation (immutable snapshot). Price calculated using sector's active tier, fractional days count as full days, floor applied per discount tier.
- **Access control**: Operators only see/edit sectors assigned to them (RLS + middleware enforcement).
- **Override audit**: Price overrides flagged with operator ID for compliance.

## Key Decisions Made

| Decision | Choice | Why | Source |
|----------|--------|-----|--------|
| Pricing scope | Per-sector | Enables different rates for different parking lots/areas; aligns with reservation model | Discovery |
| Operator lifecycle | Soft-delete (deactivated_at) | Preserves audit trail and historical reservations; reactivation possible | Discovery |
| Tier versioning | Keep old tiers active=false | New tier becomes default; old tiers available for audit; existing reservations reference immutable snapshot | Discovery |
| Discount model | Admin defines tiers with day-range steps | Flexibility: 1-3 days at rate X, 4-7 at rate Y, 8+ at rate Z; floor per tier not global | Discovery |
| Fractional days | Any partial day counts as full | Simplified: 2pm Mon to 10am Wed = 3 days for tier calculation | Discovery |
| Price override | Operator can override with flag | No cap, no approval gate; audit flag logs who overrode and when | Discovery |
| Operator provisioning | Admin generates temp password | No self-service signup; admin shares password securely; operator must change on first login | Discovery |
| Sector assignment | Checkboxes during creation | Simple UI, operators assigned to 1+ sectors, restricts their view/edit scope | Discovery |

## Scope

**In scope:**
- Migrations: pricing_tiers (add sector + versioning), operators, operator_sector_assignments, reservations (add tier + operator FK)
- Pricing calculation service: fractional day counting, discount tier lookup, floor per tier, unit tests
- Admin APIs: create/list operators, soft-delete, create/edit pricing tiers
- Admin UI pages: `/admin/pricing` (tier create/edit), `/admin/operators` (create/list/deactivate)
- Reservation integration: calculate price at creation, capture tier snapshot, validate operator sector access
- RLS policies: operators see only assigned sectors; admins see all

**Out of scope:**
- Self-service operator registration, bulk imports, pricing templates, occupancy-based pricing, price negotiation workflows, multi-facility support, dynamic pricing

## Architecture / Approach

```
Admin → Pricing Tiers (per-sector, versioned) ← Reservation Creation
              ↓
         Discount Calculation Service
         (fractional days → tier lookup → floor per tier)
              ↓
        Reservation stored with pricing_tier_id snapshot

Admin → Operators (soft-delete, sector assignments) → Sector-restricted RLS
              ↓
        Operator can only create/view assigned sectors
```

**Data flow:**
1. Admin defines pricing tiers for each sector (base rate + discount steps + floor)
2. Operator logs in → sees only assigned sectors
3. Operator creates reservation → API fetches active tier for sector → calculates price → stores with tier_id + operator_id
4. If operator overrides price → price_override flag set for audit
5. When tier updated → new reservations use new tier; old reservations retain original tier_id (immutable)

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. Data Model | Migrations: pricing_tiers versioning, operators, sector assignments, reservations audit columns | Migration safety: backfilling existing data without loss |
| 2. Pricing Service | calculatePrice() logic: fractional days, discount tiers, floor; unit tests | Correct day-counting and tier-boundary edge cases |
| 3. Operator API | POST/GET/PATCH endpoints: create, list, deactivate operators; temp password generation | Temp password security and display-once UX |
| 4. Pricing UI | Admin form to create/edit tiers per sector; extract to React component; pricing list page | Form validation and discount-step row handling |
| 5. Operator UI | Admin form to create operators, assign sectors; operator list with deactivation; middleware sector filtering | Operator sector restriction enforcement in RLS |
| 6. Reservation Integration | Price calculation in reservation creation API; capture tier snapshot; operator sector validation; price override audit | Price immutability and audit trail accuracy |

**Prerequisites:** Supabase auth working, middleware established, admin pages scaffolded, sector model exists  
**Estimated effort:** ~3-4 sessions across 6 phases (roughly ~15-20 hours for implementation + testing)

## Open Risks & Assumptions

- **Assumption**: Supabase auth integrates smoothly with temp password flow (admin API can create user with password). If it requires email confirmation, plan needs adjustment.
- **Assumption**: Existing reservations can be backfilled with current active tier without conflicts. If data is complex, migration needs care.
- **Risk**: Operator sector filtering at RLS level is complex for M:N; plan delegates to middleware + API validation (simpler, but requires discipline to not miss a path).
- **Risk**: Fractional day counting affects boundary cases (e.g., exactly 24-hour spans). Tests must cover; implementation should be explicit.

## Success Criteria (Summary)

- Admin can create pricing tiers per sector with custom discount steps; tiers version correctly (old preserved, new active)
- Operators can be created, assigned to sectors, and deactivated; deactivated operators can't log in
- Operators see only assigned sectors in dashboard and can create reservations only for those sectors
- Reservations calculate price correctly using active tier; price is immutable; overrides are audited
- End-to-end: admin sets up tier → operator creates reservation → price calculated → tier updated → new reservation uses new price; old reservation unchanged
