# P3 Vibe Prompt (canonical)

Canonical prompt to start a Vibe session (VS Code, Vibe sandbox, or the Mistral Studio `code-orchestrator` session workflow) for **Phase P3 — 3D Reconstruction**.

P3 depends only on **P1** (merged), so it can start immediately and run in parallel with P2.

Usage:

1. Branch from `origin/main`:
   `git checkout -b feature/P3-3d-reconstruction origin/main`
   (the remote branch may be stale: `git push --force-with-lease -u origin feature/P3-3d-reconstruction`)
2. Paste the fenced block below verbatim into the Vibe chat.

----

````markdown
You are implementing Phase P3 — 3D Reconstruction of the Home Energy Consumption Simulator.

Branch:
- Create `feature/P3-3d-reconstruction` from `origin/main`: `git checkout -b feature/P3-3d-reconstruction origin/main`
- If pushing fails non-fast-forward (stale remote branch), use `git push --force-with-lease -u origin feature/P3-3d-reconstruction`.

Before making any change:

1. Read:
   - AGENTS.md
   - README.md, docs/architecture.md, docs/roadmap.md, docs/ci.md
   - docs/phases/P3-3d-reconstruction.md
   - docs/phases/P1-dpe-import.md (what P1 delivered: Building aggregate, Confidence<T>, importer, API, web)
   - docs/decisions/ADR-0001-open3cl-as-core-engine.md, docs/decisions/ADR-0002-open3cl-integration-strategy.md

2. Inspect the repository.

3. Verify the P1 baseline on `origin/main` (STOP and report if any fails):
   - latest CI runs on `main` green with steps actually executed (open the run and confirm steps are not `skipped` — hashFiles guards were removed, workflows run unconditionally)
   - `packages/domain` Building aggregate + `Confidence<T>` present; `packages/dpe-xml-importer` fixtures present; `apps/api` (`POST /imports/dpe`, `GET /buildings/:id`) and `apps/web` (upload page) exist
   - locally on Node 24.14.1 (`.nvmrc`): `npm ci && npm run lint && npm run typecheck && npm run test:coverage` pass

If any discrepancy exists between this prompt, the docs, or the repo state, STOP and report it before generating code.

---

Context

- Monorepo (npm workspaces, strict TS, ESLint with engine-boundary + domain-purity rules, Vitest 80% gate, CI ci/e2e/benchmark, branch protection on main).
- P1 delivered: `Building` aggregate (zones, rooms, walls, roofs, floors, windows, doors, systems) with `Confidence<T>` metadata; DPE XML importer (p95 import 304 ms); NestJS `apps/api`; Vite/React/MUI/Zustand `apps/web` upload page; Playwright at root.
- P2 (simulation API, `SimulationResult` persistence) may still be in flight on `feature/P2-energy-simulation` — do NOT depend on it. Build the heat-loss overlay behind a read-only projection that is hidden when no `SimulationResult` exists; a small integration PR wires it after P2 merges.

---

Goal (from docs/phases/P3-3d-reconstruction.md)

Render any imported building in 3D — walls, roof, floors, windows, doors, rooms — with per-element picking and confidence marking, reconstructing missing geometry from DPE data, in **p95 < 2 s** reconstruction and 60 fps on a mid-range GPU.

Success criteria:

- `GET /buildings/:id` data renders in the web app 3D view
- inferred elements visually marked + tooltip shows `{ source, confidence }`
- clicking an element shows properties (U-value, area, orientation, confidence) in a side panel
- deterministic geometry: same building → same mesh hash (tested)
- heat-loss overlay hidden until a `SimulationResult` exists (P2), then colors envelope elements by loss share (sums to 100%)
- p95 reconstruction < 2 s on the fixture corpus; CI green (lint/typecheck/test/e2e/benchmark), coverage ≥ 80% x4

---

Scope

Implement only:

1. Domain (`packages/domain`):
   - value objects `Mesh`, `Face`, `Vector3`, `Dimensions`, `Orientation`; `Building.reconstructGeometry(): Geometry` (pure, no I/O)
   - `ReconstructionService` with **versioned inference rules** (`inferenceRulesVersion` recorded on produced geometry); every inferred element keeps its `Confidence`
   - documented coordinate system: meters, Z-up, origin at building footprint corner (unit-tested)

2. `packages/geometry` (new): adapter domain → mesh buffers (three.js BufferGeometry). Pure, framework-free core.

3. Application (`packages/application`): `ReconstructBuildingUseCase` + `GeometryPort`.

4. Web (`apps/web`): React Three Fiber + Three.js viewer in the existing Vite app; Zustand store fed by the use case; MUI side panel; orbit controls; element picking with **stable element IDs** (P4 will rely on them); room labels; confidence hatch/color + tooltip; heat-loss overlay (hidden without SimulationResult). No business logic in components.

5. API (`apps/api`): `GET /buildings/:id/geometry` returning the reconstructed geometry (or compute client-side from building JSON — choose one and document it; prefer server-side for a stable < 2 s budget).

6. Tests:
   - unit: reconstruction rules (complete → exact; incomplete → inferred with confidence + rules version); determinism (same input → same mesh hash); coordinate conversions
   - integration: API round-trip latency; overlay loss shares sum to 100% given a stored SimulationResult (mock one if P2 not merged)
   - acceptance AC-P3-01..04 (p95 < 2 s headless CI benchmark; viewer renders every fixture with screenshot diff in CI; inferred marking + tooltip via Playwright; picking shows correct properties)
   - add `benchmark:geometry` script; wire into `benchmark.yml` alongside the Open3CL benchmark

---

Out of scope (later phases — do NOT implement)

- Building editor (P4), scenario management (P5), PDF/IFC import (P6/P7)
- Any energy calculation — Open3CL only via `packages/open3cl-adapter` (P2); P3 computes no energy, the overlay only displays it
- Changes to the Open3CL boundary or to P1's import pipeline

---

Rules

- Open3CL single source of truth (ADR-0001); engine imports stay confined to `packages/open3cl-adapter` (lint-enforced).
- TypeScript strict; no `any` unless justified in the PR description; JSDoc on public APIs; no silent catches.
- Dependencies point inward: `domain` <- `application` <- adapters/apps; domain stays framework-free (no three.js imports in domain — geometry value objects are plain data).
- No business logic in components.
- Do not add dependencies beyond the scope: three, @react-three/fiber, @react-three/drei (if needed), plus existing stack.
- Conventional Commits; never push to `main`; finish with a PR from `feature/P3-3d-reconstruction`.
- CI must stay green and real: verify in your PR's runs that steps executed (not `skipped`).

---

Performance budgets

- 3D reconstruction p95 < 2 s (CI benchmark, headless)
- render 60 fps on mid-range GPU for typical dwellings (≤ 300 m²); merge geometry by material to limit draw calls
- existing budgets unchanged: simulation p95 < 3 s, import p95 < 1 s, coverage ≥ 80% x4

---

Process

Do NOT start coding immediately.

First provide:

# Objective

# Repository Assessment (P1 baseline check)

# Analysis

# Risks

# Proposed Architecture

# Implementation Plan

# Validation Strategy

# Acceptance Criteria

# Limitations

Wait for approval before creating files.

If everything is consistent, implement Phase P3. In the PR description paste: commands run, coverage numbers, geometry benchmark p50/p95/max with machine specs, screenshot-regression evidence, and confirmation that CI steps executed (not skipped).
````
