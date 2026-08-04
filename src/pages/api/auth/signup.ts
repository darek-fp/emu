import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { verifyPassword } from "@/lib/auth";
import { z } from "zod";

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  tempPassword: z.string().min(1, "Temporary password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

// Operator signup endpoint - validates temp password and creates auth user
export const POST: APIRoute = async (context) => {
  try {
    const body = (await context.request.json()) as unknown;
    const { email, tempPassword, newPassword } = signupSchema.parse(body);

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return new Response(JSON.stringify({ success: false, error: "Database connection failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if operator exists with this email using RPC function (bypasses RLS)
    const normalizedEmail = email.toLowerCase().trim();
    const { data: operatorResults, error: operatorError } = await supabase.rpc("get_operator_by_email", {
      p_email: normalizedEmail,
    });

    if (operatorError) {
      console.error("[Signup API] RPC lookup failed:", {
        searchEmail: normalizedEmail,
        operatorError: operatorError.message,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "This email is not registered as an operator. Contact an administrator.",
          debug:
            process.env.NODE_ENV === "development"
              ? { searchedEmail: normalizedEmail, rpcError: operatorError.message }
              : undefined,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const operator = operatorResults?.[0];

    if (!operator) {
      console.error("[Signup API] Operator lookup returned no results:", {
        searchEmail: normalizedEmail,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "This email is not registered as an operator. Contact an administrator.",
          debug: process.env.NODE_ENV === "development" ? { searchedEmail: normalizedEmail } : undefined,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check if operator already has a user_id (account already created)
    if (operator.user_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "An account for this email already exists. Please sign in instead.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Verify temporary password is set and hasn't expired
    if (!operator.temp_password_hash) {
      console.error("[Signup API] Operator has no temp password set:", { operatorId: operator.id });
      return new Response(
        JSON.stringify({
          success: false,
          error: "No temporary password found. Contact your administrator.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    if (operator.temp_password_expires_at && new Date(operator.temp_password_expires_at) < new Date()) {
      console.error("[Signup API] Temp password expired:", {
        operatorId: operator.id,
        expiresAt: operator.temp_password_expires_at,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Temporary password has expired. Please contact your administrator for a new one.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Verify the provided temp password matches
    if (!verifyPassword(tempPassword, operator.temp_password_hash)) {
      console.error("[Signup API] Invalid temp password provided:", { operatorId: operator.id });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid temporary password. Please check and try again.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Create auth user with the new password
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: newPassword,
      options: {
        data: {
          role: "operator",
        },
      },
    });

    if (authError || !authData.user) {
      console.error("[Signup API] Auth user creation failed:", { authError: authError?.message });
      return new Response(
        JSON.stringify({
          success: false,
          error: authError?.message || "Failed to create account",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Update operator record with auth user ID and clear temp password
    const { error: updateError } = await supabase
      .from("operators")
      .update({
        user_id: authData.user.id,
        temp_password_hash: null,
        temp_password_expires_at: null,
      })
      .eq("id", operator.id);

    if (updateError) {
      console.error("[Signup API] Failed to link account:", { updateError: updateError.message });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to link account. Please contact support.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log("[Signup API] Operator account created successfully:", {
      operatorId: operator.id,
      email: normalizedEmail,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account created successfully. You can now sign in with your new password.",
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    let message = "Invalid request";
    if (err instanceof z.ZodError && err.errors.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      message = err.errors[0].message;
    }
    console.error("[Signup API] Validation error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
