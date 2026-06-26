# EMU Parking Manager — Copilot Instructions

## Key conventions

- **Astro components** for static content/layout; **React components** only when interactivity is needed
- **Tailwind class merging**: always use `cn()` from `@/lib/utils` (clsx + tailwind-merge) — never concatenate class strings manually
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style. Add new ones with `npx shadcn@latest add [name]`
- **API routes**: export uppercase `GET`, `POST`; validate input with zod
- **Supabase migrations**: `supabase/migrations/` with naming `YYYYMMDDHHmmss_short_description.sql`; always enable RLS with per-operation, per-role policies on new tables
- **React hooks**: extract to `src/components/hooks/`; no Next.js `"use client"` directives
- **Services/helpers**: `src/lib/` or `src/lib/services/` for extracted business logic
- **Shared types**: `src/types.ts`

## Auth flow

- `src/lib/supabase.ts` — Supabase SSR client via `@supabase/ssr` with cookie-based sessions; reads `SUPABASE_URL` / `SUPABASE_KEY` from `astro:env/server`
- `src/middleware.ts` — resolves current user on every request, attaches to `context.locals.user`; redirects unauthenticated users away from `PROTECTED_ROUTES` (`/dashboard`)
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`

## Architecture

**Astro 6 SSR app** — React 19 islands for interactivity, Tailwind 4, Supabase auth, shadcn/ui components. Deployed to Cloudflare Workers.

- `output: "server"` in `astro.config.mjs` — all pages are server-rendered by default
- API routes must export `const prerender = false`
- **Path alias**: `@/*` → `./src/*`

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

No test suite exists yet.

Pre-commit hooks (husky + lint-staged): `eslint --fix` on `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}`.

## Environment

- Node.js v22.14.0 (`.nvmrc`)
- Copy `.env.example` → `.env` for Node dev; use `.dev.vars` for Cloudflare local dev (both gitignored)
- Local Supabase: `npx supabase start` (requires Docker)
- Deploy: `npx wrangler deploy`

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill                          | Use it when                                                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code review (lesson focus)** |                                                                                                                                                                                                                                         |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome**   |                                                                                                                                                                                                                                         |
| `/10x-lesson`                  | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note.                                                                             |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
