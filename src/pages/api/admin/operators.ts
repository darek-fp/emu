import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { z } from "zod";

export const prerender = false;

// Request validation schemas
const createOperatorSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  sectorIds: z.array(z.uuid()).min(1, "At least one sector must be assigned"),
});

const deactivateOperatorSchema = z.object({
  action: z.enum(["deactivate"]),
});

// Response types
interface OperatorListItem {
  id: string;
  email: string;
  sectorIds: string[];
  deactivatedAt: string | null;
  createdAt: string;
}

interface SectorInfo {
  id: string;
  name: string;
}

interface OperatorInfo {
  id: string;
  email: string;
  deactivatedAt: string | null;
  createdAt: string;
}

/**
 * POST /api/admin/operators
 * Create a new operator account with sector assignments and generate temp password.
 *
 * Request body:
 * {
 *   email: "operator@example.com",
 *   sectorIds: ["sector-uuid-1", "sector-uuid-2"]
 * }
 *
 * Response:
 * {
 *   success: true,
 *   operatorId: "operator-uuid",
 *   email: "operator@example.com",
 *   tempPassword: "GeneratedP@ss1234",
 *   sectors: [{ id: "sector-1", name: "Sector A" }]
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
    let email: string;
    let password: string;
    let sectorIds: string[];
    try {
      const body = (await context.request.json()) as unknown;
      const parsed = createOperatorSchema.parse(body);
      email = parsed.email.toLowerCase().trim();
      password = parsed.password;
      sectorIds = parsed.sectorIds;
      console.log("[POST /api/admin/operators] Creating operator:", { email, sectorCount: sectorIds.length });
    } catch (err) {
      let message = "Invalid request body";
      if (err instanceof z.ZodError && err.errors.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message = err.errors[0].message;
      }
      console.error("[POST /api/admin/operators] Validation error:", message);
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

    // Verify all sectors exist
    const { data: sectors, error: sectorError } = await supabase.from("sectors").select("id, name").in("id", sectorIds);

    if (sectorError || sectors?.length !== sectorIds.length) {
      console.error("[POST /api/admin/operators] Sector verification failed:", { sectorError, foundCount: sectors?.length, requestedCount: sectorIds.length });
      return new Response(JSON.stringify({ success: false, error: "One or more sectors not found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create auth user first
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "operator",
      },
    });

    if (authError || !authData.user) {
      const authErrorMsg = authError?.message || "Failed to create auth user";
      console.error("[POST /api/admin/operators] Auth user creation failed:", authErrorMsg);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to create auth user: ${authErrorMsg}` }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const userId = authData.user.id;
    console.log("[POST /api/admin/operators] Auth user created:", { userId, email });

    // Create operator record with the auth user ID linked
    const { data: operatorData, error: operatorError } = await supabase
      .from("operators")
      .insert([
        {
          email,
          user_id: userId,
          deactivated_at: null,
        },
      ])
      .select("id")
      .single();

    if (operatorError || !operatorData?.id) {
      const operatorErrorMsg = operatorError instanceof Error ? operatorError.message : String(operatorError);
      console.error("[POST /api/admin/operators] Failed to create operator record:", operatorErrorMsg);
      
      // Clean up auth user if operator creation fails
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch (cleanupErr) {
        console.error("[POST /api/admin/operators] Failed to clean up auth user:", cleanupErr);
      }

      return new Response(
        JSON.stringify({ success: false, error: `Failed to create operator record: ${operatorErrorMsg}` }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const operatorId = operatorData.id;
    console.log("[POST /api/admin/operators] Operator created:", { operatorId, email });

    // Assign sectors using admin function (bypasses RLS)
    const { error: assignmentError } = await supabase.rpc("assign_operator_sectors", {
      p_operator_id: operatorId,
      p_sector_ids: sectorIds,
    });

    if (assignmentError) {
      console.error("[POST /api/admin/operators] Sector assignment failed:", assignmentError);
      // Try to clean up the operator record
      try {
        await supabase.from("operators").delete().eq("id", operatorId);
      } catch (cleanupErr) {
        console.error("[POST /api/admin/operators] Cleanup failed:", cleanupErr);
      }
      const errorMsg = assignmentError instanceof Error ? assignmentError.message : String(assignmentError);
      return new Response(JSON.stringify({ success: false, error: `Failed to assign sectors: ${errorMsg}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Return success response with operator details
    console.log("[POST /api/admin/operators] Success response:", { operatorId, email });
    
    return new Response(
      JSON.stringify({
        success: true,
        operatorId,
        email,
        sectors: sectors as unknown as SectorInfo[],
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * GET /api/admin/operators
 * List all operators with their sector assignments.
 *
 * Query parameters:
 * - includeDeactivated: true/false (default: false)
 *
 * Response:
 * {
 *   success: true,
 *   operators: [
 *     {
 *       id: "operator-uuid",
 *       email: "operator@example.com",
 *       sectorIds: ["sector-uuid-1"],
 *       deactivatedAt: null,
 *       createdAt: "2026-06-22T12:00:00Z"
 *     }
 *   ]
 * }
 */
export async function GET(context: APIContext): Promise<Response> {
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

    // Get query parameters
    const url = new URL(context.request.url);
    const includeDeactivated = url.searchParams.get("includeDeactivated") === "true";

    // Get Supabase client
    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return new Response(JSON.stringify({ success: false, error: "Database connection failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

     // Fetch operators
    let query = supabase.from("operators").select("id, email, deactivated_at, created_at");

    if (!includeDeactivated) {
      query = query.is("deactivated_at", null);
    }

    const { data: operators, error: operatorsError } = await query;

    if (operatorsError) {
      const errorMsg = operatorsError instanceof Error ? operatorsError.message : String(operatorsError);
      return new Response(JSON.stringify({ success: false, error: `Failed to fetch operators: ${errorMsg}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!operators || operators.length === 0) {
      return new Response(JSON.stringify({ success: true, operators: [] as OperatorListItem[] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch sector assignments for these operators

    const operatorIds = operators.map((o) => o.id);
    const { data: assignments, error: assignmentError } = await supabase
      .from("operator_sector_assignments")
      .select("operator_id, sector_id")
      .in("operator_id", operatorIds);

    if (assignmentError) {
      const errorMsg = assignmentError instanceof Error ? assignmentError.message : String(assignmentError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch sector assignments: ${errorMsg}` }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Build operator list with sector assignments

    const operatorList: OperatorListItem[] = operators.map((op) => ({
      id: op.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      email: op.email,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      sectorIds: (assignments ?? []).filter((a) => a.operator_id === op.id).map((a) => a.sector_id),

      deactivatedAt: op.deactivated_at,
      createdAt: op.created_at,
    }));

    return new Response(JSON.stringify({ success: true, operators: operatorList }), {
      status: 200,
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

/**
 * PATCH /api/admin/operators/:id
 * Deactivate an operator (soft-delete).
 *
 * Request body:
 * {
 *   action: "deactivate"
 * }
 *
 * Response:
 * {
 *   success: true,
 *   operator: { id, email, deactivatedAt, ... }
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

    // Extract operator ID from URL path
    const url = new URL(context.request.url);
    const pathSegments = url.pathname.split("/");
    const operatorId = pathSegments[pathSegments.length - 1];

    if (!operatorId || operatorId === "operators") {
      return new Response(JSON.stringify({ success: false, error: "Invalid operator ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    let action: string;
    try {
      const body = (await context.request.json()) as unknown;
      const parsed = deactivateOperatorSchema.parse(body);
      action = parsed.action;
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

    if (action === "deactivate") {
      // Soft-delete: set deactivated_at timestamp

      const { data: updated, error } = await supabase
        .from("operators")
        .update({ deactivated_at: new Date().toISOString() })
        .eq("id", operatorId)
        .select("id, email, deactivated_at, created_at")
        .single();

      if (error || !updated) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const statusCode = error && "code" in error && error.code === "PGRST116" ? 404 : 500;
        const errorMsg = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ success: false, error: errorMsg ?? "Operator not found" }), {
          status: statusCode,
          headers: { "Content-Type": "application/json" },
        });
      }

      const response: OperatorInfo & { id: string } = {
        id: updated.id,
        email: updated.email,

        deactivatedAt: updated.deactivated_at,

        createdAt: updated.created_at,
      };

      return new Response(JSON.stringify({ success: true, operator: response }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Invalid action" }), {
      status: 400,
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
