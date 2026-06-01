---
project: EMU Parking Manager
researched_at: 2026-05-28T00:00:00+02:00
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: JavaScript / TypeScript
  framework: Astro 6 (React 19 islands)
  runtime: Cloudflare Workers (workerd)
  database: Supabase (external — PostgreSQL + auth)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project already ships the `@astrojs/cloudflare` adapter and targets `cloudflare-pages` in `tech-stack.md` — no adapter swap is required, and the local dev environment already mirrors production via the Cloudflare Vite plugin (workerd runtime). The Workers free plan covers 100k requests/day ($0) — well above the MVP's expected low-QPS load — and `wrangler` provides a complete CLI loop (deploy, versioned rollback, log tailing) that an agent can operate without a browser. Five official Cloudflare MCP servers (docs, bindings, observability, builds, logpush) are GA and agent-composable. The anti-bias cross-check surfaced real risks (10ms CPU free tier cap, rapid adapter versioning, Supabase/workerd compatibility gaps); all are captured in the risk register with concrete mitigations.

---

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **5/5** |
| **Vercel** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **5/5** |
| **Netlify** | ⚡ Partial | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **4.5/5** |
| **Railway** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **5/5** |
| **Render** | ✅ Pass | ✅ Pass | ✅ Pass | ⚡ Partial | ✅ Pass | **4.5/5** |
| **Fly.io** | ✅ Pass | ⚡ Partial | ❌ Fail | ✅ Pass | ⚡ Partial | **3/5** |

**Scoring notes:**

- **Netlify CLI-first (Partial):** `netlify` CLI covers deploy and logs, but rollback is dashboard-only — no `netlify rollback` command exists. An agent cannot complete the rollback loop from the terminal.
- **Render deploy API (Partial):** Deploy hooks and REST API work, but the `render deploys create` CLI command is newer and less mature than `wrangler deploy` or `vercel --prod`.
- **Fly.io managed (Partial):** Container-based VMs require maintaining a Dockerfile; you own OS-level configuration. Higher operational surface than fully-managed platforms.
- **Fly.io docs (Fail):** `fly.io/llms.txt` returns 404. Documentation is HTML-only — no markdown export, no per-page `.md` URLs, no LLM-optimized export of any kind.
- **Fly.io MCP (Partial):** `superfly/flymcp` is a community project (31 GitHub stars, created April 2025, no official GA designation). Not listed in any official MCP directory.

**Cost after interview weighting (Q2: minimize cost):**

| Platform | Monthly cost at MVP traffic | Notes |
|---|---|---|
| Cloudflare Workers | **$0** | 100k req/day free; upgrade to Paid ($5/mo) if CPU > 10ms avg |
| Vercel | **$0** | 1M invocations/mo + 4 CPU-hours free on Hobby; cold starts without prevention |
| Netlify | **$0** | 300 credits/mo; each prod deploy costs 15 credits (~20 deploys/mo free) |
| Render | **$0–$7** | Free with ~1-min cold starts after 15 min idle; ~$7/mo for always-on |
| Railway | **$5/mo** | Hobby plan minimum; $1/mo Free credit covers ~6 days of a 256MB Node process |
| Fly.io | **$2–$10/mo** | No free compute tier; credit card required; autostop helps at low traffic |

**Adapter switching cost:** Vercel, Netlify, Railway, and Render all require replacing `@astrojs/cloudflare` with `@astrojs/node` (or `@astrojs/vercel`/`@astrojs/netlify`). This means removing workerd-specific code, re-testing env var access patterns, and losing the dev/prod runtime parity provided by the Cloudflare Vite plugin. On a 3-week after-hours timeline this is a meaningful friction cost.

---

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Native adapter already in the project (`@astrojs/cloudflare` v13 for Astro 6), $0 free tier that covers the entire MVP traffic envelope, `wrangler` CLI covers the full operational loop (deploy, version list, traffic-based rollback, log tail), and five official MCP servers are GA. Dev and production both run workerd via the Cloudflare Vite plugin — no environment divergence. The 10ms CPU free tier cap is the principal risk; it can be resolved by upgrading to Workers Paid ($5/month) at any time.

#### 2. Vercel

Perfect criteria score and $0 Hobby tier. `@astrojs/vercel` v10.x is GA for Astro 6 (maintained in the `withastro/astro` monorepo). Fluid Compute billing means SSR pages that spend most of their time waiting on Supabase I/O use almost no CPU budget — effectively free at 10k–100k requests/month. `vercel rollback` is a proper CLI command (unlike Netlify). Requires adapter swap from `@astrojs/cloudflare` to `@astrojs/vercel` and moves the runtime from workerd to Node.js serverless — more compatible with npm packages but loses edge-specific features. Cold starts on Hobby (no prevention unless on Pro) and single-region are the main downsides.

#### 3. Netlify

`@astrojs/netlify` v6.1.0 is GA (Astro 5.x peerDep; Astro 6 support contingent on a future adapter release). Free credit model covers 100k requests/month with headroom, but each production deploy consumes 15 credits — limiting free-tier CI/CD to ~20 prod deploys per month. The official `@netlify/mcp` server is GA and listed in the Anthropic MCP directory. The absence of a `netlify rollback` CLI command is the main agent-ops gap; rollback requires either a dashboard click or a raw `netlify api restoreSiteDeploy` call.

---

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **10 ms CPU cap on the free tier can surprise mid-development.** An Astro SSR page that runs middleware auth + Supabase session check + tiered pricing computation + React 19 server render can exceed 10ms CPU — especially for reservations checking overlap across a busy dataset. Intermittent `1101 Worker threw exception` errors appear in production but not in `astro dev` (no local CPU cap). The fix (Workers Paid at $5/month) is cheap, but the surprise timing on a short deadline is costly.

2. **`@astrojs/cloudflare` v12 → v13 is a breaking migration in active churn.** The adapter removed `Astro.locals.runtime`, changed the `wrangler.jsonc` `main` field convention, and changed the `prerenderEnvironment` default — all in a single major version. A routine `npm install` that bumps the adapter mid-project produces runtime failures with no build-time error. On a 3-week after-hours timeline, an unannounced adapter breaking change can consume a full day.

3. **`@supabase/ssr` + workerd compatibility is officially untested.** There is no published Cloudflare × Supabase `@supabase/ssr` compatibility matrix. The cookie read-write cycle in `src/middleware.ts` (which reads and mutates session cookies per request) has edge case behaviors in workerd that differ from Node.js — particularly around `Response` mutation after construction.

4. **CommonJS npm transitive dependencies silently fail in workerd.** Any dependency using `require()` / `module.exports` will fail at request time, not at build time. Diagnosing a workerd runtime failure caused by a transitive CommonJS dependency buried three levels deep is non-obvious, especially for a developer unfamiliar with the edge runtime ecosystem.

5. **`wrangler tail` log sampling at traffic spikes.** Cloudflare samples `wrangler tail` output under high concurrency. Debugging the race condition in overbooking prevention (two simultaneous reservations for the last spot) requires seeing every concurrent request — sampled logs can miss the exact interleaving. Workers Logs (persistent, unsampled) requires the Paid plan.

### Pre-Mortem — How This Could Fail

The team deployed the parking manager to Cloudflare Workers in Week 2. Everything worked in `astro dev` (workerd via Vite plugin). The first production failure appeared at the stakeholder demo: the reservation creation endpoint returned `1101 Worker threw exception` intermittently — specifically on reservations that checked overlap across a lot with many active bookings. CPU was spiking to 14ms on the overlap computation, just above the free tier's 10ms cap. This was invisible in development (no local CPU cap enforced). The team upgraded to Workers Paid ($5/month) to resolve it.

Then the Supabase auth middleware broke on a specific code path in the deployed Worker — a path that passed in local workerd dev. The `@supabase/ssr` cookie mutation was hitting a workerd-specific behavior around `Response` headers after they'd been committed. Three days were spent tracing the `nodejs_compat` version interaction before a workaround was found (migrating the cookie write to a custom middleware pattern).

The final issue came from a routine `npm install` that auto-upgraded `@astrojs/cloudflare` from v12 to v13. Three API routes using `Astro.locals.runtime.env` started returning `undefined` silently — no build error, just null values at runtime. The v13 migration guide existed, but finding it consumed half a day. The 3-week deadline slipped by a week. The core failure: "native stack" was interpreted as "zero friction," but an SSR app on Workers has a meaningfully higher compatibility surface than a static site, and the adapter's rapid major-version progression on a tight timeline created compounding surprises.

### Unknown Unknowns

- **Supabase connection exhaustion under bursty traffic.** Workers isolates are stateless; each request opens new HTTP connections to Supabase. The Supabase free tier has connection limits. Under a burst (e.g., a parking lot shift change generating many simultaneous reservation lookups), the Supabase connection pool can be exhausted. Workers Hyperdrive (connection pooler) is the proper solution but is a Paid plan feature requiring additional `wrangler.jsonc` binding configuration.
- **Workers Static Assets vs Cloudflare Pages behavioral differences are poorly documented.** The app deploys as a Worker with Workers Static Assets — not as a legacy Cloudflare Pages project. Cache headers, branch preview behavior, and deployment commands differ between the two models. Many tutorials, Stack Overflow answers, and AI-generated snippets still reference the old `wrangler pages` workflow. Following stale guidance wastes time and produces hard-to-diagnose deployment failures.
- **The Cloudflare Vite plugin (workerd dev mode) is relatively new and may not replicate all production behaviors.** `ASSET_FETCHER` binding resolution, middleware execution ordering, and certain `env` binding injection patterns can differ subtly between `astro dev` and the deployed Worker. Issues that only appear in production are the hardest to debug on a short timeline.
- **`astro:env/server` maps to Cloudflare Workers Secrets via wrangler config — the mapping must be explicit.** Astro's `astro:env/server` schema (declared in `astro.config.mjs`) reads from the Workers runtime env, which is populated by `wrangler secret put` (for secrets) or `vars` in `wrangler.jsonc` (for non-secret values). If the `wrangler.jsonc` doesn't declare the variable names, `astro:env` will silently return `undefined` at runtime — even if the secret is correctly provisioned in the Cloudflare dashboard.

---

## Operational Story

- **Preview deploys:** Cloudflare Workers supports multiple environments via `wrangler.jsonc` `[env.*]` blocks. Create a `staging` environment pointing to a separate Worker name (e.g., `emu-staging`) for pre-merge preview. The existing GitHub Actions CI (`.github/workflows/ci.yml`) can be extended to deploy to staging on PR and to production on merge to `master`. Preview URLs are the Worker's `*.workers.dev` subdomain per environment. No built-in branch-preview URL automation (unlike Cloudflare Pages) — configure manually or add a GitHub Actions step with `wrangler deploy --env staging`.
- **Secrets:** `wrangler secret put SUPABASE_URL` and `wrangler secret put SUPABASE_KEY` (run once per environment). Secrets are write-only after creation — not readable via CLI or dashboard. The values must also be provisioned as GitHub Actions secrets (`SUPABASE_URL`, `SUPABASE_KEY`) for the CI build step (already required by the existing workflow). Rotation: `wrangler secret put KEY` with the new value; the Worker hot-reloads within seconds with no redeploy needed.
- **Rollback:** `npx wrangler versions list` → identify the target version ID → `npx wrangler versions deploy <version-id>@100` to route 100% of traffic to that version. The Workers runtime swaps traffic within ~30 seconds. Cloudflare retains the 100 most recent versions. Note: rolling back the Worker code does not roll back Supabase schema migrations — plan database changes to be backward-compatible with the previous Worker version.
- **Approval:** Agent may perform unattended: `wrangler deploy` (code deploys), `wrangler versions deploy` (traffic rollback), `wrangler tail` (log reading). Human required for: `wrangler secret put` (secret rotation), custom domain configuration, Workers Paid plan upgrade, deleting the Worker or its KV/D1 bindings, and any Supabase schema migration that drops or renames columns.
- **Logs:** `npx wrangler tail emu-parking-manager --format pretty` streams real-time logs. `--status error` filters to error-only events. `--search "reservation"` filters by text. At high traffic, output is sampled. For unsampled persistent logs, enable Workers Logs in the Cloudflare dashboard (requires Paid plan; 7-day retention).

---

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free tier 10ms CPU cap triggers `1101` errors on complex SSR pages | Devil's advocate | M | H | Test CPU usage with `wrangler tail` during development. Upgrade to Workers Paid ($5/mo) before launch — budget for it from day one rather than treating free as guaranteed. |
| `@astrojs/cloudflare` v12→v13 breaking changes hit mid-project | Devil's advocate | M | M | Pin the adapter version in `package.json` (`"@astrojs/cloudflare": "13.x.x"`) and use `npm install --save-exact`. Review the adapter CHANGELOG before any `npm update`. |
| `@supabase/ssr` cookie mutation behaves differently in workerd vs Node.js | Devil's advocate | M | H | Write an integration test for the middleware auth flow that runs against a deployed Worker (not just `astro dev`) before Week 1 is complete. Validate cookie round-trip explicitly. |
| CommonJS transitive dependency fails at runtime in workerd | Devil's advocate | L | M | Run `npx wrangler deploy --dry-run` and `wrangler tail` after the first deploy to catch any `require() is not defined` errors before the demo. Use Vite `optimizeDeps.include` for known CJS packages. |
| Supabase connection pool exhausted under bursty concurrent requests | Unknown unknowns | L | M | For MVP (small user base, low QPS): low risk. If traffic spikes, enable Cloudflare Workers Hyperdrive (Paid plan) as a connection pooler in front of Supabase. |
| Stale `wrangler pages` tutorials cause deployment confusion | Unknown unknowns | M | L | Always use `wrangler deploy` (Workers), never `wrangler pages deploy`. Bookmark `developers.cloudflare.com/workers/` as the canonical reference. |
| `astro:env/server` variables silently undefined if wrangler.jsonc missing var declarations | Unknown unknowns | M | H | After `wrangler login`, verify `wrangler.jsonc` declares all env var names under `vars` (non-secret) before running `wrangler secret put`. Test with `wrangler dev --remote` to confirm env resolution in the Workers runtime. |
| `wrangler tail` log sampling misses concurrent overbooking race condition | Devil's advocate | L | M | For debugging concurrent scenarios, use Supabase's own query logs and Postgres-level locking errors to reconstruct the sequence rather than relying solely on Worker logs. |
| Workers code rollback does not roll back Supabase DB migrations | Pre-mortem | M | H | Always write additive, backward-compatible migrations. Never drop or rename columns in the same deploy that changes the Worker code referencing them. Use a two-deploy strategy for destructive schema changes. |
| Workers free plan removed or limits changed by Cloudflare | Research finding | L | L | Workers free plan has been stable for years. If changed, Workers Paid at $5/mo is the immediate fallback with no code changes required. |

---

## Getting Started

The project already has the `@astrojs/cloudflare` adapter installed. These are the steps to make the first deployment:

1. **Authenticate wrangler** (one-time per machine):
   ```bash
   npx wrangler login
   ```
   Opens a browser for OAuth. After login, credentials are stored at `~/.wrangler/config/default.toml`.

2. **Verify `wrangler.jsonc` has the `nodejs_compat` flag** (required for Supabase JS client):
   ```jsonc
   {
     "compatibility_flags": ["nodejs_compat"],
     "compatibility_date": "2024-09-23"
   }
   ```
   If the file was generated by `astro add cloudflare` for Astro 6 + adapter v13, the `main` field should point to `@astrojs/cloudflare/entrypoints/server` — verify this before deploying.

3. **Provision Workers Secrets** (one command per secret, per environment):
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```
   Wrangler prompts for the value interactively. Add the same values as `SUPABASE_URL` and `SUPABASE_KEY` in the GitHub repository's Settings → Secrets and variables → Actions (already required by the existing CI workflow).

4. **Build and deploy**:
   ```bash
   npm run build && npx wrangler deploy
   ```
   On success, wrangler prints the deployed Worker URL (`https://<name>.<account>.workers.dev`). Verify the app responds correctly before adding a custom domain.

5. **Confirm the Worker is live and logs are flowing**:
   ```bash
   npx wrangler tail --format pretty
   ```
   Open the app in a browser; confirm requests appear in the tail output. Look for any `1101 Worker threw exception` or `nodejs_compat` errors and address them before announcing the URL.

---

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (the project already has `.github/workflows/ci.yml`; extending it for automated deployment is a separate task)
- Production-scale architecture (multi-region, HA, DR)
- Custom domain configuration and DNS setup
- Cloudflare Access (protecting preview/staging environments)
