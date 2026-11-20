# Home Energy Consumption Simulator

An open-source **residential Digital Energy Twin** based on the **Open3CL** (3CL-DPE) engine: import a French DPE XML diagnostic, get an editable 3D model of the dwelling, run regulatory energy simulations, and compare renovation scenarios.

**Status:** P0 (engine feasibility), P1 (DPE XML import with confidence metadata) and P3 (3D reconstruction + viewer with confidence marking) are done — see the [roadmap](docs/roadmap.md).

## Quick start

Requirements: **Node 24.14.1** (pinned in `.nvmrc`, use [fnm](https://github.com/Schniz/fnm)/nvm) and **Docker** for persistence. All details in [docs/local-development.md](docs/local-development.md).

```powershell
# Windows: one command (starts Postgres, then API + web in two windows)
.\start-dev.ps1                 # or -Mode memory to skip Docker
```

```bash
# Any OS
npm ci
docker compose -f infrastructure/docker/docker-compose.yml up -d --wait
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hecs npm run dev:api   # or DATABASE_URL=memory://
npm run dev:web                  # -> http://localhost:5173
```

API: http://localhost:3000 (OpenAPI at `/docs`) — Web: http://localhost:5173

## What it does

- **DPE XML import** into a Building-centered domain model, under 1 s, with full confidence metadata (`value`, `source`, `confidence`, `importDate`) — inferred data is never presented as certain.
- **Open3CL energy simulation** (regulatory 3CL-DPE) and, later, renovation **scenario comparison**.
- Roadmap toward: 3D reconstruction (React Three Fiber), building editor, PDF/IFC import, AI renovation advisor, IoT digital twin.

## Architecture

Clean Architecture + Hexagonal + DDD. Dependencies point inward: `domain` ← `application` ← `infrastructure` + `presentation`; the Open3CL engine is reached only through the `open3cl-adapter` package. Details: [docs/architecture.md](docs/architecture.md) · [ADR-0001](docs/decisions/ADR-0001-open3cl-as-core-engine.md).

## Repository structure

```
apps/                web (React + Vite + R3F) · api (NestJS)
packages/            domain · application · open3cl-adapter · dpe-xml-importer · postgres-repository
infrastructure/      postgres (migrations) · docker (compose)
docs/                architecture, roadmap, phases, ADRs, local dev, deployment, CI
tests/e2e/           Playwright end-to-end
AGENTS.md            contributor rules (architecture, coding standards, workflow, testing)
```

## Documentation

- [AGENTS.md](AGENTS.md) — read first before contributing: architecture rules, coding standards, workflow, testing, coverage policy
- [docs/local-development.md](docs/local-development.md) — prerequisites, quick start, modes, quality gates, troubleshooting
- [docs/architecture.md](docs/architecture.md) — principles, bounded contexts, integration strategy
- [docs/roadmap.md](docs/roadmap.md) — product vision, goals, and phases P0–P10
- [docs/deployment.md](docs/deployment.md) — self-hosting with Docker Compose (local to VPS)
- [docs/ci.md](docs/ci.md) — CI workflows, required checks, branch protection
