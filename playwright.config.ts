import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('./', import.meta.url));

// Ports are env-driven (API_PORT / WEB_PORT) so parallel agent worktrees can
// run e2e side by side without reusing each other's servers — see
// docs/agents/parallel-worktrees.md. Defaults keep the historical 3000/5173.
const apiPort = process.env['API_PORT'] ?? '3000';
const webPort = process.env['WEB_PORT'] ?? '5173';
const apiUrl = `http://localhost:${apiPort}`;
const webUrl = `http://localhost:${webPort}`;

/**
 * Playwright e2e (AC-P1-05). Starts the NestJS API (in-memory repository via
 * DATABASE_URL=memory://, no Docker needed) and the Vite dev server, then
 * drives the upload page in a real browser.
 *
 * Prerequisites: npm ci && npx playwright install chromium
 * Run with: npm run test:e2e  (or API_PORT=300N WEB_PORT=517N npm run test:e2e
 * in a worktree — never share default ports across worktrees)
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: webUrl,
    launchOptions: {
      // headless Chromium: software WebGL (SwiftShader) so the R3F viewer (P3)
      // renders in CI without a GPU. HES_CHROMIUM_EXECUTABLE optionally points
      // at a custom chromium binary (local sandboxes without system libs).
      args: ['--enable-unsafe-swiftshader'],
      ...(process.env['HES_CHROMIUM_EXECUTABLE'] !== undefined && process.env['HES_CHROMIUM_EXECUTABLE'] !== ''
        ? { executablePath: process.env['HES_CHROMIUM_EXECUTABLE'] }
        : {})
    }
  },
  webServer: [
    {
      command: 'npm run start -w apps/api',
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: 'memory://', API_PORT: apiPort, CORS_ORIGIN: webUrl },
      url: `${apiUrl}/docs-json`,
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000
    },
    {
      command: 'npm run dev',
      cwd: `${repoRoot}apps/web`,
      env: { ...process.env, API_PORT: apiPort, WEB_PORT: webPort },
      url: webUrl,
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000
    }
  ]
});
