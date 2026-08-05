---
change_id: reservation-rpc-authz-hardening
title: Enforce authorization inside create_reservation_locked RPC to close RLS bypass
status: new
created: 2026-08-05
updated: 2026-08-05
archived_at: null
---

## Notes

Enforce authorization inside create_reservation_locked RPC to prevent RLS bypass. Follow-up from the implementation review of testing-critical-path-coverage (F1, CRITICAL): the create_reservation_locked Postgres function (supabase/migrations/20260804220000_add_reservation_capacity_lock.sql) is SECURITY DEFINER and GRANT EXECUTE TO authenticated, but performs no internal authorization checks (no auth.uid() verification, no sector-assignment check). This bypasses the reservations_insert RLS policy's operator_has_sector_access() check that the plain INSERT it replaced was subject to. Any authenticated user can call the RPC directly via PostgREST/supabase-js, bypassing the checks in src/pages/api/reservations.ts entirely — impersonating any operator (via p_created_by_operator_id), targeting sectors they aren't assigned to, and setting an arbitrary price_total.

Recommended fix (from the review, Fix A): inside create_reservation_locked, before the capacity check, verify auth.uid() resolves to an active operator matching p_created_by_operator_id, and call the existing operator_has_sector_access(p_sector_id) helper (from supabase/migrations/20260622000004_update_reservations_sector_rls.sql), raising an exception if either check fails.

Alternative considered (Fix B): drop SECURITY DEFINER and rely on the existing reservations_insert RLS policy — needs verification that the sectors table RLS/grants would still allow the calling role to SELECT ... FOR UPDATE for the lock step; more blast radius, not fully verified during the review.

Full finding detail: context/changes/testing-critical-path-coverage/reviews/impl-review.md (F1).
