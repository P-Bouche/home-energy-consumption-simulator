# CI / CD

GitHub Actions only. Node version is pinned via `.nvmrc` (Node 24 LTS — `@open3cl/engine@1.11.6` requires `node >= 24.14.1`); CI never installs a different version.

## Workflows

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `.github/workflows/ci.yml` | every PR + push to `main` | `lint` (ESLint, incl. the `@open3cl/engine` boundary rule), `typecheck` (`tsc --noEmit`, strict), `test` (Vitest + v8 coverage, thresholds 80% lines/statements/functions/branches, PostGIS service container, coverage artifact) |
| `.github/workflows/e2e.yml` | PR/push touching `apps/**`, `packages/**`, `tests/e2e/**` | `e2e` (Playwright against PostGIS + `apps/api` + built `apps/web`, report artifact on failure) |

Planned later: `docker.yml` (build api/web images → ghcr.io), `benchmark.yml` (p50/p95/max on Node 24, PR comment), `dependabot.yml`.

## Progressive guards

Until the corresponding scaffolding exists, steps carry `if: hashFiles('<marker>') != ''` and skip cleanly:

- `ci.yml`: marker = `package.json` (repo is docs-only before P0)
- `e2e.yml`: marker = `tests/e2e/playwright.config.ts` (before P1)

Gotcha (verified live): `hashFiles()` must be used at **step level** — a job-level `if: hashFiles(...)` makes the run fail instantly with zero jobs.

## Branch protection on `main` (active)

- Require a pull request before merging
- Require status checks: `Lint (ESLint)`, `Typecheck (tsc --noEmit)`, `Tests (Vitest) + coverage gate`, and `E2E (Playwright: web + api + PostGIS)` once e2e is active
- Disallow force pushes; no direct pushes to `main`
- Conventional Commits on every PR

## Local equivalent

```bash
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e   # needs the compose db running: docker compose -f infrastructure/docker/docker-compose.yml up -d db
```

## Coverage policy

Minimum 80% on lines, statements, functions, and branches for all new/changed code (enforced by Vitest thresholds in `vitest.config.ts`, failing the `test` job otherwise). Coverage reports are uploaded as CI artifacts (`coverage-report`).
