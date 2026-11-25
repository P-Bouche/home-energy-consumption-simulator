#!/usr/bin/env bash
# Arrete la base PostgreSQL (et les processus API/Web lances en arriere-plan
# par start-dev.sh) — equivalent bash de stop-dev.ps1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Pas de cd ici : cwd-neutral, chemins absolus, -f explicite pour docker compose.

echo "Arret de la base PostgreSQL..."
docker compose -f "$SCRIPT_DIR/infrastructure/docker/docker-compose.yml" stop
echo "Base arretee. (Les donnees sont conservees dans le volume postgres_data.)"

# Repli de start-dev.sh sans emulateur de terminal : tue les processus dev.
PID_FILE="$SCRIPT_DIR/.dev-pids"
if [[ -f "$PID_FILE" ]]; then
  while read -r pid; do
    if kill "$pid" 2>/dev/null; then echo "Processus dev arrete (pid $pid)"; fi
  done <"$PID_FILE"
  rm -f "$PID_FILE"
fi

echo "Pour relancer plus tard: ./start-dev.sh"
