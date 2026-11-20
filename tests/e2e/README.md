# tests/e2e — Playwright end-to-end tests

AC-P1-05 lives here: `import-report.spec.ts` starts the NestJS API (in-memory
repository, `DATABASE_URL=memory://`) and the Vite dev server via the
Playwright `webServer` config, uploads a DPE fixture in the real UI and
asserts the import report is displayed.

```bash
npm ci
npx playwright install chromium
npm run test:e2e
```

Config: [playwright.config.ts](../../playwright.config.ts) (repo root).
