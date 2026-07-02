/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { calculatePrice } from "@/lib/services/PricingService";

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
    const schema = z.object({ sectorId: z.uuid(), arrivalAt: z.string(), departureAt: z.string() });
    const raw = (await context.request.json()) as unknown;
    let parsed: z.infer<typeof schema>;
    try {
      parsed = schema.parse(raw);
    } catch (_e) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { sectorId, arrivalAt, departureAt } = parsed;

    // Enforce operator access to the sector to avoid information leakage
    const operatorSectors: string[] = ((context.locals as any)?.operatorSectors ?? []) as string[];
    if (!operatorSectors.includes(sectorId)) {
      return new Response(JSON.stringify({ error: "Access denied to this sector" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch active pricing tier for the sector
    type PricingTierRow = Record<string, unknown>;
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

    const arrival = new Date(arrivalAt);
    const departure = new Date(departureAt);

    if (departure <= arrival) {
      return new Response(JSON.stringify({ error: "Departure must be after arrival" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = calculatePrice(arrival, departure, pricingTier);
    const price = result.totalPrice;

    return new Response(JSON.stringify({ price, breakdown: result.breakdown, pricing_tier_id: pricingTier.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Price calculation error:", err);
    return new Response(JSON.stringify({ error: "Failed to calculate price" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
