/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition */
import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

/**
 * GET /api/admin/debug-operators
 * DEBUG ONLY: Lists all operators with their details
 * Shows exactly what's stored in the database
 */
export async function GET(context: APIContext): Promise<Response> {
  try {
    const user = context.locals.user;
    const role = context.locals.role;

    if (!user || role !== "admin") {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return new Response(JSON.stringify({ success: false, error: "Database connection failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: operators, error } = await supabase
      .from("operators")
      .select("id, email, user_id, created_at, deactivated_at")
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: operators?.length ?? 0,
        operators:
          operators?.map((op) => {
            const email = typeof op.email === "string" ? op.email : "";
            return {
              id: op.id,
              email,
              emailLength: email.length,
              emailCharCodes: email.split("").map((c) => c.charCodeAt(0)),
              hasAuthUser: !!op.user_id,
              createdAt: op.created_at,
              deactivatedAt: op.deactivated_at,
            };
          }) ?? [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
