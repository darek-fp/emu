# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-02

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the risk wins. Do not promote to e2e because e2e "feels safer." Do not layer a vision model on top of a deterministic check that already catches the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team is worried about X" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what could fail* and *why we believe it's likely* — drawn from documents, interview, and codebase *signal* (churn, structure, test base). It does NOT claim to know which line owns the failure. `/10x-research` produces anchors per phase.

Hot-spot scope used for likelihood weighting: `src`, `src/lib` (insufficient git history; reliance on roadmap & interview).

Test-base profile: sparse — vitest configured in package.json; 2 test files located in `src/lib/services` and `tests/integration`.

Stack grounding tools (current session):
- Docs: none available in current session — checked: 2026-08-02
- Search: none available in current session — checked: 2026-08-02
- Runtime/browser: none available in current session — checked: 2026-08-02
- Provider/platform: none available in current session — checked: 2026-08-02

## 2. Risk Map

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---:|---:|---:|---|
| 1 | Operator login outage prevents booking and operator workflow is blocked | High | High | interview Q1; PRD Access Control; roadmap F-01 |
| 2 | Overbooking / availability regression allows conflicting reservations | High | High | PRD FR-013; roadmap S-03 (north star) |
| 3 | Pricing calculation errors (rounding/discount miscompute) lead to incorrect charges | High | High | PRD FR-007; roadmap S-03 |
| 4 | Reservation UI form regressions break submission or validation (frequent UI problems) | High | Medium | interview Q4; observed UI fragility |
| 5 | PII or authorization gaps leak sensitive data in logs or bundles | Medium | Medium | PRD GDPR notes; AGENTS.md guidance |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | Authenticated operator session + booking endpoint functions end-to-end (operator can sign in and create reservation) | Assume password-reset and session expiry are correct | auth flows, sign-in, password-reset, session claims, role enforcement | integration (auth + booking endpoint) | mirroring auth logic in test oracle |
| #2 | Two concurrent reservations for the same spot/window cannot both succeed | Assume single-request happy-path proves concurrency-safety | reservation creation transaction semantics, DB constraint approach | integration with DB transaction or contract tests | only happy-path unit test; no concurrency check |
| #3 | Price returned equals independent calculation for sample windows including discount steps | Assume expected values taken from implementation are correct | pricing rule shape, discount steps, fractional-day handling | unit tests for pricing function with paramized cases | snapshotting or copying production output as expected value |
| #4 | Reservation form submits validated payloads and surfaces validation errors deterministically | Assume UI snapshot checks catch regressions reliably | frontend validation, API response shapes for errors | integration test around form submission + small deterministic UI test | broad flaky snapshots; brittle selectors |
| #5 | Sensitive fields are absent from public bundles and logs; error bodies do not expose PII | Assume infra prevents leak by default | logging config, error handling middleware, build bundle contents | contract tests + log-inspection checks | ignoring observability; relying on infra black-box |

Challenger findings: none at initial synthesis (research will validate and may propose corrections). 

## 3. Phased Rollout

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---:|---|
| 1 | Critical-path coverage | Defend availability and pricing correctness at cheapest useful layer | #2, #3 | unit + integration | change opened | context/changes/testing-critical-path-coverage/ |
| 2 | Auth & password flows | Protect operator sign-in, password reset, and role enforcement | #1, #5 | integration + contract | not started | — |
| 3 | Reservation UI stability | Stabilize reservation form submission and validation | #4 | integration + targeted UI | not started | — |
| 4 | Quality-gates wiring | Wire CI gates (lint/typecheck + unit/integration) and post-edit hooks | cross-cutting | gates | not started | — |

Last updated: 2026-08-02

## 4. Stack

The project: Astro + Supabase + Cloudflare; Node + Vitest.

- unit + integration: vitest (configured via vitest.config.ts)
- e2e / browser: none configured (TBD if needed)
- provider: Supabase (DB + auth)

**Stack grounding tools (current session):**
- Docs: none available; checked: 2026-08-02
- Search: none available; checked: 2026-08-02
- Runtime/browser: none available; checked: 2026-08-02
- Provider/platform: none available; checked: 2026-08-02

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required | syntax and type drift |
| unit + integration | local + CI | required after §3 Phase 1 | logic regressions |
| e2e on critical flows | CI on PR | required after §3 Phase 1 (conditional) | broken critical user paths |
| post-edit hook | local (agent loop) | recommended after §3 Phase 3 | regressions at edit time |

## 6. Cookbook Patterns

### 6.1 Critical-path tests (Phase 1)
TBD — see §3 Phase 1. (Will include: pricing unit test reference, reservation integration reference, commands to run locally.)

### 6.2 Auth & password tests (Phase 2)
TBD — see §3 Phase 2.

### 6.3 Reservation UI tests (Phase 3)
TBD — see §3 Phase 3.

## 7. What We Deliberately Don't Test

- Supabase infra-level integration and Cloudflare platform internals (user requested: do not spend test budget here). Source: Phase 2 interview Q5.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-02
- Stack versions last verified: 2026-08-02
- AI-native tool references last verified: 2026-08-02

Refresh (`/10x-test-plan --refresh`) when:
- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes,
- §7 negative-space no longer matches the team's expectations.
