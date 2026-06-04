# Auth RBAC Scaffold — Plan Brief

> Full plan: `context/changes/auth-rbac-scaffold/plan.md`

## What & Why

Wire a two-role RBAC layer (Admin / Operator) into the existing Supabase auth foundation. The product requires role-scoped route protection as a non-negotiable prerequisite — every downstream slice (S-01 through S-05) depends on knowing whether the current user is an Admin or an Operator before touching any business logic.

## Starting Point

Supabase auth is partially wired: sign-in/sign-out work, and the middleware resolves `context.locals.user`. There is no concept of role anywhere in the codebase, `App.Locals` declares only `user`, and public self-registration is currently enabled despite the PRD requiring Admin-only account provisioning.

## Desired End State

Every request resolves `context.locals.role` as `"admin" | "operator" | null`. `/admin/*` routes are Admin-only; `/dashboard/*` routes are accessible to both roles. Unauthenticated or wrong-role access is redirected gracefully. Public signup is disabled. A `supabase/seed.sql` provisions the first Admin account for local dev.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Role storage mechanism | `app_metadata` JWT claim | Server-assigned, user-read-only, zero extra DB query per request — standard Supabase pattern for system roles | Plan |
| Route protection pattern | Path-prefix (`/admin/*`, `/dashboard/*`) | Consistent with existing `PROTECTED_ROUTES` pattern; self-documenting; scales by convention without per-route annotation | Plan |
| TypeScript exposure | Separate `context.locals.role: UserRole \| null` field | Clean separation; pages and APIs check one field without digging into the JWT payload; type-safe with string union | Plan |
| Wrong-role redirect | Redirect to role's own home | Better UX than a sign-in loop; Admin has full access per PRD spec | Plan |
| Self-registration | Disable signup route and page | Enforces PRD "no self-registration" immediately; prevents roleless accounts accumulating | Plan |
| Admin provisioning | `supabase/seed.sql` | Reproducible for local dev and CI; explicit and auditable; credentials kept out of source control | Plan |

## Scope

**In scope:**
- `UserRole` type in `src/types.ts`
- `App.Locals.role` in `src/env.d.ts`
- Middleware rewrite with prefix-based RBAC
- Disable signup API route and page; remove signup link from signin
- `supabase/seed.sql` for initial local dev Admin

**Out of scope:**
- Admin or Operator UI pages (S-01 through S-05)
- Operator account provisioning API (S-02)
- Domain schema migrations (F-02)
- Invite-token or email-based registration flow
- Role assignment via app API (deferred to S-02)

## Architecture / Approach

Role is embedded in the Supabase JWT `access_token` under `app_metadata.role`. The middleware reads it synchronously (no DB round-trip), assigns it to `context.locals.role`, then applies prefix-match rules: `/admin/*` requires `role === "admin"`; `/dashboard/*` requires any valid role. Admin has full access to both prefixes. Wrong role or unauthenticated → redirect, not 403.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. RBAC types & middleware | `UserRole` type, `locals.role`, rewritten middleware with prefix-based enforcement | Prefix matching must guard against false positives (e.g. `/administrator`) |
| 2. Disable self-registration | Signup route → redirect; signup page → redirect; signin removes signup link | Minimal risk — existing pages are just redirected |
| 3. Initial admin seed | `supabase/seed.sql` with hashed dev-only credentials | Seed credentials must never ship to production |

**Prerequisites:** Local Supabase running (`npx supabase start`) for Phase 3 verification; no code prerequisites — all upstream auth wiring is already in place.
**Estimated effort:** ~1 session across 3 phases

## Open Risks & Assumptions

- Role changes in `app_metadata` don't take effect until the user's JWT refreshes (~1 hour); this is acceptable for F-01 and must be documented when S-02 builds the Operator provisioning UI
- The seed inserts a dev-only admin account — teams must ensure `supabase/seed.sql` is never applied against a production Supabase project

## Success Criteria (Summary)

- `context.locals.role` resolves correctly for admin, operator, and unauthenticated users on every request
- Accessing any protected route while unauthenticated or with the wrong role redirects to the correct destination
- Navigating to `/auth/signup` or posting to `/api/auth/signup` no longer creates accounts
