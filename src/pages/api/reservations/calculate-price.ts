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
    const body = await context.request.json() as {
      sectorId: string;
      arrivalAt: string;
      departureAt: string;
    };

    const { sectorId, arrivalAt, departureAt } = body;

    if (!sectorId || !arrivalAt || !departureAt) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch active pricing tier for the sector
    console.log(`[calculate-price] Fetching tier for sector: ${sectorId}`);
    const { data: pricingTier, error: tierError } = await supabase
      .from("pricing_tiers")
      .select("*")
      .eq("sector_id", sectorId)
      .is("ended_at", null)
      .single();

    if (tierError) {
      console.error(`[calculate-price] Tier fetch error:`, tierError);
    }
    console.log(`[calculate-price] Tier result:`, { found: !!pricingTier, tier: pricingTier });

    if (tierError || !pricingTier) {
      return new Response(
        JSON.stringify({ 
          error: "No active pricing tier for this sector, but pricing is configured",
          debug: { sectorId, tierError: tierError?.message }
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const arrival = new Date(arrivalAt);
    const departure = new Date(departureAt);

    if (departure <= arrival) {
      return new Response(
        JSON.stringify({ error: "Departure must be after arrival" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = calculatePrice(arrival, departure, pricingTier);
    const price = result.totalPrice;

    return new Response(
      JSON.stringify({ price, tierName: sectorId }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Price calculation error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to calculate price" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
