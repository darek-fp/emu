#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Runs the local, Docker-backed integration test suite (see tests/integration/).

.DESCRIPTION
  Starts the local Supabase stack (Postgres + services) via the Supabase CLI, applies all
  migrations (including the reservation-capacity-lock RPC), runs `npm run test:integration`,
  then reports the result. The Supabase stack is left running afterwards (matching the repo's
  normal local-dev workflow) unless -StopAfter is passed.

.PARAMETER StopAfter
  Stop the local Supabase stack after the tests finish (default: leave it running).

.EXAMPLE
  ./scripts/test-integration.ps1
.EXAMPLE
  ./scripts/test-integration.ps1 -StopAfter
#>
param(
  [switch]$StopAfter
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  Write-Host "==> Starting local Supabase (Postgres + services)..." -ForegroundColor Cyan
  npx supabase start
  if ($LASTEXITCODE -ne 0) { throw "supabase start failed" }

  Write-Host "==> Applying migrations (db reset)..." -ForegroundColor Cyan
  npx supabase db reset --local
  if ($LASTEXITCODE -ne 0) { throw "supabase db reset failed" }

  Write-Host "==> Resolving local Supabase credentials..." -ForegroundColor Cyan
  $statusJson = npx supabase status -o json | Out-String
  $status = $statusJson | ConvertFrom-Json
  $env:SUPABASE_URL = $status.API_URL
  # `supabase status -o json` masks the legacy SERVICE_ROLE_KEY as "******". SECRET_KEY is the
  # new-format API key with equivalent (service-role) privileges and is not masked.
  $env:SUPABASE_SERVICE_ROLE_KEY = $status.SECRET_KEY

  Write-Host "==> Running integration tests..." -ForegroundColor Cyan
  npm run test:integration
  $testExitCode = $LASTEXITCODE

  if ($testExitCode -ne 0) { throw "Integration tests failed (exit code $testExitCode)" }
  Write-Host "==> Integration tests passed." -ForegroundColor Green
}
finally {
  if ($StopAfter) {
    Write-Host "==> Stopping local Supabase..." -ForegroundColor Cyan
    npx supabase stop
  }
  Pop-Location
}
