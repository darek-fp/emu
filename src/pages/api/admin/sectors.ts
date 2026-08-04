/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-condition */
import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { checkSectorConflict, type ConflictInfo } from "@/lib/services/sectorService";
import { z } from "zod";

export const prerender = false;

const operationSchema = z.object({
  type: z.enum(["add", "update"]),
  name: z.string().min(1, "Sector name is required").optional(),
  spotCount: z.number().int().positive("Spot count must be greater than 0"),
  id: z.string().optional(),
});

const requestSchema = z.object({
  operations: z.array(operationSchema).min(1, "At least one operation is required"),
});

type Operation = z.infer<typeof operationSchema>;
interface Sector {
  id: string;
  name: string;
  spot_count: number;
  created_at: string;
}

export async function POST(context: APIContext) {
  try {
    // Verify admin access via middleware
    const user = context.locals.user;
    const role = context.locals.role;

    if (!user || role !== "admin") {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse request body
    let operations: Operation[];
    try {
      const body = await context.request.json();
      const parsed = requestSchema.parse(body);
      operations = parsed.operations;
    } catch (err) {
      let message = "Invalid request body";
      if (err instanceof z.ZodError && err.errors.length > 0) {
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

    // Validate all operations before any writes
    const validationErrors: string[] = [];

    for (const op of operations) {
      if (op.type === "add") {
        if (!op.name || op.name.trim().length === 0) {
          validationErrors.push("Sector name is required for add operation");
        }
        if (!op.spotCount || op.spotCount <= 0) {
          validationErrors.push("Spot count must be greater than 0");
        }
      } else {
        if (!op.id) {
          validationErrors.push("Sector ID is required for update operation");
        }
        if (op.name?.trim().length === 0) {
          validationErrors.push("Sector name cannot be empty");
        }
        if (!op.spotCount || op.spotCount <= 0) {
          validationErrors.push("Spot count must be greater than 0");
        }
      }
    }

    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ success: false, error: validationErrors.join("; ") }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check for name uniqueness on add operations
    const newNames = operations.reduce<string[]>((acc, op) => {
      if (op.type === "add" && typeof op.name === "string") {
        acc.push(op.name.trim());
      }
      return acc;
    }, []);
    if (newNames.length > 0) {
      const { data: existingSectors, error: fetchError } = await supabase
        .from("sectors")
        .select("name")
        .in("name", newNames);

      if (fetchError) {
        return new Response(
          JSON.stringify({ success: false, error: `Failed to check sector names: ${fetchError.message}` }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      if (existingSectors && existingSectors.length > 0) {
        const duplicates = existingSectors.map((s) => s.name).join(", ");
        return new Response(
          JSON.stringify({
            success: false,
            error: `Sector name(s) already exist: ${duplicates}`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Check for conflicts on update operations that reduce spot count
    // WARNING: TOCTOU race condition window exists between this check and the write.
    // For production, use a PostgreSQL RPC to make check-then-act atomic.
    // Temporary mitigation: re-validate immediately before writes.
    const conflicts: ConflictInfo[] = [];
    for (const op of operations) {
      if (op.type === "update" && op.id) {
        // Get current sector spot count to check if this is a reduction
        const { data: currentSector } = await supabase.from("sectors").select("spot_count").eq("id", op.id).single();

        if (currentSector && op.spotCount < currentSector.spot_count) {
          // This is a reduction, check for conflicts
          const conflict = await checkSectorConflict(supabase, op.id, op.spotCount);
          if (conflict) {
            conflicts.push(conflict);
          }
        }
      }
    }

    // If conflicts exist, return error response
    if (conflicts.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Cannot apply changes: conflicts detected in affected sectors",
          conflicts,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Apply all operations atomically
    // Note: Supabase JS client does not support true transactions.
    // We validate all operations before any writes to minimize risk.
    // TOCTOU mitigation: re-validate conflicts immediately before writes.
    // If a write fails mid-batch, partial updates may persist.
    // For production, use a Supabase RPC or PostgreSQL trigger for true atomicity.
    try {
      // Re-validate conflicts immediately before writes (TOCTOU mitigation)
      for (const op of operations) {
        if (op.type === "update" && op.id) {
          const { data: currentSector } = await supabase.from("sectors").select("spot_count").eq("id", op.id).single();
          if (currentSector && op.spotCount < currentSector.spot_count) {
            const conflict = await checkSectorConflict(supabase, op.id, op.spotCount);
            if (conflict) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: "Conflict detected (state changed during request): " + conflict.reason,
                  conflicts: [conflict],
                }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }
          }
        }
      }

      const writeErrors: string[] = [];

      for (const op of operations) {
        if (op.type === "add") {
          const { error } = await supabase
            .from("sectors")
            .insert([{ name: op.name?.trim() ?? "", spot_count: op.spotCount }]);

          if (error) {
            writeErrors.push(`Failed to add sector: ${error.message}`);
          }
        } else {
          const updateData: { spot_count: number; name?: string } = { spot_count: op.spotCount };
          if (op.name) {
            updateData.name = op.name.trim();
          }
          const { error } = await supabase
            .from("sectors")
            .update(updateData)
            .eq("id", op.id ?? "");

          if (error) {
            writeErrors.push(`Failed to update sector: ${error.message}`);
          }
        }
      }

      // If any writes failed, return error (stop processing)
      if (writeErrors.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "One or more sector updates failed. Partial updates may have persisted.",
            details: writeErrors,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error during operation";
      return new Response(JSON.stringify({ success: false, error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch and return all sectors
    const { data: allSectors, error: fetchAllError } = await supabase
      .from("sectors")
      .select("*")
      .order("created_at", { ascending: true });

    if (fetchAllError) {
      const errorMsg = fetchAllError instanceof Error ? fetchAllError.message : String(fetchAllError);
      return new Response(JSON.stringify({ success: false, error: `Failed to fetch updated sectors: ${errorMsg}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, sectors: allSectors as unknown as Sector[] }), {
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

export async function GET(context: APIContext) {
  try {
    // Verify authenticated access
    const user = context.locals.user;
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify admin-only access for /api/admin/sectors
    const role = context.locals.role;
    if (role !== "admin") {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: admin access required" }), {
        status: 403,
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

    // Fetch all sectors
    const { data: sectors, error } = await supabase
      .from("sectors")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ success: false, error: `Failed to fetch sectors: ${errorMsg}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, sectors: sectors as unknown as Sector[] }), {
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
