import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import type { UserRole } from "@/types";

export const prerender = false;

export async function GET(context: APIContext) {
  // Create Supabase client with user's auth session
  const supabase = createClient(context.request.headers, context.cookies);

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check user role (operator or admin allowed)
  const role = (user.app_metadata.role ?? null) as UserRole | null;
  if (role !== "operator" && role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Fetch all sectors with spot counts
    const { data: sectors, error } = await supabase
      .from("sectors")
      .select("id, name, spot_count, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ success: true, sectors }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({
        error: "Failed to fetch sectors",
        details: message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
