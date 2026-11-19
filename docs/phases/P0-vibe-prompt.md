# P0 Vibe Prompt (canonical)

Canonical prompt to start a Vibe session (VS Code, Vibe sandbox, or the Mistral Studio `code-orchestrator` session workflow) for **Phase P0 — Open3CL Feasibility**.

Usage:

1. Create the branch from `origin/main` (the remote branch may be stale; push with `--force-with-lease` if history diverges):
   `git checkout -b feature/P0-open3cl-feasibility origin/main`
2. Replace `<path-to>/engine` with the actual path of the local engine clone (version 0.1.0 — fixtures/inspection only; the runtime dependency is the pinned npm package).
3. Paste the fenced block below verbatim into the Vibe chat.

----

````markdown
You are implementing Phase P0 — Open3CL Feasibility of the Home Energy Consumption Simulator.

Branch:
- Create `feature/P0-open3cl-feasibility` from `origin/main` (NOT from the existing remote branch, which is stale at the initial commit): `git checkout -b feature/P0-open3cl-feasibility origin/main`
- When pushing, history diverges from the remote branch: use `git push --force-with-lease -u origin feature/P0-open3cl-feasibility`

Before making any change:

1. Read:
   - AGENTS.md
   - README.md
   - docs/architecture.md
   - docs/roadmap.md
   - docs/phases/P0-open3cl-feasibility.md
   - docs/decisions/ADR-0001-open3cl-as-core-engine.md

2. Inspect the repository.

3. Verify:
   - `npm install @open3cl/engine@1.11.6` (EXACT pin) succeeds and the package imports from strict TypeScript
   - the ACTUAL API of the INSTALLED 1.11.6 package matches the expected exports: calcul_3cl_xml(dpeXmlContent, options), calcul_3cl(dpeObject, options), get_classe_ges_dpe, getVersion (verify on node_modules, NOT on the local clone)
   - the local engine clone (path: <path-to>/engine, version 0.1.0) exists and contains test/fixtures/ with ~300 DPE XML files — used for FIXTURES ONLY, the clone is not the runtime dependency
   - the package is ESM-only ("type": "module") and declares engines node >= 24.14.1
   - assumptions in the documentation are valid (license of the pinned 1.11.6 is MIT; note: early 1.0.x npm tags carried GPL-3.0 metadata — record this in ADR-0001)

If any discrepancy exists between the documentation, the installed npm package, or the local engine clone, STOP and report it before generating code.

---

Context

The Open3CL engine is the npm package:

@open3cl/engine

Pinned version: 1.11.6 (exact). A local clone (0.1.0) exists at <path-to>/engine for inspection and fixture sourcing only.

The package is ESM-only and requires Node >= 24.14.1.

Expected exports of the installed package:

- calcul_3cl_xml(dpeXmlContent, options)
- calcul_3cl(dpeObject, options)
- get_classe_ges_dpe
- getVersion

The engine test corpus in the clone contains ~300 DPE XML fixtures (the npm tarball may not include them — always source fixtures from the git clone).

Source priority:

1. Installed npm package @open3cl/engine@1.11.6 (runtime dependency)
2. Local engine clone (inspection and fixtures only)

---

Goal

Prove with executable evidence that Open3CL can serve as the project's energy simulation engine.

Success criteria:

- Open3CL works from strict TypeScript
- adapter outputs are semantically identical to direct engine outputs
- p95 simulation latency < 3 seconds on this machine (record CPU/RAM in the report)
- CI is operational
- architectural constraints are enforced

---

Scope

Implement only:

1. Monorepo scaffolding using npm workspaces

/apps
/packages/domain
/packages/application
/packages/open3cl-adapter
/infrastructure/docker
/tests/e2e

2. Root tooling

- TypeScript strict mode
- ESLint
- Vitest + coverage (@vitest/coverage-v8)
- .nvmrc with a Node 24 LTS version (engine 1.11.6 requires node >= 24.14.1); CI must use the same version
- npm workspaces
- package.json with "type": "module" (engine is ESM-only)

3. CI

.github/workflows/ci.yml

Run on every PR:

- lint
- typecheck (tsc --noEmit)
- tests
- coverage (fail below thresholds)

4. Domain package

SimulationResult

Fields:

- consumptionKwh
- emissionsKg
- energyLabel
- climateLabel
- rawEngineOutput

Typed domain errors.

No framework imports.

5. Application package

SimulationPort

simulate(dpeXml: string): Promise<SimulationResult>

6. Open3CL Adapter

The ONLY package allowed to import:

@open3cl/engine

Enforce with ESLint no-restricted-imports (any import of @open3cl/engine outside packages/open3cl-adapter fails lint).

Use calcul_3cl_xml from the installed 1.11.6 package.

7. CLI spike

apps/cli-spike

Command:

node . simulate <file.xml>

Output:

JSON on stdout

Failure:

non-zero exit code + explicit error message

8. Benchmark harness

Copy 10-20 representative fixtures from:

<path-to>/engine/test/fixtures/

to:

packages/open3cl-adapter/test/fixtures/

Measure:

- p50
- p95
- max latency

Generate:

docs/phases/P0-benchmark-report.md

Include machine specs (CPU, RAM, Node version).

9. Documentation

Update:

docs/decisions/ADR-0001-open3cl-as-core-engine.md

with:

- measured latency
- benchmark results
- license note (1.11.6 = MIT; early 1.0.x tags were GPL-3.0)
- final go/no-go recommendation

Create:

docs/decisions/ADR-0002-open3cl-integration-strategy.md

Compare:

- direct package integration
- dynamic import
- wrapper adapter
- dedicated service

Document the selected approach.

Renumbering (same PR): docs/phases/P7-ifc-integration.md currently reserves ADR-0002 for the IFC reader → change it to ADR-0003; docs/phases/P8-ai-renovation-advisor.md reserves ADR-0003 for LLM/privacy → change it to ADR-0004.

---

Out of scope

Do NOT implement:

- Building
- Room
- Wall
- ThermalZone
- Scenario
- DPE parsing into a domain model
- REST APIs
- UI
- database schema

These belong to later phases.

Assumption to state in your report: the project owner will later provide an actual ADEME DPE XML + DPE report as extra fixtures; until then the engine clone corpus is used. Never invent fixture data.

---

Rules

- Open3CL is the single source of truth.
- Never reimplement 3CL calculations.
- TypeScript strict mode.
- No silent catches.
- No any unless explicitly justified in the PR description.
- JSDoc on public APIs.
- Dependencies point inward: domain <- application <- adapter
- Domain layer remains framework-free.
- Conventional Commits. Never push to main. Finish with a PR from feature/P0-open3cl-feasibility.
- Do not add non-essential dependencies.

---

Testing

Unit tests:
- SimulationResult mapping
- error mapping

Integration tests:
- adapter vs direct Open3CL invocation on the installed package

Comparison must use semantic equality on normalized JSON.

Compare:

- consumption
- emissions
- energyLabel
- climateLabel
- engine version (getVersion)

Ignore:

- JSON property ordering
- formatting
- non-functional metadata

Acceptance tests:

AC-P0-01:
>= 10 fixtures simulate successfully

AC-P0-02:
100% semantic equivalence with direct engine results

AC-P0-03:
p95 latency < 3 seconds

AC-P0-04:
CI green with coverage >= 80%

Coverage thresholds (aligned with AGENTS.md "minimum 80%"):

- lines >= 80%
- statements >= 80%
- functions >= 80%
- branches >= 80%

---

Process

Do NOT start coding immediately.

First provide:

# Objective

# Repository Assessment

# Open3CL API Verification

# Analysis

# Risks

# Proposed Architecture

# Implementation Plan

# Validation Strategy

# Acceptance Criteria

# Limitations

Wait for approval before creating files.

If everything is consistent, then implement Phase P0. At the end, open the PR and paste into its description: commands run, coverage numbers, benchmark p50/p95/max, and the go/no-go recommendation.
````
