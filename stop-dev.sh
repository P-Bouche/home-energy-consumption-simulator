#!/usr/bin/env bash
# Arrete la base PostgreSQL (et les processus API/Web du projet) — equivalent
# bash de stop-dev.ps1
# Usage: ./stop-dev.sh [postgres|memory]   (sans argument: mode de .dev-mode)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Pas de cd ici : cwd-neutral, chemins absolus, -f explicite pour docker compose.

MODE_ARG=""
case "${1:-}" in
  postgres|memory) MODE_ARG="$1" ;;
  "") ;;
  -h|--help) echo "Usage: ./stop-dev.sh [postgres|memory]"; exit 0 ;;
  *) echo "Argument inconnu: $1 (attendu: postgres|memory)" >&2; exit 2 ;;
esac

# Mode memorise par start-dev.sh : en mode memory aucune base n'a ete lancee.
MODE_FILE="$SCRIPT_DIR/.dev-mode"
MODE="$MODE_ARG"
[[ -z "$MODE" && -f "$MODE_FILE" ]] && MODE="$(cat "$MODE_FILE")"
[[ -z "$MODE" ]] && MODE="postgres"

if [[ "$MODE" == "memory" ]]; then
  echo "Mode memoire: aucune base Docker a arreter."
elif ! command -v docker >/dev/null 2>&1; then
  echo "docker introuvable: base non arretee (aucune base Docker n'a pu etre lancee)." >&2
else
  echo "Arret de la base PostgreSQL..."
  if docker compose -f "$SCRIPT_DIR/infrastructure/docker/docker-compose.yml" stop; then
    echo "Base arretee. (Les donnees sont conservees dans le volume postgres_data.)"
  else
    echo "Echec de docker compose stop (Docker Desktop / integration WSL inactive ?)." >&2
  fi
fi
rm -f "$MODE_FILE"

# Repli de start-dev.sh sans emulateur de terminal : tue les processus dev.
PID_FILE="$SCRIPT_DIR/.dev-pids"
if [[ -f "$PID_FILE" ]]; then
  while read -r pid; do
    if kill "$pid" 2>/dev/null; then echo "Processus dev arrete (pid $pid)"; fi
  done <"$PID_FILE"
  rm -f "$PID_FILE"
fi

# Processus dev leakés (fenetres de terminal ouvertes avant le pidfile) :
# tue les serveurs dev de CE repo (ports 3000/5173) et les vite de ce chemin.
for port in 3000 5173; do
  pid="$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
  if [[ -n "${pid:-}" ]] && kill "$pid" 2>/dev/null; then echo "Serveur dev arrete (pid $pid, port $port)"; fi
done
pkill -f "$SCRIPT_DIR/node_modules/.bin/vite" 2>/dev/null || true

echo "Pour relancer plus tard: ./start-dev.sh"
