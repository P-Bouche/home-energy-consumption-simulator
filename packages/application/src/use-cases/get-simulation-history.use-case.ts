import type { BuildingId, SimulationResultRecord } from '@hes/domain';
import { BuildingNotFoundError } from '../errors.ts';
import type { BuildingRepository, SimulationRepository } from '../ports/index.ts';

/**
 * Result of {@link GetSimulationHistoryUseCase.execute} (FR-P2-02).
 */
export interface GetSimulationHistoryResult {
  readonly buildingId: BuildingId;
  readonly results: readonly SimulationResultRecord[];
}

/**
 * Dependencies of {@link GetSimulationHistoryUseCase}.
 */
export interface GetSimulationHistoryUseCaseDeps {
  readonly buildingRepository: BuildingRepository;
  readonly simulationRepository: SimulationRepository;
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const GET_SIMULATION_HISTORY_USE_CASE = Symbol('GetSimulationHistoryUseCase');

/**
 * Use case: list the historized simulation results of a building, most recent
 * first.
 */
export class GetSimulationHistoryUseCase {
  private readonly buildingRepository: BuildingRepository;
  private readonly simulationRepository: SimulationRepository;

  constructor(deps: GetSimulationHistoryUseCaseDeps) {
    this.buildingRepository = deps.buildingRepository;
    this.simulationRepository = deps.simulationRepository;
  }

  /**
   * @throws BuildingNotFoundError when the building id is unknown (HTTP 404)
   */
  async execute(buildingId: BuildingId): Promise<GetSimulationHistoryResult> {
    const stored = await this.buildingRepository.findById(buildingId);
    if (stored === null) {
      throw new BuildingNotFoundError(buildingId);
    }
    const results = await this.simulationRepository.findResultsByBuildingId(buildingId);
    return { buildingId, results };
  }
}
