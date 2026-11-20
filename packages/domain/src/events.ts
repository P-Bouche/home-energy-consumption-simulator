import type { BuildingId } from './entities.ts';
import type { SimulationErrorCode } from './errors.ts';
import type { SimulationInputHash, SimulationJobId, SimulationResultId } from './simulation-record.ts';

/**
 * Base interface for domain events.
 */
export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
}

/**
 * Emitted by the Building aggregate when a DPE XML has been imported and the
 * aggregate constructed. Used for audit and future IoT sync (P9).
 */
export class BuildingImported implements DomainEvent {
  readonly type = 'BuildingImported';
  readonly buildingId: BuildingId;
  readonly dpeNumber: string | null;
  readonly occurredAt: Date;

  constructor(buildingId: BuildingId, dpeNumber: string | null, occurredAt: Date) {
    this.buildingId = buildingId;
    this.dpeNumber = dpeNumber;
    this.occurredAt = occurredAt;
  }
}

/**
 * Emitted when a simulation of a building completed and its result was
 * persisted (P2, TR-P2-07). Used for audit and future IoT sync (P9).
 */
export class SimulationCompleted implements DomainEvent {
  readonly type = 'SimulationCompleted';
  readonly buildingId: BuildingId;
  readonly resultId: SimulationResultId;
  readonly inputHash: SimulationInputHash;
  readonly occurredAt: Date;

  constructor(
    buildingId: BuildingId,
    resultId: SimulationResultId,
    inputHash: SimulationInputHash,
    occurredAt: Date
  ) {
    this.buildingId = buildingId;
    this.resultId = resultId;
    this.inputHash = inputHash;
    this.occurredAt = occurredAt;
  }
}

/**
 * Emitted when a simulation of a building failed (P2, TR-P2-07). Carries the
 * typed machine-readable error code of the underlying SimulationError.
 */
export class SimulationFailed implements DomainEvent {
  readonly type = 'SimulationFailed';
  readonly buildingId: BuildingId;
  readonly inputHash: SimulationInputHash;
  readonly errorCode: SimulationErrorCode | 'UNEXPECTED';
  readonly message: string;
  readonly jobId: SimulationJobId | null;
  readonly occurredAt: Date;

  constructor(input: {
    buildingId: BuildingId;
    inputHash: SimulationInputHash;
    errorCode: SimulationErrorCode | 'UNEXPECTED';
    message: string;
    jobId?: SimulationJobId | null;
    occurredAt: Date;
  }) {
    this.buildingId = input.buildingId;
    this.inputHash = input.inputHash;
    this.errorCode = input.errorCode;
    this.message = input.message;
    this.jobId = input.jobId ?? null;
    this.occurredAt = input.occurredAt;
  }
}
