/**
 * Loads local Supabase credentials for `npm run test:integration` so it works standalone
 * (no need to manually export SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY first).
 *
 * Falls back to `.dev.vars` (the repo's existing local-dev secrets file, gitignored) when the
 * env vars aren't already set — e.g. by scripts/test-integration.ps1/.sh or CI.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const devVarsPath = fileURLToPath(new URL("../../.dev.vars", import.meta.url));

if ((!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) && existsSync(devVarsPath)) {
  process.loadEnvFile(devVarsPath);
}
