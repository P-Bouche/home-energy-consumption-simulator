import type { BuildingId, SimulationInputHash, SimulationJobId, SimulationResultId } from '@hes/domain';

/**
 * Raised when no building exists for the requested id (mapped to HTTP 404).
 */
export class BuildingNotFoundError extends Error {
  readonly code = 'BUILDING_NOT_FOUND';
  readonly buildingId: BuildingId;

  constructor(buildingId: BuildingId) {
    super(`no building found with id ${buildingId}`);
    this.name = 'BuildingNotFoundError';
    this.buildingId = buildingId;
  }
}

/**
 * Raised when no persisted simulation result exists for the requested id
 * (mapped to HTTP 404).
 */
export class SimulationNotFoundError extends Error {
  readonly code = 'SIMULATION_NOT_FOUND';
  readonly simulationId: SimulationResultId;

  constructor(simulationId: SimulationResultId) {
    super(`no simulation result found with id ${simulationId}`);
    this.name = 'SimulationNotFoundError';
    this.simulationId = simulationId;
  }
}

/**
 * Raised when no simulation job exists for the requested id (mapped to HTTP 404).
 */
export class SimulationJobNotFoundError extends Error {
  readonly code = 'SIMULATION_JOB_NOT_FOUND';
  readonly jobId: SimulationJobId;

  constructor(jobId: SimulationJobId) {
    super(`no simulation job found with id ${jobId}`);
    this.name = 'SimulationJobNotFoundError';
    this.jobId = jobId;
  }
}

/**
 * Raised when a simulation is requested for a building input hash that already
 * has an in-flight job (mapped to HTTP 409; the response carries the existing
 * job id so the client can poll it).
 */
export class SimulationAlreadyInFlightError extends Error {
  readonly code = 'SIMULATION_IN_FLIGHT';
  readonly jobId: SimulationJobId;
  readonly inputHash: SimulationInputHash;

  constructor(jobId: SimulationJobId, inputHash: SimulationInputHash) {
    super(`a simulation for input hash ${inputHash} is already in flight (job ${jobId})`);
    this.name = 'SimulationAlreadyInFlightError';
    this.jobId = jobId;
    this.inputHash = inputHash;
  }
}
