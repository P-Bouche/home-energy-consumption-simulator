# CI / CD

GitHub Actions only. Node version is pinned via `.nvmrc` (Node 24 LTS — `@open3cl/engine@1.11.6` requires `node >= 24.14.1`); CI never installs a different version.

## Workflows

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `.github/workflows/ci.yml` | every PR + push to `main` | `Lint (ESLint)` (engine boundary + domain purity), `Typecheck (tsc --noEmit)`, `Tests (Vitest) + coverage gate` (PostGIS service container for PG-backed tests, 80% thresholds on all four metrics, coverage artifact) |
| `.github/workflows/e2e.yml` | PR/push touching `apps/**`, `packages/**`, `tests/e2e/**`, `playwright.config.ts`, lockfile | `E2E (Playwright, AC-P1-05)` — the root `playwright.config.ts` starts the API (`DATABASE_URL=memory://`) and the Vite dev server via `webServer`; report artifact on failure |
| `.github/workflows/benchmark.yml` | every PR + push to `main` + manual dispatch | `Open3CL p95 latency benchmark (Node from .nvmrc)` — fails when p95 >= 3000 ms; report artifact. P2 extends it with `benchmark:simulation` |

Planned later: `docker.yml` (build api/web images to ghcr.io), `dependabot.yml`.

## IMPORTANT: no hashFiles guards (lesson learned)

Earlier versions guarded steps with `if: hashFiles('<marker>') != ''` so CI would skip on the docs-only pre-P0 repo. **In this repository those guards silently evaluated to false even after code landed**: post-P1 `main` push run 44750293527 shows every guarded step `skipped` on all jobs — CI was vacuous ("success" with zero real steps), and the E2E job never ran Playwright despite `playwright.config.ts` existing. Root cause not fully isolated (likely token/tree-read related), but the guards' original purpose ended when P0 merged.

**Current rule: workflows run unconditionally. Do not reintroduce `hashFiles` guards.** If a "run only when X exists" behavior is ever needed again, gate on a boolean env/secret or a matrix input instead, and verify in the run that steps were not skipped.

Related gotcha (verified live earlier): `hashFiles()` in a **job-level** `if` makes the whole run fail instantly with zero jobs — if it is ever used, it must be at step level.

## Branch protection on `main` (active)

- Require a pull request before merging (review required)
- Require status checks: `Lint (ESLint)`, `Typecheck (tsc --noEmit)`, `Tests (Vitest) + coverage gate`, `E2E (Playwright, AC-P1-05)`, `Open3CL p95 latency benchmark (Node from .nvmrc)` — job names must stay stable, protection references them
- Disallow force pushes; no direct pushes to `main`
- Conventional Commits on every PR

## Local equivalent

```bash
npm ci
npm run lint
npm run typecheck
npm run test:coverage   # PG-backed tests need DATABASE_URL (compose db: docker compose -f infrastructure/docker/docker-compose.yml up -d db)
npm run test:e2e        # self-contained: playwright.config.ts starts API (memory://) + Vite dev server
npm run benchmark       # fails when p95 >= 3000 ms
```

## Coverage policy

Minimum 80% on lines, statements, functions, and branches for all new/changed code (enforced by Vitest thresholds in `vitest.config.ts`, failing the `test` job otherwise). Coverage reports are uploaded as CI artifacts (`coverage-report`).

## Verifying CI is real

When reviewing a PR, do not trust a green check alone: open the run and confirm the steps actually executed (not `skipped`). A job that only ran "Set up job"/"Complete job" did no work.
