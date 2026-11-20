import type { Building, SimulationResult } from '@hes/domain';

/**
 * Port (hexagonal architecture) for running a regulatory energy simulation.
 *
 * The only implementation allowed to touch the Open3CL engine is
 * packages/open3cl-adapter (ADR-0001). Callers depend on this interface only.
 */
export interface SimulationPort {
  /**
   * Simulates a French DPE XML document and returns the mapped result.
   *
   * @param dpeXml - raw DPE XML content
   * @returns the simulation result (consumption, emissions, labels, raw engine output)
   * @throws InvalidDpeError when the input is empty
   * @throws UnsupportedDpeModelError when the engine does not support the DPE model
   * @throws EngineExecutionError when the engine throws
   * @throws SimulationMappingError when the engine output cannot be mapped
   */
  simulate(dpeXml: string): Promise<SimulationResult>;

  /**
   * Simulates a domain {@link Building} through the engine (P2). The adapter
   * maps the building to the engine input (verbatim retained source document
   * when present, otherwise a field-wise reconstruction with logged defaults)
   * and never mutates the aggregate.
   *
   * @param building - the building aggregate to simulate
   * @returns the simulation result (consumption, emissions, labels, raw engine output)
   * @throws SimulationMappingError when the building cannot be mapped to an engine input or the output cannot be mapped
   * @throws EngineExecutionError when the engine throws
   * @throws UnsupportedDpeModelError when the engine does not support the DPE model
   */
  simulateBuilding(building: Building): Promise<SimulationResult>;

  /**
   * @returns the version of the pinned engine, e.g. "1.11.6" (stored on every persisted result)
   */
  getEngineVersion(): string;
}

/**
 * Injection token for the SimulationPort (NestJS wiring in apps/api).
 */
export const SIMULATION_PORT = Symbol('SimulationPort');
