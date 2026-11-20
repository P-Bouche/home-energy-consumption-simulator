import { getVersion, type EngineDpeResult } from '@open3cl/engine';
import type { SimulationPort } from '@hes/application';
import {
  EngineExecutionError,
  InvalidDpeError,
  toSimulationView,
  UnsupportedDpeModelError,
  type Building,
  type SimulationResult
} from '@hes/domain';
import { getEngineRunner } from './engine-runner.ts';
import { mapEngineResult } from './map-engine-result.ts';
import { buildEngineInput, type MappingDefault } from './map-building-to-engine-input.ts';

/**
 * Minimal logger used by the adapter to report engine-input defaults
 * (confidence-annotated) — defaults are logged, never applied silently.
 */
export interface AdapterLogger {
  warn(message: string): void;
}

const defaultLogger: AdapterLogger = {
  warn: (message) => console.warn(message)
};

/**
 * SimulationPort adapter backed by the pinned Open3CL engine (@open3cl/engine@1.11.6).
 *
 * This package is the single place in the monorepo that touches the engine
 * (enforced by ESLint no-restricted-imports). The engine itself runs in a
 * dedicated worker thread (engine-runner.ts + engine-worker.mjs): it is
 * synchronous and CPU-bound, so calling it on the main thread would block the
 * API event loop for the whole simulation. Open3CL stays the single source of
 * truth: no 3CL formula is re-implemented here, only input/output mapping.
 */
export class Open3clAdapter implements SimulationPort {
  private readonly logger: AdapterLogger;

  constructor(logger: AdapterLogger = defaultLogger) {
    this.logger = logger;
  }

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
    return this.runEngine(() => getEngineRunner().run({ kind: 'xml', xml: dpeXml }));
  }

  /**
   * Simulates a domain Building through Open3CL (P2, FR-P2-01).
   *
   * The building is projected to a read-only {@link BuildingSimulationView}
   * (the aggregate is never mutated), mapped to the engine input
   * (verbatim retained source document when present, otherwise a field-wise
   * reconstruction whose defaults are logged with their confidence), executed
   * via `calcul_3cl_xml` / `calcul_3cl`, and mapped back to SimulationResult.
   *
   * @param building - the building aggregate to simulate
   * @throws SimulationMappingError when the engine output cannot be mapped
   * @throws EngineExecutionError when the engine throws
   * @throws UnsupportedDpeModelError when the engine returns null
   */
  async simulateBuilding(building: Building): Promise<SimulationResult> {
    const view = toSimulationView(building);
    const mapping = buildEngineInput(view);
    if (mapping.verbatimSource) {
      this.logger.warn(
        `simulation of building ${view.id}: engine input is the verbatim retained source DPE document (measured, confidence 1)`
      );
    } else {
      for (const d of mapping.defaults) {
        this.logger.warn(
          `simulation of building ${view.id}: engine-input default at ${d.path} = ${JSON.stringify(d.value)} (source ${d.source}, confidence ${d.confidence})`
        );
      }
      if (mapping.defaults.length === 0) {
        this.logger.warn(
          `simulation of building ${view.id}: engine input reconstructed from the domain model (no defaults needed)`
        );
      }
    }
    const input = mapping.input;
    return this.runEngine(() =>
      getEngineRunner().run(
        input.kind === 'xml' ? { kind: 'xml', xml: input.xml } : { kind: 'json', json: input.json }
      )
    );
  }

  /**
   * Returns the version of the embedded Open3CL engine, e.g. "1.11.6".
   */
  getEngineVersion(): string {
    return getVersion();
  }

  private async runEngine(run: () => Promise<EngineDpeResult | null>): Promise<SimulationResult> {
    let engineResult: EngineDpeResult | null;
    try {
      engineResult = await run();
    } catch (error) {
      throw new EngineExecutionError('Open3CL engine threw while processing the DPE input.', {
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
}

/**
 * Creates an Open3clAdapter instance.
 */
export function createOpen3clAdapter(logger?: AdapterLogger): Open3clAdapter {
  return new Open3clAdapter(logger);
}

export type { MappingDefault };
