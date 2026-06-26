import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { z } from "zod";

export const prerender = false;

const createPricingTierSchema = z.object({
  sectorId: z.uuid(),
  baseRate: z.number().positive("Base rate must be greater than 0"),
  floor: z.number().nonnegative("Floor must be 0 or greater"),
  discountSteps: z
    .array(
      z.object({
        dayMin: z.number().int().positive(),
        dayMax: z.number().int().positive(),
        discountPercent: z.number().int().min(0).max(100),
      }),
    )
    .optional()
    .default([]),
});

type CreatePricingTierInput = z.infer<typeof createPricingTierSchema>;

/**
 * POST /api/admin/pricing
 * Create a new pricing tier for a sector.
 * If an active tier exists, deactivate it before creating the new one.
 *
 * Request body:
 * {
 *   sectorId: "sector-uuid",
 *   baseRate: 100,
 *   floor: 50,
 *   discountSteps: [
 *     { dayMin: 1, dayMax: 3, discountPercent: 0 },
 *     { dayMin: 4, dayMax: 7, discountPercent: 10 }
 *   ]
 * }
 *
 * Response:
 * {
 *   success: true,
 *   tier: { id, sector_id, base_daily_rate, daily_floor, discount_steps, ... }
 * }
 */
export async function POST(context: APIContext): Promise<Response> {
  try {
    // Verify admin access
    const user = context.locals.user;
    const role = context.locals.role;

    if (!user || role !== "admin") {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    let input: CreatePricingTierInput;
    try {
      const body = (await context.request.json()) as unknown;
      input = createPricingTierSchema.parse(body);
    } catch (err) {
      let message = "Invalid request body";
      if (err instanceof z.ZodError && err.errors.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message = err.errors[0].message;
      }
      return new Response(JSON.stringify({ success: false, error: message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get Supabase client
    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return new Response(JSON.stringify({ success: false, error: "Database connection failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify sector exists
    const { data: sector, error: sectorError } = await supabase
      .from("sectors")
      .select("id")
      .eq("id", input.sectorId)
      .single();

    if (sectorError || !sector) {
      return new Response(JSON.stringify({ success: false, error: "Sector not found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Deactivate any existing active tier for this sector
    const now = new Date().toISOString();

    const { error: deactivateError } = await supabase
      .from("pricing_tiers")
      .update({ ended_at: now })
      .eq("sector_id", input.sectorId)
      .is("ended_at", null);

    if (deactivateError) {
      const errorMsg = deactivateError instanceof Error ? deactivateError.message : String(deactivateError);
      return new Response(JSON.stringify({ success: false, error: `Failed to deactivate old tier: ${errorMsg}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create new tier
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data: newTier, error: createError } = await supabase
      .from("pricing_tiers")
      .insert([
        {
          sector_id: input.sectorId,
          base_daily_rate: input.baseRate,
          daily_floor: input.floor,
          discount_steps: input.discountSteps,
          ended_at: null,
        },
      ])
      .select()
      .single();

    if (createError || !newTier) {
      const errorMsg = createError instanceof Error ? createError.message : String(createError);
      return new Response(JSON.stringify({ success: false, error: `Failed to create tier: ${errorMsg}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, tier: newTier }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
