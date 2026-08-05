#!/usr/bin/env bash
# Runs the local, Docker-backed integration test suite (see tests/integration/).
#
# Starts the local Supabase stack (Postgres + services) via the Supabase CLI, applies all
# migrations (including the reservation-capacity-lock RPC), runs `npm run test:integration`,
# then reports the result. The Supabase stack is left running afterwards (matching the repo's
# normal local-dev workflow) unless STOP_AFTER=1 is set.
#
# Usage:
#   ./scripts/test-integration.sh
#   STOP_AFTER=1 ./scripts/test-integration.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

cleanup() {
  if [ "${STOP_AFTER:-0}" = "1" ]; then
    echo "==> Stopping local Supabase..."
    npx supabase stop || true
  fi
}
trap cleanup EXIT

echo "==> Starting local Supabase (Postgres + services)..."
npx supabase start

echo "==> Applying migrations (db reset)..."
npx supabase db reset --local

echo "==> Resolving local Supabase credentials..."
STATUS_JSON="$(npx supabase status -o json)"
export SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL="$(node -e "console.log(JSON.parse(process.argv[1]).API_URL)" "$STATUS_JSON")"
# `supabase status -o json` masks the legacy SERVICE_ROLE_KEY as "******". SECRET_KEY is the
# new-format API key with equivalent (service-role) privileges and is not masked.
SUPABASE_SERVICE_ROLE_KEY="$(node -e "console.log(JSON.parse(process.argv[1]).SECRET_KEY)" "$STATUS_JSON")"

echo "==> Running integration tests..."
npm run test:integration

echo "==> Integration tests passed."
