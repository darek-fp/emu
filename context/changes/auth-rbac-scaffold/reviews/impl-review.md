<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth RBAC Scaffold

- **Plan**: context/changes/auth-rbac-scaffold/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-06-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  2 warnings  3 observations (incl. 1 bonus finding from safety agent)

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — [auth.email] enable_signup still true

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: supabase/config.toml:203
- **Detail**: Plan required enable_signup = false under both [auth] AND [auth.email] as defense-in-depth. [auth] was correctly set (line 169) but [auth.email] line 203 was still enable_signup = true.
- **Fix**: Changed enable_signup = true → false on line 203 of supabase/config.toml.
- **Decision**: FIXED

### F2 — Middleware allows unknown roles through /dashboard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality / Plan Adherence
- **Location**: src/middleware.ts:34
- **Detail**: Plan states /dashboard/* accessible only to role === "admin" or role === "operator". Implementation only blocked role === null — any non-null unknown role passed through. Latent bug (app_metadata is server-assigned) but deviates from spec.
- **Fix**: Replaced null-check with explicit allowlist: `role !== "operator" && role !== "admin"`.
- **Decision**: FIXED

### F3 — seed.sql: pre-computed hash + unplanned auth.identities insert

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Scope Discipline
- **Location**: supabase/seed.sql:31, lines 47–67
- **Detail**: (a) Password uses pre-computed bcrypt literal instead of crypt() — avoids pgcrypto dependency, verified correct. (b) auth.identities insert not in plan but necessary for GoTrue email/password auth.
- **Fix**: Documented both deviations in plan.md Phase 3 "Changes Required".
- **Decision**: FIXED (plan updated)

### F4 — eslint.config.js: unplanned no-misused-promises disable

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:64
- **Detail**: @typescript-eslint/no-misused-promises disabled for *.astro files due to astro-eslint-parser crash on frontmatter return statements. Benign, necessary for lint to pass.
- **Fix**: Added upstream issue link comment for future re-enablement.
- **Decision**: FIXED (comment improved)

### F5 — ?next= redirect parameter set but never consumed (bonus finding)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: src/pages/api/auth/signin.ts:19
- **Detail**: Middleware redirects to /auth/signin?next=<pathname> but sign-in handler always redirected to / on success. Deep links to protected routes silently broke after login. Plan added ?next= to redirect URL but didn't include consuming it in the sign-in handler.
- **Fix**: 
  - signin.ts: reads next from URL, uses safeNext (same-origin validated) for post-login redirect.
  - signin.astro: passes next prop to SignInForm.
  - SignInForm.tsx: accepts next prop, includes in form action URL. Renamed internal validate() variable next → errs to avoid shadowing.
- **Decision**: FIXED
