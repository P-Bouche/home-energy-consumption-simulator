import type { AuditEntry, Building, BuildingId, ImportReport } from '@hes/domain';

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
 * Input accepted by {@link BuildingRepository.update} (P4): an edited
 * aggregate plus the version the caller based its edit on.
 */
export interface UpdateBuildingInput {
  readonly building: Building;
  readonly report: ImportReport;
  /**
   * The version the caller read before editing. Implementations MUST reject
   * the update with {@link StaleVersionError} when the persisted version
   * differs (optimistic locking, HTTP 409).
   */
  readonly expectedVersion: number;
  /**
   * The audit entry of this edit. Implementations MUST write it in the SAME
   * transaction as the building update (one unit of work): a committed edit
   * without its audit row — or an audit row for a rejected edit — would break
   * the audit trail and undo.
   */
  readonly auditEntry: AuditEntry;
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

  /**
   * Persists an edited Building aggregate AND its audit entry atomically, with
   * optimistic locking (P4, TR-P4-02): the update only lands when the
   * persisted version still equals `expectedVersion`. One transaction
   * (Postgres: `SELECT … FOR UPDATE` + conditional `UPDATE` + audit `INSERT`).
   *
   * @returns the stored aggregate after the update
   * @throws StaleVersionError when another edit landed first (HTTP 409; nothing is written)
   * @throws BuildingNotFoundError when the id is unknown (HTTP 404)
   */
  update(input: UpdateBuildingInput): Promise<StoredBuilding>;
}

/**
 * Injection token for the BuildingRepository port (NestJS wiring in apps/api).
 */
export const BUILDING_REPOSITORY = Symbol('BuildingRepository');
