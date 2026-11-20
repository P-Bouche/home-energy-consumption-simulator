# ADR-0002 — Open3CL Integration Strategy

## Status

**Accepted** — 2026-11-19 (Phase P0)

## Context

ADR-0001 makes Open3CL the single energy engine. This ADR decides **how** the rest of the
monorepo is allowed to reach it. The engine is an ESM-only npm package
(`@open3cl/engine@1.11.6`, Node >= 24.14.1) whose only stable contract is its function
exports (`calcul_3cl_xml`, `calcul_3cl`, `get_classe_ges_dpe`, `getVersion`); it ships no
TypeScript declarations for its entry point and has two failure modes (throw on malformed
XML, `null` return on unsupported models).

## Options Considered

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| 1. Direct package integration everywhere | Any package imports `@open3cl/engine` where needed | Zero indirection | Violates the single-boundary rule; engine API churn and type shim would leak into every layer; unenforceable |
| 2. Dynamic `import()` at call sites | Each consumer lazy-loads the engine | Defers engine load cost | Still scattered imports; harder to enforce; hides the dependency from static analysis and lint |
| 3. Wrapper adapter behind a port (chosen) | `packages/open3cl-adapter` implements `SimulationPort` (application layer) and is the **only** package importing the engine; static import; ESLint `no-restricted-imports` enforces the boundary | Single import point, statically enforceable and greppable; typed shim + error mapping + result mapping live in exactly one place; callers depend only on `SimulationPort`/`SimulationResult`; engine upgrades touch one package; testable via DI | One extra package; adapter must be kept in sync with engine upgrades (mitigated by pin + contract tests) |
| 4. Dedicated simulation microservice | Engine runs in its own process/service, called over HTTP/queue | Isolates engine crashes/Node version; horizontal scaling | Network hop per simulation (budget is 3 s, measured in-process at ~24 ms p95); deployment complexity (extra container, health checks) for zero current benefit; can still be added later **behind the same `SimulationPort`** without changing this decision |

## Decision

**Option 3: wrapper adapter behind a port.** `packages/open3cl-adapter` statically imports the
pinned `@open3cl/engine@1.11.6`, owns the typed module declaration, maps engine output to the
domain `SimulationResult`, and maps both engine failure modes (throw, `null`) to typed domain
errors. The application layer exposes `SimulationPort.simulate(dpeXml: string): Promise<SimulationResult>`;
dependency direction stays `domain <- application <- adapter`. ESLint `no-restricted-imports`
fails the build for any `@open3cl/engine` import outside `packages/open3cl-adapter/**`.

A dedicated service (option 4) remains a possible **deployment** mode later (e.g. for very large
corpora or crash isolation), but it would implement the same `SimulationPort` — the platform-level
flow `Building → Open3CL Adapter → Open3CL → SimulationResult` (ADR-0001) is unchanged.

## Consequences

**Positive**

- Engine boundary is mechanical, not conventional: CI lint fails on any stray import.
- Engine upgrade = one package + contract tests over the fixture corpus (15 fixtures checked in,
  sourced from the engine clone's 300-file corpus).
- Domain and application layers stay framework-free and engine-free; `tsc --noEmit` strict passes.
- Measured cost of the wrapper: p95 23.9 ms end-to-end (engine + mapping) on the P0 reference
  machine — the adapter adds no meaningful overhead.

**Negative**

- The typed `declare module '@open3cl/engine'` shim must be maintained when the engine API
  changes (detected immediately by typecheck + contract tests).
- Engine is synchronous: long simulations block the event loop; if that ever matters, move to
  option 4 behind the same port (worker_threads or service) without touching callers.
- P0 packages export `src/index.ts` directly (no build step; Node >= 24 native type stripping
  runs the CLI spike, and `tsconfig` paths + Vitest aliases duplicate the package mapping).
  That is fine for the spike, but **before the NestJS API (P1/P2) a build strategy must be
  chosen**: `tsc` project references emitting `dist/`, or relying on Node 24 type stripping
  in production. Decision deferred to P1/P2, recorded here so it is not forgotten.

## Reassessment Conditions

Reopen if: simulation latency approaches the 3 s budget in-process; the engine becomes a
long-running service upstream; or a hard requirement for process isolation emerges.
