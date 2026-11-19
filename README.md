# Home Energy Consumption Simulator

An open-source **residential Digital Energy Twin** platform based on the **Open3CL** (3CL-DPE) calculation engine. Starting from a French DPE XML diagnostic, it reconstructs the building, renders it in 3D, runs regulatory energy simulations, and compares renovation scenarios.

## Project Overview

Home Energy Consumption Simulator turns a French **DPE (Diagnostic de Performance Énergétique)** file into an editable, simulable 3D model of a dwelling. The central domain entity is the **Building**; every feature extends or interacts with it. Open3CL is the single source of truth for all energy calculations: `Building → Open3CL Adapter → Open3CL → SimulationResult`.

## Strategic Vision

- Make regulatory-grade energy simulation **accessible, transparent, and actionable** for homeowners and professionals.
- Never present inferred data as certain: every inferred value carries `value`, `source`, `confidence`, and `importDate`.
- Grow from a single diagnostic import toward a **living digital twin** connected to real consumption data (IoT) and 3D capture (photogrammetry/LiDAR).

## Project Goals

1. Import French DPE XML files in under 1 second with full confidence metadata.
2. Reconstruct and visualize the building in 3D in under 2 seconds.
3. Run Open3CL simulations in under 3 seconds and compare renovation scenarios in under 1 second.
4. Support PDF floorplan and IFC/OpenBIM imports alongside DPE XML.
5. Provide AI-assisted renovation recommendations grounded in simulation deltas.

## Planned Features

- French DPE XML import
- Building reconstruction
- Open3CL energy simulation
- Renovation scenario comparison
- 3D visualization (React Three Fiber / Three.js)
- Building editing
- PDF floorplan import
- IFC/OpenBIM integration
- AI-assisted renovation recommendations
- IoT integration (future)
- Photogrammetry and LiDAR support (future)

## Architecture Summary

Clean Architecture + Hexagonal Architecture + DDD + SOLID + dependency injection. Dependencies point inward: `domain` (framework-free `Building` model) ← `application` (use cases, ports) ← `infrastructure` (NestJS API, importers, Open3CL adapter, PostgreSQL/PostGIS) and `presentation` (React UI). Business logic never lives in the UI; the Open3CL engine is reached only through the `open3cl-adapter` package. See [docs/architecture.md](docs/architecture.md) and [ADR-0001](docs/decisions/ADR-0001-open3cl-as-core-engine.md).

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, React Three Fiber, Three.js, Zustand, Material UI |
| Backend | Node.js, TypeScript, NestJS |
| Database | PostgreSQL, PostGIS |
| Simulation engine | Open3CL (3CL-DPE) |
| Infrastructure | Docker, Docker Compose |
| Testing | Vitest, Jest, Playwright |

## Repository Structure

```
home-energy-consumption-simulator/
├── apps/
│   ├── web/                      # React + Vite frontend (R3F 3D view, MUI)
│   └── api/                      # NestJS backend (REST API, import pipeline)
├── packages/
│   ├── domain/                   # Framework-free DDD core (Building and entities)
│   ├── application/              # Use cases and ports
│   ├── open3cl-adapter/          # The only bridge to the Open3CL engine
│   ├── dpe-xml-importer/         # French DPE XML parsing
│   ├── pdf-floorplan-importer/   # PDF floorplan extraction
│   └── ifc-importer/             # IFC / OpenBIM import
├── infrastructure/
│   ├── postgres/                 # PostGIS schema and migrations
│   └── docker/                   # Docker Compose stack
├── docs/                         # Architecture, roadmap, ADRs
│   ├── architecture.md
│   ├── roadmap.md
│   └── decisions/
├── tests/e2e/                    # Playwright end-to-end tests
├── AGENTS.md                     # Rules for AI agents and contributors
└── README.md
```

## Branching Strategy

- `main` is the protected default branch; it only receives reviewed, CI-green pull requests.
- Work on short-lived branches: `feature/<scope>-<slug>` for product work, `vibe/<slug>-<id>` for agent-driven tasks.
- Conventional Commits (`feat:`, `fix:`, `docs:`, ...). No direct pushes or force-pushes to `main`.

## Development Workflow

Every feature follows: (1) restate objective, (2) analyze requirements, (3) identify risks, (4) propose architecture, (5) define tests, (6) implement, (7) validate. Quality gates: TypeScript strict mode, no unjustified `any`, JSDoc on public APIs, minimum 80% test coverage (Vitest/Jest/Playwright). See [AGENTS.md](AGENTS.md) for the full rules.

## Roadmap Summary

P0 Open3CL feasibility → P1 DPE XML import → P2 energy simulation → P3 3D reconstruction → P4 building editor → P5 scenario management → P6 PDF import → P7 IFC integration → P8 AI advisor → P9 IoT digital twin → P10 photogrammetry/LiDAR. Full detail in [docs/roadmap.md](docs/roadmap.md).

## Documentation

- [AGENTS.md](AGENTS.md) — project context, architecture rules, coding standards, workflow, testing, expected response format
- [docs/architecture.md](docs/architecture.md) — principles, system context, bounded contexts, Open3CL integration strategy
- [docs/roadmap.md](docs/roadmap.md) — phases P0–P10 with deliverables, risks, and success criteria
- [docs/decisions/ADR-0001-open3cl-as-core-engine.md](docs/decisions/ADR-0001-open3cl-as-core-engine.md) — Open3CL as the core engine
