# P5 Vibe Prompt (canonical) — headless variant, parallel with P2

Canonical prompt to start a Vibe session for **Phase P5 — Scenario Management** in its **headless** form: it does **not** require P3 (3D) or P4 (editor UI). It requires the **P2 contract** (`simulateBuilding` + `SimulationResult` persistence) and can therefore run **in parallel with P2** by branching off the P2 branch.

Usage:

1. If P2 is still in flight, branch from the P2 branch; otherwise from `origin/main`:
   `git checkout -b feature/P5-scenario-management feature/P2-energy-simulation` (or `origin/main` once P2 is merged)
   (stale remote branch: `git push --force-with-lease -u origin feature/P5-scenario-management`)
   Merge after P2.
2. Paste the fenced block below verbatim into the Vibe chat.

----

````markdown
You are implementing Phase P5 — Scenario Management (headless, no P3/P4) of the Home Energy Consumption Simulator.

Branch:
- If P2 (`feature/P2-energy-simulation`) is not merged yet, branch from it: `git checkout -b feature/P5-scenario-management feature/P2-energy-simulation`; otherwise `git checkout -b feature/P5-scenario-management origin/main`.
- If pushing fails non-fast-forward, use `git push --force-with-lease -u origin feature/P5-scenario-management`.
- Merge after P2.

Before making any change:

1. Read:
   - AGENTS.md
   - README.md, docs/architecture.md, docs/roadmap.md, docs/ci.md
   - docs/phases/P5-scenario-management.md
   - docs/phases/P2-energy-simulation.md and docs/phases/P2-vibe-prompt.md (the contract you build against)
   - docs/phases/P4-building-editor.md (the shared command vocabulary — declarative change-sets, see below)
   - docs/phases/P1-dpe-import.md
   - docs/decisions/ADR-0001-open3cl-as-core-engine.md, docs/decisions/ADR-0002-open3cl-integration-strategy.md

2. Inspect the repository.

3. Verify (STOP and report if any fails):
   - the P2 contract is available on your base branch: `SimulationPort.simulateBuilding(building: Building): Promise<SimulationResult>`, persisted `SimulationResult` v1 (with `inputHash`), result cache — OR, if P2 is not merged, that the P2 branch provides them and you branched from it
   - P1 baseline intact; CI green with steps executed (not skipped)
   - locally on Node 24.14.1 (`.nvmrc`): `npm ci && npm run lint && npm run typecheck && npm run test:coverage` pass

If any discrepancy exists, STOP and report it before generating code.

---

Context

- P1: `Building` aggregate + `Confidence<T>`, importer, Postgres/PostGIS persistence (schema v1), NestJS API, web app.
- P2 (parallel): building → Open3CL simulation via `packages/open3cl-adapter` only, persisted `SimulationResult` with input-hash cache, `SimulationJob` queue. All scenario simulations go through this pipeline — never a parallel calculation path.
- P4 (parallel) defines the versioned **command vocabulary** (UpdateWallCommand etc. with type tags). P5 reuses it as **declarative change-sets**: a scenario is a named list of commands applied to a copy of the building via `Building.fork(commands)` — no editor UI needed.

---

Goal (headless P5 — from docs/phases/P5-scenario-management.md)

Create renovation scenarios (named change-sets), simulate each through Open3CL (P2 pipeline, cached), and compare against the baseline — **comparison p95 < 1 s**.

Success criteria:

- CRUD: `POST /buildings/:id/scenarios`, `GET/PATCH/DELETE /scenarios/:id`
- `POST /scenarios/:id/simulate` runs the scenario via P2 and persists the result linked to the scenario
- `POST /buildings/:id/compare` returns baseline + scenarios with deltas (kWh, kg CO2, label change, rank); p95 < 1 s when results are cached
- apply scenario → building state replaced, version bumped (audit entry; full audit trail comes with P4 — note it as a limitation), baseline re-simulated
- web: scenario list + comparison table with label badges and deltas (no 3D needed)
- CI green, steps executed; coverage ≥ 80% x4; Playwright e2e for create 2 scenarios → compare → correct deltas

---

Scope

Implement only:

1. Domain (`packages/domain`):
   - `Scenario` aggregate: `{ id, buildingId, name, description, commands: Command[] (versioned type tags), baselineVersion, createdAt }`
   - `Building.fork(commands): Building` — pure; if P4 hasn't landed it, define it here and mark it as the shared contract
   - `ScenarioComparison` value object + `ComparisonService.compare(results)` (pure domain computation: deltas, ranking, label change)
   - events `ScenarioCreated`, `ScenarioSimulated`, `ScenarioApplied`

2. Application: `CreateScenarioUseCase`, `SimulateScenarioUseCase` (via `SimulationPort.simulateBuilding` on the forked building — same cache), `CompareScenariosUseCase`, `ApplyScenarioUseCase`; `ScenarioRepository` port.

3. Persistence: migration `0004_scenarios.sql` (`scenarios` with commands JSONB + type tags, `scenario_results`); postgres-repository implementation; in-memory variant for `memory://`.

4. API (`apps/api`): the endpoints above; typed errors (404 unknown building/scenario, 409 duplicate in-flight identical input hash → return existing result); OpenAPI updated.

5. Web (`apps/web`): scenario editor (pick from the command catalog: wall insulation, roof insulation, window replacement, boiler replacement… each = one typed command), comparison table (absolute values + deltas vs baseline, labels, rank), "apply scenario" action. No 3D.

6. Tests: unit (fork purity, comparison math, label-change, serialization round-trip of command tags); integration (scenario simulate → persisted; comparison correct vs independently recomputed delta; cache reuse — second compare < 1 s and engine call counter unchanged; apply → version bump + audit entry); acceptance AC-P5-01..04 (p95 < 1 s compare in CI; label improvement D→C shown; apply persists + re-simulates; delete scenario leaves building intact).

---

Out of scope

- 3D viewer (P3), building editor UI (P4 — the command catalog is data, not UI), PDF/IFC (P6/P7), AI advisor (P8 — will rank over `ScenarioComparison`)
- Full audit trail / optimistic locking UI (comes with P4); P5-lite writes a minimal audit entry and version bump only
- Any change to the Open3CL boundary; any calculation outside the P2 pipeline

---

Rules

- Open3CL single source of truth (ADR-0001): every scenario simulation goes through `packages/open3cl-adapter` via the P2 port. Comparison itself is pure domain code over `SimulationResult`s.
- TypeScript strict; no `any` unless justified; JSDoc on public APIs; no silent catches; dependencies inward; domain framework-free.
- Scenario parameters are user-supplied → `Confidence { source: "user", confidence: 1.0 }` on the forked building.
- Command type tags shared with P4 — versioned, do not rename casually.
- Conventional Commits; never push to `main`; PR from `feature/P5-scenario-management`, merged after P2.
- CI green with steps executed (not skipped).

---

Performance budgets

- scenario comparison p95 < 1 s for ≤ 10 scenarios when cached (CI-measured)
- simulation p95 < 3 s (P2 budget, unchanged); import p95 < 1 s unchanged
- coverage ≥ 80% x4

---

Process

Do NOT start coding immediately.

First provide:

# Objective

# Repository Assessment (P1/P2-contract check)

# Analysis

# Risks

# Proposed Architecture

# Implementation Plan

# Validation Strategy

# Acceptance Criteria

# Limitations

Wait for approval before creating files.

If everything is consistent, implement headless P5. In the PR description paste: commands run, coverage numbers, comparison benchmark p50/p95/max, AC evidence, and confirmation that CI steps executed (not skipped).
````
