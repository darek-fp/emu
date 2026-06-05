import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import type { UserRole } from "@/types";

const ADMIN_PREFIXES = ["/admin"];
const OPERATOR_PREFIXES = ["/dashboard"];

const matchesPrefix = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const user = context.locals.user;
  const role = (user?.app_metadata.role ?? null) as UserRole | null;
  context.locals.role = role;

  const { pathname } = context.url;
  const isAdminRoute = ADMIN_PREFIXES.some((p) => matchesPrefix(pathname, p));
  const isOperatorRoute = OPERATOR_PREFIXES.some((p) => matchesPrefix(pathname, p));

  if (isAdminRoute || isOperatorRoute) {
    if (!user) {
      return context.redirect(`/auth/signin?next=${encodeURIComponent(pathname)}`);
    }
    if (isOperatorRoute && role === null) {
      return context.redirect("/auth/signin");
    }
    if (isAdminRoute && role !== "admin") {
      return context.redirect(role === "operator" ? "/dashboard" : "/auth/signin");
    }
  }

  return next();
});
