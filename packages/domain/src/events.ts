import type { BuildingCommand } from './commands.ts';
import type { ConfidenceJson } from './confidence.ts';
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
 * One field-level change applied to the building by a command (P4): the field
 * name, and the previous / new values as Confidence JSON (so the audit trail
 * keeps the provenance — e.g. `source: "user"`, confidence 1.0).
 */
export interface FieldChange {
  readonly field: string;
  readonly oldValue: ConfidenceJson<unknown> | null;
  readonly newValue: ConfidenceJson<unknown> | null;
}

/**
 * Emitted by the Building aggregate when a validated command has been applied
 * (P4, TR-P4-06). Carries the command and the old→new field changes so the
 * application layer can build the audit entry.
 */
export class BuildingUpdated implements DomainEvent {
  readonly type = 'BuildingUpdated';
  readonly buildingId: BuildingId;
  readonly userId: string;
  readonly command: BuildingCommand;
  readonly commandType: string;
  readonly changes: readonly FieldChange[];
  readonly version: number;
  readonly occurredAt: Date;

  constructor(input: {
    buildingId: BuildingId;
    userId: string;
    command: BuildingCommand;
    changes: readonly FieldChange[];
    version: number;
    occurredAt: Date;
  }) {
    this.buildingId = input.buildingId;
    this.userId = input.userId;
    this.command = input.command;
    this.commandType = input.command.type;
    this.changes = Object.freeze([...input.changes]);
    this.version = input.version;
    this.occurredAt = input.occurredAt;
  }
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
