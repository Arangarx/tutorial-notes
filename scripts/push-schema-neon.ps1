# Fallback: apply schema to Neon when you cannot run migrations from Vercel/CI.
# Normal path: migrations run automatically on Vercel build (`prisma migrate deploy`).
#
# 1. In https://console.neon.tech → project "tutoring-notes" → Connection details:
#    - Copy POOLED connection string → DATABASE_URL
#    - Copy DIRECT connection string → DIRECT_URL
# 2. Run (PowerShell), pasting your URLs:
#
#    $env:DATABASE_URL = "postgresql://..."
#    $env:DIRECT_URL   = "postgresql://..."
#    .\scripts\push-schema-neon.ps1
#
# Or pass as parameters:
#    .\scripts\push-schema-neon.ps1 -DatabaseUrl "..." -DirectUrl "..."

param(
  [string] $DatabaseUrl = $env:DATABASE_URL,
  [string] $DirectUrl = $env:DIRECT_URL
)

$ErrorActionPreference = "Stop"

if (-not $DatabaseUrl -or -not $DirectUrl) {
  Write-Host "Set DATABASE_URL (pooled) and DIRECT_URL (direct) from Neon, then run again." -ForegroundColor Yellow
  Write-Host "Console: https://console.neon.tech → tutoring-notes → Connection details" -ForegroundColor Gray
  exit 1
}

if ($DatabaseUrl -notmatch "^postgres(ql)?://") {
  Write-Host "DATABASE_URL must start with postgresql:// or postgres://" -ForegroundColor Red
  exit 1
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:DATABASE_URL = $DatabaseUrl
$env:DIRECT_URL = $DirectUrl

Write-Host "Running: npx prisma migrate deploy (pending migrations -> Neon)..." -ForegroundColor Cyan
npx prisma migrate deploy
Write-Host "Done. Next: open https://YOUR-APP.vercel.app/setup to create the first admin (if not already)." -ForegroundColor Green
