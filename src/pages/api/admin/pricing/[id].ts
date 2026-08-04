/* eslint-disable @typescript-eslint/no-unsafe-assignment, no-console */
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  const role = context.locals.role;

  if (!user || role !== "admin") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = context.params;

  if (!id) {
    return new Response(JSON.stringify({ error: "Tier ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);

  try {
    const { data: tier, error } = await supabase.from("pricing_tiers").select("*").eq("id", id).single();

    if (error || !tier) {
      return new Response(JSON.stringify({ error: "Tier not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(tier), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Failed to fetch pricing tier:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch pricing tier" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
