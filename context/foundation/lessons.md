# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Feature flags must have a kill date

- **Context**: implement phase when introducing toggles
- **Problem**: Toggles are never cleaned up, accumulating as permanent dead code.
- **Rule**: Always assign a kill date (expiry) to every feature flag at the time it is introduced.
- **Applies to**: implement, impl-review
