param(
  [Parameter(Mandatory)][string]$Message
)

Write-Host "Running build..." -ForegroundColor Cyan
npm run build; if (-not $?) { exit 1 }

Write-Host "Running lint..." -ForegroundColor Cyan
npm run lint; if (-not $?) { exit 1 }

Write-Host "All checks passed. Committing..." -ForegroundColor Green
git add -A
git commit -m $Message
git push
