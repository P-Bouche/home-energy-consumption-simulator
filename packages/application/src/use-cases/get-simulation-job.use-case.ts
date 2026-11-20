import type { SimulationJob, SimulationJobId } from '@hes/domain';
import { SimulationJobNotFoundError } from '../errors.ts';
import type { SimulationRepository } from '../ports/index.ts';

/**
 * Dependencies of {@link GetSimulationJobUseCase}.
 */
export interface GetSimulationJobUseCaseDeps {
  readonly simulationRepository: SimulationRepository;
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const GET_SIMULATION_JOB_USE_CASE = Symbol('GetSimulationJobUseCase');

/**
 * Use case: read one simulation job by id (status polling, TR-P2-04).
 */
export class GetSimulationJobUseCase {
  private readonly simulationRepository: SimulationRepository;

  constructor(deps: GetSimulationJobUseCaseDeps) {
    this.simulationRepository = deps.simulationRepository;
  }

  /**
   * @throws SimulationJobNotFoundError when the id is unknown (HTTP 404)
   */
  async execute(id: SimulationJobId): Promise<SimulationJob> {
    const job = await this.simulationRepository.findJobById(id);
    if (job === null) {
      throw new SimulationJobNotFoundError(id);
    }
    return job;
  }
}
