/**
 * Integration test (local-only, Docker-backed Supabase Postgres): proves Risk #2
 * (overbooking due to concurrent reservation requests) is closed.
 *
 * Requires a running local Supabase instance with migrations applied:
 *   npx supabase start
 *   npx supabase db reset --local   (applies migrations, including create_reservation_locked)
 *
 * Run with: npm run test:integration
 *
 * The test seeds a sector with spot_count = 1 (i.e. only one reservation can be active at
 * a time), then fires two concurrent POST /api/reservations attempts for the exact same
 * time window. Because src/pages/api/reservations.ts creates reservations through the
 * `create_reservation_locked` Postgres function (SELECT ... FOR UPDATE on the sector row +
 * capacity re-check inside the insert transaction), exactly one attempt must succeed (201)
 * and the other must be rejected as a capacity conflict (409) — never both.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/database.types";
import type { APIRoute } from "astro";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const describeIfConfigured = SUPABASE_SERVICE_ROLE_KEY ? describe : describe.skip;

/** Type-safe helper to call an APIRoute handler with a hand-built fake Astro context. */
function callHandler(handler: APIRoute, context: unknown): Promise<Response> {
  return (handler as unknown as (ctx: unknown) => Promise<Response>)(context);
}

describeIfConfigured("Reservation concurrency (overbooking prevention)", () => {
  // describeIfConfigured only runs this suite when SUPABASE_SERVICE_ROLE_KEY is set, so the
  // admin client below is always non-null inside the test/hook bodies.
  const admin: SupabaseClient<Database> = createSupabaseClient<Database>(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let sectorId: string;
  let pricingTierId: string;
  let operatorId: string;
  let operatorUserId: string;

  beforeAll(async () => {
    // Sector with a single spot: the second concurrent reservation for the same window
    // must be rejected once the first has claimed the only spot.
    const { data: sector } = await admin
      .from("sectors")
      .insert({ name: `concurrency-test-${randomUUID()}`, spot_count: 1 })
      .select("id")
      .single();
    if (!sector) throw new Error("Failed to seed sector for concurrency test");
    sectorId = sector.id;

    const { data: tier } = await admin
      .from("pricing_tiers")
      .insert({ sector_id: sectorId, base_daily_rate: 100, daily_floor: 50, discount_steps: [], ended_at: null })
      .select("id")
      .single();
    if (!tier) throw new Error("Failed to seed pricing tier for concurrency test");
    pricingTierId = tier.id;

    const email = `concurrency-test-${randomUUID()}@emu.dev`;
    const { data: userResp } = await admin.auth.admin.createUser({
      email,
      password: "concurrency-test-password",
      email_confirm: true,
      app_metadata: { role: "operator" },
    });
    if (!userResp.user) throw new Error("Failed to seed operator auth user for concurrency test");
    operatorUserId = userResp.user.id;

    const { data: operator } = await admin.from("operators").insert({ user_id: operatorUserId }).select("id").single();
    if (!operator) throw new Error("Failed to seed operator record for concurrency test");
    operatorId = operator.id;

    const { error: assignmentError } = await admin
      .from("operator_sector_assignments")
      .insert({ operator_id: operatorId, sector_id: sectorId });
    if (assignmentError) throw new Error(`Failed to seed sector assignment: ${assignmentError.message}`);
  });

  afterAll(async () => {
    if (!sectorId) return;
    await admin.from("reservations").delete().eq("sector_id", sectorId);
    await admin.from("operator_sector_assignments").delete().eq("sector_id", sectorId);
    if (operatorId) await admin.from("operators").delete().eq("id", operatorId);
    if (operatorUserId) await admin.auth.admin.deleteUser(operatorUserId);
    await admin.from("pricing_tiers").delete().eq("sector_id", sectorId);
    await admin.from("sectors").delete().eq("id", sectorId);
  });

  it("allows exactly one of two concurrent same-window reservation attempts to succeed", async () => {
    // Exercise the real POST handler (business logic + capacity mapping) against the real,
    // Docker-backed local Postgres instance. Only the connection wiring is stubbed so the
    // request doesn't need a genuine cookie-based auth session.
    vi.resetModules();
    vi.doMock("@/lib/supabase", () => ({
      createClient: () => admin,
    }));

    const { POST } = (await import("../../src/pages/api/reservations")) as { POST: APIRoute };

    const arrivalAt = "2027-01-10T10:00:00.000Z";
    const departureAt = "2027-01-11T10:00:00.000Z";

    const makeContext = (licensePlate: string) => ({
      locals: { user: { id: operatorUserId }, role: "operator" },
      request: {
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            sectorId,
            arrivalAt,
            departureAt,
            customerName: "Concurrency Test",
            licensePlate,
          }),
      },
      cookies: {},
    });

    const [responseA, responseB] = await Promise.all([
      callHandler(POST, makeContext("PLATE-A")),
      callHandler(POST, makeContext("PLATE-B")),
    ]);

    const statuses = [responseA.status, responseB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    // Confirm no double booking landed in the DB either.
    const { data: reservations, error } = await admin
      .from("reservations")
      .select("id")
      .eq("sector_id", sectorId)
      .in("status", ["confirmed", "arrived"]);
    expect(error).toBeNull();
    expect(reservations).toHaveLength(1);

    vi.doUnmock("@/lib/supabase");
  });

  it("reports the pricing_tier id used by create_reservation_locked matches the seeded tier", async () => {
    const { data: reservation } = await admin
      .from("reservations")
      .select("pricing_tier_id")
      .eq("sector_id", sectorId)
      .single();
    expect(reservation?.pricing_tier_id).toBe(pricingTierId);
  });
});
