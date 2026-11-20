import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

/**
 * Applies the versioned SQL migrations found in `migrationsDir` (sorted by
 * filename) inside per-migration transactions, tracked in the
 * `schema_migrations` table. Idempotent: already-applied migrations are
 * skipped.
 *
 * @param pool - pg pool
 * @param migrationsDir - directory containing `<version>_<name>.sql` files
 * @returns the list of migration files applied by this call
 * @throws when a migration fails (transaction rolled back, error rethrown)
 */
export async function runMigrations(pool: Pool, migrationsDir: string): Promise<string[]> {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
  );
  const appliedResult = await pool.query('SELECT version FROM schema_migrations');
  const applied = new Set<string>(
    appliedResult.rows.map((row) => (row as { version: string }).version)
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const appliedNow: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      appliedNow.push(file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return appliedNow;
}
