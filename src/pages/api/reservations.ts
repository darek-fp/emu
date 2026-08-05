/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { calculatePrice } from "@/lib/services/pricingService";
import type { Database } from "@/database.types";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const role = context.locals.role;

  if (!user || role !== "operator") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);

  try {
    // Validate request body with zod
    const { z } = await import("zod");
    const reservationSchema = z.object({
      sectorId: z.uuid(),
      arrivalAt: z.string(),
      departureAt: z.string(),
      customerName: z.string().min(1),
      licensePlate: z.string().min(1),
      priceOverride: z.number().positive().optional(),
    });

    const raw = (await context.request.json()) as unknown;
    let parsed: z.infer<typeof reservationSchema>;
    try {
      parsed = reservationSchema.parse(raw);
    } catch (_e) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { sectorId, arrivalAt, departureAt, customerName, licensePlate, priceOverride } = parsed;

    // Get operator record
    const opResp = (await supabase.from("operators").select("id").eq("user_id", user.id).single()) as unknown as {
      data: { id: string } | null;
      error?: unknown;
    };
    const operator = opResp.data;

    if (!operator) {
      return new Response(JSON.stringify({ error: "Operator not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify operator has access to this sector
    const assignResp = (await supabase
      .from("operator_sector_assignments")
      .select("sector_id")
      .eq("operator_id", operator.id)
      .eq("sector_id", sectorId)
      .single()) as unknown as { data: { sector_id: string } | null; error?: unknown };
    const assignment = assignResp.data;

    if (!assignment) {
      return new Response(JSON.stringify({ error: "Access denied to this sector" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch active pricing tier for the sector
    type PricingTierRow = Database["public"]["Tables"]["pricing_tiers"]["Row"];
    const tierResp = (await supabase
      .from("pricing_tiers")
      .select("*")
      .eq("sector_id", sectorId)
      .is("ended_at", null)
      .single()) as unknown as { data: PricingTierRow | null; error?: unknown };
    const pricingTier = tierResp.data;

    if (!pricingTier) {
      return new Response(JSON.stringify({ error: "No active pricing tier for this sector" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Calculate price
    const arrival = new Date(arrivalAt);
    const departure = new Date(departureAt);

    if (departure <= arrival) {
      return new Response(JSON.stringify({ error: "Departure must be after arrival" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = calculatePrice(arrival, departure, pricingTier);
    const calculatedPrice = result.totalPrice;

    // Use override price if provided, otherwise use calculated price
    const finalPrice = priceOverride ?? calculatedPrice;
    const priceOverrideFlag = priceOverride !== undefined && priceOverride !== calculatedPrice;

    // Create the reservation via a DB-locked RPC: it locks the sector row (SELECT ... FOR
    // UPDATE) and re-checks overlapping-reservation capacity inside the same transaction as
    // the insert, so two concurrent requests for the same sector/window cannot both succeed.
    type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
    const rpcResp = (await supabase.rpc("create_reservation_locked", {
      p_sector_id: sectorId,
      p_arrival_at: arrivalAt,
      p_departure_at: departureAt,
      p_customer_name: customerName,
      p_license_plate: licensePlate,
      p_pricing_tier_id: pricingTier.id,
      p_created_by_operator_id: operator.id,
      p_price_total: finalPrice,
      p_price_override: priceOverrideFlag,
    })) as unknown as {
      data: ReservationRow | null;
      error?: { code?: string; message?: string } | null;
    };

    const reservation = rpcResp.data;
    if (!reservation) {
      // P0001 is the ERRCODE raised by create_reservation_locked when the sector has no
      // available capacity for the requested window (the overbooking-prevention path).
      if (rpcResp.error?.code === "P0001") {
        return new Response(JSON.stringify({ error: "Sector has no available capacity for the requested window" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.error("Reservation creation error:", rpcResp.error);
      return new Response(JSON.stringify({ error: "Failed to create reservation" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        reservation_id: reservation.id,
        price_total: reservation.price_total,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Reservation creation error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  const role = context.locals.role;

  if (!user || role !== "operator") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);

  try {
    const { data: operator } = await supabase.from("operators").select("id").eq("user_id", user.id).single();

    if (!operator) {
      return new Response(JSON.stringify({ error: "Operator not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get operator's reservations
    const { data: reservations, error } = await supabase
      .from("reservations")
      .select("*")
      .eq("created_by_operator_id", operator.id)
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: "Failed to fetch reservations" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reservations }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Failed to fetch reservations:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
