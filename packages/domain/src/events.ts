import type { BuildingCommand } from './commands.ts';
import type { ConfidenceJson } from './confidence.ts';
import type { BuildingId } from './entities.ts';
import type { SimulationErrorCode } from './errors.ts';
import type { ScenarioId } from './scenario.ts';
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

/**
 * Emitted when a scenario (named change-set) is created on a building (P5,
 * TR-P5-06).
 */
export class ScenarioCreated implements DomainEvent {
  readonly type = 'ScenarioCreated';
  readonly scenarioId: ScenarioId;
  readonly buildingId: BuildingId;
  readonly occurredAt: Date;

  constructor(scenarioId: ScenarioId, buildingId: BuildingId, occurredAt: Date) {
    this.scenarioId = scenarioId;
    this.buildingId = buildingId;
    this.occurredAt = occurredAt;
  }
}

/**
 * Emitted when a scenario has been simulated through the P2 pipeline and its
 * result persisted and linked to the scenario (P5, TR-P5-06).
 */
export class ScenarioSimulated implements DomainEvent {
  readonly type = 'ScenarioSimulated';
  readonly scenarioId: ScenarioId;
  readonly buildingId: BuildingId;
  readonly resultId: SimulationResultId;
  readonly inputHash: SimulationInputHash;
  readonly occurredAt: Date;

  constructor(
    scenarioId: ScenarioId,
    buildingId: BuildingId,
    resultId: SimulationResultId,
    inputHash: SimulationInputHash,
    occurredAt: Date
  ) {
    this.scenarioId = scenarioId;
    this.buildingId = buildingId;
    this.resultId = resultId;
    this.inputHash = inputHash;
    this.occurredAt = occurredAt;
  }
}

/**
 * Emitted when a scenario is applied to its building: the building state is
 * replaced by the forked state and its version bumped (P5-lite; the full
 * per-command audit trail lands with P4, TR-P5-06).
 */
export class ScenarioApplied implements DomainEvent {
  readonly type = 'ScenarioApplied';
  readonly scenarioId: ScenarioId;
  readonly buildingId: BuildingId;
  readonly previousVersion: number;
  readonly newVersion: number;
  readonly occurredAt: Date;

  constructor(
    scenarioId: ScenarioId,
    buildingId: BuildingId,
    previousVersion: number,
    newVersion: number,
    occurredAt: Date
  ) {
    this.scenarioId = scenarioId;
    this.buildingId = buildingId;
    this.previousVersion = previousVersion;
    this.newVersion = newVersion;
    this.occurredAt = occurredAt;
  }
}
