import type { BuildingId } from '@hes/domain';
import type { BuildingRepository, SaveBuildingInput, StoredBuilding } from '@hes/application';

/**
 * In-memory BuildingRepository used when DATABASE_URL=memory:// (local demos
 * and Playwright e2e without Docker). Not for production persistence.
 */
export class InMemoryBuildingRepository implements BuildingRepository {
  private readonly store = new Map<BuildingId, StoredBuilding>();

  save(input: SaveBuildingInput): Promise<BuildingId> {
    this.store.set(input.building.id, { building: input.building, report: input.report });
    return Promise.resolve(input.building.id);
  }

  findById(id: BuildingId): Promise<StoredBuilding | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
}
