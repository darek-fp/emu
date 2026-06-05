import type { APIRoute } from "astro";

// Account creation is Admin-provisioned only. Public self-registration is disabled.
export const POST: APIRoute = (context) => {
  return context.redirect(
    "/auth/signin?error=" + encodeURIComponent("Account registration is not available. Contact an administrator."),
  );
};
