<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Auth RBAC Scaffold

- **Plan**: `context/changes/auth-rbac-scaffold/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-04
- **Verdict**: SOUND (post-triage)
- **Findings**: 0 critical 3 warnings 1 observation

## Verdicts

| Dimension             | Verdict                |
| --------------------- | ---------------------- |
| End-State Alignment   | WARNING → PASS (fixed) |
| Lean Execution        | PASS                   |
| Architectural Fitness | PASS                   |
| Blind Spots           | WARNING → PASS (fixed) |
| Plan Completeness     | WARNING → PASS (fixed) |

## Grounding

6/6 paths ✓, 2/2 symbols ✓, brief↔plan ✓, Progress↔Phase 3/3 ✓

## Findings

### F1 — Signup links in Topbar and Welcome components not addressed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Disable self-registration
- **Detail**: Phase 2 claimed to disable "all entry points" but only addressed signin.astro. src/components/Topbar.astro (line 30–32) and src/components/Welcome.astro (lines 47–51) also contain /auth/signup hrefs.
- **Fix A ⭐ Recommended**: Add Topbar.astro + Welcome.astro to Phase 2 changes
- **Decision**: FIXED via Fix A — added Change 4 (Topbar) and Change 5 (Welcome) to Phase 2; added manual verification items 2.6 and 2.7.

### F2 — Supabase-level signup still enabled; bypass path exists

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Disable self-registration
- **Detail**: supabase/config.toml had enable_signup = true at both [auth] (line 169) and [auth.email] (line 204). Direct POST to Supabase Auth API bypassed the app-level route disable.
- **Fix A ⭐ Recommended**: Set enable_signup = false in config.toml + add production note
- **Decision**: FIXED via Fix A — added Change 6 (config.toml) to Phase 2; added manual item 2.8; added production deployment note to Migration Notes.

### F3 — Middleware snippet uses `role` variable but doesn't declare it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Change 3 (Rewrite middleware)
- **Detail**: The Contract snippet referenced `role` without declaring it; implementer would get a TypeScript compile error.
- **Fix**: Extend snippet to include the role extraction + context.locals assignment lines.
- **Decision**: FIXED — snippet extended to show `context.locals.user = user ?? null; const role = ...; context.locals.role = role;` before the routing block.

### F4 — Seed SQL idempotency left ambiguous

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Admin seed
- **Detail**: Contract said "gen_random_uuid() (or a fixed UUID for idempotency)" without committing.
- **Fix**: Commit to fixed UUID `00000000-0000-0000-0000-000000000001` + ON CONFLICT DO NOTHING.
- **Decision**: FIXED — contract updated with fixed UUID and ON CONFLICT clause.
