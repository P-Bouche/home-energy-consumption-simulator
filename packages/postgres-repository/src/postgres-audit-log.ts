import { auditEntryFromJson, type AuditEntry, type AuditEntryJson, type BuildingId } from '@hes/domain';
import type { AuditLog } from '@hes/application';
import type { Pool } from 'pg';

/**
 * Postgres adapter for the AuditLog port (P4): reads from the append-only
 * `audit_entries` table (schema v3). Writes go through {@link append}; the
 * append-only triggers of migration 0003_audit.sql reject any later mutation.
 */
export class PostgresAuditLog implements AuditLog {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Appends one audit entry. The table rejects UPDATE/DELETE/TRUNCATE at DB
   * level, so an appended entry can never be silently altered.
   *
   * @throws when the insert fails (error rethrown — never swallowed)
   */
  async append(entry: AuditEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_entries (id, building_id, user_id, command_type, command, changes, version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.id,
        entry.buildingId,
        entry.userId,
        entry.commandType,
        JSON.stringify(entry.command),
        JSON.stringify(entry.changes),
        entry.version,
        entry.timestamp
      ]
    );
  }

  /**
   * @returns all audit entries of a building, oldest first
   */
  async listByBuilding(buildingId: BuildingId): Promise<readonly AuditEntry[]> {
    const result = await this.pool.query(
      `SELECT id, building_id, user_id, command_type, command, changes, version, created_at
       FROM audit_entries WHERE building_id = $1 ORDER BY created_at ASC, id ASC`,
      [buildingId]
    );
    return result.rows.map((row) => auditEntryFromJson(rowToJson(row)));
  }

  /**
   * @returns the most recent audit entry of a building, or null
   */
  async latestByBuilding(buildingId: BuildingId): Promise<AuditEntry | null> {
    const result = await this.pool.query(
      `SELECT id, building_id, user_id, command_type, command, changes, version, created_at
       FROM audit_entries WHERE building_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [buildingId]
    );
    const row = result.rows[0];
    return row === undefined ? null : auditEntryFromJson(rowToJson(row));
  }
}

/**
 * Maps a pg row (snake_case) to the AuditEntryJson contract (camelCase).
 */
function rowToJson(row: Record<string, unknown>): AuditEntryJson {
  return {
    id: row['id'] as string,
    buildingId: row['building_id'] as string,
    userId: row['user_id'] as string,
    timestamp: (row['created_at'] as Date).toISOString(),
    commandType: row['command_type'] as string,
    command: row['command'] as AuditEntryJson['command'],
    changes: row['changes'] as AuditEntryJson['changes'],
    version: row['version'] as number
  };
}
