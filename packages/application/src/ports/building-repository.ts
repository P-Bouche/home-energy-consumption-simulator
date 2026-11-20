import type { Building, BuildingId, ImportReport } from '@hes/domain';

/**
 * A building aggregate together with the import report that produced it.
 */
export interface StoredBuilding {
  readonly building: Building;
  readonly report: ImportReport;
}

/**
 * Input accepted by {@link BuildingRepository.save}.
 */
export interface SaveBuildingInput {
  readonly building: Building;
  readonly report: ImportReport;
}

/**
 * Port (hexagonal architecture) for persisting and reading Building
 * aggregates. Implemented by the Postgres adapter (packages/postgres-repository);
 * the application layer depends on this interface only.
 */
export interface BuildingRepository {
  /**
   * Persists a Building aggregate and its import report atomically.
   *
   * @returns the id of the persisted building
   */
  save(input: SaveBuildingInput): Promise<BuildingId>;

  /**
   * Loads a Building aggregate and its import report by id.
   *
   * @returns the stored aggregate, or null when the id is unknown
   */
  findById(id: BuildingId): Promise<StoredBuilding | null>;
}

/**
 * Injection token for the BuildingRepository port (NestJS wiring in apps/api).
 */
export const BUILDING_REPOSITORY = Symbol('BuildingRepository');
