import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { runMigrations } from '../src/index.ts';

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
    expect(texts[0]).toContain('CREATE TABLE IF NOT EXISTS schema_migrations');
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
});
