import { randomUUID } from 'node:crypto';
import {
  createSimulationResultRecord,
  SimulationCompleted,
  SimulationError,
  SimulationFailed,
  type Building,
  type DomainEvent,
  type SimulationInputHash,
  type SimulationResultRecord
} from '@hes/domain';
import { computeBuildingInputHash } from '../building-input-hash.ts';
import { SimulationAlreadyInFlightError } from '../errors.ts';
import type { Logger } from '../logger.ts';
import { consoleLogger } from '../logger.ts';
import type { SimulationRepository, SimulationPort } from '../ports/index.ts';

/**
 * Dependencies of {@link runInlineSimulation} — the single shared inline
 * simulation path of the application layer (P2 baseline + P5 scenarios).
 */
export interface InlineSimulationDeps {
  readonly simulationRepository: SimulationRepository;
  readonly simulation: SimulationPort;
  readonly logger?: Logger;
  readonly now?: () => Date;
  readonly eventSink?: (event: DomainEvent) => void;
}

/**
 * Outcome of {@link runInlineSimulation}.
 */
export type InlineSimulationOutcome = {
  readonly kind: 'cached' | 'completed';
  readonly record: SimulationResultRecord;
  readonly events: DomainEvent[];
};

/**
 * The ONE shared inline simulation path (cache → 409 in-flight → engine →
 * persist), used by RunSimulationUseCase's sync path (P2) and by the P5
 * scenario use cases (baseline/scenario states, incl. `Building.fork`
 * projections). Never queued — see the note on RunSimulationUseCase.
 *
 * Semantics: the cache key is the canonical input hash of the exact building
 * state passed in, so a cached record is by construction the result of this
 * state; an in-flight identical job → {@link SimulationAlreadyInFlightError};
 * a persistence race on (buildingId, inputHash) serves the persisted winner.
 *
 * @throws SimulationAlreadyInFlightError when the same input hash has an in-flight job (HTTP 409)
 * @throws SimulationError subclasses from the engine path (HTTP 422/500)
 */
export async function runInlineSimulation(
  deps: InlineSimulationDeps,
  building: Building
): Promise<InlineSimulationOutcome> {
  const logger = deps.logger ?? consoleLogger;
  const now = deps.now ?? (() => new Date());
  const inputHash: SimulationInputHash = computeBuildingInputHash(building);
  const buildingId = building.id;

  const cached = await deps.simulationRepository.findResultByInputHash(buildingId, inputHash);
  if (cached !== null) {
    logger.log(`simulation cache hit for building ${buildingId} (hash ${inputHash}) — no engine call`);
    return { kind: 'cached', record: cached, events: [] };
  }

  const active = await deps.simulationRepository.findActiveJobByInputHash(buildingId, inputHash);
  if (active !== null) {
    throw new SimulationAlreadyInFlightError(active.id, inputHash);
  }

  let result;
  try {
    result = await deps.simulation.simulateBuilding(building);
  } catch (error) {
    const code = error instanceof SimulationError ? error.code : 'UNEXPECTED';
    const message = error instanceof Error ? error.message : String(error);
    deps.eventSink?.(
      new SimulationFailed({ buildingId, inputHash, errorCode: code, message, occurredAt: now() })
    );
    logger.error(`simulation of building ${buildingId} failed: [${code}] ${message}`);
    throw error;
  }
  const record = createSimulationResultRecord({
    ...result,
    id: randomUUID(),
    buildingId,
    inputHash,
    engineVersion: deps.simulation.getEngineVersion(),
    createdAt: now()
  });
  const persisted = await deps.simulationRepository.saveResult(record);
  if (persisted.id !== record.id) {
    // A concurrent identical run won the (buildingId, inputHash) uniqueness
    // race: serve the persisted winner instead of an unpersisted record.
    logger.log(
      `simulation of building ${buildingId} lost the persistence race: serving cached result ${persisted.id} (hash ${inputHash})`
    );
    return { kind: 'cached', record: persisted, events: [] };
  }
  const events: DomainEvent[] = [new SimulationCompleted(buildingId, persisted.id, inputHash, now())];
  for (const event of events) {
    deps.eventSink?.(event);
  }
  logger.log(`simulation of building ${buildingId} completed: result ${persisted.id} (hash ${inputHash})`);
  return { kind: 'completed', record: persisted, events };
}
