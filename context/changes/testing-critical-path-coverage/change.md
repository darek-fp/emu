---
change_id: testing-critical-path-coverage
title: Testing critical path coverage
status: implemented
created: 2026-08-02
updated: 2026-08-05
archived_at: null
---

## Notes

Risks covered: #2, #3. Test types planned: unit + integration.
Risk response intent: #2: Two concurrent reservations cannot both succeed - prove using integration tests with DB transactions; avoid only happy-path unit tests.
#3: Pricing calculation matches independent calculations for sample windows - prove with unit tests parametrized over discounts; avoid copying production outputs as expected values.