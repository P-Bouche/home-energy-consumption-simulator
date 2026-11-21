import type { BuildingId } from '@hes/domain';
import { BuildingNotFoundError, StaleVersionError } from '@hes/application';
import type { BuildingRepository, SaveBuildingInput, StoredBuilding, UpdateBuildingInput } from '@hes/application';
import type { InMemoryAuditLog } from './in-memory-audit-log.ts';

/**
 * In-memory BuildingRepository used when DATABASE_URL=memory:// (local demos
 * and Playwright e2e without Docker). Not for production persistence.
 * Implements the same optimistic locking and the same atomic state+audit
 * write as the Postgres adapter (schema v3): `update` only lands when the
 * stored version equals `expectedVersion`, and records the audit entry on the
 * shared in-memory audit log in the same call.
 */
export class InMemoryBuildingRepository implements BuildingRepository {
  private readonly store = new Map<BuildingId, StoredBuilding>();
  private readonly auditLog: InMemoryAuditLog | null;

  constructor(auditLog: InMemoryAuditLog | null = null) {
    this.auditLog = auditLog;
  }

  save(input: SaveBuildingInput): Promise<BuildingId> {
    this.store.set(input.building.id, { building: input.building, report: input.report });
    return Promise.resolve(input.building.id);
  }

  findById(id: BuildingId): Promise<StoredBuilding | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }

  update(input: UpdateBuildingInput): Promise<StoredBuilding> {
    const current = this.store.get(input.building.id);
    if (current === undefined) {
      return Promise.reject(new BuildingNotFoundError(input.building.id));
    }
    if (current.building.version !== input.expectedVersion) {
      return Promise.reject(
        new StaleVersionError(input.building.id, input.expectedVersion, current.building.version)
      );
    }
    this.auditLog?.record(input.auditEntry);
    const stored: StoredBuilding = { building: input.building, report: input.report };
    this.store.set(input.building.id, stored);
    return Promise.resolve(stored);
  }
}
