#!/usr/bin/env bash
# Lancement complet du projet (API + Web + base si besoin) — equivalent bash de start-dev.ps1
# Usage:
#   ./start-dev.sh                 # mode postgres (docker compose up si besoin)
#   ./start-dev.sh memory          # sans base de donnees (demo rapide)
#   ./start-dev.sh --mode memory
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Pas de cd ici : le script reste cwd-neutral, tous les chemins sont absolus.

MODE="postgres"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--mode) MODE="${2:?--mode attend une valeur}"; shift 2 ;;
    postgres|memory) MODE="$1"; shift ;;
    -h|--help)
      sed -n '2,6p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Argument inconnu: $1 (attendu: postgres|memory)" >&2; exit 2 ;;
  esac
done
if [[ "$MODE" != "postgres" && "$MODE" != "memory" ]]; then
  echo "Mode invalide: $MODE (attendu: postgres|memory)" >&2
  exit 2
fi
echo "$MODE" >"$SCRIPT_DIR/.dev-mode" # lu par stop-dev.sh

if [[ "$MODE" == "postgres" ]]; then
  echo "Docker: verification de la base PostgreSQL/PostGIS..."
  if ! docker compose -f "$SCRIPT_DIR/infrastructure/docker/docker-compose.yml" up -d --wait; then
    echo "Docker indisponible ou echec. Lance Docker Desktop, ou utilise: ./start-dev.sh memory" >&2
    exit 1
  fi
  echo "Base prete sur localhost:5432"
else
  echo "Mode memoire: aucune base requise (les donnees sont perdues a l'arret)"
fi

if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
  echo "node_modules absent: npm ci (peut prendre plusieurs minutes)..."
  npm ci --prefix "$SCRIPT_DIR" --no-audit --no-fund
fi

DB_URL="postgres://postgres:postgres@localhost:5432/hecs"
[[ "$MODE" == "memory" ]] && DB_URL="memory://"

# Ouvre une commande dans un nouvel onglet/fenetre de terminal si un
# emulateur est disponible, sinon lance en arriere-plan avec logs + pidfile.
PID_FILE="$SCRIPT_DIR/.dev-pids"
LOG_DIR="$SCRIPT_DIR/.dev-logs"
open_terminal() { # $1 = titre, $2 = commande
  local title="$1" cmd="$2"
  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --title="$title" -- bash -c "$cmd; exec bash"
  elif command -v konsole >/dev/null 2>&1; then
    konsole --title "$title" -e bash -c "$cmd; exec bash"
  elif command -v xfce4-terminal >/dev/null 2>&1; then
    xfce4-terminal --title="$title" -e "bash -c '$cmd; exec bash'"
  elif command -v xterm >/dev/null 2>&1; then
    xterm -title "$title" -e bash -c "$cmd; exec bash"
  else
    return 1
  fi
}

start_bg() { # $1 = titre, $2 = commande — repli sans emulateur de terminal
  mkdir -p "$LOG_DIR"
  local log="$LOG_DIR/$1.log"
  nohup bash -c "$2" >"$log" 2>&1 &
  echo "$!" >>"$PID_FILE"
  echo "  $1 demarre en arriere-plan (pid $!, log: $log)"
}

API_CMD="cd '$SCRIPT_DIR' && DATABASE_URL='$DB_URL' npm run dev:api"
WEB_CMD="cd '$SCRIPT_DIR' && npm run dev:web"

rm -f "$PID_FILE"
if open_terminal "HES - API" "$API_CMD" && open_terminal "HES - Web" "$WEB_CMD"; then
  echo "API et Web ouverts dans deux fenetres de terminal."
else
  echo "Pas d'emulateur de terminal detecte, lancement en arriere-plan:"
  start_bg "api" "$API_CMD"
  start_bg "web" "$WEB_CMD"
  echo "  Arret: ./stop-dev.sh (tue aussi ces processus)"
fi

echo ""
echo "Projet lance:"
echo "  API : http://localhost:3000/docs"
echo "  Web : http://localhost:5173"
echo "  Base: $DB_URL"
echo ""
echo "Pour tout arreter: ferme les deux fenetres, puis ./stop-dev.sh (arrete la base)"
