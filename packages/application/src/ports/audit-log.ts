import type { AuditEntry, BuildingId } from '@hes/domain';

/**
 * Port (hexagonal architecture) for the append-only audit log of building
 * edits (P4, FR-P4-03 / TR-P4-03). Implemented by packages/postgres-repository
 * (Postgres, schema v3: the table is append-only, enforced by DB triggers) and
 * by an in-memory adapter when DATABASE_URL=memory://.
 *
 * Writes go through {@link AuditLog.append}; the state update itself is
 * optimistic-locked through BuildingRepository.update and is executed first,
 * so a rejected (409) edit never leaves an orphan audit row.
 */
export interface AuditLog {
  /**
   * Appends one audit entry (append-only: no update/delete exists on this port).
   */
  append(entry: AuditEntry): Promise<void>;

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
