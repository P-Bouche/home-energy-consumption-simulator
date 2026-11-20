import type { AuditEntry, BuildingId } from '@hes/domain';
import type { AuditLog } from '@hes/application';

/**
 * In-memory AuditLog used when DATABASE_URL=memory:// (local demos and
 * Playwright e2e without Docker). Not for production persistence; the
 * append-only guarantee is a DB-level concern of the Postgres adapter.
 */
export class InMemoryAuditLog implements AuditLog {
  private readonly entries = new Map<BuildingId, AuditEntry[]>();

  append(entry: AuditEntry): Promise<void> {
    const list = this.entries.get(entry.buildingId) ?? [];
    list.push(entry);
    this.entries.set(entry.buildingId, list);
    return Promise.resolve();
  }

  listByBuilding(buildingId: BuildingId): Promise<readonly AuditEntry[]> {
    return Promise.resolve([...(this.entries.get(buildingId) ?? [])]);
  }

  latestByBuilding(buildingId: BuildingId): Promise<AuditEntry | null> {
    const list = this.entries.get(buildingId) ?? [];
    return Promise.resolve(list[list.length - 1] ?? null);
  }
}
