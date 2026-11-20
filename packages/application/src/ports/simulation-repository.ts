import type {
  BuildingId,
  SimulationInputHash,
  SimulationJob,
  SimulationJobId,
  SimulationResultId,
  SimulationResultRecord
} from '@hes/domain';

/**
 * Port (hexagonal architecture) for persisting simulation results and jobs.
 * Implemented by packages/postgres-repository (Postgres, schema v2) and by an
 * in-memory adapter when DATABASE_URL=memory://; the application layer
 * depends on this interface only.
 */
export interface SimulationRepository {
  /**
   * Persists a simulation result. Implementations enforce uniqueness of
   * (buildingId, inputHash): saving the same input twice is the cache path,
   * not a duplicate row.
   *
   * @returns the persisted winning record — on a conflict (identical input
   * hash persisted concurrently) the already-stored row, so callers never
   * hold a record that was not persisted (which would 404 on later reads).
   */
  saveResult(record: SimulationResultRecord): Promise<SimulationResultRecord>;

  /**
   * @returns the persisted result by id, or null when unknown
   */
  findResultById(id: SimulationResultId): Promise<SimulationResultRecord | null>;

  /**
   * @returns all results of a building, most recent first (history, FR-P2-02)
   */
  findResultsByBuildingId(buildingId: BuildingId): Promise<readonly SimulationResultRecord[]>;

  /**
   * Cache lookup (FR-P2-03 / TR-P2-05): the result previously computed for
   * exactly this building input hash, or null.
   */
  findResultByInputHash(
    buildingId: BuildingId,
    inputHash: SimulationInputHash
  ): Promise<SimulationResultRecord | null>;

  /**
   * Persists a newly queued job.
   */
  saveJob(job: SimulationJob): Promise<void>;

  /**
   * Persists a job state transition (queued -> running -> done | failed).
   */
  updateJob(job: SimulationJob): Promise<void>;

  /**
   * @returns the job by id, or null when unknown
   */
  findJobById(id: SimulationJobId): Promise<SimulationJob | null>;

  /**
   * @returns the in-flight (queued | running) job for this exact building
   * input hash, or null. Used to answer 409 on duplicate in-flight requests.
   */
  findActiveJobByInputHash(
    buildingId: BuildingId,
    inputHash: SimulationInputHash
  ): Promise<SimulationJob | null>;
}

/**
 * Injection token for the SimulationRepository port (NestJS wiring in apps/api).
 */
export const SIMULATION_REPOSITORY = Symbol('SimulationRepository');
