# Home Energy Consumption Simulator

An open-source **residential Digital Energy Twin** based on the **Open3CL** (3CL-DPE) engine: import a French DPE XML diagnostic, get an editable 3D model of the dwelling, run regulatory energy simulations, and compare renovation scenarios.

**Status:** P0 (engine feasibility), P1 (DPE XML import), P2 (Open3CL energy simulation), P3 (3D viewer), P4 (building editor) and P5 (renovation scenario comparison) are done — see the [roadmap](docs/roadmap.md) and the [user guide](docs/user-guide.md).

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
- **Open3CL energy simulation** (regulatory 3CL-DPE) from the web UI: after an import, the building page offers **« Lancer la simulation »** → consumption (kWh/m².an), GES emissions (kg CO₂/m².an), A–G energy/climate labels and the engine version; results are persisted and listed in the history, and an identical re-run is served from the input-hash cache with no engine call. Long runs are queued (`202` + job polling).
- **3D reconstruction + viewer** (React Three Fiber): open `#/building/<id>` after an import — orbit/zoom the model, click an element for its properties (U-value, area, orientation, confidence); inferred elements are visually marked with `{ source, confidence }`, and a heat-loss overlay colors envelope elements once a simulation result exists.
- **Building editor** (P4, « Éditeur du bâtiment (2D) »): edit an element (e.g. wall U-value), save with optimistic versioning (409 reloads the panel on conflict), automatic re-simulation, undo, append-only audit trail.
- **Renovation scenario comparison** (P5, « Scénarios de rénovation »): declarative change-sets from a command catalog, each scenario simulated through the same Open3CL pipeline, comparison of deltas / label changes / ranking against the current state (< 1 s cached), apply a scenario to the building.
- Step-by-step walkthroughs: [docs/user-guide.md](docs/user-guide.md).
- Roadmap toward: PDF/IFC import, AI renovation advisor, IoT digital twin, photogrammetry/LiDAR.

## Architecture

Clean Architecture + Hexagonal + DDD. Dependencies point inward: `domain` ← `application` ← `infrastructure` + `presentation`; the Open3CL engine is reached only through the `open3cl-adapter` package. Details: [docs/architecture.md](docs/architecture.md) · [ADR-0001](docs/decisions/ADR-0001-open3cl-as-core-engine.md).

## Repository structure

```
apps/                web (React + Vite + R3F) · api (NestJS)
packages/            domain · application · open3cl-adapter · dpe-xml-importer · postgres-repository · geometry
infrastructure/      postgres (migrations) · docker (compose)
docs/                architecture, roadmap, phases, ADRs, geometry, local dev, deployment, CI
tests/e2e/           Playwright end-to-end
AGENTS.md            contributor rules (architecture, coding standards, workflow, testing)
```

## Documentation

- [AGENTS.md](AGENTS.md) — read first before contributing: architecture rules, coding standards, workflow, testing, coverage policy
- [docs/user-guide.md](docs/user-guide.md) — end-user guide: import a DPE, simulate, 3D viewer, edit the building, compare and apply renovation scenarios
- [docs/local-development.md](docs/local-development.md) — prerequisites, quick start, modes, quality gates, troubleshooting
- [docs/architecture.md](docs/architecture.md) — principles, bounded contexts, integration strategy
- [docs/roadmap.md](docs/roadmap.md) — product vision, goals, and phases P0–P10
- [docs/deployment.md](docs/deployment.md) — self-hosting with Docker Compose (local to VPS)
- [docs/ci.md](docs/ci.md) — CI workflows, required checks, branch protection
