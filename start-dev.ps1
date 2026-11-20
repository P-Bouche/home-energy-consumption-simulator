# Lancement complet du projet (API + Web + base si besoin)
# Usage:
#   .\start-dev.ps1                  # mode Postgres (docker compose up si besoin)
#   .\start-dev.ps1 -Mode memory     # sans base de donnees (demo rapide)
param(
    [ValidateSet('postgres', 'memory')]
    [string]$Mode = 'postgres'
)

$repo = $PSScriptRoot
Set-Location $repo

if ($Mode -eq 'postgres') {
    Write-Host "Docker: verification de la base PostgreSQL/PostGIS..." -ForegroundColor Cyan
    docker compose -f infrastructure/docker/docker-compose.yml up -d --wait
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Docker indisponible ou echec. Lance Docker Desktop, ou utilise: .\start-dev.ps1 -Mode memory" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "Base prete sur localhost:5432" -ForegroundColor Green
} else {
    Write-Host "Mode memoire: aucune base requise (les donnees sont perdues a l'arret)" -ForegroundColor Yellow
}

if (-not (Test-Path "$repo\node_modules")) {
    Write-Host "node_modules absent: npm ci (peut prendre plusieurs minutes)..." -ForegroundColor Cyan
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Write-Host "npm ci a echoue" -ForegroundColor Red; exit 1 }
}

$dbUrl = if ($Mode -eq 'postgres') { 'postgres://postgres:postgres@localhost:5432/hecs' } else { 'memory://' }

# Terminal API
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
`$Host.UI.RawUI.WindowTitle = 'HES - API'
Set-Location '$repo'
`$env:DATABASE_URL = '$dbUrl'
Write-Host 'API sur http://localhost:3000 (docs: /docs)' -ForegroundColor Green
npm run dev:api
"@

# Terminal Web
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
`$Host.UI.RawUI.WindowTitle = 'HES - Web'
Set-Location '$repo'
Write-Host 'Web sur http://localhost:5173' -ForegroundColor Green
npm run dev:web
"@

Write-Host ""
Write-Host "Projet lance:" -ForegroundColor Green
Write-Host "  API : http://localhost:3000/docs"
Write-Host "  Web : http://localhost:5173"
Write-Host "  Base: $dbUrl"
Write-Host ""
Write-Host "Pour tout arreter: ferme les deux fenetres, puis .\stop-dev.ps1 (arrete la base)"
