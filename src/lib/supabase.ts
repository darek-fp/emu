import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Create an admin-scoped Supabase client for server-side operations.
 * This client has full admin privileges and should NEVER be exposed to the client.
 * Use only for operations like creating auth users that require admin access.
 * 
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set in environment.
 */
export function createAdminClient() {
  if (!SUPABASE_URL) {
    return null;
  }

  // Use service role key if available (for auth admin operations)
  // Fall back to regular key if service role key not set
  const apiKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY;
  
  if (!apiKey) {
    return null;
  }

  return createSupabaseClient(SUPABASE_URL, apiKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
