# AGENTS.md — Home Energy Consumption Simulator

Entry point for AI agents and contributors. Read this file before making any change to the repository.

## 1. Project Context

Home Energy Consumption Simulator is an open-source **residential Digital Energy Twin** built on the **Open3CL** (3CL-DPE) calculation engine. Starting from a French DPE XML diagnostic, the platform reconstructs the building, visualizes it in 3D, runs regulatory energy simulations, and compares renovation scenarios.

Progressively planned capabilities: French DPE XML import, building reconstruction, Open3CL energy simulation, renovation scenario comparison, 3D visualization, building editing, PDF floorplan import, IFC/OpenBIM integration, AI-assisted renovation recommendations, IoT integration, and photogrammetry/LiDAR support.

## 2. Architecture Rules

Mandatory on every change:

- **Clean Architecture** + **Hexagonal Architecture** + **Domain-Driven Design** + **SOLID** + **dependency injection**.
- Layered packages: `domain` ← `application` ← `infrastructure` / `presentation`. Dependencies point **inward only**.
- Domain models are **framework-free**: no NestJS, React, or ORM imports inside `packages/domain`.
- **No business logic in the UI.** Components call application services / use cases.
- No circular dependencies. No god classes. Keep modules small and single-purpose.

## 3. Domain Model Guidance

The central entity is **`Building`**. Every feature must extend or interact with this model.

Core entities: `Building`, `Zone`, `Room`, `Wall`, `Roof`, `Floor`, `Window`, `Door`, `ThermalZone`, `HeatingSystem`, `VentilationSystem`, `PhotovoltaicSystem`, `Scenario`, `SimulationResult`.

**Data confidence rule:** DPE files are frequently incomplete. Every inferred value must be stored and exposed as:

```ts
{ value: T; source: string; confidence: number; importDate: Date }
```

Never present inferred information as measured fact. Document assumptions explicitly.

## 4. Open3CL Principles

- **Open3CL is the single source of truth for all energy calculations.**
- The only permitted flow is: `Building → Open3CL Adapter → Open3CL → SimulationResult`.
- Never create an alternative energy calculation engine, and never re-implement 3CL formulas locally. If the engine has a gap, contribute the fix upstream to the engine.
- The engine is reached **only** through the `packages/open3cl-adapter` port/adapter. No other package may import the engine.

## 5. Coding Standards

- TypeScript **strict mode** everywhere. No `any` unless explicitly justified in the PR description.
- **JSDoc on all public APIs.**
- Thorough, explicit error handling: domain errors or Result types; no silent `catch {}`.
- Follow the naming, folder, and test conventions of the nearest existing package.
- One responsibility per module; prefer composition over inheritance.

## 6. Workflow Rules

Before implementing any feature:

1. Restate the objective.
2. Analyze requirements.
3. Identify risks.
4. Propose architecture.
5. Define tests.
6. Implement.
7. Validate results.

- Work on short-lived branches (`feature/<scope>-<slug>`, `vibe/<slug>-<id>`). **Never push directly to `main`.**
- **Parallel sessions:** each agent session works in its own git worktree on its own branch (`git worktree add …`), never in a shared checkout; dev/e2e ports are per-worktree via `API_PORT` / `WEB_PORT`. See `docs/agents/parallel-worktrees.md`.
- **Issue-linked branches:** when a branch implements issue #N, name it `feature/issue-<N>-<slug>` and put `Closes #N` in the PR body, so GitHub auto-closes the issue on merge (see GLOSSARY.md, « Issue-linked branch »).
- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, ...).
- Open a pull request with a complete description; keep PRs small and reviewable.

## 7. Testing Requirements

- **Vitest** for unit tests in packages, **Jest** for backend integration tests, **Playwright** for end-to-end tests.
- Minimum **80% coverage** on all new or modified code.
- Performance budgets (add benchmarks when touching these paths):
  - DPE import < 1 s
  - Open3CL simulation < 3 s
  - 3D reconstruction < 2 s
  - Scenario comparison < 1 s

## 8. Expected Response Format

For non-trivial tasks, structure the answer as:

1. Objective
2. Analysis
3. Risks
4. Proposed Architecture
5. Implementation Plan
6. Validation Tests
7. Acceptance Criteria
8. Code (only when requested)
9. Limitations

If information is missing, **state assumptions and confidence levels explicitly** instead of inventing data.

## Agent skills

### Issue tracker

Issues are tracked as GitHub issues in this repo (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one root `GLOSSARY.md` plus ADRs in `docs/decisions/`. See `docs/agents/domain.md`.
