import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { MIGRATION_LOCK_ID, runMigrations } from '../src/index.ts';

interface Call {
  text: string;
  values?: unknown[];
}

function fakePool(existingVersions: string[] = []): { pool: Pool; calls: Call[] } {
  const calls: Call[] = [];
  const applied = new Set(existingVersions);
  const result = (rows: Record<string, unknown>[]): QueryResult =>
    ({ rows, rowCount: rows.length, command: '', oid: 0, fields: [] }) as QueryResult;
  const client: PoolClient = {
    query: (text: string, values?: unknown[]) => {
      calls.push({ text, values });
      if (text === 'SELECT version FROM schema_migrations') {
        return Promise.resolve(result([...applied].map((v) => ({ version: v }))));
      }
      if (text.startsWith('INSERT INTO schema_migrations')) {
        applied.add(values?.[0] as string);
      }
      return Promise.resolve(result([]));
    },
    release: () => undefined
  } as unknown as PoolClient;
  const pool = {
    connect: () => Promise.resolve(client),
    query: (text: string, values?: unknown[]) => {
      calls.push({ text, values });
      if (text === 'SELECT version FROM schema_migrations') {
        return Promise.resolve(result([...applied].map((v) => ({ version: v }))));
      }
      if (text.startsWith('INSERT INTO schema_migrations')) {
        applied.add(values?.[0] as string);
      }
      return Promise.resolve(result([]));
    }
  } as unknown as Pool;
  return { pool, calls };
}

describe('runMigrations', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function makeDir(files: Record<string, string>): string {
    dir = mkdtempSync(path.join(tmpdir(), 'hes-migrations-'));
    for (const [name, sql] of Object.entries(files)) {
      writeFileSync(path.join(dir, name), sql);
    }
    return dir;
  }

  it('applies pending migrations in sorted order, each in a transaction', async () => {
    const d = makeDir({
      '0002_second.sql': 'CREATE TABLE b (id int);',
      '0001_first.sql': 'CREATE TABLE a (id int);'
    });
    const { pool, calls } = fakePool();
    const applied = await runMigrations(pool, d);
    expect(applied).toEqual(['0001_first.sql', '0002_second.sql']);
    const texts = calls.map((c) => c.text);
    expect(texts[0]).toBe('SELECT pg_advisory_lock($1)');
    expect(calls[0]?.values).toEqual([MIGRATION_LOCK_ID]);
    expect(texts[texts.length - 1]).toBe('SELECT pg_advisory_unlock($1)');
    expect(texts[1]).toContain('CREATE TABLE IF NOT EXISTS schema_migrations');
    expect(texts.filter((t) => t === 'BEGIN')).toHaveLength(2);
    expect(texts.filter((t) => t === 'COMMIT')).toHaveLength(2);
    expect(texts).toContain('CREATE TABLE a (id int);');
    expect(texts).toContain('CREATE TABLE b (id int);');
    expect(texts.filter((t) => t.startsWith('INSERT INTO schema_migrations'))).toHaveLength(2);
  });

  it('is idempotent: skips already-applied migrations', async () => {
    const d = makeDir({ '0001_first.sql': 'CREATE TABLE a (id int);' });
    const { pool, calls } = fakePool(['0001_first.sql']);
    const applied = await runMigrations(pool, d);
    expect(applied).toEqual([]);
    expect(calls.map((c) => c.text)).not.toContain('CREATE TABLE a (id int);');
  });

  it('holds the advisory lock for the whole run (concurrent starters serialize)', async () => {
    const d = makeDir({ '0001_first.sql': 'CREATE TABLE a (id int);' });
    const { pool, calls } = fakePool();
    await runMigrations(pool, d);
    const lockIndex = calls.findIndex((c) => c.text === 'SELECT pg_advisory_lock($1)');
    const unlockIndex = calls.findIndex((c) => c.text === 'SELECT pg_advisory_unlock($1)');
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(unlockIndex).toBeGreaterThan(lockIndex);
  });

  it('propagates the original error (not the rollback failure) when ROLLBACK itself throws', async () => {
    const d = makeDir({ '0001_first.sql': 'THIS IS NOT SQL;' });
    const client = {
      query: (text: string) => {
        if (text === 'THIS IS NOT SQL;' || text === 'ROLLBACK') {
          return Promise.reject(new Error(text === 'ROLLBACK' ? 'connection dead' : 'syntax error'));
        }
        return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as QueryResult);
      },
      release: () => undefined
    } as unknown as PoolClient;
    const pool = { connect: () => Promise.resolve(client) } as unknown as Pool;
    const error = await runMigrations(pool, d).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('syntax error');
    expect((error as Error & { rollbackError?: unknown }).rollbackError).toBeInstanceOf(Error);
    expect(((error as Error & { rollbackError?: Error }).rollbackError as Error).message).toBe('connection dead');
  });

  it('rolls back and rethrows when a migration fails', async () => {
    const d = makeDir({ '0001_first.sql': 'THIS IS NOT SQL;' });
    const calls: Call[] = [];
    const client = {
      query: (text: string) => {
        calls.push({ text });
        if (text === 'THIS IS NOT SQL;') return Promise.reject(new Error('syntax error'));
        return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as QueryResult);
      },
      release: () => undefined
    } as unknown as PoolClient;
    const pool = {
      connect: () => Promise.resolve(client),
      query: (text: string) => {
        calls.push({ text });
        return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as QueryResult);
      }
    } as unknown as Pool;
    await expect(runMigrations(pool, d)).rejects.toThrow('syntax error');
    expect(calls.map((c) => c.text)).toContain('ROLLBACK');
  });

  it('the checked-in migration set is schema v1 + v2 (P2 simulations) + v3 (P4 audit) + v4 (P5 scenarios)', () => {
    const realDir = fileURLToPath(new URL('../../../infrastructure/postgres/migrations', import.meta.url));
    const files = readdirSync(realDir).filter((f) => f.endsWith('.sql')).sort();
    expect(files).toEqual(['0001_init.sql', '0002_simulations.sql', '0003_audit.sql', '0004_scenarios.sql']);
    const v2 = readFileSync(path.join(realDir, '0002_simulations.sql'), 'utf8');
    expect(v2).toContain('CREATE TABLE IF NOT EXISTS simulations');
    expect(v2).toContain('CREATE TABLE IF NOT EXISTS simulation_jobs');
    expect(v2).toContain("WHERE status IN ('queued', 'running')");
    const v3 = readFileSync(path.join(realDir, '0003_audit.sql'), 'utf8');
    expect(v3).toContain('ADD COLUMN IF NOT EXISTS version');
    expect(v3).toContain('CREATE TABLE IF NOT EXISTS audit_entries');
    expect(v3).toContain('audit_entries_no_row_mutation');
    expect(v3).toContain('audit_entries_no_truncate');
    const v4 = readFileSync(path.join(realDir, '0004_scenarios.sql'), 'utf8');
    expect(v4).toContain('CREATE TABLE IF NOT EXISTS scenarios');
    expect(v4).toContain('CREATE TABLE IF NOT EXISTS scenario_results');
    expect(v4).toContain('baseline_version integer NOT NULL CHECK (baseline_version >= 0)');
    // v4 must NOT re-define the v3 objects (P4 owns buildings.version + audit_entries)
    expect(v4).not.toContain('CREATE TABLE IF NOT EXISTS audit_entries');
    expect(v4).not.toContain('ADD COLUMN IF NOT EXISTS version');
    expect(v4).not.toMatch(/ALTER TABLE buildings/);
  });
});
