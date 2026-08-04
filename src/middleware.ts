/* eslint-disable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/array-type */
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

  // Fetch operator sector assignments for operators
  context.locals.operatorSectors = [] as string[];
  if (user && role === "operator" && supabase) {
    // Get the operator record
    const { data: operatorData } = await supabase.from("operators").select("id").eq("user_id", user.id).single();

    if (operatorData) {
      // Get the sector assignments
      const { data: assignments } = await supabase
        .from("operator_sector_assignments")
        .select("sector_id")
        .eq("operator_id", operatorData.id);

      const sectorIds = (assignments as unknown as Array<{ sector_id: string }>)?.map((a) => a.sector_id) ?? [];
      context.locals.operatorSectors = sectorIds;
    }
  }

  const { pathname } = context.url;
  const isAdminRoute = ADMIN_PREFIXES.some((p) => matchesPrefix(pathname, p));
  const isOperatorRoute = OPERATOR_PREFIXES.some((p) => matchesPrefix(pathname, p));

  if (isAdminRoute || isOperatorRoute) {
    if (!user) {
      return context.redirect(`/auth/signin?next=${encodeURIComponent(pathname)}`);
    }
    if (isOperatorRoute && role !== "operator" && role !== "admin") {
      return context.redirect("/auth/signin");
    }
    if (isAdminRoute && role !== "admin") {
      return context.redirect(role === "operator" ? "/dashboard" : "/auth/signin");
    }
  }

  return next();
});
