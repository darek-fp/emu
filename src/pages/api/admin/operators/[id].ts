import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { z } from "zod";

export const prerender = false;

const deactivateOperatorSchema = z.object({
  action: z.enum(["deactivate", "updateSectors"]),
  sectorIds: z.array(z.uuid()).optional(),
});

/**
 * PATCH /api/admin/operators/:id
 * Deactivate an operator or update their sector assignments.
 *
 * Request body:
 * {
 *   action: "deactivate" | "updateSectors",
 *   sectorIds?: ["sector-uuid-1", "sector-uuid-2"]  // Required for updateSectors
 * }
 */
export async function PATCH(context: APIContext): Promise<Response> {
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

    // Get operator ID from dynamic route parameter
    const operatorId = context.params.id;

    console.log("[PATCH /api/admin/operators/:id] Operator ID:", operatorId);

    if (!operatorId) {
      return new Response(JSON.stringify({ success: false, error: "Invalid operator ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    let action: string;
    let sectorIds: string[] = [];
    try {
      const body = (await context.request.json()) as unknown;
      const parsed = deactivateOperatorSchema.parse(body);
      action = parsed.action;
      sectorIds = parsed.sectorIds ?? [];
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

    if (action === "updateSectors") {
      // Update operator sector assignments
      if (sectorIds.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "At least one sector must be assigned" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log("[PATCH updateSectors] Updating sectors for operator:", operatorId);
      console.log("[PATCH updateSectors] New sector IDs:", sectorIds);

      // Delete existing assignments
      const { error: deleteError } = await supabase
        .from("operator_sector_assignments")
        .delete()
        .eq("operator_id", operatorId);

      console.log("[PATCH updateSectors] Delete result:", { error: deleteError });

      if (deleteError) {
        const errorMsg = deleteError instanceof Error ? deleteError.message : String(deleteError);
        console.error("[PATCH updateSectors] Delete error:", errorMsg);
        return new Response(JSON.stringify({ success: false, error: `Failed to update sectors: ${errorMsg}` }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Insert new assignments
      const newAssignments = sectorIds.map((sectorId) => ({
        operator_id: operatorId,
        sector_id: sectorId,
      }));

      console.log("[PATCH updateSectors] Inserting assignments:", newAssignments);

      const { error: insertError } = await supabase.from("operator_sector_assignments").insert(newAssignments);

      console.log("[PATCH updateSectors] Insert result:", { error: insertError });

      if (insertError) {
        const errorMsg = insertError instanceof Error ? insertError.message : String(insertError);
        console.error("[PATCH updateSectors] Insert error:", errorMsg);
        return new Response(JSON.stringify({ success: false, error: `Failed to assign sectors: ${errorMsg}` }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Sectors updated successfully" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "deactivate") {
      // Soft-delete: set deactivated_at timestamp
      const { data: updated, error } = await supabase
        .from("operators")
        .update({ deactivated_at: new Date().toISOString() })
        .eq("id", operatorId)
        .select()
        .single();

      if (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("[PATCH deactivate] Error:", errorMsg);
        return new Response(JSON.stringify({ success: false, error: `Failed to deactivate operator: ${errorMsg}` }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          operator: {
            id: updated.id,
            email: updated.email,
            deactivatedAt: updated.deactivated_at,
            createdAt: updated.created_at,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ success: false, error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[PATCH /api/admin/operators/:id] Unexpected error:", errorMsg);
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
