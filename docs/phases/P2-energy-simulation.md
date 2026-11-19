# Phase Overview

| Field | Value |
| --- | --- |
| Phase | P2 — Energy Simulation |
| Status | Planned |
| Estimated duration | 8–12 weeks |
| Team | 2 backend engineers, 1 architect |
| Depends on | P1 exit criteria (frozen Building fixtures, stable repository, import report v1) |
| Blocks | P4, P5, P8, P9 — every feature that needs a computed result |

P2 turns an imported `Building` into a regulatory `SimulationResult` through Open3CL — the only permitted calculation path.

# Objective

Expose `POST /buildings/:id/simulations` that maps the domain `Building` to the Open3CL input, executes the pinned engine, persists a `SimulationResult`, and returns it — with p95 latency under 3 seconds.

# Business Value

- This is the moment the platform produces regulatory-grade numbers (consumption, emissions, DPE labels) — the core value proposition.
- All later features (editor validation, scenario comparison, AI advisor, IoT deviation) consume `SimulationResult`.

# Scope

**In scope**

- Domain → Open3CL input mapping inside `packages/open3cl-adapter` (the only package allowed to import the engine).
- `SimulationPort` in the application layer; `RunSimulationUseCase`; `SimulationResult` entity; `SimulationJob` for async execution.
- Result persistence + `GET /buildings/:id/simulations` (history) + `GET /simulations/:id`.
- Result caching keyed by a hash of the building input; queue for long runs.
- Web: "Run simulation" button + results panel (consumption, emissions, labels).
- Contract tests: adapter output must match direct engine output on the frozen P1 fixture set.

**Out of scope**

- Scenario comparison (P5), editing (P4), 3D (P3), AI advisor (P8).

# Functional Requirements

- FR-P2-01: `POST /buildings/:id/simulations` runs Open3CL on the current building state and returns a `SimulationResult`.
- FR-P2-02: Results are persisted and listed per building (history with timestamps and input hash).
- FR-P2-03: Re-running with an identical building returns the cached result (no engine re-run).
- FR-P2-04: The web UI shows consumption (kWh/m².an), emissions (kg CO₂/m².an), and energy/climate labels, plus a link to the raw engine output.
- FR-P2-05: Simulation failures return a typed error (engine error vs mapping error) with HTTP 500/422 respectively.

# Technical Requirements

- TR-P2-01: p95 simulation latency < 3 s on the reference machine; measured in CI on the fixture corpus.
- TR-P2-02: Engine stays pinned; `no-restricted-imports` keeps the engine confined to `open3cl-adapter`.
- TR-P2-03: Mapping is total: every domain field needed by the engine has either a value or an explicit, logged default with confidence.
- TR-P2-04: Async path: simulations expected to exceed 3 s run as queued `SimulationJob`s with status polling (`queued/running/done/failed`).
- TR-P2-05: Cache invalidates automatically when the building changes (input hash).
- TR-P2-06: ≥ 80% coverage; contract tests compare adapter output to direct engine output byte-for-byte.
- TR-P2-07: Domain events: `SimulationCompleted`, `SimulationFailed`.

# Architecture

```
Web "Run simulation" ──► POST /buildings/:id/simulations ──► RunSimulationUseCase
                                                                    │  SimulationPort
                                                                    ▼
                                              packages/open3cl-adapter (only engine importer)
                                                                    │  maps Building → engine XML/JSON
                                                                    ▼
                                              Open3CL engine (pinned) ──► SimulationResult (domain)
                                                                    │
                                              SimulationRepository port ──► Postgres adapter (+ cache by input hash)
```

`Building → Open3CL Adapter → Open3CL → SimulationResult` remains the only calculation flow (ADR-0001).

# Domain Model Impact

- New entity `SimulationResult`: `{ buildingId, inputHash, consumptionKwh, emissionsKg, energyLabel, climateLabel, rawEngineOutput, createdAt, confidence }`.
- New entity `SimulationJob` (status machine: `queued → running → done | failed`).
- `Building` gains a read-only projection used by the adapter (`BuildingSimulationView`) — the adapter never mutates the aggregate.
- New domain events: `SimulationCompleted`, `SimulationFailed`.

# Deliverables

1. Adapter mapping layer (domain → engine input) with mapping documentation and default-value log.
2. `RunSimulationUseCase`, `SimulationPort` implementation, job queue + cache.
3. REST endpoints + OpenAPI; Postgres schema v2 (simulations table).
4. Web results panel.
5. Contract test suite on the frozen P1 fixtures; CI benchmark for the < 3 s budget.

# Dependencies

**Must be completed before this phase starts (P1 exit):** frozen fixture snapshots of expected `Building` objects; stable `BuildingRepository`; import report v1; green CI on `main`.

# Test Plan

## Unit Tests

- Mapping: each domain field → engine input field; defaults logged when confidence < 1.
- Cache: same input hash → no engine call; changed building → invalidation.
- Job state machine transitions and failure handling.

## Integration Tests

- Contract tests: for every frozen P1 fixture, adapter result === direct engine result (byte-for-byte on normalized JSON).
- Endpoint flow: POST simulation → persisted → GET history returns it; repeat POST returns cached result.
- Queue path: forced slow fixture completes via polling.

## Acceptance Tests

- AC-P2-01: p95 latency < 3 s across the fixture corpus in CI.
- AC-P2-02: 100% contract-test match with the engine.
- AC-P2-03: UI displays labels and figures matching the API payload (Playwright).
- AC-P2-04: Identical building re-simulation served from cache (engine call counter = 0).

# Risks

| Risk | Level | Mitigation |
| --- | --- | --- |
| Domain→engine mapping drift produces wrong results | High | Contract tests on every fixture; byte-for-byte comparison; mapping doc reviewed per engine upgrade |
| Engine regression after upgrade | Medium | Pinned version; upgrade PRs must run the full contract suite |
| Latency above 3 s on complex buildings | Medium | p95 CI benchmark; async job path; caching |
| Cache key collision/staleness | Low | Hash over canonical serialized building; invalidation test |

# Acceptance Criteria

AC-P2-01…04 green on `main`; contract suite runs in CI on every PR touching the adapter.

# Exit Criteria

**Must be completed before P3/P4/P5 start:**

1. Simulation API v1 stable and versioned (`/v1/...`).
2. Contract suite green on all fixtures; p95 < 3 s published.
3. `SimulationResult` schema tagged v1 (P5 and P8 depend on its shape).
4. Cache + job queue behavior verified under load test (100 concurrent simulations).

# Branch Name

`feature/P2-energy-simulation`

# Definition of Done

- [ ] `POST /buildings/:id/simulations` works, p95 < 3 s
- [ ] Adapter output identical to engine on 100% of fixtures
- [ ] Results persisted, historized, cached by input hash
- [ ] Web results panel matches API payload
- [ ] Job queue handles long runs; failures typed
- [ ] Coverage ≥ 80%, CI green, ADR-0001 flow unchanged
