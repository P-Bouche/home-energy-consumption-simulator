import { calcul_3cl_xml, getVersion, type EngineDpeResult } from '@open3cl/engine';
import type { SimulationPort } from '@hes/application';
import {
  EngineExecutionError,
  InvalidDpeError,
  UnsupportedDpeModelError,
  type SimulationResult
} from '@hes/domain';
import { mapEngineResult } from './map-engine-result.ts';

/**
 * SimulationPort adapter backed by the pinned Open3CL engine (@open3cl/engine@1.11.6).
 *
 * This class is the single place in the monorepo that calls the engine
 * (enforced by ESLint no-restricted-imports). Open3CL stays the single source
 * of truth: no 3CL formula is re-implemented here, only output mapping.
 */
export class Open3clAdapter implements SimulationPort {
  /**
   * Simulates a DPE XML document through Open3CL and maps the output to SimulationResult.
   *
   * @param dpeXml - raw DPE XML content
   * @throws InvalidDpeError when dpeXml is empty
   * @throws EngineExecutionError when the engine throws (e.g. malformed XML)
   * @throws UnsupportedDpeModelError when the engine returns null (unsupported DPE model)
   * @throws SimulationMappingError when the engine output cannot be mapped
   */
  async simulate(dpeXml: string): Promise<SimulationResult> {
    if (typeof dpeXml !== 'string' || dpeXml.trim().length === 0) {
      throw new InvalidDpeError('DPE XML content must be a non-empty string.');
    }

    let engineResult: EngineDpeResult | null;
    try {
      engineResult = calcul_3cl_xml(dpeXml, { sanitize: true });
    } catch (error) {
      throw new EngineExecutionError('Open3CL engine threw while processing the DPE XML.', {
        cause: error
      });
    }

    if (engineResult === null || engineResult === undefined) {
      throw new UnsupportedDpeModelError(
        'Open3CL returned no result: the DPE model is not supported by engine 1.11.6 ' +
          '(only "dpe 3cl 2021 méthode logement" is implemented).'
      );
    }

    return mapEngineResult(engineResult);
  }

  /**
   * Returns the version of the embedded Open3CL engine, e.g. "1.11.6".
   */
  getEngineVersion(): string {
    return getVersion();
  }
}

/**
 * Creates an Open3clAdapter instance.
 */
export function createOpen3clAdapter(): Open3clAdapter {
  return new Open3clAdapter();
}
