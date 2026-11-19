import type { SimulationResult } from '@hes/domain';

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
}
