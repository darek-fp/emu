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
    const z = (await import('zod')).z;
    const schema = z.object({ sectorId: z.string().uuid(), arrivalAt: z.string(), departureAt: z.string() });
    const raw = await context.request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsed.error.format() }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { sectorId, arrivalAt, departureAt } = parsed.data;

    // Enforce operator access to the sector to avoid information leakage
    const operatorSectors: string[] = (context.locals && (context.locals as any).operatorSectors) || [];
    if (!operatorSectors.includes(sectorId)) {
      return new Response(
        JSON.stringify({ error: 'Access denied to this sector' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch active pricing tier for the sector
    const { data: pricingTier, error: tierError } = await supabase
      .from('pricing_tiers')
      .select('*')
      .eq('sector_id', sectorId)
      .is('ended_at', null)
      .single();

    if (tierError || !pricingTier) {
      console.error('Pricing tier fetch failed for sector', sectorId, tierError);
      return new Response(
        JSON.stringify({ error: 'No active pricing tier for this sector' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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
