# Testing critical path coverage — runbook

Covers Risk #2 (overbooking from concurrent reservations) and Risk #3 (pricing calculation
regressions). See `plan.md` for the full implementation plan and `research.md` for background.

## Unit tests (CI-gated)

Pricing correctness is proven by parametrized unit tests in
`src/lib/services/pricingService.test.ts` and `src/lib/services/pricingService.param.test.ts`.

```bash
npm run test        # watch mode
npm run test:run    # single run, used in CI (.github/workflows/ci.yml, "Run unit tests" step)
```

These run on every push/PR and must pass before merge.

## Integration tests (local, on-demand)

The concurrency-safety proof for reservation creation
(`tests/integration/concurrency.reservations.test.ts`) runs against a real, Docker-backed local
Supabase Postgres instance — it is **not** run in CI. It seeds a sector with `spot_count = 1`,
fires two concurrent `POST /api/reservations` attempts for the same time window, and asserts
exactly one `201` and one `409` (plus that only one row lands in the `reservations` table). This
proves `create_reservation_locked` (the `SELECT ... FOR UPDATE`-backed Postgres function the
handler calls — see `supabase/migrations/20260804220000_add_reservation_capacity_lock.sql`)
closes the overbooking race.

### Prerequisites

- Docker Desktop (or compatible) running
- Supabase CLI available via `npx supabase` (already a devDependency)

### Running locally

Easiest — one script starts Supabase, resets the DB (applying all migrations), and runs the
suite:

```powershell
# Windows
./scripts/test-integration.ps1
```

```bash
# macOS/Linux
./scripts/test-integration.sh
```

Or, if a local Supabase stack is already running (`npx supabase start`) and migrated
(`npx supabase db reset --local`), just run:

```bash
npm run test:integration
```

`npm run test:integration` (via `tests/integration/setup.ts`) automatically loads
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from the repo's `.dev.vars` file if they aren't
already set in the environment, so no manual env export is required for local runs.

> Note: `npx supabase status -o json` masks the legacy `SERVICE_ROLE_KEY` field as `"******"`.
> The scripts and setup file use the unmasked, equivalent-privilege `SECRET_KEY` field instead.

## Manual verification checklist

- [ ] `npm run test:run` passes locally and the parametrized pricing vectors look correct for a
      sample of windows/discount combinations (Reviewer, Phase 1 — plan item 1.3).
- [ ] `./scripts/test-integration.ps1` (or `.sh`) runs successfully end-to-end and prints
      `==> Integration tests passed.` (Developer, Phase 2 — plan item 2.3).
- [ ] After the concurrency test run, inspect the DB to confirm no double-booking occurred. The
      test's `afterAll` hook deletes its fixture data once it finishes, so the `reservations`
      table will look empty again afterwards — that's expected, not a failure. Instead, check the
      test's own console output for a line like:

  ```
  [concurrency test] reservations active for sector after concurrent attempts: [ { id: '...', ... } ]
  ```

  Confirm exactly one reservation is listed for the sector/window under test (proving the second
  concurrent attempt was rejected, not silently double-booked). If you want to inspect the DB
  directly instead, comment out the `afterAll` cleanup temporarily and re-run
  `npm run test:integration`, then query:

  ```sql
  select id, sector_id, arrival_at, departure_at, status
  from reservations
  where status in ('confirmed', 'arrived');
  ```
- [ ] CI's "Run unit tests" step is green on the PR (`.github/workflows/ci.yml`).
