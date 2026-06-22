# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Feature flags must have a kill date

- **Context**: implement phase when introducing toggles
- **Problem**: Toggles are never cleaned up, accumulating as permanent dead code.
- **Rule**: Always assign a kill date (expiry) to every feature flag at the time it is introduced.
- **Applies to**: implement, impl-review

## Inline DOM scripts in Astro pages should be extracted to React islands

- **Context**: Admin form page with large inline Astro script (src/pages/admin/structure.astro) handling form state and submission
- **Problem**: Large inline scripts diverge from project's React+Astro pattern and are harder to test/reuse
- **Rule**: Interactive sections (forms, toggles, dynamic rendering) → extract to React components with `client:load` directive
- **Applies to**: frontend, impl-review, code-review

## Planned components must be mounted in pages, not left as dead code

- **Context**: Phase 1 planning specified SectorList and SectorForm React components; implementation created them but never imported them in the page
- **Problem**: Components exist but are unused, creating maintenance debt and divergence from plan intent. Future reviewers assume they're used and don't catch the gap.
- **Rule**: Every planned component must be imported and mounted. If circumstances change, explicitly document why and mark as deprecated.
- **Applies to**: impl-review, plan-review
