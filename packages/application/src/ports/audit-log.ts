import type { AuditEntry, BuildingId } from '@hes/domain';

/**
 * Port (hexagonal architecture) for reading the append-only audit log of
 * building edits (P4, FR-P4-03 / TR-P4-03). Implemented by
 * packages/postgres-repository (Postgres, schema v3: the `audit_entries`
 * table is append-only, enforced by DB triggers) and by an in-memory adapter
 * when DATABASE_URL=memory://.
 *
 * Writes do NOT go through this port: every audit entry is written atomically
 * with the building update, as one unit of work, through
 * `BuildingRepository.update({ …, auditEntry })` (same transaction on
 * Postgres). This port is the read side used by the audit view and by undo.
 */
export interface AuditLog {
  /**
   * @returns all audit entries of a building, oldest first
   */
  listByBuilding(buildingId: BuildingId): Promise<readonly AuditEntry[]>;

  /**
   * @returns the most recent audit entry of a building, or null when the
   * building has never been edited (used by undo, FR-P4-05)
   */
  latestByBuilding(buildingId: BuildingId): Promise<AuditEntry | null>;
}

/**
 * Injection token for the AuditLog port (NestJS wiring in apps/api).
 */
export const AUDIT_LOG = Symbol('AuditLog');
