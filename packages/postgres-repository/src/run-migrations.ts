import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

/**
 * Session-level advisory lock key guarding migration application, so two
 * processes starting simultaneously cannot both apply the same migration.
 */
export const MIGRATION_LOCK_ID = 721984513011;

/**
 * Applies the versioned SQL migrations found in `migrationsDir` (sorted by
 * filename) inside per-migration transactions, tracked in the
 * `schema_migrations` table. Idempotent: already-applied migrations are
 * skipped. The whole run holds `pg_advisory_lock(MIGRATION_LOCK_ID)` on a
 * single dedicated connection, so concurrent starters serialize.
 *
 * @param pool - pg pool
 * @param migrationsDir - directory containing `<version>_<name>.sql` files
 * @returns the list of migration files applied by this call
 * @throws when a migration fails (transaction rolled back, error rethrown;
 * the rollback failure never masks the original error)
 */
export async function runMigrations(pool: Pool, migrationsDir: string): Promise<string[]> {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    try {
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
      );
      const appliedResult = await client.query('SELECT version FROM schema_migrations');
      const applied = new Set<string>(
        appliedResult.rows.map((row) => (row as { version: string }).version)
      );
      const appliedNow: string[] = [];
      for (const file of files) {
        if (applied.has(file)) continue;
        const sql = await readFile(path.join(migrationsDir, file), 'utf8');
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
          await client.query('COMMIT');
          appliedNow.push(file);
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            if (error instanceof Error) {
              (error as Error & { rollbackError?: unknown }).rollbackError = rollbackError;
            }
          }
          throw error;
        }
      }
      return appliedNow;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}
