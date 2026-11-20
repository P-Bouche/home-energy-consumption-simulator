# Local Development

How to run, test, and debug the platform on your machine. For contribution rules, see [AGENTS.md](../AGENTS.md); for architecture, [architecture.md](architecture.md).

## Prerequisites

- **Node.js 24.14.1** — pinned in `.nvmrc`. Use [fnm](https://github.com/Schniz/fnm) (`winget install Schniz.fnm`) or nvm so the version switches automatically when you `cd` into the repo.
  - fnm needs a one-time shell init. PowerShell (`$PROFILE`):
    `fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression`
- **Docker Desktop** — only needed for PostgreSQL/PostGIS persistence (`postgres` mode).
- **Windows:** allow local PowerShell scripts once per user:
    `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` (required for `start-dev.ps1` and fnm's `npm` shim).

## Quick start (Windows)

```powershell
.\start-dev.ps1                 # full stack: Postgres (Docker) + API + web
.\start-dev.ps1 -Mode memory    # no database required
.\stop-dev.ps1                  # stop the database (data kept in the postgres_data volume)
```

`start-dev.ps1` starts PostgreSQL/PostGIS via `docker compose up -d --wait` (skipped in `memory` mode), runs `npm ci` on the first launch, then opens two titled windows:

| Service | URL | Notes |
| --- | --- | --- |
| API | http://localhost:3000 (docs: `/docs`) | applies migrations on startup |
| Web | http://localhost:5173 | Vite proxies `/api/*` to the API |
| Postgres | localhost:5432 (bound to 127.0.0.1) | user/password/db: postgres/postgres/hecs |

## Manual start (any OS)

```bash
npm ci
docker compose -f infrastructure/docker/docker-compose.yml up -d --wait
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hecs npm run dev:api   # or DATABASE_URL=memory://
npm run dev:web                  # second terminal -> http://localhost:5173
```

## Two persistence modes

- **`DATABASE_URL=memory://`** — no Docker needed; the repository lives in the API process. Data is lost on restart. Use it for quick demos, UI work, and the Playwright e2e suite.
- **`DATABASE_URL=postgres://…`** — real persistence: migrations are tracked in `schema_migrations` and applied automatically at API startup; the BAN geolocation is stored as an EPSG:2154 point via PostGIS. Use it for the PostgreSQL integration suites and anything durability-related.

## Quality gates

```bash
npm run lint && npm run typecheck
npm run test                        # PostgreSQL suites are skipped unless DATABASE_URL is set
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hecs npm run test
npx playwright install chromium && npm run test:e2e
```

Expect ~146 tests passing with no `DATABASE_URL` (2 PostgreSQL suites skipped); the full suite runs in CI against a PostGIS service container.

## Inspecting the database

```bash
docker exec hes-db psql -U postgres -d hecs -c "\dt"
docker exec hes-db psql -U postgres -d hecs -c "SELECT version, applied_at FROM schema_migrations;"
docker exec hes-db psql -U postgres -d hecs -c "SELECT id, dpe_number, ST_AsText(location) FROM buildings LIMIT 5;"
```

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `node`/`npm` not recognized in a new terminal | fnm init missing. Add the `fnm env --use-on-cd …` line to `$PROFILE` (create the file if needed: `New-Item -ItemType File -Path $PROFILE -Force`), then open a new terminal. |
| "exécution de scripts désactivée" | `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`. |
| `npm error code ENOENT … package.json` | You are not in the repo directory. `cd E:\...\home-energy-consumption-simulator` first. |
| API returns **413** on upload | File above `MAX_UPLOAD_BYTES` (5 MB). |
| API returns **422** | Invalid or non-DPE XML; the body lists `schemaErrors`. |
| `could not connect` to Postgres | Docker Desktop not running, or compose stack down: `docker compose -f infrastructure/docker/docker-compose.yml up -d --wait`. |
| Migrations expected but tables missing | Migrations run at API startup and are tracked in `schema_migrations`; check the API logs before touching the schema manually. |
