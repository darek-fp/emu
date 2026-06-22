# Parking Structure Setup — Plan Brief

> Full plan: `context/changes/parking-structure-setup/plan.md`
> Roadmap: `context/foundation/roadmap.md` (S-01 slice)

## What & Why

Admin can define and update parking lot sectors with spot counts. For MVP, the system operates in **single-lot mode** (no sector division yet); sectors are scaffolded as the foundational data structure for reservations and availability checks. This slice is the first admin-facing feature and must ship before the north-star reservation-creation slice (S-03), which depends on sectors existing in the database.

## Starting Point

Supabase `sectors` table and RLS policies already exist (from F-02: Core Domain Schema). No admin UI exists; no sector CRUD endpoints. Middleware enforces admin-only route access via `/admin/*` prefix protection. Auth/RBAC scaffold (F-01) is wired.

## Desired End State

Admin can navigate to `/admin/structure`, see the current parking structure (sectors and spot counts), and enter edit mode to add or update sectors. Structural changes are blocked if active reservations exist in affected sectors, with a clear conflict warning modal explaining the issue. All changes are atomic — if one operation fails validation, none are persisted. Operators can query the current structure (read-only) via API for use in reservation creation.

## Key Decisions Made

| Decision                            | Choice                                    | Why (1 sentence)                                                                      | Source |
| ----------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| Scope (sector deletion?)            | Reduce spot counts only                   | Prevents accidental loss of lot configuration; deletions deferred to v2.               | Plan   |
| Conflict handling                   | Block update if ANY active reservation    | Prevents overbooking; simple clear rule.                                              | Plan   |
| Multi-sector batch behavior         | Atomic: all changes or none                | Prevents partial configuration corruption; matches DB transaction semantics.          | Plan   |
| UX pattern (admin interface)        | Dedicated page with edit mode toggle      | Keeps admin workspace organized; matches existing Astro + React island pattern.       | Plan   |
| Operator visibility                 | Read-only sector list API endpoint        | Operators need structure to check availability; admin-controlled, not editable.       | Plan   |
| MVP sector model                    | Single-lot mode (no multi-sector division) | Simplifies MVP; sectors table scaffolded but not exposed; full division in v2.        | Plan   |

## Scope

**In scope:** 
- Admin UI for viewing and editing sectors (name, spot count)
- Sector creation (add) and update operations
- Conflict detection: reject updates if active reservations exist in affected sectors
- Atomic batch validation and application
- Operator read-only API access to view sectors

**Out of scope:** 
- Sector deletion (reduce spot counts only)
- Multi-lot support (single lot for MVP)
- Automatic spot assignment or optimization by stay duration
- Per-sector access control (all authenticated users see all sectors)

## Architecture / Approach

**Three-tier implementation:**

1. **Admin page** (`/admin/structure`): Astro page + React form island. Displays current sectors in a table; "Edit" button toggles form for add/update operations.
2. **API layer** (`/api/admin/sectors`, `/api/sectors`): POST/PUT handlers validate operations, detect conflicts via reservation query, and apply atomically. RLS policies enforce admin-only writes; operator-accessible read endpoint.
3. **Conflict detection** (`sectorService.ts`): Query active reservations (status = confirmed or arrived) per sector; compute peak concurrent occupancy; reject updates that would drop below peak.

**Atomicity guarantee:** All operations in a batch are validated before any writes occur. If any validation fails, the entire batch is rejected. Database transaction ensures all-or-nothing semantics.

## Phases at a Glance

| Phase | What it delivers                          | Key risk                                      |
| ----- | ----------------------------------------- | --------------------------------------------- |
| 1     | Admin page scaffold + UI layout           | Form/page structure must match API contract   |
| 2     | Sector CRUD endpoints + atomic validation | Batch atomicity and race conditions           |
| 3     | Conflict detection + reservation queries  | Peak concurrent calculation accuracy          |
| 4     | Operator read-only sector endpoint        | Data consistency with admin writes            |

**Prerequisites:** F-01 (Auth/RBAC) and F-02 (Core Domain Schema) must be completed first.
**Estimated effort:** ~2-3 sessions across 4 phases, assuming ~1-2 hours per session.

## Open Risks & Assumptions

- **Conflict detection specificity**: "Active reservation" is defined as `status IN ('confirmed', 'arrived')`. Assumes this definition matches operator intent; if "arrived but not departed" should be treated differently, logic needs adjustment.
- **Atomic transactions in Supabase JS client**: Plan assumes Supabase transaction support or raw SQL for atomicity. If neither is available, may need to implement optimistic locking or split-phase validation.
- **Peak concurrent calculation accuracy**: Relies on precise `arrival_at` and `departure_at` timestamps. If reservations are keyed by calendar day only (not time-of-day), the peak calculation changes.

## Success Criteria (Summary)

- Admin can create and update sectors with clear visual feedback
- Structural changes are rejected with explanation if conflicts exist
- Batch operations are atomic (all succeed or all fail)
- Operators can query current sectors via API for reservation creation (S-03)
