import type { AuditEntry, BuildingId } from '@hes/domain';
import type { AuditLog } from '@hes/application';

/**
 * In-memory AuditLog used when DATABASE_URL=memory:// (local demos and
 * Playwright e2e without Docker). Not for production persistence; the
 * append-only guarantee is a DB-level concern of the Postgres adapter.
 *
 * `record` (not on the port) is called synchronously by
 * InMemoryBuildingRepository.update so the state write and the audit write
 * are one atomic unit, like the Postgres transaction.
 */
export class InMemoryAuditLog implements AuditLog {
  private readonly entries = new Map<BuildingId, AuditEntry[]>();

  /**
   * Records one audit entry (called by the in-memory building repository
   * inside its atomic update).
   */
  record(entry: AuditEntry): void {
    const list = this.entries.get(entry.buildingId) ?? [];
    list.push(entry);
    this.entries.set(entry.buildingId, list);
  }

  listByBuilding(buildingId: BuildingId): Promise<readonly AuditEntry[]> {
    return Promise.resolve([...(this.entries.get(buildingId) ?? [])]);
  }

  latestByBuilding(buildingId: BuildingId): Promise<AuditEntry | null> {
    const list = this.entries.get(buildingId) ?? [];
    return Promise.resolve(list[list.length - 1] ?? null);
  }
}
