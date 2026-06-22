# Pricing Configuration & Operator Account Management Implementation Plan

## Overview

This plan implements Admin-configurable pricing tiers (per-sector) and operator account management (creation, sector assignment, deactivation) with price calculation integration into the reservation flow. Operators will be assigned to specific sectors with soft-delete deactivation, pricing tiers versioned for immutability, and price calculations applied at reservation creation time with optional override flags for audit trails.

## Current State Analysis

**Database**:

- `pricing_tiers` table exists (global, single active tier) with `base_daily_rate`, `daily_floor`, and `discount_steps` (JSONB)
- `reservations` table has `price_total` and `price_override` fields but **lacks `pricing_tier_id` and `created_by_operator_id`** — price isn't versioned
- **No `operators` table** exists — Supabase auth stores users but no app-level operator records with sector assignments
- **No `operator_sector_assignments` table** — operators lack sector restrictions

**Auth & RLS**:

- Roles (admin, operator) stored in Supabase JWT `app_metadata.role`
- `current_user_role()` function reads role from JWT for RLS policies
- No operator-sector filtering in RLS — operators see all sectors

**Admin UI**:

- `src/pages/admin/structure.astro` uses large inline Astro script for sector form (follows pattern flagged in lessons.md for extraction to React)
- Pattern: fetch data server-side, render with Astro, wire form interactivity inline

**Key Discoveries**:

- Pricing tiers currently global (one active); decision: make per-sector with versioning
- Price not versioned on reservations; decision: capture `pricing_tier_id` at creation for audit
- Operators not distinguished from admins in app DB; decision: soft-delete with deactivation_date
- Discount steps stored as JSONB; structure TBD based on admin UI form
- Fractional days: partial days count as full days for tier calculation

## Desired End State

1. **Pricing Configuration**: Admins can create/edit pricing tiers per sector with base rate, custom discount steps (day ranges + percentages), and daily minimum floor. Pricing history is preserved (versioning).

2. **Operator Management**: Admins can create operators (with temp password), assign them to sectors (checkboxes), view operator list, and deactivate operators (soft-delete, audit trail).

3. **Price Calculation**: Reservation creation calculates price using the sector's active pricing tier, applying day-range discounts, flooring per tier, and counting fractional days as full days. Price is immutable (tied to tier snapshot).

4. **Operator Sector Restriction**: Operators only see sectors they're assigned to; reservations created for unassigned sectors are rejected (RLS + middleware).

5. **Override Audit**: Price overrides flagged in reservations table with operator ID and timestamp.

**Verification**:

- Admin creates pricing tier with 2 discount steps → tier appears in list with versioning
- Admin creates operator, assigns to Sector A/B → operator logs in, sees only A/B in dashboard
- Operator creates reservation (2.5 day stay) → price calculated with correct tier + day floor
- Admin updates pricing → new reservations use new tier; old reservations retain original price
- Operator deactivated → still appears in list (marked inactive), old reservations keep audit trail

## What We're NOT Doing

- **No self-service operator registration** — admin creates accounts only (per PRD)
- **No customer-facing pricing display** — operators configure for internal use only
- **No bulk operator import** — single creation per operator in MVP
- **No pricing tier templates** — each tier configured from scratch
- **No dynamic pricing based on occupancy** — tier is static per sector
- **No price negotiation workflow** — override is simple flag, no approval required
- **No multi-facility support** — single parking lot only (future scope)

## Implementation Approach

**Data Model Changes**:

1. Modify `pricing_tiers` to add `sector_id` (FK to sectors) and remove global `is_active` unique index
2. Add `pricing_tier_id` and `created_by_operator_id` to reservations
3. Create `operators` table (email, password_hash, deactivated_at for soft-delete)
4. Create `operator_sector_assignments` table (operator_id, sector_id)

**Calculation Service**:

- Build `PricingService.calculatePrice()` — takes arrival, departure, tier, returns price with breakdown
- Handle fractional day counting (any partial day = full day)
- Apply discount tiers, then floor per tier

**Admin UI**:

1. Extract inline scripts to React components (following lessons.md)
2. Pricing form: sector dropdown → base rate + discount tier rows (day-min, day-max, %) + floor + save
3. Operator form: email + sector checkboxes + generate temp password (display once) + save

**RLS & Access Control**:

- Update reservations RLS to filter by operator's assigned sectors
- Add RLS to `operators` table: operators can read own record, admins can CRUD all
- Middleware validates operator sector assignments

## Critical Implementation Details

**Fractional Day Handling**: Arrivals and departures can be any time. Stay from Mon 2:00 PM to Wed 10:00 AM = 3 full days (Mon + Tue + Wed partial = 3 for tier calculation). Floor applies per discount tier, not globally.

**Pricing Tier Versioning**: When admin saves an updated tier (e.g., base rate change), the old tier is preserved with an `ended_at` timestamp. New reservations use the latest active tier for that sector. Existing reservations reference the tier ID they used at creation.

**Operator Deactivation**: Soft-delete via `deactivated_at` timestamp. Deactivated operators cannot log in (auth check) but their reservations and audit trails remain. Admin can see deactivated operators in a separate view or filtered list.

**Password Generation**: Admin generates a random temporary password (min 12 chars, mixed case + numbers). This is displayed once and not stored (admin must copy and share). On first login, operator must change password.

## Phase 1: Pricing Tier Data Model & Versioning

### Overview

Create the database foundation for per-sector pricing tiers with versioning, supporting custom discount steps and per-tier floors. Migrate existing global `pricing_tiers` data into per-sector structure.

### Changes Required

#### 1. Database Migration: Modify Pricing Tiers for Per-Sector

**File**: `supabase/migrations/20260622000000_add_sector_pricing_versioning.sql`

**Intent**: Add `sector_id` FK to link pricing tiers to sectors; add `ended_at` for versioning; remove global `is_active` unique index and replace with per-sector uniqueness (one active tier per sector at a time).

**Contract**:

- Add column `sector_id UUID NOT NULL REFERENCES public.sectors(id)`
- Add column `ended_at TIMESTAMPTZ` (null = currently active)
- Drop existing `one_active_tier` unique index
- Create new index `one_active_tier_per_sector ON public.pricing_tiers(sector_id) WHERE ended_at IS NULL` (one active per sector)
- Update RLS to restrict based on operator's assigned sectors

---

#### 2. Database Migration: Create Operators Table

**File**: `supabase/migrations/20260622000001_create_operators.sql`

**Intent**: Store app-level operator records with soft-delete via `deactivated_at` timestamp.

**Contract**:

- Columns: `id UUID primary key`, `user_id UUID NOT NULL REFERENCES auth.users(id)`, `deactivated_at TIMESTAMPTZ` (null = active)
- RLS: operators can read own record only, admins can read all, only admins can update
- Trigger: sync operator creation/deletion with user management (optional for MVP)

---

#### 3. Database Migration: Create Operator Sector Assignments

**File**: `supabase/migrations/20260622000002_create_operator_sector_assignments.sql`

**Intent**: Many-to-many link between operators and sectors.

**Contract**:

- Columns: `operator_id UUID NOT NULL REFERENCES public.operators(id)`, `sector_id UUID NOT NULL REFERENCES public.sectors(id)`, `assigned_at TIMESTAMPTZ DEFAULT now()`
- Primary key: `(operator_id, sector_id)`
- RLS: operators can read own assignments, admins can read/write all

---

#### 4. Database Migration: Link Reservations to Pricing Tier & Operator

**File**: `supabase/migrations/20260622000003_update_reservations_pricing_audit.sql`

**Intent**: Capture which pricing tier and operator created a reservation for audit and immutability.

**Contract**:

- Add column `pricing_tier_id UUID REFERENCES public.pricing_tiers(id)` (not null on new rows; backfill existing with active tier for sector)
- Add column `created_by_operator_id UUID REFERENCES public.operators(id)` (nullable, admin can create without operator context)

---

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db push`
- Type generation updates: `npx supabase gen types typescript > src/database.types.ts`
- No existing data loss: all existing reservations backfilled with current active tier reference
- Unique index correctly created: only one `ended_at IS NULL` per sector in pricing_tiers

#### Manual Verification

- Run Supabase local dev: `npx supabase start` — migrations apply without error
- Query pricing_tiers: confirm sector_id is populated and not null
- Query operators: confirm table is empty (no seeded data yet)
- Query operator_sector_assignments: confirm table is empty
- Confirm reservations have pricing_tier_id and created_by_operator_id columns

---

## Phase 2: Pricing Service & Calculation Logic

### Overview

Implement the PricingService with calculation logic: fractional day counting, discount tier lookup, floor application. Unit test edge cases (boundary discounts, fractional days, floor application).

### Changes Required

#### 1. Pricing Calculation Service

**File**: `src/lib/services/pricingService.ts`

**Intent**: Core calculation logic that computes total price for a stay given arrival/departure timestamps, pricing tier, and discount structure.

**Contract**: Export `calculatePrice(arrival: Date, departure: Date, tier: PricingTier) -> { totalPrice: number, breakdown: PriceBreakdown }`.

Algorithm:

1. Parse `discount_steps` JSONB from tier (array of `{dayMin, dayMax, discountPercent}`)
2. Calculate stay duration in days: count each partial day as 1 full day (e.g., Mon 2pm to Wed 10am = 3)
3. For each discount tier (ordered by day range):
   - Count how many days fall in this range
   - Apply discount: `price = base_daily_rate * (100 - discountPercent) / 100`
   - Apply floor: `price = max(price, daily_floor)`
   - Add to total
4. Return total price + breakdown (per-tier costs for UI display)

**Example Snippet** (conceptual):

```typescript
// Stay 8 days, base $100/day, tiers: [1-3 days: 0%, 4-7 days: 10%, 8+: 20%], floor $50/day
// Days 1-3: $100 * 1.0 = $100/day, floored to $100 → $300
// Days 4-7: $100 * 0.9 = $90/day, floored to $50 → $360
// Days 8: $100 * 0.8 = $80/day, floored to $50 → $80
// Total: $740
```

---

#### 2. Unit Tests: Pricing Calculation Edge Cases

**File**: `src/lib/services/pricingService.test.ts`

**Intent**: Verify calculation logic handles boundary conditions correctly.

**Test Cases**:

- Single day stay (arrival Mon 10am, departure Mon 5pm) = 1 day
- Overnight stay (Mon 2pm to Tue 2pm) = 2 days
- Fractional with discount boundary (3.5 days, tier boundary at 4 days) = counts as 4 days
- Floor application: discounted rate below floor → applies floor
- Multiple discount tiers: verify each tier applied correctly
- Discount tier not found (stay duration outside all ranges) → default to last tier or raise error (define behavior)

---

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Unit tests pass: `npm run test` (or manual jest run if test suite not set up)
- Linting passes: `npm run lint`

#### Manual Verification

- Create a test pricing tier with discount steps → manually call `calculatePrice()` and verify output matches expectation
- Test edge cases: 1-day stay, 3.5-day stay, 10-day stay with multiple discount tiers
- Verify floor is applied correctly when discount causes price below minimum

---

## Phase 3: Operator Account Management API

### Overview

Create API endpoints for admin to manage operators: create (with temp password generation), list, deactivate (soft-delete). Link operators to Supabase auth users and assign sectors.

### Changes Required

#### 1. Operator Creation Endpoint

**File**: `src/pages/api/admin/operators.ts`

**Intent**: POST endpoint for admin to create a new operator account, generate temp password, and assign sectors.

**Contract**:

- POST `/api/admin/operators` with body: `{ email, sectorIds: string[] }`
- Returns: `{ operatorId, tempPassword, email, sectors }`
- Implementation:
  1. Verify admin role
  2. Check email not already in use (query auth.users and operators)
  3. Create Supabase auth user via admin API with temp password (use `generateRandomPassword()` helper)
  4. Create operators record linked to auth user
  5. Insert operator_sector_assignments for each sector in sectorIds
  6. Return operator record + temp password (generated, not stored)

---

#### 2. Operator List Endpoint

**File**: `src/pages/api/admin/operators.ts` (GET method)

**Intent**: GET endpoint for admin to list all operators (active and deactivated) with sector assignments.

**Contract**:

- GET `/api/admin/operators` — returns array of operators with `{ id, email, sectorIds, deactivatedAt, createdAt }`
- Query params: `?includeDeactivated=true` (default false)

---

#### 3. Operator Deactivation Endpoint

**File**: `src/pages/api/admin/operators.ts` (PATCH method)

**Intent**: PATCH endpoint to deactivate an operator (soft-delete).

**Contract**:

- PATCH `/api/admin/operators/:id` with body: `{ action: "deactivate" }`
- Sets `deactivated_at = now()` on operators record
- Does NOT delete auth user (if we want auth to be separate), or set auth user to disabled state (depends on preference)

---

#### 4. Password Generation Helper

**File**: `src/lib/auth.ts` (new or existing)

**Intent**: Generate a random temp password (min 12 chars, mixed case, numbers, symbols).

**Contract**: Export `generateTempPassword(): string`. Use a library like `crypto` or `nanoid` for randomness.

---

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- API routes compile without error

#### Manual Verification

- Start dev server: `npm run dev`
- Call POST `/api/admin/operators` with valid email and sector IDs → operator created, temp password returned (can see in response)
- Call GET `/api/admin/operators` → list includes newly created operator
- Verify operator record in Supabase dashboard exists with correct sector assignments
- Call PATCH `/api/admin/operators/:id` with deactivate action → operator marked deactivated, still in list

---

## Phase 4: Admin Pricing Configuration UI

### Overview

Build admin UI for creating and editing pricing tiers per sector. Extract form logic to React component following lessons.md pattern. Allow admin to define base rate, discount tiers (day ranges + percentages), and daily floor.

### Changes Required

#### 1. Pricing Configuration Form Component

**File**: `src/components/admin/PricingTierForm.tsx` (new React component)

**Intent**: Reusable form for creating/editing pricing tiers with dynamic discount tier rows.

**Contract**:

- Props: `{ sectorId, onSave, onCancel, initialTier? }`
- Fields: sector dropdown, base_daily_rate (number), daily_floor (number), dynamic discount_steps rows (day-min, day-max, discount-percent)
- "Add Tier" button to insert new discount step row
- "Remove" buttons on each discount step row
- Validation: base rate > 0, floor >= 0, discount % 0-100, day ranges don't overlap
- On save: POST to `/api/admin/pricing` with tier data; on success, close form and refresh list

---

#### 2. Pricing Tier List Page

**File**: `src/pages/admin/pricing.astro` (new)

**Intent**: Admin page listing all pricing tiers per sector, with create/edit buttons.

**Contract**:

- Display sectors with their active pricing tier
- Show tier creation date and status (active/archived)
- "Edit" button → open form modal
- "Create New Tier" button per sector → open form for that sector
- Conditionally show deactivated/old tiers (toggle or separate tab)

---

#### 3. Pricing API Endpoint

**File**: `src/pages/api/admin/pricing.ts` (new)

**Intent**: POST endpoint for admin to save pricing tier configuration.

**Contract**:

- POST `/api/admin/pricing` with body: `{ sectorId, baseRate, floor, discountSteps: [{dayMin, dayMax, discountPercent}] }`
- Implementation:
  1. Verify admin role
  2. If tier exists for sector, set `ended_at = now()` on old tier
  3. Insert new pricing tier with sector_id and is_active = true
  4. Return new tier record

---

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint --fix`
- Prettier formatting: `npm run format`
- Component compiles without error

#### Manual Verification

- Start dev server: `npm run dev`
- Navigate to `/admin/pricing` → see sectors listed with create buttons
- Click "Create Tier" for a sector → PricingTierForm opens
- Enter base rate, floor, add 2 discount tiers (e.g., 1-3 days, 4-7 days), click Save
- Tier appears in list for that sector with correct rates
- Edit the tier → form pre-populates with data, modify values, save
- Verify old tier is marked inactive and new tier active in Supabase

---

## Phase 5: Admin Operator Management UI

### Overview

Build admin UI for managing operators: create, assign to sectors, view list, deactivate. Extract form to React component. Display operator list with sector assignments and deactivation status.

### Changes Required

#### 1. Operator Management Form Component

**File**: `src/components/admin/OperatorForm.tsx` (new React component)

**Intent**: Form for admin to create operator accounts and assign sectors.

**Contract**:

- Props: `{ onSave, onCancel }`
- Fields: email (text), sector checkboxes (list of all sectors)
- On save: POST to `/api/admin/operators` → display temp password in a success modal (copy-to-clipboard button)
- Validation: email format, at least one sector selected

---

#### 2. Operator List Page

**File**: `src/pages/admin/operators.astro` (new)

**Intent**: Admin page listing all operators with actions.

**Contract**:

- Table with columns: email, sectors (comma-separated names), status (Active/Deactivated), actions (Edit, Deactivate/Reactivate)
- "Create Operator" button → open form
- Filter toggle: show only active / show all
- Click "Deactivate" → PATCH `/api/admin/operators/:id` with deactivate action → operator status updates in table

---

#### 3. Integration with Reservations (RLS & Middleware)

**File**: `src/middleware.ts` (update), `src/lib/supabase.ts` (if needed)

**Intent**: Ensure operators only see sectors they're assigned to.

**Contract**:

- Middleware: After auth, fetch operator's sector assignments and attach to `context.locals.operatorSectors`
- Reservations RLS: Add policy filtering by operator's assigned sectors (or block queries for restricted sectors)
- Reservation creation: Verify operator has access to the requested sector

---

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Component compiles without error

#### Manual Verification

- Start dev server: `npm run dev`
- Navigate to `/admin/operators` → see empty list initially
- Click "Create Operator" → form opens
- Enter email, check 2 sectors, click Save → temp password displayed (can copy), form closes
- New operator appears in list with correct sectors and "Active" status
- Click "Deactivate" → operator status changes to "Deactivated" (still visible)
- Log in as the newly created operator → can see dashboard
- Verify operator sees only assigned sectors in reservation creation flow

---

## Phase 6: Reservation Integration & Price Calculation

### Overview

Integrate pricing calculation into the reservation creation flow. Capture pricing tier ID and operator ID at reservation creation. Update reservation API endpoint to calculate price and apply operator sector restrictions.

### Changes Required

#### 1. Update Reservation Creation Endpoint

**File**: `src/pages/api/admin/reservations.ts` (or operator endpoint if separate)

**Intent**: Modify reservation creation to calculate price using sector's active pricing tier and validate operator sector access.

**Contract**:

- Before creating reservation:
  1. Fetch active pricing tier for the sector
  2. Call `calculatePrice(arrival, departure, tier)` → get total price
  3. Verify operator has access to sector (check operator_sector_assignments)
  4. On save, include: `pricing_tier_id`, `created_by_operator_id`, `price_total`
  5. If operator overrides price: set `price_override = true` and log override

---

#### 2. Reservation Creation UI Update

**File**: `src/pages/dashboard.astro` or reservation component

**Intent**: Display calculated price before operator confirms booking. Allow override with warning flag.

**Contract**:

- Show "Calculated Price: $XXX" after operator selects arrival/departure
- Display price breakdown (if available from `calculatePrice()` response)
- Optional checkbox: "Override Price" → text input for custom price
- Warning message if override is selected: "This override will be audited"
- On submit: send price + override flag to API

---

#### 3. Unit Tests: Reservation Price Immutability

**File**: Reservation-related test files

**Intent**: Verify that price is correctly captured and remains immutable after creation.

**Test Cases**:

- Create reservation with pricing tier X → price locked to tier X
- Update pricing tier for sector → existing reservation price unchanged
- Create new reservation with updated tier → new price calculated with updated tier
- Override price → flag set correctly, audit trail recorded

---

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Existing tests pass: `npm run test` (if any)

#### Manual Verification

- Start dev server: `npm run dev`
- Log in as operator (assigned to Sector A)
- Create reservation: select sector, arrival, departure → calculated price appears
- Verify price matches manual calculation (e.g., 8 days with tier: $740)
- Override price to custom amount → warning appears, "price override" flag shown
- Submit reservation → reservation created with correct pricing tier ID and operator ID
- Update pricing tier → create new reservation and verify new price is calculated with updated tier
- Verify old reservation still has original price (immutable)

---

## Testing Strategy

### Unit Tests

- `pricingService.test.ts`: Fractional day counting, discount tier application, floor logic, edge cases
- Form validation: PricingTierForm and OperatorForm validate inputs correctly

### Integration Tests

- Operator creation → auth user created, sector assignments recorded
- Pricing tier versioning → old tier preserved, new tier active
- Reservation creation → pricing tier captured, price calculated correctly, operator sector access enforced
- Operator deactivation → operator can no longer create reservations

### Manual Testing Steps

1. **Admin setup**: Log in as admin, navigate to `/admin/pricing`, create a pricing tier for Sector A (base $100, 1-3 days = 0%, 4+ days = 20%, floor $50)
2. **Operator creation**: Navigate to `/admin/operators`, create operator (email: `test@example.com`, assign to Sector A), copy temp password
3. **Operator login**: Log out, log in as operator with temp password, confirm can only see Sector A
4. **Create reservation**: In operator dashboard, create reservation (2 days, Sector A) → price should be $200 (2 × $100)
5. **Test discount**: Create 5-day reservation → price should be $450 (3 × $100 + 2 × $80, floored where needed)
6. **Price override**: Create another 2-day reservation but override price to $180 → reservation created with override flag
7. **Pricing tier update**: As admin, update pricing tier for Sector A (base $120) → new reservations use new price; old reservations retain $100 base
8. **Operator deactivation**: As admin, deactivate the operator → operator can no longer log in; existing reservations remain

---

## Performance Considerations

- Pricing calculation is synchronous and in-process; no caching needed for MVP (tier lookup is fast DB query)
- Operator sector assignments could be cached in session/middleware to reduce per-request DB queries
- For large operator counts (100+), pagination on operator list page recommended

## Migration Notes

- Backfill `pricing_tier_id` on existing reservations using current active tier for each sector
- Backfill `created_by_operator_id` as null for existing reservations (created before operator tracking)
- No data deletion; all migrations are additive

## References

- Related research: `context/changes/pricing-operator-setup/research.md` (if created)
- Pricing schema: `src/database.types.ts` (generated from Supabase)
- Similar patterns: `src/pages/api/admin/sectors.ts` (batch operations, RLS enforcement)
- Lessons learned: `context/foundation/lessons.md` (extract forms to React, component mounting)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pricing Tier Data Model & Versioning

#### Automated

- [x] 1.1 Modify pricing_tiers migration: add sector_id, ended_at, update unique index — 9ef8b005
- [x] 1.2 Create operators table migration — 9ef8b005
- [x] 1.3 Create operator_sector_assignments migration — 9ef8b005
- [x] 1.4 Update reservations with pricing_tier_id and created_by_operator_id — 9ef8b005

#### Manual

- [x] 1.5 Verify migrations apply cleanly and data backfilled

### Phase 2: Pricing Service & Calculation Logic

#### Automated

- [x] 2.1 Implement PricingService.calculatePrice() with fractional day logic — 1bc45d19
- [x] 2.2 Unit tests: fractional days, discount tiers, floor application — 1bc45d19
- [x] 2.3 Type checking and linting pass — 1bc45d19

#### Manual

- [x] 2.4 Manual calculation tests: verify edge cases match expected output — 1bc45d19

### Phase 3: Operator Account Management API

#### Automated

- [x] 3.1 Implement POST /api/admin/operators (create with temp password) — d47c4af6
- [x] 3.2 Implement GET /api/admin/operators (list) — d47c4af6
- [x] 3.3 Implement PATCH /api/admin/operators/:id (deactivate) — d47c4af6
- [x] 3.4 Implement generateTempPassword() helper — d47c4af6

#### Manual

- [ ] 3.5 Test operator creation and temp password display
- [ ] 3.6 Test operator list retrieval
- [ ] 3.7 Test operator deactivation

### Phase 4: Admin Pricing Configuration UI

#### Automated

- [x] 4.1 Create PricingTierForm React component with validation — 052e6632
- [x] 4.2 Create /admin/pricing page with tier list — 052e6632
- [x] 4.3 Implement POST /api/admin/pricing (save tier) — 052e6632
- [x] 4.4 Type checking and linting pass — 052e6632

#### Manual

- [ ] 4.5 Create pricing tier via UI, verify saved correctly
- [ ] 4.6 Edit pricing tier, verify update and versioning (old tier preserved)
- [ ] 4.7 Verify multiple tiers per sector handled (only one active)

### Phase 5: Admin Operator Management UI

#### Automated

- [x] 5.1 Create OperatorForm React component with validation — f36ce77d
- [x] 5.2 Create /admin/operators page with list and actions — f36ce77d
- [x] 5.3 Update middleware to attach operator sector assignments — f36ce77d
- [x] 5.4 Update reservations RLS to restrict by sector — f36ce77d
- [x] 5.5 Type checking and linting pass — f36ce77d

#### Manual

- [ ] 5.6 Create operator via UI, verify email and sectors
- [ ] 5.7 Log in as new operator, verify only assigned sectors visible
- [ ] 5.8 Deactivate operator, verify status update
- [ ] 5.9 Test operator sector restriction: try to create reservation in unassigned sector (should be rejected)

### Phase 6: Reservation Integration & Price Calculation

#### Automated

- [ ] 6.1 Update reservation creation endpoint to calculate price
- [ ] 6.2 Capture pricing_tier_id and created_by_operator_id on save
- [ ] 6.3 Implement price override with audit flag
- [ ] 6.4 Unit tests: price immutability, tier capture

#### Manual

- [ ] 6.5 Create reservation, verify calculated price matches expectation
- [ ] 6.6 Override price, verify flag and audit trail
- [ ] 6.7 Update pricing tier, create new reservation, verify new price; old reservation unchanged
- [ ] 6.8 End-to-end: admin setup tier → operator creates reservation → operator deactivated → verify audit trail
