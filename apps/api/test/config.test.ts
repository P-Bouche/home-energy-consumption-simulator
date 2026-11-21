import { readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

const apiDir = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const originalCwd = process.cwd();

describe('loadConfig()', () => {
  afterEach(() => {
    // chdir is process-global: always restore the original cwd.
    process.chdir(originalCwd);
  });

  describe('default migrationsDir (regression: must not depend on process cwd)', () => {
    // Regression test: `npm run start -w apps/api` starts the API with
    // cwd = apps/api. The default used to be the relative path
    // 'infrastructure/postgres/migrations', which then resolved to
    // apps/api/infrastructure/... (ENOENT) and broke bootstrap.
    const cwds = [
      ['apps/api (npm workspace cwd)', apiDir],
      ['repo root', repoRoot],
      ['os.tmpdir()', os.tmpdir()]
    ] as const;

    for (const [label, cwd] of cwds) {
      it(`resolves to an absolute directory containing 0001_init.sql when cwd is ${label}`, () => {
        try {
          process.chdir(cwd);
          const config = loadConfig({});
          expect(path.isAbsolute(config.migrationsDir)).toBe(true);
          expect(readdirSync(config.migrationsDir)).toContain('0001_init.sql');
          expect(path.resolve(config.migrationsDir)).toBe(
            path.join(repoRoot, 'infrastructure', 'postgres', 'migrations')
          );
        } finally {
          process.chdir(originalCwd);
        }
      });
    }
  });

  it('honors MIGRATIONS_DIR when set', () => {
    const custom = path.join(os.tmpdir(), 'custom-migrations');
    const config = loadConfig({ MIGRATIONS_DIR: custom });
    expect(config.migrationsDir).toBe(custom);
  });

  it('applies local-dev defaults', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.databaseUrl).toBe('postgres://postgres:postgres@localhost:5432/hecs');
    expect(config.corsOrigin).toBe('http://localhost:5173');
    expect(config.maxUploadBytes).toBe(5 * 1024 * 1024);
    expect(config.simulationSyncBudgetMs).toBe(3000);
    expect(config.simulationForceAsync).toBe(false);
  });

  it('rejects a non-positive API_PORT', () => {
    expect(() => loadConfig({ API_PORT: '0' })).toThrow(/API_PORT/);
  });
});
