# Auth RBAC Scaffold Implementation Plan

## Overview

Extend the existing Supabase auth foundation with a two-role RBAC layer (Admin / Operator). Roles are stored as `app_metadata.role` in Supabase (embedded in the JWT access token). Middleware enforces path-prefix-based access control — `/admin/*` for Admin-only routes, `/dashboard/*` for Operator and Admin routes. A reproducible SQL seed provisions the first Admin account for local development. Public self-registration is disabled to match the PRD requirement that all accounts are Admin-provisioned.

## Current State Analysis

- `src/middleware.ts` — resolves `context.locals.user` from Supabase JWT; protects only `/dashboard` (any authenticated user); no role concept
- `src/env.d.ts` — `App.Locals` declares only `user: User | null`; no `role` field
- `src/lib/supabase.ts` — creates server-side Supabase client; reads nothing from `app_metadata`
- `src/pages/api/auth/signup.ts` — open public self-registration; violates PRD "no self-registration"
- `src/pages/auth/signin.astro` — links to signup page
- `supabase/config.toml` — Supabase CLI initialized; no migrations, no seed file
- `src/types.ts` — does not exist yet

### Key Discoveries

- `user.app_metadata` is available on the Supabase `User` object returned by `supabase.auth.getUser()` — `src/lib/supabase.ts:9` — no API changes needed to read it
- `App.Locals` type declaration lives in `src/env.d.ts:1-5`; needs a `role` field added
- Middleware's `PROTECTED_ROUTES` array at `src/middleware.ts:4` is the existing pattern to extend
- `/dashboard` is the only currently protected path; it will remain as the Operator landing page under the new `/dashboard/*` Operator prefix
- `supabase/config.toml` exists (`supabase init` was run); `supabase/seed.sql` does not — safe to create

## Desired End State

After this plan completes:

- Every request resolves `context.locals.role` (type: `"admin" | "operator" | null`) alongside `context.locals.user`
- `/admin/*` routes are accessible only to users with `role === "admin"`
- `/dashboard/*` routes are accessible to users with `role === "admin"` or `role === "operator"`
- Unauthenticated access to either prefix redirects to `/auth/signin?next=<path>`
- Operator accessing `/admin/*` is redirected to `/dashboard`
- All self-registration entry points are disabled
- `npx supabase db seed` creates a local dev Admin account

### Key Discoveries

- `user.app_metadata` on the Supabase `User` object is server-assigned and user-read-only — `src/lib/supabase.ts` creates client with `getUser()` which returns `app_metadata` in the response
- Convention for shared types: `src/types.ts` (per project conventions — does not exist yet, will be created)
- No Supabase Admin API calls needed in app code for F-01; role is read-only from JWT in middleware. Role assignment (for Operator provisioning) uses the Supabase Admin API and is scoped to S-02

## What We're NOT Doing

- Not creating Admin or Operator UI pages (S-01 through S-05)
- Not building Operator account provisioning UI or API (S-02)
- Not writing domain schema migrations for sectors, spots, etc. (F-02)
- Not adding invite-token or email-based account creation flow
- Not protecting `/api/auth/*` routes — sign-in and sign-out remain public
- Not adding role assignment via the app's own API — Admin API calls for role writes are deferred to S-02

## Implementation Approach

Three sequential phases, each independently verifiable:

1. **Extend the type layer and rewrite middleware** — the foundational change; every downstream slice depends on it
2. **Disable self-registration** — enforces the PRD requirement; safe to do after Phase 1 since it has no dependencies on role logic
3. **Admin seed** — local dev tooling; isolated to `supabase/seed.sql`

The middleware rewrite replaces the flat `PROTECTED_ROUTES` array with a `matchesPrefix` helper and two typed prefix sets (`ADMIN_PREFIXES`, `OPERATOR_PREFIXES`), preserving the existing null-check pattern for when Supabase is unconfigured.

## Critical Implementation Details

**Role read from JWT, not DB**: `user.app_metadata.role` is available synchronously from the decoded JWT; no extra Supabase query is needed. Cast to `UserRole | null` via `(user?.app_metadata?.role ?? null) as UserRole | null`.

**Prefix matching must prevent false positives**: `startsWith("/admin")` matches `/administrator`. Use the helper: `pathname === prefix || pathname.startsWith(prefix + "/")`.

**Admin has full access**: an Admin accessing `/dashboard/*` is allowed through. Only Operators on `/admin/*` trigger the wrong-role redirect.

---

## Phase 1: RBAC types and middleware layer

### Overview

Define the `UserRole` type, extend `App.Locals` with a `role` field, and rewrite the middleware to read and enforce roles from `app_metadata`. This is the single change that all downstream slices will build on.

### Changes Required

#### 1. UserRole shared type

**File**: `src/types.ts`

**Intent**: Create the shared type file and export `UserRole` as a string union. All layers (middleware, API routes, pages) import from here so the role vocabulary is defined once.

**Contract**: Export `export type UserRole = "admin" | "operator";`

---

#### 2. Extend App.Locals

**File**: `src/env.d.ts`

**Intent**: Add `role: import("./types").UserRole | null` to the `App.Locals` interface so every `.astro` page and API route can access `Astro.locals.role` (or `context.locals.role`) with full TypeScript inference.

**Contract**: `App.Locals` gains a `role` field alongside the existing `user` field. Import path is `"./types"` (relative, since this is a `.d.ts` file in `src/`).

---

#### 3. Rewrite middleware to enforce RBAC

**File**: `src/middleware.ts`

**Intent**: Replace the flat `PROTECTED_ROUTES` array with two typed prefix sets and enforce role-scoped access. Assign `context.locals.role` on every request. Redirect unauthenticated users to `/auth/signin?next=<pathname>`. Redirect wrong-role users to their own home (`/dashboard` for Operators, `/auth/signin` for roleless).

**Contract**: The rewritten middleware exports the same `onRequest` shape. The snippet below shows the two assignments that must follow the existing `supabase.auth.getUser()` call, plus the routing block:

```ts
// After getUser() — assign both locals:
context.locals.user = user ?? null;
const role = (user?.app_metadata?.role ?? null) as UserRole | null;
context.locals.role = role;

// Role-aware route protection (replace the PROTECTED_ROUTES block):
const ADMIN_PREFIXES = ["/admin"];
const OPERATOR_PREFIXES = ["/dashboard"];
const matchesPrefix = (path: string, prefix: string) =>
  path === prefix || path.startsWith(prefix + "/");

const isAdminRoute = ADMIN_PREFIXES.some((p) => matchesPrefix(pathname, p));
const isOperatorRoute = OPERATOR_PREFIXES.some((p) => matchesPrefix(pathname, p));

if (isAdminRoute || isOperatorRoute) {
  if (!user) {
    return context.redirect(`/auth/signin?next=${encodeURIComponent(pathname)}`);
  }
  if (isAdminRoute && role !== "admin") {
    return context.redirect(role === "operator" ? "/dashboard" : "/auth/signin");
  }
}
```

---

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- Accessing `/dashboard` while signed out redirects to `/auth/signin?next=%2Fdashboard`
- Accessing `/admin` while signed out redirects to `/auth/signin?next=%2Fadmin`
- Signing in as a user with no role and navigating to `/dashboard` redirects to `/auth/signin`
- Signing in as a user with `role: "operator"` in `app_metadata` can access `/dashboard`; accessing `/admin` redirects to `/dashboard`
- Signing in as a user with `role: "admin"` in `app_metadata` can access both `/dashboard` and `/admin`

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Disable self-registration

### Overview

Disable all entry points for public self-registration: the API route, the signup page, and all signup navigation links. Accounts are henceforth created only by an Admin (S-02).

### Changes Required

#### 1. Disable signup API route

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Make the POST handler return a redirect to `/auth/signin` with a message instead of calling `supabase.auth.signUp()`. Add a comment explaining that account creation is Admin-provisioned. This prevents programmatic signup attempts.

**Contract**: `POST` handler returns `context.redirect("/auth/signin?error=..." )` unconditionally. Keep the `export const prerender = false` if not already implicit (API routes in SSR mode).

---

#### 2. Disable signup page

**File**: `src/pages/auth/signup.astro`

**Intent**: Replace the signup form page with a server-side redirect to `/auth/signin` so navigating directly to `/auth/signup` does not show a registration form.

**Contract**: Frontmatter returns `return Astro.redirect("/auth/signin");` at the top, before any rendering. No HTML body needed.

---

#### 3. Remove signup link from signin page

**File**: `src/pages/auth/signin.astro`

**Intent**: Remove the "Don't have an account? Sign up" paragraph. Users who land on the sign-in page should not see a dead link.

**Contract**: Delete the `<p>` element containing the signup anchor at the bottom of the sign-in card.

---

#### 4. Remove signup link from Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Remove the "Sign up" anchor that shows in the navigation bar when a user is not signed in. Unauthenticated visitors should only see "Sign in".

**Contract**: Delete the `<a href="/auth/signup">` element inside the unauthenticated branch of the Topbar (currently at line 30–32). Leave the "Sign in" link intact.

---

#### 5. Remove signup button from Welcome page

**File**: `src/components/Welcome.astro`

**Intent**: Remove the "Sign Up" hero CTA button from the landing page. The landing page should only offer "Sign In".

**Contract**: Delete the `<a href="/auth/signup">` anchor element in the hero button group (currently at lines 47–51). Leave the "Sign In" button intact.

---

#### 6. Disable signup in local Supabase config

**File**: `supabase/config.toml`

**Intent**: Align the local Supabase dev environment with the PRD "no self-registration" requirement. Setting `enable_signup = false` closes the bypass path where a developer or user could POST directly to `http://localhost:54321/auth/v1/signup` and create a roleless account, circumventing the app-level route disable.

**Contract**: Set `enable_signup = false` under both `[auth]` (line 169) and `[auth.email]` (line 204).

---

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- Navigating to `/auth/signup` redirects to `/auth/signin`
- Submitting a POST request to `/api/auth/signup` redirects to `/auth/signin` (no account created)
- The sign-in page no longer shows a "Sign up" link
- The Topbar no longer shows a "Sign up" link when unauthenticated
- The landing page (`/`) no longer shows a "Sign Up" button
- Posting directly to `http://localhost:54321/auth/v1/signup` returns an error (signup disabled)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Initial admin seed

### Overview

Write `supabase/seed.sql` to provision the first Admin account in the local Supabase dev environment. The seed inserts directly into `auth.users` with a hashed password and sets `raw_app_meta_data` to `{"role": "admin"}`.

### Changes Required

#### 1. Admin seed file

**File**: `supabase/seed.sql`

**Intent**: Create a reproducible local dev seed that inserts an Admin user so developers can immediately sign in and test role-protected routes without manually editing the Supabase dashboard. The credentials are intentionally simple dev-only values, clearly marked.

**Contract**: Insert one row into `auth.users` with:
- `id = '00000000-0000-0000-0000-000000000001'::uuid` (fixed UUID for idempotency)
- `raw_app_meta_data = '{"provider": "email", "providers": ["email"], "role": "admin"}'`
- `raw_user_meta_data = '{}'`
- `encrypted_password = crypt('admin1234', gen_salt('bf'))` (dev-only — change before production use). **Implementation note**: the seed uses a pre-computed bcrypt literal instead of `crypt()` to avoid requiring the pgcrypto extension to be enabled at seed time. The hash is equivalent and has been verified correct.
- `email_confirmed_at = now()` (skip email confirmation in local dev)
- `aud = 'authenticated'`, `role = 'authenticated'`
- Use `INSERT ... ON CONFLICT (id) DO NOTHING` so the seed is safe to run multiple times without error (both via `supabase db reset` and standalone `supabase db seed`).

Include a prominent `-- DEVELOPMENT ONLY` header comment and instructions for applying: `npx supabase db seed` (requires a running local Supabase instance via `npx supabase start`).

**Additional required insert**: GoTrue requires a corresponding row in `auth.identities` for email/password authentication to work even when the user row exists. The seed also inserts one identity record for the admin user with `provider = 'email'`.

---

### Success Criteria

#### Automated Verification

- Seed file is valid SQL (no syntax errors — verified by running `npx supabase db seed` against a local instance)

#### Manual Verification

- After `npx supabase start` + `npx supabase db seed`, signing in with `admin@emu.dev` / `admin1234` succeeds
- `context.locals.role` resolves to `"admin"` for that account (visible via `/dashboard` access working and `/admin` access working)

**Implementation Note**: After completing this phase and all automated verification passes, the foundation is complete. Confirm with the user before declaring F-01 done.

---

## Testing Strategy

### Manual Testing Scenarios

1. **Unauthenticated access** — visit `/dashboard` and `/admin` without being signed in → both redirect to `/auth/signin?next=<path>`
2. **Operator role** — seed or manually set `app_metadata.role = "operator"` → `/dashboard` accessible, `/admin` redirects to `/dashboard`
3. **Admin role** — use seeded admin account → both `/dashboard` and `/admin` accessible
4. **No-role user** — sign in as a user without a role in `app_metadata` → `/dashboard` redirects to `/auth/signin`
5. **Signup disabled** — navigate to `/auth/signup` → redirected to `/auth/signin`; POST to `/api/auth/signup` → redirected to `/auth/signin`
6. **Existing session** — sign in, then access protected routes without re-authenticating → role still resolved correctly from JWT

### No Automated Test Suite

The project has no test suite (per roadmap baseline). Success criteria rely on lint + build (automated) and manual smoke tests above.

## Migration Notes

No data migrations required for F-01. Role storage in `app_metadata` is handled entirely by Supabase Auth — no domain tables touched. The seed inserts into `auth.users` (Supabase's internal schema) which is separate from the domain migrations in F-02.

**Production deployment note**: Before going live, set `enable_signup = false` in the hosted Supabase project's Auth settings (Authentication → Settings → Disable sign ups). The local `config.toml` already sets this for the local dev environment, but the hosted project setting must be applied manually in the Supabase dashboard.

## References

- Roadmap F-01 definition: `context/foundation/roadmap.md` (lines 63–74)
- Supabase `app_metadata` docs: https://supabase.com/docs/guides/auth/managing-user-data#accessing-user-metadata
- Existing middleware: `src/middleware.ts`
- Existing Supabase client: `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: RBAC types and middleware layer

#### Automated

- [x] 1.1 Lint passes — 61568c81
- [x] 1.2 Build passes — 61568c81

#### Manual

- [x] 1.3 Unauthenticated /dashboard redirects to /auth/signin?next=%2Fdashboard — 61568c81
- [x] 1.4 Unauthenticated /admin redirects to /auth/signin?next=%2Fadmin — 61568c81
- [x] 1.5 No-role user accessing /dashboard redirects to /auth/signin — 61568c81
- [x] 1.6 Operator can access /dashboard; /admin redirects to /dashboard — 61568c81
- [x] 1.7 Admin can access both /dashboard and /admin — 61568c81

### Phase 2: Disable self-registration

#### Automated

- [x] 2.1 Lint passes — 02f9127b
- [x] 2.2 Build passes — 02f9127b

#### Manual

- [x] 2.3 /auth/signup redirects to /auth/signin — 02f9127b
- [x] 2.4 POST /api/auth/signup redirects to /auth/signin (no account created) — 02f9127b
- [x] 2.5 Sign-in page has no signup link — 02f9127b
- [x] 2.6 Topbar has no signup link when unauthenticated — 02f9127b
- [x] 2.7 Landing page has no Sign Up button — 02f9127b
- [x] 2.8 Direct POST to Supabase auth signup endpoint returns error — 02f9127b

### Phase 3: Initial admin seed

#### Automated

- [x] 3.1 npx supabase db seed runs without error — ca16f56f

#### Manual

- [x] 3.2 Seeded admin@emu.dev / admin1234 signs in successfully — ca16f56f
- [x] 3.3 Seeded admin account resolves role "admin" (can access /admin) — ca16f56f
