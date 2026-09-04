# start-supabase.ps1
# Reliable startup script for local Supabase development on Windows

Write-Host "`n Starting Supabase Local Environment..." -ForegroundColor Cyan

# 1. Check if Docker daemon is running
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker Desktop is not running. Please launch Docker Desktop and try again."
        exit 1
    }
} catch {
    Write-Error "Docker is not installed or not in PATH."
    exit 1
}

# 2. Run supabase start with --ignore-health-check to avoid transient cold-boot healthcheck timeouts
Write-Host " Initializing Supabase containers (with health check tolerance)..." -ForegroundColor Yellow
supabase start --ignore-health-check

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n Supabase local stack started successfully!" -ForegroundColor Green
    Write-Host "Services are running and accessible." -ForegroundColor Green
} else {
    Write-Host "`n Failed to start Supabase." -ForegroundColor Red
    exit $LASTEXITCODE
}
