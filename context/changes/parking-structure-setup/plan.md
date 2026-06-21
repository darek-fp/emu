# Parking Structure Setup Implementation Plan

## Overview

Admin can define and update parking lot sectors with spot counts. For MVP, the system operates in **single-lot mode** (no sector division initially); sectors are scaffolded but not exposed to operators until v2. Admin operations include: creating sectors, updating spot counts, and deleting sectors (with conflict warnings if active reservations exist for affected sectors). All structural changes are atomic — validate all changes first, then apply all or reject entirely. Reduced spot counts are blocked if active (confirmed or arrived) reservations exist in the affected sector.

## Current State Analysis

**What exists:**
- Supabase `sectors` table with RLS policies enforcing admin-only INSERT/UPDATE/DELETE (schema in `supabase/migrations/20260605120001_create_sectors.sql`)
- Supabase `reservations` table tracking sector_id, customer data, arrival/departure times, and status (schema in `supabase/migrations/20260605120003_create_reservations.sql`)
- Middleware role checking in `src/middleware.ts` enforcing `/admin/*` route access to admin users only
- No admin UI exists yet; no sector management endpoints

**What's missing:**
- Admin configuration page at `/admin/structure`
- React form component for sector CRUD (add, update, delete sectors)
- API endpoints for sector operations: POST/PUT/DELETE `/api/admin/sectors`
- Conflict detection logic: query active reservations to detect when a structural change would violate constraints
- Operator read-only view of sectors (for S-03: reservation creation needs to display available sectors and spot counts)

**Constraints & patterns:**
- Role enforcement: middleware checks `role === "admin"` for `/admin/*` paths; RLS policies automatically enforce via `current_user_role() = 'admin'` on the database side
- API pattern: POST/PUT requests use form data; responses redirect on error or return JSON on success (no Zod validation yet — client-side validation in React is the pattern)
- UI pattern: Astro pages with React islands (`client:load`); FormField + SubmitButton components for forms; shadcn/ui Button, Dialog, AlertDialog for UI
- Data model: spot_count is an integer on sectors; no individual spot records; availability is implicit (sector.spot_count - count of active reservations in that sector determines occupancy)

## Desired End State

**User experience:**
1. Admin navigates to `/admin/structure` and sees the current parking structure (initially empty or a default single-lot sector)
2. Admin clicks "Edit" to enter edit mode; form fields become editable for sector names and spot counts
3. Admin can add new sectors by entering a name and spot count; remove sectors; or update spot counts
4. Admin submits changes; if active reservations exist in any affected sector, a conflict warning dialog appears listing affected sectors and the count of active reservations per sector
5. Admin either cancels (no changes applied) or confirms (all changes applied atomically)
6. On success, the page refreshes to show the updated structure; on error, a toast or inline error message displays

**Verification:**
- Admin can create a sector with a name and spot count
- Admin can update a sector's spot count
- Admin cannot delete a sector (per decision: reduce spot counts only — no sector deletion)
- Structural changes are rejected if active reservations exist in affected sectors, with a clear explanation to the admin
- All structural changes (add, update) are applied atomically — if one fails validation, none are persisted
- Operators can view sectors and spot counts in the `/dashboard` (read-only, no edit capability)

## What We're NOT Doing

- **Sector deletion** — only spot count reduction is allowed (PR decision)
- **Partial-batch updates** — if multiple sectors are being updated and one has a conflict, the entire batch is rejected (atomic validation and application)
- **Automatic spot reassignment** — spot assignment to reservations is operator-driven in S-03; this slice only configures the pool of available spots per sector
- **Multi-lot support** — single-lot (one default sector) for MVP; multi-sector complexity is deferred to v2
- **Sector-level RLS policies** — all sectors are visible to all authenticated admins and operators; no per-sector access control

## Implementation Approach

**Atomicity and safety:**
- All structural changes are validated at the API layer before any database writes occur
- Conflict detection: query reservations with `status IN ('confirmed', 'arrived')` (not 'departed' or 'canceled') to determine active bookings per sector
- If reducing a sector's spot_count below the peak concurrent reservation count in that sector during the update window, reject with a clear reason
- Database writes are wrapped in a single transaction to ensure atomicity; if any insert/update fails, the entire change batch rolls back

**Validation order:**
1. Authenticate: check role === 'admin' (middleware + RLS)
2. Parse request: extract sector operations (add, update, delete)
3. Query existing structure: fetch current sectors and pricing tier info
4. Validate each operation: name uniqueness, spot_count > 0, detect conflicts with active reservations
5. Build change batch: collect all validated changes
6. Execute atomically: insert/update sectors in a single transaction; return success or detailed error

**Operator visibility:**
- Operators can query sectors via GET `/api/sectors` (read-only, RLS enforces SELECT permission)
- Operators use sector list + spot_count to check availability in S-03 (reservation creation)
- No operator access to admin endpoints

## Critical Implementation Details

**Conflict detection specifics:**
When admin attempts to reduce spot_count in a sector, check if there are active reservations. "Active" means `status IN ('confirmed', 'arrived')`. If peak concurrent reservations exceed the new spot_count, reject. Example: sector "A" currently has 10 spots; admin tries to reduce to 8; query finds 9 active reservations with overlapping time windows → reject.

**Atomic batch updates:**
All changes in a single request must be validated before any writes. Use a Supabase RPC or client-side transaction logic (if using raw SQL) to ensure atomicity. If using the JavaScript client, construct a batch of updates and apply them within a transaction context; if one fails, none are persisted.

---

## Phase 1: Admin Configuration Page Scaffold

### Overview

Create the admin configuration page at `/admin/structure` with a read-only view of current sectors and an edit mode toggle. The page displays the current parking structure (sectors and spot counts) and provides a button to enter edit mode. In edit mode, a form appears allowing the admin to add, update sector details. The page is protected by admin-only middleware and uses React for interactivity (form state) within an Astro page.

### Changes Required:

#### 1. Astro page for admin structure configuration

**File**: `src/pages/admin/structure.astro`

**Intent**: Create the main admin configuration page. On page load, fetch current sectors from the database and display them in a read-only view. Provide an "Edit" button to toggle to edit mode, which renders the SectorForm React island. The page respects the `/admin/*` middleware protection; unauthenticated or non-admin users are redirected.

**Contract**: Page exports `prerender = false` (SSR). Page frontmatter queries sectors via Supabase client (`createClient` from `@/lib/supabase`). Passes sectors data to the SectorList React component. Uses `Astro.locals.user` and `Astro.locals.role` from middleware context to verify admin access (middleware already handles redirect, so the page itself just reads the data).

#### 2. React component for sector list display (read-only)

**File**: `src/components/admin/SectorList.tsx`

**Intent**: Display the current list of sectors in a table or card layout. Each row shows sector name and current spot count. Used in both view and edit modes (read-only in view; edit mode overlays a form on top). This component is stateless and receives sectors as props.

**Contract**: Interface: `SectorListProps = { sectors: Sector[] }`. Renders a table with columns: [Name, Spot Count]. Each row can be selected (for deletion in edit mode, if supported). Export a `<SectorList sectors={sectors} selectedId={selectedId} onSelect={onSelect} />` component.

#### 3. React component for sector form (add/update sectors)

**File**: `src/components/admin/SectorForm.tsx`

**Intent**: React form for adding new sectors or updating existing sector spot counts. Uses local state to manage form fields (sector name, spot count) and form submission via POST/PUT to the API endpoint `/api/admin/sectors`. Implements client-side validation (name not empty, spot_count > 0). On submission, sends a batch of changes to the API; displays errors or success toast.

**Contract**: Interface: `SectorFormProps = { sectors: Sector[], onSuccess: () => void }`. Form has fields for add operations (new sector name + spot count) and inline update fields for existing sectors (edit spot count per row). Implements validation and error display via FormField component (following auth pattern from `src/components/auth/FormField.tsx`). On submit, posts to `/api/admin/sectors` with a batch payload: `{ operations: [{ type: 'add'|'update', id?, name?, spotCount? }, ...] }`.

#### 4. Admin page layout and styling

**File**: `src/layouts/AdminLayout.astro` (new)

**Intent**: Shared layout for admin pages (structure, pricing, operators — future slices). Includes Topbar + sidebar navigation for admin routes. Inherits from main Layout.astro.

**Contract**: Astro layout; wraps `<slot />` with admin-specific header and nav.

### Success Criteria:

#### Automated Verification:

- Page renders at `/admin/structure` without 500 errors
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Middleware correctly redirects non-admin users away from `/admin/structure`

#### Manual Verification:

- Navigating to `/admin/structure` as an admin displays the current sectors (from DB) in a table
- "Edit" button toggles the form visibility
- Form displays input fields for sector name and spot count
- Validation errors appear when submitting empty name or non-positive spot count

**Implementation Note**: Complete Phase 1 form and layout scaffolding before proceeding to Phase 2 API endpoints. The form structure here is the contract Phase 2 will implement against.

---

## Phase 2: Sector CRUD API Endpoints

### Overview

Implement API endpoints for sector operations: POST to create sectors, PUT to update sectors, DELETE to remove sectors (if applicable). Endpoints validate requests, query existing sectors and active reservations for conflict detection, and return clear error messages if validation fails. All operations enforce admin-only access via middleware and RLS policies.

### Changes Required:

#### 1. API endpoint: POST /api/admin/sectors (create/update batch)

**File**: `src/pages/api/admin/sectors.ts`

**Intent**: Handle sector creation and updates in a single atomic operation. Request body contains a batch of operations: `{ operations: [{ type: 'add'|'update', name, spotCount, id? }, ...] }`. Validates each operation, detects conflicts with active reservations, and either applies all changes or rejects the entire batch.

**Contract**: 
- POST endpoint; middleware ensures `role === 'admin'`
- Request body (form data or JSON): `{ operations: Array<{ type: 'add'|'update', name?: string, spotCount?: number, id?: string }> }`
- Validation: each operation is validated before any writes. On validation failure, returns error response with details of which operation failed and why.
- Response on success: `{ success: true, sectors: Sector[] }` (returns updated full sector list)
- Response on error: `{ success: false, error: string, conflicts?: { sectorName: string, activeReservations: number }[] }`

#### 2. Conflict detection logic (query active reservations)

**File**: `src/lib/services/sectorService.ts` (new)

**Intent**: Encapsulate conflict detection and atomic sector operations. Exported functions: `detectConflicts(sectorId: string): Promise<ConflictInfo>` and `applyStructuralChanges(operations: Operation[]): Promise<Sector[]>`. The conflict detection queries reservations with `status IN ('confirmed', 'arrived')` to determine active bookings per sector.

**Contract**: 
- `detectConflicts(sectorId)` returns `{ hasConflict: boolean, activeReservations: number }`. Queries reservations where `sector_id = sectorId AND status IN ('confirmed', 'arrived') AND departure_at > now()`.
- `applyStructuralChanges(operations)` validates all operations, detects conflicts, and either applies all changes atomically or throws a descriptive error. Uses Supabase client transactions if available, or raw SQL BEGIN/COMMIT for atomicity.

#### 3. API endpoint: GET /api/admin/sectors (fetch current structure)

**File**: `src/pages/api/admin/sectors.ts` (GET handler)

**Intent**: Fetch current sector list with spot counts and (optional) count of active reservations per sector. Used by admin page to refresh after changes.

**Contract**: 
- GET endpoint; middleware ensures authenticated access (admin or operator for `/api/sectors`; admin-only for `/api/admin/sectors`)
- Response: `{ sectors: Sector[] }` or with optional `{ sectors: Array<Sector & { activeReservations: number }> }` for admin view
- No query params; returns all sectors

#### 4. Input validation and error responses

**File**: `src/lib/validators.ts` (new, or extend existing)

**Intent**: Client-side validation functions (already in React form) + server-side validation in API handler. Ensures spot_count > 0, sector names are non-empty and unique, operations are well-formed.

**Contract**: Exported functions: `validateSectorName(name: string): { valid: boolean, error?: string }`, `validateSpotCount(count: number): { valid: boolean, error?: string }`. Called in POST handler before any database operations.

### Success Criteria:

#### Automated Verification:

- POST /api/admin/sectors with valid batch operations succeeds and persists changes to database
- Conflicting operations (e.g., reducing spot count with active reservations) are rejected with clear error message
- GET /api/admin/sectors returns current sectors from database
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Supabase RLS policies correctly enforce admin-only access (non-admin requests return 403)

#### Manual Verification:

- Admin submits a batch of sector changes and sees them reflected on the page immediately
- Admin attempts to reduce spot count while active reservations exist; receives a conflict warning modal
- Atomic batch validation: if one operation in a batch fails, all operations are rejected (no partial updates)
- Error messages are clear and actionable ("Cannot reduce sector 'A' spot count: 9 active reservations exist")

**Implementation Note**: Implement conflict detection and atomic updates carefully. Use database transactions or Supabase RPC to ensure atomicity. Test with concurrent requests to verify no race conditions.

---

## Phase 3: Conflict Detection and Reservation Query Logic

### Overview

Implement the core conflict detection logic. When an admin attempts to reduce a sector's spot count, query active reservations to determine if the new spot count would violate overbooking constraints. If the peak concurrent reservations exceed the new spot count, reject the change with a clear explanation to the admin.

### Changes Required:

#### 1. Reservation overlap detection query

**File**: `src/lib/services/sectorService.ts` (expand from Phase 2)

**Intent**: Query active reservations in a sector and detect the peak concurrent occupancy during any time window. This is used to determine if reducing spot_count would create an overbooking situation.

**Contract**: 
- Function: `getPeakConcurrentReservations(sectorId: string, timeRange?: { start: Date, end: Date }): Promise<number>`
- Queries reservations where `sector_id = sectorId AND status IN ('confirmed', 'arrived')`
- Returns the maximum number of overlapping reservations at any point in time
- Time range defaults to "now and forward" if not provided

#### 2. Conflict detection in sector update handler

**File**: `src/pages/api/admin/sectors.ts` (expand from Phase 2)

**Intent**: In the POST handler, before applying any sector updates, for each "update" operation, call `getPeakConcurrentReservations()` and compare against the new spot_count. If peak > new spot_count, add to conflicts list.

**Contract**: The POST handler collects all conflicts first, then either returns a 400 response with conflicts list or proceeds with updates if no conflicts found.

#### 3. Error response with conflict details

**File**: `src/pages/api/admin/sectors.ts` (response contract)

**Intent**: When conflicts are detected, return a clear error response that includes: which sectors have conflicts, how many active reservations exist per sector, and the proposed new spot count.

**Contract**: Response body on conflict: 
```json
{
  "success": false,
  "error": "Cannot apply changes: conflicts detected in affected sectors",
  "conflicts": [
    {
      "sectorName": "Main Lot",
      "currentSpotCount": 10,
      "proposedSpotCount": 8,
      "activeReservations": 9,
      "reason": "Proposed spot count (8) is less than peak concurrent reservations (9)"
    }
  ]
}
```

### Success Criteria:

#### Automated Verification:

- Conflict detection correctly counts active (confirmed or arrived) reservations
- Peak concurrent calculation is accurate across overlapping time windows
- Rejects spot count reductions that would create overbooking
- Allows spot count reductions that don't conflict

#### Manual Verification:

- Admin creates 3 reservations in a sector with 5 spots
- Admin attempts to reduce spot count to 2 → receives conflict warning listing 3 active reservations
- Admin cancels; no changes applied
- Admin attempts to reduce spot count to 3 → change is allowed (3 >= 3)
- Peak concurrent calculation tested with multiple overlapping and non-overlapping reservations

**Implementation Note**: Test edge cases: reservations at sector boundaries (arrival = another's departure), late-night reservations crossing midnight, and concurrent updates from multiple admins.

---

## Phase 4: Operator Read-Only Sector View

### Overview

Operators need to see available sectors and spot counts when creating reservations (S-03). This phase exposes a read-only sector endpoint and ensures operators can query current structure without modification access.

### Changes Required:

#### 1. API endpoint: GET /api/sectors (operator-accessible)

**File**: `src/pages/api/sectors.ts` (or extend if already exists)

**Intent**: Public read endpoint (for authenticated operators and admins) to fetch the current parking structure. Returns all sectors with their spot counts (and optionally, current occupancy per sector).

**Contract**: 
- GET endpoint; middleware ensures authenticated access (operator or admin)
- Response: `{ sectors: Array<{ id: string, name: string, spotCount: number, currentOccupancy?: number }> }`
- No admin-only restrictions; operators use this to display available sectors in the reservation form (S-03)

#### 2. Operator dashboard page reference (preview)

**File**: `src/pages/dashboard.astro` (reference only; full implementation in S-03)

**Intent**: Note that the dashboard (operator page) will eventually display sectors and allow creating reservations. This phase doesn't implement the full reservation UI; it only ensures the sector data is available to S-03.

**Contract**: Dashboard can query `/api/sectors` to display the parking structure.

### Success Criteria:

#### Automated Verification:

- GET /api/sectors returns all sectors with spot counts
- Middleware enforces operator/admin access (non-auth redirects to `/auth/signin`)
- Linting and type checking pass

#### Manual Verification:

- Operator logs in and can view sectors in the UI (manual spot-check; full integration tested in S-03)
- Operators cannot modify sectors (no POST/PUT/DELETE access to `/api/sectors`)

**Implementation Note**: This phase is a bridge to S-03. Full operator-facing UI (sector selector + availability check form) is implemented in S-03.

---

## Testing Strategy

### Unit Tests:

- Sector name validation (non-empty, unique)
- Spot count validation (positive integer)
- Conflict detection logic: peak concurrent reservation counting
- Batch operation validation: atomic validation and rollback on error

### Integration Tests:

- Create sector → verify in database via query
- Update sector spot count → verify change persisted
- Update sector with conflicts → verify rejection and no partial updates
- Concurrent admin requests → verify race condition handling (only one update succeeds or both succeed atomically)

### Manual Testing Steps:

1. Log in as Admin; navigate to `/admin/structure`
2. Add a new sector (e.g., "North Lot") with 20 spots; verify it appears in the list
3. Create a reservation in the "North Lot" sector (will be tested in S-03)
4. Return to `/admin/structure` and attempt to reduce "North Lot" spot count to 10
5. Observe conflict warning modal listing 1 active reservation
6. Cancel the change; verify no update occurs
7. Manually cancel the reservation (will be tested in S-04)
8. Return to `/admin/structure` and reduce "North Lot" spot count to 10; verify success
9. Test as Operator: log out, log in as Operator, navigate to `/dashboard` and verify sectors are visible (read-only)

## Performance Considerations

- Sectors table is expected to be small (< 100 rows in typical parking facilities)
- Conflict detection queries reservations with indexed filters (sector_id, status, time range); index on `(sector_id, status, departure_at)` recommended for performance
- Batch operations should validate all before any writes; O(n) validation where n = number of operations (expected to be small; < 10 per batch)
- No caching of sector structure on client; refresh on each navigation to ensure data consistency

## Migration Notes

- Supabase migrations for `sectors` table are already applied (`20260605120001_create_sectors.sql`)
- No data migration needed for MVP (schema is fresh); future versions may need backfill logic if existing parking facilities are imported
- RLS policies are already in place; no additional policy changes required

## References

- PRD: `context/foundation/prd.md` (FR-001, FR-002; Access Control; Business Logic)
- Roadmap: `context/foundation/roadmap.md` (S-01 slice, prerequisites F-01 + F-02)
- Lessons: `context/foundation/lessons.md` (feature flags must have kill dates; applies if any toggles are introduced)
- Related research: `context/changes/core-domain-schema/research.md` (if present, for DB schema details)
- Similar implementations: Admin provisioning pattern in `src/pages/api/auth/signin.ts` (for role-based access)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Admin Configuration Page Scaffold

#### Automated

- [x] 1.1 Page renders at `/admin/structure` without errors — 26e3f43b
- [x] 1.2 Type checking passes — 26e3f43b
- [x] 1.3 Linting passes — 26e3f43b
- [x] 1.4 Middleware correctly redirects non-admin users — 26e3f43b

#### Manual

- [x] 1.5 Admin sees current sectors in read-only view — 26e3f43b
- [x] 1.6 Edit button toggles form visibility — 26e3f43b
- [x] 1.7 Form validation prevents empty names and non-positive spot counts — 26e3f43b

### Phase 2: Sector CRUD API Endpoints

#### Automated

- [x] 2.1 POST /api/admin/sectors creates sectors and persists to database — 3514dac1
- [x] 2.2 GET /api/admin/sectors returns current sectors — 3514dac1
- [x] 2.3 Supabase RLS policies enforce admin-only access — 3514dac1
- [x] 2.4 Type checking passes — 3514dac1
- [x] 2.5 Linting passes — 3514dac1

#### Manual

- [x] 2.6 Admin submits batch changes and sees them reflected immediately — 3514dac1
- [x] 2.7 Atomic validation: partial batch failures reject entire batch — 3514dac1
- [x] 2.8 Error messages are clear and actionable — 3514dac1

### Phase 3: Conflict Detection and Reservation Query Logic

#### Automated

- [x] 3.1 Conflict detection correctly counts active reservations — ee450633
- [x] 3.2 Peak concurrent calculation is accurate — ee450633
- [x] 3.3 Rejects spot count reductions that would create overbooking — ee450633
- [x] 3.4 Allows spot count reductions that don't conflict — ee450633
- [x] 3.5 Type checking passes — ee450633
- [x] 3.6 Linting passes — ee450633

#### Manual

- [x] 3.7 Admin receives conflict warning when attempting to reduce spot count below active reservations — ee450633
- [x] 3.8 Peak concurrent calculation tested with overlapping and non-overlapping reservations — ee450633
- [x] 3.9 Edge cases tested: same-day arrival/departure boundaries, late-night reservations — ee450633

### Phase 4: Operator Read-Only Sector View

#### Automated

- [x] 4.1 GET /api/sectors returns all sectors with spot counts
- [x] 4.2 Middleware enforces operator/admin access
- [x] 4.3 Type checking passes
- [x] 4.4 Linting passes

#### Manual

- [x] 4.5 Operator can view sectors in UI (manual spot-check)
- [x] 4.6 Operators cannot modify sectors
