# P1 Vibe Prompt (canonical)

Canonical prompt to start a Vibe session (VS Code, Vibe sandbox, or the Mistral Studio `code-orchestrator` session workflow) for **Phase P1 — DPE XML Import**.

Usage:

1. PR #6 (Phase P0) must be merged first. Create the branch from `origin/main`:
   `git checkout -b feature/P1-dpe-import origin/main`
2. Paste the fenced block below verbatim into the Vibe chat.

----

````markdown
You are implementing Phase P1 — DPE XML Import of the Home Energy Consumption Simulator.

Branch:
- Create `feature/P1-dpe-import` from `origin/main`: `git checkout -b feature/P1-dpe-import origin/main`
- (The remote branch may exist and be stale: if pushing fails non-fast-forward, use `git push --force-with-lease -u origin feature/P1-dpe-import`.)

Before making any change:

1. Read:
   - AGENTS.md
   - README.md
   - docs/architecture.md
   - docs/roadmap.md
   - docs/phases/P1-dpe-import.md
   - docs/phases/P0-open3cl-feasibility.md and docs/phases/P0-vibe-prompt.md (what P0 delivered)
   - docs/decisions/ADR-0001-open3cl-as-core-engine.md
   - docs/decisions/ADR-0002-open3cl-integration-strategy.md

2. Inspect the repository.

3. Verify the P0 exit criteria on `origin/main` (STOP and report if any fails):
   - `package.json` exists with npm workspaces (`apps/*`, `packages/*`), `"type": "module"`, root scripts `lint`, `typecheck`, `test`, `test:coverage`, `benchmark`
   - `packages/open3cl-adapter` exists and is the only importer of `@open3cl/engine` (pinned `1.11.6`); `SimulationPort` in `packages/application` is unchanged
   - `.github/workflows/ci.yml` exists and the latest CI run on `main` is green with jobs lint/typecheck/test actually executed
   - `docs/decisions/ADR-0001` and `ADR-0002` are Accepted; `docs/phases/P0-benchmark-report.md` exists (p95 < 3 s)
   - `packages/open3cl-adapter/test/fixtures/` contains the 15 DPE XML fixtures
   - locally on Node 24.14.1 (`.nvmrc`): `npm ci && npm run lint && npm run typecheck && npm run test:coverage` all pass

If any discrepancy exists between this prompt, the docs, or the repo state, STOP and report it before generating code.

---

Context

What P0 delivered (do not rebuild it):

- Monorepo: npm workspaces, strict TS (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), ESLint (`no-explicit-any: error`, `no-restricted-imports` confining `@open3cl/engine` to `packages/open3cl-adapter`), Vitest + v8 coverage (thresholds 80% on lines/statements/functions/branches), Node pinned via `.nvmrc` (24.14.1), CI workflow on every PR.
- `packages/domain`: `SimulationResult`, typed `SimulationError`s, `EnergyLabel`.
- `packages/application`: `SimulationPort.simulate(dpeXml: string): Promise<SimulationResult>`.
- `packages/open3cl-adapter`: the single Open3CL boundary (ADR-0001/ADR-0002), pinned `@open3cl/engine@1.11.6`.
- `apps/cli-spike`: `node . simulate <file.xml>`.
- 15 real DPE XML fixtures in `packages/open3cl-adapter/test/fixtures/` (reuse them as import fixtures; the engine clone corpus has ~300 more if needed — fixtures only, never a runtime dependency).

---

Goal (from docs/phases/P1-dpe-import.md)

Import a French DPE XML file into the canonical domain `Building` aggregate, persisted in PostgreSQL/PostGIS, with an import report listing every missing/inferred/unrecognized field — p95 import < 1 second for files up to 5 MB.

Success criteria:

- `POST /imports/dpe` uploads a DPE XML and returns `{ buildingId, report }`; invalid XML → HTTP 422 with schema errors
- every inferred value is stored as `Confidence<T> = { value, source, confidence, importDate }` and never presented as measured
- round-trip `POST /imports/dpe` → `GET /buildings/:id` returns identical data
- p95 import < 1 s on the fixture corpus (reference machine specs recorded)
- CI stays green (lint, typecheck, tests, coverage ≥ 80%) on Node 24.14.1

---

Scope

Implement only:

1. Domain model v1 (`packages/domain`):
   - Aggregate root `Building` with entities `Zone`, `Room`, `Wall`, `Roof`, `Floor`, `Window`, `Door`, `ThermalZone`, `HeatingSystem`, `VentilationSystem`, `PhotovoltaicSystem`
   - Value object `Confidence<T> = { value: T; source: string; confidence: number; importDate: Date }` — type-level impossible to build an inferred value without source/confidence/importDate
   - `ImportReport` (v1, `reportVersion: 1`): parsed fields, inferred fields with confidence, unrecognized fields
   - Domain event `BuildingImported`; invariants (a Room belongs to exactly one Zone; envelope elements belong to exactly one Building)
   - The domain stays framework-free: no NestJS, no `pg`, no XML parser imports

2. `packages/dpe-xml-importer` (new):
   - Pure core: DPE XML string → domain candidates (no NestJS/ORM imports)
   - Schema validation against the DPE XML schema variants present in the corpus; unknown optional elements are reported, never fatal
   - Use `fast-xml-parser` (already used by the engine; does not resolve external entities). Harden against hostile XML (no XXE, size limits, fuzz-tested)
   - Streaming/bounded parsing; p95 < 1 s for ≤ 5 MB
   - Must NOT import `@open3cl/engine` (the ESLint boundary already fails the build if it does)

3. Persistence:
   - `infrastructure/postgres/`: PostGIS schema v1 + versioned SQL migrations + `infrastructure/docker/docker-compose.yml` with a `db` service (`postgis/postgis:16-3.4`, volume `postgres_data`, bound to localhost)
   - `BuildingRepository` port in `packages/application`; Postgres adapter package (e.g. `packages/postgres-repository`) using `pg` (no ORM — keeps the domain clean)
   - `.env.example` with `DATABASE_URL` etc.; no secrets committed

4. API (`apps/api`, new workspace, NestJS):
   - `POST /imports/dpe` (multipart upload, ≤ 5 MB) → `ImportDpeXmlUseCase` → importer port → `BuildingRepository`; returns `{ buildingId, report }`
   - `GET /buildings/:id` → building + report
   - Thin controllers, DI of ports (hexagonal), typed errors → HTTP 422/404/500 mapping, OpenAPI docs (`@nestjs/swagger`)
   - CORS enabled for the local Vite dev server

5. Web (`apps/web`, new workspace: Vite + React + TS + MUI + Zustand):
   - Upload page: file picker → POST to the API → import report view (parsed / inferred with confidence / unrecognized)
   - No business logic in components; API calls through a small store/service layer

6. Tests:
   - Unit: parser per schema variant; mapper per XML section; Confidence rules; hostile XML
   - Integration: `POST /imports/dpe` → DB → `GET /buildings/:id` round-trip; report consistency; concurrent imports
   - Acceptance (AC-P1-01..05): corpus imports with p95 < 1 s; 422 on invalid XML; 100% of inferred values carry full confidence metadata (DB-level check); report lists every gap on a deliberately incomplete fixture; Playwright e2e shows the report after upload

---

Out of scope (later phases — do NOT implement)

- Changing `SimulationPort` / the Open3CL adapter / running simulations from the API (P2)
- 3D viewer (P3), editor (P4), scenarios (P5), PDF/IFC import (P6/P7)
- Building mergeGeometry (P6+)

Assumption to state in your report: the owner-provided ADEME DPE XML + DPE report will join the fixture corpus after privacy review; until then, use the P0 corpus + engine clone corpus. Never invent fixture data.

---

Rules

- Open3CL remains the single source of truth (ADR-0001); the importer never imports the engine.
- TypeScript strict mode; no `any` unless justified in the PR description; JSDoc on public APIs; no silent catches.
- Dependencies point inward: `domain` <- `application` <- adapters/apps. Domain stays framework-free.
- Every inferred value carries `Confidence<T>`; inferred data is never presented as measured.
- Do not add dependencies beyond what the scope needs (fast-xml-parser, pg, NestJS packages, React/Vite/MUI/Zustand, Playwright for e2e).
- Conventional Commits; never push to `main`; finish with a PR from `feature/P1-dpe-import`.
- Keep root scripts working; new workspaces are picked up by the existing globs (`packages/*`, `apps/*`) — CI must stay green.

---

Performance budgets

- DPE import (upload → persisted): p95 < 1 s, measured on the corpus with machine specs recorded
- Existing budgets unchanged: simulation p95 < 3 s (P0 report), coverage ≥ 80% on all four metrics

---

Process

Do NOT start coding immediately.

First provide:

# Objective

# Repository Assessment (P0 exit criteria check)

# Analysis

# Risks

# Proposed Architecture

# Implementation Plan

# Validation Strategy

# Acceptance Criteria

# Limitations

Wait for approval before creating files.

If everything is consistent, implement Phase P1. At the end, open the PR and paste into its description: commands run, coverage numbers, import benchmark p50/p95/max with machine specs, and the list of schema variants covered.
````
