# Arrete la base PostgreSQL (les fenetres API/Web se ferment manuellement)
Write-Host "Arret de la base PostgreSQL..." -ForegroundColor Cyan
# Ne JAMAIS utiliser Set-Location ici : un script PowerShell s'execute dans la
# session de l'appelant, et Set-Location deplacerait son shell (il faudrait
# refaire un cd manuel avant de relancer start-dev.ps1). On reste donc
# cwd-neutral : chemins absolus bases sur $PSScriptRoot, et -f explicite pour
# docker compose (le fichier n'utilise que des volumes nommes, aucun chemin
# relatif dependant du cwd).
docker compose -f "$PSScriptRoot\infrastructure\docker\docker-compose.yml" stop
Write-Host "Base arretee. (Les donnees sont conservees dans le volume postgres_data.)" -ForegroundColor Green
Write-Host "Pour la relancer plus tard: .\start-dev.ps1"
