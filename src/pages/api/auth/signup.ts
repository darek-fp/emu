import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { z } from "zod";

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Operator signup endpoint - allows pre-created operators to sign up with temp password
export const POST: APIRoute = async (context) => {
  try {
    const body = (await context.request.json()) as unknown;
    const { email, password } = signupSchema.parse(body);

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return new Response(
        JSON.stringify({ success: false, error: "Database connection failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check if operator exists with this email
    const { data: operator, error: operatorError } = await supabase
      .from("operators")
      .select("id, email")
      .eq("email", email.toLowerCase())
      .single();

    if (operatorError || !operator) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "This email is not registered as an operator. Contact an administrator.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Create auth user with provided password
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: "operator",
        },
      },
    });

    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: authError?.message || "Failed to create account",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Update operator record with auth user ID
    const { error: updateError } = await supabase
      .from("operators")
      .update({ user_id: authData.user.id })
      .eq("id", operator.id);

    if (updateError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to link account. Please contact support.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account created successfully. Please check your email to confirm.",
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    let message = "Invalid request";
    if (err instanceof z.ZodError && err.errors.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      message = err.errors[0].message;
    }
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
