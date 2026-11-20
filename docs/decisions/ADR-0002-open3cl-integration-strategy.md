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
- Engine is synchronous and CPU-bound: resolved in P2 by running it in a dedicated
  `worker_threads` worker (see "Execution Strategy (decided in P2)" below) instead of on the
  main thread.
- P0 packages export `src/index.ts` directly (no build step; Node >= 24 native type stripping
  runs the CLI spike, and `tsconfig` paths + Vitest aliases duplicate the package mapping).
  That is fine for the spike, but **before the NestJS API (P1/P2) a build strategy must be
  chosen**: `tsc` project references emitting `dist/`, or relying on Node 24 type stripping
  in production. Decision deferred to P1/P2, recorded here so it is not forgotten.

## Build / Runtime Strategy (decided in P1)

The deferred build question is answered for the P1 stack as follows:

- **Library packages** (`domain`, `application`, `dpe-xml-importer`, `postgres-repository`,
  `open3cl-adapter`) ship TypeScript **sources** (`exports` → `src/index.ts`) and contain only
  erasable TypeScript syntax, so Node 24 (`.nvmrc` 24.14.1) runs them directly via native type
  stripping. `tsc --noEmit` + Vitest aliases duplicate the workspace mapping for tooling.
- **apps/api (NestJS)** uses decorators, which type stripping does not support, so it runs via
  **tsx** (`npm run start -w apps/api`). Constructor injection uses explicit `@Inject(token)`
  everywhere, so no `emitDecoratorMetadata` is required and the same code runs under Vitest
  (esbuild, `experimentalDecorators: true` in `tsconfig.base.json`). A compiled production
  image (tsc/swc emit to `dist/`) can be added at deployment time without changing any port.

## Execution Strategy (decided in P2)

The engine (`calcul_3cl` / `calcul_3cl_xml`) is synchronous and CPU-bound, so P2 runs it in a
dedicated `node:worker_threads` worker instead of on the API event loop (PR #14 review finding:
a queued simulation would freeze all HTTP traffic for its whole duration):

- `packages/open3cl-adapter/src/engine-worker.mjs` is the **only** runtime import of
  `@open3cl/engine` (plain JS, `execArgv: []`, so no loader flags are inherited). It receives
  `{ id, task }` messages (`task.kind: 'xml' | 'json'`), calls the engine with
  `{ sanitize: true }`, and replies `{ id, ok: true, result }` or `{ id, ok: false, message }`.
- `packages/open3cl-adapter/src/engine-runner.ts` (`EngineRunner`, process-wide singleton
  `getEngineRunner()`) owns the worker: one worker per process serializes engine calls
  naturally. The worker is `unref()`'d so it never keeps the process alive; while runs are
  pending a ref'd keep-alive interval keeps the event loop alive so responses are received
  (CLI spike, benchmarks). A crashed worker rejects its pending runs and is lazily recreated on
  the next `run()`.
- `Open3clAdapter.runEngine` is now `async` and routes every engine call through the runner;
  the error mapping is unchanged (worker-side throw → `EngineExecutionError`, `null` result
  → `UnsupportedDpeModelError`). The adapter's public API (`SimulationPort`) is unchanged, so
  callers (API, CLI, benchmarks) needed no modification.
- Measured overhead of the hop: sub-millisecond to a few ms per call for corpus-sized documents
  (structured clone of the XML/result), negligible against the p95 23.9 ms engine time.

A dedicated engine **service** (option 4) remains a possible deployment mode later behind the
same `SimulationPort`; it is still not needed for the latency budget.

## Reassessment Conditions

Reopen if: simulation latency approaches the 3 s budget in-process; the engine becomes a
long-running service upstream; a hard requirement for process isolation emerges; or the API
needs a compiled production build (add swc/tsc emit behind the same entry point).
