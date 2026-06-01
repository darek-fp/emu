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

## 10xDevs AI Toolkit - Module 2, Lesson 1

Move from sprint-zero setup to project orchestration with the **roadmap chain**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` is the lesson focus. `/10x-new` is intentionally introduced in Module 2, Lesson 2, when a selected roadmap item becomes an implementation change folder.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Roadmap (lesson focus)** | |
| `/10x-roadmap` | You have `context/foundation/prd.md` and a scaffolded project baseline, and you need a vertical-first MVP roadmap. The skill reads the PRD, inspects the code baseline, uses available foundation docs such as `tech-stack.md`, `infrastructure.md`, and `deploy-plan.md`, then writes `context/foundation/roadmap.md`. Use it BEFORE creating per-change folders or implementation plans. |
| **Re-run upstream if needed** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Bundled from Module 1 so foundation contracts can be fixed before roadmap sequencing. If roadmap generation exposes a PRD gap, repair the PRD before pretending the backlog is ready. |

### How the chain hands off

- `/10x-roadmap` bridges product and implementation. It does not choose frameworks, design schemas, or write a per-change implementation plan.
- The output is `context/foundation/roadmap.md`: ordered milestones, vertical slices, bounded foundations, dependencies, unknowns, risk, and backlog handoff fields.
- Roadmap items should receive stable human-readable identifiers in backlog tools. The actual `context/changes/<change-id>/` folder is created in Lesson 2 with `/10x-new`.

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.

### Foundation paths used by this lesson

- `context/foundation/prd.md` - input
- `context/foundation/tech-stack.md` - optional input
- `context/foundation/infrastructure.md` - optional input
- `context/deployment/deploy-plan.md` - optional input
- `context/foundation/roadmap.md` - output
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
