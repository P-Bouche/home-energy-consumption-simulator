# P2 Vibe Prompt (canonical)

Canonical prompt to start a Vibe session (VS Code, Vibe sandbox, or the Mistral Studio `code-orchestrator` session workflow) for **Phase P2 — Energy Simulation**.

Usage:

1. PR #9 (Phase P1) must be merged first. Create the branch from `origin/main`:
   `git checkout -b feature/P2-energy-simulation origin/main`
   (The remote branch may exist and be stale: `git push --force-with-lease -u origin feature/P2-energy-simulation`.)
2. Paste the fenced block below verbatim into the Vibe chat.

----

````markdown
You are implementing Phase P2 — Energy Simulation of the Home Energy Consumption Simulator.

Branch:
- Create `feature/P2-energy-simulation` from `origin/main`: `git checkout -b feature/P2-energy-simulation origin/main`
- If pushing fails non-fast-forward (stale remote branch), use `git push --force-with-lease -u origin feature/P2-energy-simulation`.

Before making any change:

1. Read:
   - AGENTS.md
   - README.md, docs/architecture.md, docs/roadmap.md, docs/ci.md
   - docs/phases/P2-energy-simulation.md
   - docs/phases/P1-dpe-import.md and docs/phases/P1-vibe-prompt.md (what P1 delivered)
   - docs/phases/P0-open3cl-feasibility.md, docs/phases/P0-benchmark-report.md, docs/phases/P1-import-benchmark-report.md
   - docs/decisions/ADR-0001-open3cl-as-core-engine.md, docs/decisions/ADR-0002-open3cl-integration-strategy.md

2. Inspect the repository.

3. Verify the P1 exit criteria on `origin/main` (STOP and report if any fails):
   - PR #9 merged; latest CI runs on `main` green with lint/typecheck/test/benchmark executed, and the E2E job actually running Playwright (guard marker is the root `playwright.config.ts`)
   - `packages/domain` has the `Building` aggregate + `Confidence<T>` + `ImportReport` v1; `packages/application` has `BuildingRepository`, `DpeImporterPort`, `SimulationPort` (unchanged from P0: `simulate(dpeXml: string)`)
   - `packages/open3cl-adapter` is still the only importer of `@open3cl/engine@1.11.6` (ESLint boundary + lint tests in `tests/lint/`)
   - import fixture snapshots frozen (`packages/dpe-xml-importer/test/fixtures/` + expected `Building` snapshots); Postgres schema v1 tagged (`infrastructure/postgres/migrations/0001_init.sql`)
   - locally on Node 24.14.1 (`.nvmrc`): `npm ci && npm run lint && npm run typecheck && npm run test:coverage && npm run benchmark` all pass

If any discrepancy exists between this prompt, the docs, or the repo state, STOP and report it before generating code.

---

Context

What P0+P1 delivered (do not rebuild it):

- Monorepo with strict TS, ESLint (engine boundary + domain purity), Vitest + 80% coverage gate, CI (`ci.yml`, `e2e.yml`, `benchmark.yml`), branch protection on `main`.
- `packages/domain`: `Building` aggregate (zones, rooms, envelope, systems), `Confidence<T>` (measured vs inferred, confidence < 1 for inferred), `SimulationResult` value object, domain errors.
- `packages/application`: ports `SimulationPort.simulate(dpeXml)`, `BuildingRepository`, `DpeImporterPort`; use cases for import/get.
- `packages/open3cl-adapter`: sole Open3CL boundary; `calcul_3cl_xml`-based `simulate(dpeXml)` + `mapEngineResult` + typed engine shim; contract tests prove adapter == direct engine on the 15-fixture corpus (p95 = 24 ms).
- `packages/dpe-xml-importer`: pure DPE XML → `Building` importer (p95 import = 304 ms), hardened parser, schema variants 2–2.4.
- `apps/api` (NestJS, tsx): `POST /imports/dpe`, `GET /buildings/:id`, OpenAPI `/docs`, `DATABASE_URL=memory://` in-memory mode, PG mode runs migrations on bootstrap. `apps/web` (Vite/React/MUI/Zustand): upload page + report view. Playwright at root (`npm run test:e2e`).

---

Goal (from docs/phases/P2-energy-simulation.md)

Simulate an imported/edited `Building` through Open3CL and persist the result:

- `POST /buildings/:id/simulations` maps the domain `Building` to the engine input, runs the pinned engine, persists a `SimulationResult`, returns it — p95 < 3 s
- results historized per building (`GET /buildings/:id/simulations`, `GET /simulations/:id`)
- identical building re-simulation served from cache (input hash), engine call counter = 0
- long runs (> 3 s expected) go through a `SimulationJob` queue with status polling (`queued/running/done/failed`)
- web: "Run simulation" button + results panel (kWh/m2.an, kg CO2/m2.an, energy/climate labels, link to raw engine output)

Success criteria: AC-P2-01..04 from the phase doc, CI green (lint/typecheck/test/coverage/e2e/benchmark), contract tests adapter == direct engine on 100% of fixtures.

---

Scope

Implement only:

1. Domain (`packages/domain`):
   - `SimulationResult` gains persistence identity (`id`, `buildingId`, `inputHash`, `createdAt`) alongside the existing fields — keep the P0 value object shape intact
   - `SimulationJob` entity with status machine `queued -> running -> done | failed`
   - `BuildingSimulationView`: read-only projection of `Building` for the adapter (the adapter never mutates the aggregate); confidence metadata must flow through (engine defaults for low-confidence fields are logged, never silent)
   - domain events `SimulationCompleted`, `SimulationFailed`

2. Application (`packages/application`):
   - EXTEND `SimulationPort` without breaking the P0 method: add `simulateBuilding(building: Building): Promise<SimulationResult>` (keep `simulate(dpeXml)`)
   - `SimulationRepository` port; `RunSimulationUseCase` (sync path under budget + queued job path), `GetSimulationHistoryUseCase`
   - cache keyed by canonical hash of the building input; invalidated automatically on building change

3. Adapter (`packages/open3cl-adapter` — still the ONLY importer of `@open3cl/engine`):
   - Building → engine input mapping (produce the engine's DPE XML/JSON shape from the domain `Building`; reuse the importer's knowledge in reverse — mapping doc + default-value log with confidence)
   - implement `simulateBuilding` (build input → `calcul_3cl_xml` or `calcul_3cl` → `mapEngineResult`)
   - CONTRACT TESTS (AC-P2-02): for every frozen P1 fixture with its expected `Building` snapshot: `simulateBuilding(building)` result must be semantically identical (normalized JSON, incl. labels + raw output) to the direct engine run on the original fixture XML. 100% required.
   - benchmark: add root script `benchmark:simulation` measuring building→simulation p95 across the corpus on Node 24.14.1; wire it into `benchmark.yml` (keep the existing raw benchmark too)

4. Persistence:
   - migration `0002_simulations.sql` (PostGIS schema v2): `simulations` table (building_id FK, input_hash unique-ish, result JSONB, status, timestamps, engine_version), `simulation_jobs` table; `schema_migrations` bookkeeping
   - `packages/postgres-repository`: `PostgresSimulationRepository` (pg, no ORM) + cache table or in-memory cache with hash keys
   - in-memory simulation repository for `DATABASE_URL=memory://`

5. API (`apps/api`):
   - `POST /buildings/:id/simulations` (sync if fast, else enqueue and return job id), `GET /buildings/:id/simulations`, `GET /simulations/:id`, `GET /simulations/jobs/:id` for polling
   - typed errors → 404 (unknown building), 422 (mapping error), 500 (engine error), 409 (duplicate in-flight identical input hash → return existing job/result)
   - OpenAPI updated

6. Web (`apps/web`):
   - "Run simulation" button on the building page + results panel (consumption, emissions, labels A–G chips, engine version, raw output viewer); polling when a job is queued
   - e2e: extend `tests/e2e/` with a simulation spec (import fixture → run simulation → labels shown match API payload) — the E2E CI job must actually execute it

7. Tests:
   - unit: mapping building→engine input (defaults logged with confidence), cache hash/invalidation, job state machine, error mapping
   - integration: contract tests (AC-P2-02) on the frozen corpus; POST simulation → persisted → GET history; repeat POST returns cached (engine call counter = 0); queued path via a forced slow case
   - acceptance AC-P2-01..04 (p95 < 3 s in CI via benchmark job; UI matches API via Playwright)

---

Out of scope (later phases — do NOT implement)

- 3D viewer (P3), building editor (P4), scenarios (P5), PDF/IFC import (P6/P7)
- changing the P0 `simulate(dpeXml)` port method; changing the engine boundary

Assumptions to state in your report: owner-provided ADEME files still pending (privacy review); corpus = the 15 P0/P1 fixtures. Never invent fixture data. Note any field where Building→engine mapping needs a default and its confidence.

---

Rules

- Open3CL is the single source of truth (ADR-0001): all calculation flows through `packages/open3cl-adapter` only; ESLint boundary unchanged and still tested. Flow: `Building → Open3CL Adapter → Open3CL → SimulationResult`.
- TypeScript strict; no `any` unless justified in the PR description; JSDoc on public APIs; no silent catches.
- Dependencies point inward: `domain` <- `application` <- adapters/apps. Domain stays framework-free.
- Confidence metadata is preserved end-to-end: engine-input defaults for inferred fields are logged with their confidence, never presented as measured.
- Do not add dependencies beyond what the scope needs.
- Conventional Commits; never push to `main`; finish with a PR from `feature/P2-energy-simulation`.
- CI must stay green: lint, typecheck, test+coverage (80% x4), e2e (actually running), benchmark (p95 < 3 s). The E2E guard marker is the root `playwright.config.ts` — verify the E2E job steps are NOT skipped in your PR's CI run.

---

Performance budgets

- building→simulation p95 < 3 s (CI benchmark on Node 24.14.1)
- import p95 < 1 s (must not regress: run `npm run benchmark:import`)
- coverage >= 80% lines/statements/functions/branches

---

Process

Do NOT start coding immediately.

First provide:

# Objective

# Repository Assessment (P1 exit criteria check)

# Analysis

# Risks

# Proposed Architecture

# Implementation Plan

# Validation Strategy

# Acceptance Criteria

# Limitations

Wait for approval before creating files.

If everything is consistent, implement Phase P2. In the PR description paste: commands run, coverage numbers, benchmark p50/p95/max (raw + building path), contract-test result (100% fixtures), and confirmation that the E2E CI job executed Playwright (not skipped).
````
