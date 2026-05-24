---
starter_id: 10x-astro-starter
package_manager: npm
project_name: emu-parking-manager
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

The EMU Parking Manager is a small-scale web app for parking managers with auth, a relational reservation model, and a tiered pricing computation engine — all on a 3-week after-hours timeline targeting a small user base. The `10x-astro-starter` is the recommended default for `(web-app, js)`: Supabase provides PostgreSQL for the reservation and pricing schema plus auth out of the box, covering the Admin/Operator role split without extra integration work. Cloudflare Pages keeps ops overhead near zero for a solo after-hours project. All four agent-friendly quality gates pass. GitHub Actions with auto-deploy-on-merge matches the short-timeline, ship-first discipline the PRD describes.
