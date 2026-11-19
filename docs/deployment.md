# Deployment — Home Energy Consumption Simulator

The platform is **self-hostable**: the Open3CL engine runs embedded in the API, so deployment requires no external simulation service — only Docker and Docker Compose.

## Deployment Modes

| Mode | Use case | How |
| --- | --- | --- |
| **Local development** | Develop on a workstation | `docker compose up -d` from `infrastructure/docker/` |
| **Dedicated server / VPS** | Production or team staging | Same Docker Compose stack on the server, behind a reverse proxy with TLS |

## Local Development

```bash
git clone https://github.com/P-Bouche/home-energy-consumption-simulator.git
cd home-energy-consumption-simulator
cp .env.example .env          # local defaults work out of the box
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

Services started: PostgreSQL + PostGIS (`db`), NestJS API (`api`, e.g. http://localhost:3000), Vite web app (`web`, e.g. http://localhost:5173).

## Dedicated Server (VPS) Deployment

Prerequisites on the server: Docker, Docker Compose, and a reverse proxy (nginx or Traefik).

```bash
# On the server
git clone https://github.com/P-Bouche/home-energy-consumption-simulator.git
cd home-energy-consumption-simulator
cp .env.example .env
# edit .env: set strong DB credentials, public URLs, ports

docker compose -f infrastructure/docker/docker-compose.yml \
               -f infrastructure/docker/docker-compose.prod.yml up -d
```

Production checklist:

- **Reverse proxy + TLS:** expose only the `web` (and `api`, if needed externally) ports through the proxy with HTTPS; bind Postgres to `127.0.0.1` only (default in the prod compose file).
- **Environment variables:** all runtime configuration comes from `.env`; never commit secrets. Required variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `API_PORT`, `WEB_PORT`, `PUBLIC_URL`.
- **Volumes:** PostGIS data lives in the named volume `postgres_data`; the API never writes to the host filesystem outside volumes.
- **Backups:** schedule `pg_dump` against the `db` container, e.g. `docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql` (daily, retained off-server).
- **Updates:** `git pull`, then `docker compose ... up -d --build`; run database migrations before restarting the API.
- **Resources:** start with 2 vCPU / 4 GB RAM for a single-tenant instance; the API is stateless and can be scaled horizontally behind the proxy (see `docs/architecture.md` §8).

## What Is NOT Required

- No external Open3CL service: the engine is embedded in the API container (see [ADR-0001](decisions/ADR-0001-open3cl-as-core-engine.md)).
- No SaaS account, API key, or telemetry endpoint.

## Monitoring (recommended)

- Container healthchecks are defined in the compose files; use `docker compose ps` and your proxy's access logs.
- Simulation jobs expose duration metrics; the < 3 s budget from the roadmap should be alerted on.
