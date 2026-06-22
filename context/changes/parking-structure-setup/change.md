---
change_id: parking-structure-setup
title: Parking structure setup
status: impl_reviewed
created: 2026-06-09
updated: 2026-06-21
archived_at: null
---

## Notes

- MVP scope: single-lot mode (no sector division). Sectors table is the foundational structure.
- Conflict detection blocks structural updates if active reservations exist in affected sectors.
- All batch operations are atomic: validate all before any writes.
- Operator read-only access to sector list via `/api/sectors` for S-03 (reservation creation).
