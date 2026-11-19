# ADR-0001 — Open3CL as the Core Energy Engine

## Status

**Accepted** — 2026-11-19

## Context

The platform must produce energy consumption, greenhouse-gas emissions, and DPE energy/climate labels for French dwellings. These outputs are regulatory artifacts in France: they are defined by the **3CL-DPE** calculation method and must be reproducible and auditable. Building our own engine would mean re-implementing a regulated method, duplicating years of validated work, and risking divergence from the official method. Open3CL is an open-source implementation of 3CL-DPE that accepts a DPE (XML or JSON) and returns consumption, emissions, and labels, with a public test corpus of real DPE files.

## Decision

**Open3CL is the primary and single energy simulation engine of the platform.**

All energy calculations flow through exactly one path:

```
Building → Open3CL Adapter → Open3CL → SimulationResult
```

- `packages/open3cl-adapter` is the only module allowed to import the engine; it exposes a `SimulationPort` to the application layer.
- The engine version is pinned, and contract tests run against real DPE fixtures from the engine's test corpus.
- No alternative calculation engine is implemented in this repository, and no 3CL formula is re-implemented locally. Engine gaps are fixed upstream in the engine project.

## Alternatives Considered

1. **Build a proprietary in-house engine.** Rejected: high regulatory risk, duplication of the 3CL-DPE method, heavy maintenance cost, and results would not match official DPE labels.
2. **Support multiple pluggable engines.** Rejected: breaks the single-source-of-truth principle; identical inputs could yield different labels depending on the engine, destroying trust and comparability of scenarios.
3. **Use only a hosted Open3CL REST API.** Rejected as the sole option: adds an external runtime dependency and latency. Kept as a possible *deployment* mode behind the same `SimulationPort`, but the embedded engine remains the default so the platform is self-hostable.
4. **Adopt Open3CL as the single embedded core engine (chosen).** Accepted: regulatory fidelity, open-source (MIT) engine with a public test corpus, fast local execution within the < 3 s budget.

## Consequences

**Positive**

- Results match the official 3CL-DPE method and real DPE labels; auditable and reproducible.
- Large fixture corpus available for contract testing.
- Fast local simulations (< 3 s target) without network dependency.
- Clear boundary: domain model feeds the adapter; engine owns the physics.

**Negative**

- Coupling to the engine's release cycle and API; breaking changes require adapter updates (mitigated by pinned version + contract tests).
- Mapping effort between our domain `Building` and the engine's input format (mitigated by fixture-driven tests with real DPE files).
- Engine bugs block the platform until fixed upstream (mitigated by contributing fixes to the engine).

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Engine API changes in a new release | Medium | High | Pin the engine version; contract tests on every upgrade |
| Domain → engine mapping errors | Medium | High | Fixture-based tests with real DPE files; compare against engine output verbatim |
| Simulation latency above 3 s | Low | Medium | Benchmarks in P0; result caching by input hash; async job queue |
| Engine becomes unmaintained | Low | High | Monitor upstream activity; reassess (see below) |
| Regulatory method change (new 3CL version) | Medium | High | Track regulation; upgrade engine + adapter; re-run full fixture corpus |

## Reassessment Conditions

Reopen this ADR if any of the following occurs:

- The Open3CL engine is abandoned or unmaintained for a sustained period.
- The French regulation changes the calculation method (new 3CL-DPE version) and the engine does not follow.
- A regulation or a major customer explicitly requires a second, different engine.
- Measured performance cannot meet the < 3 s budget even with caching and async execution, and a hosted/optimized engine path is required — in which case the hosted API stays behind the same `SimulationPort` and this decision still holds at the platform level.
