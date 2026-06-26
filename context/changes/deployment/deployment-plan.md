# Plan: First Deploy to Cloudflare Workers

## TL;DR

Deploy EMU Parking Manager to Cloudflare Workers (free tier, `wrangler deploy` — NOT `wrangler pages deploy`).
Fix Worker name, provision Supabase secrets, run first deploy, wire CI auto-deploy, and add Supabase redirect URL after go-live.

## Phase 1 — Config fixes (agent) ✅ DONE

Fixes two starter template leftovers that would register the wrong Worker name in Cloudflare.

- [x] Fix `wrangler.jsonc`: `"name"` → `"emu-parking-manager"`
- [x] Fix `package.json`: `"name"` → `"emu-parking-manager"`

## Phase 2 — Cloudflare account setup (human, one-time) ✅ DONE

- [x] Create or verify Cloudflare account at dash.cloudflare.com
- [x] `npx wrangler login` — opens browser, authenticates wrangler locally
- [x] Note Account ID from Cloudflare dashboard right-hand sidebar (needed for CI) — stored in GitHub secret `CLOUDFLARE_ACCOUNT_ID`
- [x] Create API token: dash.cloudflare.com/profile/api-tokens → "Create Token" → "Edit Cloudflare Workers" template → scope to the emu-parking-manager Worker — stored in GitHub secret `CLOUDFLARE_API_TOKEN`

## Phase 3 — Provision Supabase secrets on the Worker

Secrets must exist before the first request hits the Worker; `astro:env` reads them from the Workers runtime env.

### 3a — Create Supabase project (human, one-time)

- [ ] Sign in or create account at [supabase.com](https://supabase.com)
- [ ] New project → choose organisation → set project name (e.g. `emu-parking-manager`) → choose region closest to your users → set a strong database password (save it — it cannot be recovered)
- [ ] Wait for project to provision (~1 min)
- [ ] Go to **Settings → API** and copy:
  - **Project URL** — looks like `https://abcdefghijklm.supabase.co`
  - **anon / public key** — the `anon` JWT key (safe to expose in browser; Row-Level Security gates what it can access)

> **Note on key naming:** Supabase recently renamed `anon` to `publishable`. Either works; the env var name in this project is `SUPABASE_KEY`.

### 3b — Provision secrets on the Worker (human)

- [ ] `echo "https://YOUR-PROJECT.supabase.co" | npx wrangler secret put SUPABASE_URL`
      — pipe avoids interactive prompt (required on Windows)
- [ ] `echo "YOUR-ANON-KEY" | npx wrangler secret put SUPABASE_KEY`
- [ ] Verify both secrets are set: `npx wrangler secret list`

> **Edge case — secret put fails with "No account id":**
> Add `"account_id": "YOUR_ACCOUNT_ID"` temporarily to `wrangler.jsonc`, run secret put, then remove it (or keep it; it's not sensitive).

## Phase 4 — First deploy ✅ DONE

- [x] `npm run build` — confirm clean build (secrets are `optional: true` so build succeeds without them)
- [x] `npx wrangler deploy --dry-run` — validates wrangler.jsonc, catches config errors before touching prod
- [x] `npx wrangler deploy` — deploys Worker; live at https://emu-parking-manager.dariusz-sowada.workers.dev
  - KV Namespace `emu-parking-manager-session` auto-provisioned for sessions
  - gworkers.dev subdomain `dariusz-sowada` registered

## Phase 5 — Smoke test (human)

- [x] Open `https://emu-parking-manager.dariusz-sowada.workers.dev` — home page loads (HTTP 200)
- [x] Open `/auth/signin` — page loads (exercises SSR + middleware + cookie read)
- [x] `npx wrangler tail emu-parking-manager --format pretty` — watch for errors for 30 seconds; specifically watch for `1101 Worker threw exception` (CPU cap) or `undefined` values (missing secrets)

## Phase 6 — Supabase redirect URL (human, post-go-live)

Required for email-confirmation auth flow to work on the deployed URL.

- [x] Supabase dashboard → Authentication → URL Configuration → Site URL → set to `https://emu-parking-manager.dariusz-sowada.workers.dev`
- [x] Add `https://emu-parking-manager.dariusz-sowada.workers.dev/**` to Redirect URLs allowlist

## Phase 7 — CI auto-deploy wiring (agent + human)

- [x] Update `.github/workflows/ci.yml`: add `deploy` job that runs after `ci` succeeds on push to `master`, using `cloudflare/wrangler-action@v3` with `accountId` input (required — without it CI fails with "No account id found")
- [x] Add GitHub repo secrets (Settings → Secrets → Actions):
  - `CLOUDFLARE_API_TOKEN` — the token from Phase 2
  - `CLOUDFLARE_ACCOUNT_ID` — the Account ID from Phase 2
  - `SUPABASE_URL` — same value as Workers secret (needed for CI build step)
  - `SUPABASE_KEY` — same value as Workers secret (needed for CI build step)
- [x] Push a test commit to `master` → confirm the `deploy` job passes in GitHub Actions

## CI job shape (for Phase 7)

```yaml
deploy:
  needs: ci
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/master' && github.event_name == 'push'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - uses: cloudflare/wrangler-action@v3
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      env:
        SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
        SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
```

Note: `SUPABASE_URL` and `SUPABASE_KEY` in `env` are for the `astro build` step inside wrangler-action. They are NOT re-provisioned as Worker secrets — those were already set in Phase 3.

## Relevant files

- `wrangler.jsonc` — fix `name` field
- `package.json` — fix `name` field
- `.github/workflows/ci.yml` — add `deploy` job

## Key decisions

- Deploy target: Cloudflare Workers (Workers Static Assets) — NOT Cloudflare Pages. Command: `wrangler deploy`, never `wrangler pages deploy`.
- `@astrojs/cloudflare` v13 dropped Cloudflare Pages support; `tech-stack.md` `deployment_target: cloudflare-pages` is outdated naming — deployment proceeds as Workers.
- Worker name: `emu-parking-manager` (from `tech-stack.md` `project_name`)
- No staging environment in this plan — out of scope for first MVP deploy
- `wrangler.jsonc` does NOT need `account_id` for local deploy (wrangler reads it from login auth); CI passes it explicitly via `accountId:` action input
- Secrets provisioned via `wrangler secret put` (piped, not interactive), not via `vars` in `wrangler.jsonc`
- `astro:env` `optional: true` on both secrets → build never fails for missing values; missing secrets show up as `undefined` at runtime only
- Supabase redirect URL must be updated post-deploy or email confirmation links will 404

## Edge case register

| Edge case                                            | Symptom                                         | Fix                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `[ERROR] No account id found` on wrangler secret put | Wrangler can't determine account                | Temporarily add `"account_id": "..."` to `wrangler.jsonc` OR use `--account-id` flag                |
| `1101 Worker threw exception` in prod but not dev    | CPU > 10ms free tier cap                        | Upgrade to Workers Paid ($5/mo): dash.cloudflare.com → your Worker → Settings → Usage Model         |
| `SUPABASE_URL` is `undefined` at runtime             | Secret not provisioned on the Worker            | Re-run `echo "..." \| npx wrangler secret put SUPABASE_URL`; verify with `npx wrangler secret list` |
| Auth redirect after email confirm goes to localhost  | Supabase Site URL still set to localhost        | Update Supabase → Auth → URL Configuration (Phase 6)                                                |
| CI deploy job fails with "No account id"             | `CLOUDFLARE_ACCOUNT_ID` secret missing or empty | Add secret to GitHub repo settings (Phase 7)                                                        |
| `require is not defined` runtime error               | CommonJS transitive dep in workerd              | Add to `vite.optimizeDeps.include` in `astro.config.mjs`                                            |
