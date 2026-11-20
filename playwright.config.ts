import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('./', import.meta.url));

/**
 * Playwright e2e (AC-P1-05). Starts the NestJS API (in-memory repository via
 * DATABASE_URL=memory://, no Docker needed) and the Vite dev server, then
 * drives the upload page in a real browser.
 *
 * Prerequisites: npm ci && npx playwright install chromium
 * Run with: npm run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173'
  },
  webServer: [
    {
      command: 'npm run start -w apps/api',
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: 'memory://', API_PORT: '3000' },
      url: 'http://localhost:3000/docs-json',
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000
    },
    {
      command: 'npm run dev',
      cwd: `${repoRoot}apps/web`,
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000
    }
  ]
});
