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
- The engine version is pinned (`@open3cl/engine@1.11.6`, exact, in the workspace root and the adapter), and contract tests run against real DPE fixtures from the engine's test corpus.
- No alternative calculation engine is implemented in this repository, and no 3CL formula is re-implemented locally. Engine gaps are fixed upstream in the engine project.
- **License note (verified on the npm registry during P0):** the pinned `1.11.6` tag is **MIT**. Early `1.0.x`–`1.5.x` npm tags carried **GPL-3.0** metadata; the license switched to MIT in a later 1.x release. The exact pin is what makes the license position deterministic — an accidental `^1.0.0`-style range could have pulled a GPL-3.0 build. Any engine upgrade PR must re-check `npm view @open3cl/engine@<version> license`.

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

## P0 Feasibility Results (measured, 2026-11-19)

Phase P0 proved the decision with executable evidence on `feature/P0-open3cl-feasibility`:

| Check | Result |
| --- | --- |
| Install of exact pin `@open3cl/engine@1.11.6` | OK (ESM-only, `engines.node >= 24.14.1`, `license: MIT` in the installed package.json) |
| Expected exports on the **installed** package | Present: `calcul_3cl_xml`, `calcul_3cl`, `get_classe_ges_dpe`, `getVersion` (plus `get_conso_coeff_1_7_2027`, `Umur/Uph/Upb/Uporte/Ubv/Upt`); `getVersion()` returns `"1.11.6"` |
| Strict TypeScript import | Works through a minimal typed `declare module '@open3cl/engine'` shim inside `packages/open3cl-adapter` — the npm tarball ships **no** declaration for its entry point (TS7016 otherwise). The shim doubles as the adapter's typed contract. |
| Adapter vs direct engine (AC-P0-02) | 15/15 fixtures, 100% semantic equality on normalized JSON (consumption, emissions, energy label, climate label, engine version, full raw output) |
| Fixtures (AC-P0-01) | 15 real DPE XML files copied from the engine git clone corpus (300 files; the npm tarball does not ship them) into `packages/open3cl-adapter/test/fixtures/` |
| Latency (AC-P0-03), machine: Intel Xeon 6985P-C, 5 vCPU @ 2.30 GHz, 5.9 GB RAM, linux x64 | **p50 = 7.9 ms, p95 = 23.9 ms, max = 26.4 ms** (45 samples = 15 fixtures × 3 timed runs + warm-up) — budget 3000 ms → **PASS with ~125× headroom**. Full table: [P0 benchmark report](../phases/P0-benchmark-report.md) |
| Engine failure modes | Malformed XML → engine **throws** (mapped to `EngineExecutionError`); unsupported DPE model → engine **returns `null`** after `console.error` (mapped to `UnsupportedDpeModelError`). Both covered by tests; no silent catches. |
| Node version | Engine declares `>=24.14.1`; `.nvmrc` pins `24.14.1` and CI uses it via `setup-node`. P0 sandbox measurements above were taken on Node v22.23.5, where the engine also runs correctly; CI on Node 24 is authoritative. |
| CI (AC-P0-04) | `.github/workflows/ci.yml`: lint (incl. `no-restricted-imports` on `@open3cl/engine` outside the adapter) + `tsc --noEmit` (strict) + Vitest with coverage thresholds ≥ 80% on lines/statements/functions/branches. Measured coverage: **95.7% lines / 95.7% statements / 93.8% functions / 91.1% branches** |

**Go/no-go recommendation: GO.** Open3CL 1.11.6 embeds cleanly, is ~125× inside the latency budget, is MIT-licensed at the pinned tag, and its only API quirks (missing bundled types, null-return failure mode) are handled and tested inside the single adapter boundary.

## Reassessment Conditions

Reopen this ADR if any of the following occurs:

- The Open3CL engine is abandoned or unmaintained for a sustained period.
- The French regulation changes the calculation method (new 3CL-DPE version) and the engine does not follow.
- A regulation or a major customer explicitly requires a second, different engine.
- Measured performance cannot meet the < 3 s budget even with caching and async execution, and a hosted/optimized engine path is required — in which case the hosted API stays behind the same `SimulationPort` and this decision still holds at the platform level.
