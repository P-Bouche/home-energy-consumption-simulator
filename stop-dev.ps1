# Arrete la base PostgreSQL (les fenetres API/Web se ferment manuellement)
Write-Host "Arret de la base PostgreSQL..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\infrastructure\docker"
docker compose -f docker-compose.yml stop
Write-Host "Base arretee. (Les donnees sont conservees dans le volume postgres_data.)" -ForegroundColor Green
Write-Host "Pour la relancer plus tard: .\start-dev.ps1"
