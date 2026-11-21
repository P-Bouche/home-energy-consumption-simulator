import type { BuildingId, Scenario, ScenarioId, SimulationResultId } from '@hes/domain';

/**
 * Link between a scenario and one of its persisted simulation results
 * (`scenario_results` table, schema v4).
 */
export interface ScenarioResultLink {
  readonly scenarioId: ScenarioId;
  readonly simulationId: SimulationResultId;
  readonly createdAt: Date;
}

/**
 * Port (hexagonal architecture) for persisting renovation scenarios and their
 * simulation-result links. Implemented by packages/postgres-repository
 * (Postgres, schema v4) and by an in-memory adapter when
 * DATABASE_URL=memory://; the application layer depends on this interface
 * only.
 */
export interface ScenarioRepository {
  /**
   * Persists a new scenario.
   */
  save(scenario: Scenario): Promise<void>;

  /**
   * @returns the scenario by id, or null when unknown
   */
  findById(id: ScenarioId): Promise<Scenario | null>;

  /**
   * @returns all scenarios of a building, oldest first
   */
  findByBuildingId(buildingId: BuildingId): Promise<readonly Scenario[]>;

  /**
   * Replaces the stored scenario (name/description/commands).
   */
  update(scenario: Scenario): Promise<void>;

  /**
   * Deletes a scenario and its result links (never the building or the
   * simulation results themselves — FR-P5-06).
   */
  delete(id: ScenarioId): Promise<void>;

  /**
   * Links a persisted simulation result to a scenario (per-scenario result
   * history). Saving the same (scenarioId, simulationId) twice is idempotent.
   */
  linkResult(link: ScenarioResultLink): Promise<void>;

  /**
   * @returns the most recent simulation result linked to the scenario, or
   * null when the scenario has never been simulated
   */
  findLatestResultId(scenarioId: ScenarioId): Promise<SimulationResultId | null>;

  /**
   * @returns all result links of the scenario, most recent first
   */
  findResultLinks(scenarioId: ScenarioId): Promise<readonly ScenarioResultLink[]>;
}

/**
 * Injection token for the ScenarioRepository port (NestJS wiring in apps/api).
 */
export const SCENARIO_REPOSITORY = Symbol('ScenarioRepository');
