# P4 Vibe Prompt (canonical)

Canonical prompt to start a Vibe session (VS Code, Vibe sandbox, or the Mistral Studio `code-orchestrator` session workflow) for **Phase P4 — Building Editor** (2D-first).

P4 is launched early, in parallel with P2: the editor works in **2D mode** (element list + forms) and re-simulates through the P2 contract; 3D picking from P3 is integrated later in a small PR.

Usage:

1. If P2 is still in flight, branch from the P2 branch; otherwise from `origin/main`:
   `git checkout -b feature/P4-building-editor feature/P2-energy-simulation` (or `origin/main` once P2 is merged)
   (stale remote branch: `git push --force-with-lease -u origin feature/P4-building-editor`)
2. Paste the fenced block below verbatim into the Vibe chat.

----

````markdown
You are implementing Phase P4 — Building Editor (2D-first) of the Home Energy Consumption Simulator.

Branch:
- If P2 (`feature/P2-energy-simulation`) is not merged yet, branch from it: `git checkout -b feature/P4-building-editor feature/P2-energy-simulation`
- Otherwise from `origin/main`. If pushing fails non-fast-forward, use `git push --force-with-lease -u origin feature/P4-building-editor`.
- Merge after P2.

Before making any change:

1. Read:
   - AGENTS.md
   - README.md, docs/architecture.md, docs/roadmap.md, docs/ci.md
   - docs/phases/P4-building-editor.md
   - docs/phases/P2-energy-simulation.md and docs/phases/P2-vibe-prompt.md (the simulateBuilding contract you build against)
   - docs/phases/P1-dpe-import.md (Building aggregate, Confidence<T>, repositories)
   - docs/decisions/ADR-0001-open3cl-as-core-engine.md, docs/decisions/ADR-0002-open3cl-integration-strategy.md

2. Inspect the repository.

3. Verify (STOP and report if any fails):
   - the `SimulationPort` extension contract is available (on the P2 branch or merged on main): `simulateBuilding(building: Building): Promise<SimulationResult>` alongside the untouched `simulate(dpeXml)`
   - P1 baseline intact: Building aggregate, Confidence<T>, `BuildingRepository`, `POST /imports/dpe`, `GET /buildings/:id`; CI on the base branch green with steps executed (not skipped)
   - locally on Node 24.14.1 (`.nvmrc`): `npm ci && npm run lint && npm run typecheck && npm run test:coverage` pass

If any discrepancy exists, STOP and report it before generating code.

---

Context

- P1 delivered the `Building` aggregate with `Confidence<T>` (measured vs inferred), the DPE importer, Postgres/PostGIS persistence (`packages/postgres-repository`, schema v1), NestJS API, web upload page.
- P2 (parallel) adds simulation of a building through Open3CL with result cache. You build against that contract only — do not modify the adapter or the engine boundary.
- P3 (parallel) adds the 3D viewer with stable element IDs. Your editor is 2D-first (list + forms); 3D picking is a follow-up integration PR after P3 merges.

---

Goal (from docs/phases/P4-building-editor.md, 2D-first)

Let users correct/enrich the imported building via a 2D editor: every change is a validated domain command, persisted with versioning + audit trail, marked `source: "user"` confidence 1.0, and re-simulable through P2.

Success criteria:

- edit an envelope element or system via list+form; invalid edits rejected with field-level messages; nothing invalid persisted
- every save is audit-logged (who/when/old→new); building version increments; stale version → HTTP 409
- undo of the last change works
- after a successful edit, re-simulation via P2 reflects the change (input hash changes → cache miss → new engine run)
- user edits stored with `Confidence { source: "user", confidence: 1.0 }`
- CI green with steps executed; coverage ≥ 80% x4; e2e (Playwright) covers edit → save → re-simulate

---

Scope

Implement only:

1. Domain (`packages/domain`):
   - command objects per editable element (e.g. `UpdateWallCommand { buildingId, wallId, uValue, thickness, material }`, `UpdateWindowCommand`, `UpdateRoofCommand`, `UpdateFloorCommand`, `UpdateHeatingSystemCommand`, `UpdateVentilationSystemCommand`) — **the command type tags are a shared contract with P5 scenarios: freeze them now, versioned**
   - `Building.version` + `apply(command): Either<DomainError, Building>` — pure, invariants enforced (never persist an un-simulable state: negative U-value, window larger than wall, etc.)
   - `AuditEntry { buildingId, userId, timestamp, command, oldValue, newValue }`; domain event `BuildingUpdated`
   - `fork(commands): Building` pure copy used by P5 later (define now, test now)

2. Application (`packages/application`): `EditBuildingUseCase` (apply command, validate, persist), `UndoLastChangeUseCase`, ports unchanged + `AuditLog` port.

3. Persistence: migration `0003_audit.sql` (append-only `audit_entries` table, enforced at DB level; building `version` column); `packages/postgres-repository` implements optimistic locking + audit; in-memory variant for `memory://`.

4. API (`apps/api`): `PATCH /buildings/:id` (command body, `If-Match: version` → 409 on conflict), `GET /buildings/:id/audit`, `POST /buildings/:id/undo`. Typed errors → 400/404/409. OpenAPI updated.

5. Web (`apps/web`): building page with element list (walls/windows/roof/floor/systems) → edit form (MUI) with field-level validation → save → re-run simulation (P2 endpoint) → updated labels; undo button; audit view. No business logic in components.

6. Tests: unit (every command: valid → new state + event; invalid → typed DomainError, aggregate unchanged; undo; fork purity); integration (version increment, 409, audit rows, edit → input-hash change → new SimulationResult via cache-miss check); acceptance AC-P4-01..04 (Playwright: edit wall U-value → re-simulate → consumption decreases and label updates; invalid edit rejected; audit shows old/new + source "user"; undo restores + re-simulates).

---

Out of scope

- 3D picking integration (follow-up after P3 merges — do not wait for it)
- Scenario management (P5 — builds on your command vocabulary), PDF/IFC import (P6/P7), AI advisor (P8)
- Any change to the Open3CL boundary

---

Rules

- Open3CL single source of truth (ADR-0001); re-simulation goes through P2's `simulateBuilding` only.
- TypeScript strict; no `any` unless justified in the PR description; JSDoc on public APIs; no silent catches.
- Dependencies point inward; domain framework-free.
- User-supplied values always `Confidence { source: "user", confidence: 1.0 }`.
- Command type tags are versioned and shared with P5 — do not rename casually.
- Conventional Commits; never push to `main`; PR from `feature/P4-building-editor`, merged after P2.
- CI must stay green and real (verify steps executed, not skipped).

---

Performance budgets

- p95 edit→persisted < 500 ms; re-simulation via P2 p95 < 3 s
- import p95 < 1 s and simulation p95 < 3 s must not regress (run `npm run benchmark:import` and `npm run benchmark`)
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

If everything is consistent, implement Phase P4 (2D-first). In the PR description paste: commands run, coverage numbers, benchmark results, AC evidence, and confirmation that CI steps executed (not skipped).
````
