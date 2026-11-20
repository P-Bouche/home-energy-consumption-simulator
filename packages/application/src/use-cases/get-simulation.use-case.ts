import type { SimulationResultId, SimulationResultRecord } from '@hes/domain';
import { SimulationNotFoundError } from '../errors.ts';
import type { SimulationRepository } from '../ports/index.ts';

/**
 * Dependencies of {@link GetSimulationUseCase}.
 */
export interface GetSimulationUseCaseDeps {
  readonly simulationRepository: SimulationRepository;
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const GET_SIMULATION_USE_CASE = Symbol('GetSimulationUseCase');

/**
 * Use case: read one persisted simulation result by id.
 */
export class GetSimulationUseCase {
  private readonly simulationRepository: SimulationRepository;

  constructor(deps: GetSimulationUseCaseDeps) {
    this.simulationRepository = deps.simulationRepository;
  }

  /**
   * @throws SimulationNotFoundError when the id is unknown (HTTP 404)
   */
  async execute(id: SimulationResultId): Promise<SimulationResultRecord> {
    const record = await this.simulationRepository.findResultById(id);
    if (record === null) {
      throw new SimulationNotFoundError(id);
    }
    return record;
  }
}
