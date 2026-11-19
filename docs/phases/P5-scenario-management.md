# Phase Overview

| Field | Value |
| --- | --- |
| Phase | P5 — Scenario Management |
| Status | Planned |
| Estimated duration | 8–12 weeks |
| Team | 2 full-stack engineers, 1 product owner |
| Depends on | P2 exit (SimulationResult v1), P4 exit (editable, versioned Building) |
| Blocks | P8 (AI advisor ranks scenarios) |

P5 introduces renovation scenarios: named sets of modifications applied to a building, each simulated through Open3CL, and compared side by side in under 1 second.

# Objective

Let a user create scenarios ("Insulate walls", "Replace boiler + windows", …), run each through Open3CL, and compare consumption, emissions, labels, and estimated cost against the baseline — with comparison results delivered in under 1 second.

# Business Value

- Scenario comparison is the decision-making feature: it turns simulation from a report into a renovation roadmap.
- It is the quantitative backbone of the AI advisor (P8), which can only rank what has been simulated.

# Scope

**In scope**

- `Scenario` aggregate: name, description, list of modification commands (reusing P4 commands), baseline building version, status.
- CRUD endpoints: `POST /buildings/:id/scenarios`, `GET/PATCH/DELETE`, `POST /scenarios/:id/simulate`.
- `CompareScenariosUseCase`: runs (or reuses cached) simulations for baseline + scenarios and produces a `ScenarioComparison` (deltas in kWh, kg CO₂, label changes, cost estimate if cost data provided).
- Web UI: scenario list, comparison table + label badges per scenario, "apply scenario to building" action.
- Comparison p95 < 1 s (cached simulation results; comparison itself is pure domain computation).

**Out of scope**

- AI-generated recommendations (P8), cost database integration beyond a simple editable cost table, PDF export of comparisons.

# Functional Requirements

- FR-P5-01: Create a scenario from a set of edits (same commands as P4) applied on top of the current building.
- FR-P5-02: Simulate a scenario via Open3CL; result persisted and linked to the scenario.
- FR-P5-03: Compare any set of scenarios + baseline: per-scenario consumption, emissions, labels, deltas vs baseline, ranking by kWh saved.
- FR-P5-04: Comparison response p95 < 1 s when all results are cached.
- FR-P5-05: Applying a scenario writes its edits onto the building (audit-logged, source "user") and re-simulates the baseline.
- FR-P5-06: Deleting a scenario never deletes the building or other scenarios' results.

# Technical Requirements

- TR-P5-01: Scenario simulation reuses the P2 pipeline unchanged (same `SimulationPort`, same cache) — no parallel calculation engine.
- TR-P5-02: `ScenarioComparison` computed in the domain (pure function over `SimulationResult`s) — no I/O.
- TR-P5-03: Comparison p95 < 1 s for ≤ 10 scenarios, measured in CI.
- TR-P5-04: Schema v4: `scenarios`, `scenario_results` tables; scenario commands serialized as JSON with command-type tags (versioned).
- TR-P5-05: ≥ 80% coverage; Playwright e2e: create 2 scenarios → compare → table shows correct deltas on a fixture.
- TR-P5-06: Domain events: `ScenarioCreated`, `ScenarioSimulated`, `ScenarioApplied`.

# Architecture

```
Web comparison UI ──► CompareScenariosUseCase (application)
                            │  reads ScenarioRepository + SimulationRepository
                            ▼
              Scenario aggregate (domain) ── applies P4 commands to a Building copy (pure)
                            │  simulate via SimulationPort (P2 adapter, cached)
                            ▼
              ScenarioComparison (domain value object) ──► JSON API ──► UI table
```

# Domain Model Impact

- New aggregate `Scenario { id, buildingId, name, description, commands: Command[], baselineVersion, createdAt }`.
- New value object `ScenarioComparison { baseline, entries: [{ scenarioId, result, deltaKwh, deltaKg, labelChange, rank }] }`.
- New domain service `ComparisonService.compare(results): ScenarioComparison`.
- `Building` unchanged except a `fork(commands): Building` method used to materialize a scenario's state (pure).

# Deliverables

1. Scenario aggregate + CRUD endpoints + schema v4.
2. Simulation-per-scenario via the P2 pipeline; per-scenario result history.
3. `CompareScenariosUseCase` + comparison API (`POST /buildings/:id/compare`).
4. Web UI: scenario editor (reuse P4 forms), comparison table with labels and deltas.
5. CI benchmark for the < 1 s comparison budget.

# Dependencies

**Must be completed before this phase starts:**

- P2 exit: `SimulationResult` schema v1 frozen, simulation API stable, cache + jobs verified.
- P4 exit: command set + versioned `Building` + audit log + edit→re-simulate loop proven.

# Test Plan

## Unit Tests

- `Building.fork(commands)` applies commands without mutating the original.
- `ComparisonService`: deltas, ranking, label-change computation on synthetic results.
- Scenario serialization/deserialization (command tags round-trip).

## Integration Tests

- Create scenario with wall-insulation command on a fixture → simulate → result persisted → comparison endpoint returns correct delta vs baseline (recomputed independently in the test).
- Cache reuse: second comparison < 1 s and engine call counter unchanged.
- Apply scenario → building version increments, audit entries written.

## Acceptance Tests

- AC-P5-01: Comparison of baseline + 3 scenarios on a fixture returns in p95 < 1 s (cached) with correct deltas (Playwright + API assert).
- AC-P5-02: Label improvement shown correctly (e.g., D → C) in the UI.
- AC-P5-03: Apply scenario persists edits with audit trail and re-simulates baseline.
- AC-P5-04: Deleting a scenario leaves building and other results intact.

# Risks

| Risk | Level | Mitigation |
| --- | --- | --- |
| Many scenarios × simulations overload the engine/queue | Medium | Cache by input hash; queue with rate limit; comparison itself is free |
| Users misread deltas (baseline confusion) | Medium | UI always shows absolute values + deltas; baseline pinned and labeled |
| Command serialization breaks across versions | Low | Versioned command tags; migration tests |
| Cost estimates misleading | Low | Costs are user-editable inputs, labeled as estimates with confidence |

# Acceptance Criteria

AC-P5-01…04 green on `main`; comparison benchmark published.

# Exit Criteria

**Must be completed before P8 starts:**

1. Scenario CRUD + comparison API v1 stable and versioned.
2. `ScenarioComparison` schema frozen — P8 ranks over exactly this structure.
3. Comparison p95 < 1 s demonstrated in CI.
4. Audit trail verified for apply-scenario.

# Branch Name

`feature/P5-scenario-management`

# Definition of Done

- [ ] Scenario CRUD + simulate + compare endpoints working, API v1 versioned
- [ ] Comparison p95 < 1 s (cached results), deltas verified against independent recomputation
- [ ] UI comparison table with labels/deltas e2e-tested
- [ ] Apply scenario → audited building update + baseline re-simulation
- [ ] All simulations via Open3CL adapter only; coverage ≥ 80%; CI green
