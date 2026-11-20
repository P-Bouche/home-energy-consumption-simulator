import { DomainInvariantError } from './import-errors.ts';
import type { BuildingId } from './entities.ts';
import type { SimulationErrorCode } from './errors.ts';
import type { SimulationInputHash, SimulationJobId, SimulationResultId } from './simulation-record.ts';

/**
 * Status of a {@link SimulationJob}. State machine:
 * `queued -> running -> done | failed` (done/failed are terminal).
 */
export type SimulationJobStatus = 'queued' | 'running' | 'done' | 'failed';

/**
 * Typed failure payload of a failed job (mirrors the domain SimulationError codes).
 */
export interface SimulationJobError {
  readonly code: SimulationErrorCode | 'UNEXPECTED';
  readonly message: string;
}

/**
 * Input accepted by {@link createSimulationJob}.
 */
export interface SimulationJobInput {
  readonly id: SimulationJobId;
  readonly buildingId: BuildingId;
  readonly inputHash: SimulationInputHash;
  readonly createdAt: Date;
}

/**
 * JSON shape of a SimulationJob (dates as ISO-8601 strings).
 */
export interface SimulationJobJson {
  readonly id: SimulationJobId;
  readonly buildingId: BuildingId;
  readonly inputHash: SimulationInputHash;
  readonly status: SimulationJobStatus;
  readonly resultId: SimulationResultId | null;
  readonly error: SimulationJobError | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

/**
 * Entity representing an asynchronous simulation run (P2, TR-P2-04).
 *
 * Transitions are enforced: `queued -> running -> done | failed`; any other
 * transition throws {@link DomainInvariantError}. The entity is the only
 * place that mutates job state.
 */
export class SimulationJob {
  readonly id: SimulationJobId;
  readonly buildingId: BuildingId;
  readonly inputHash: SimulationInputHash;
  readonly createdAt: Date;
  private _status: SimulationJobStatus;
  private _resultId: SimulationResultId | null;
  private _error: SimulationJobError | null;
  private _startedAt: Date | null;
  private _finishedAt: Date | null;

  private constructor(input: SimulationJobInput, status: SimulationJobStatus) {
    this.id = input.id;
    this.buildingId = input.buildingId;
    this.inputHash = input.inputHash;
    this.createdAt = new Date(input.createdAt.getTime());
    this._status = status;
    this._resultId = null;
    this._error = null;
    this._startedAt = null;
    this._finishedAt = null;
  }

  /**
   * Creates a new job in status `queued`.
   */
  static create(input: SimulationJobInput): SimulationJob {
    return new SimulationJob(input, 'queued');
  }

  /**
   * Rebuilds a job from its JSON shape (persistence read path).
   */
  static fromJson(json: SimulationJobJson): SimulationJob {
    const job = new SimulationJob(
      { id: json.id, buildingId: json.buildingId, inputHash: json.inputHash, createdAt: new Date(json.createdAt) },
      json.status
    );
    job._resultId = json.resultId;
    job._error = json.error;
    job._startedAt = json.startedAt === null ? null : new Date(json.startedAt);
    job._finishedAt = json.finishedAt === null ? null : new Date(json.finishedAt);
    return job;
  }

  get status(): SimulationJobStatus {
    return this._status;
  }

  get resultId(): SimulationResultId | null {
    return this._resultId;
  }

  get error(): SimulationJobError | null {
    return this._error;
  }

  get startedAt(): Date | null {
    return this._startedAt === null ? null : new Date(this._startedAt.getTime());
  }

  get finishedAt(): Date | null {
    return this._finishedAt === null ? null : new Date(this._finishedAt.getTime());
  }

  /**
   * `queued -> running`. @throws DomainInvariantError on any other source status
   */
  markRunning(at: Date = new Date()): void {
    if (this._status !== 'queued') {
      throw new DomainInvariantError(`cannot mark a job ${this._status} as running (only queued -> running)`);
    }
    this._status = 'running';
    this._startedAt = new Date(at.getTime());
  }

  /**
   * `running -> done` with the persisted result id.
   * @throws DomainInvariantError on any other source status
   */
  markDone(resultId: SimulationResultId, at: Date = new Date()): void {
    if (this._status !== 'running') {
      throw new DomainInvariantError(`cannot mark a job ${this._status} as done (only running -> done)`);
    }
    if (typeof resultId !== 'string' || resultId.trim().length === 0) {
      throw new DomainInvariantError('markDone requires a non-empty resultId');
    }
    this._status = 'done';
    this._resultId = resultId;
    this._finishedAt = new Date(at.getTime());
  }

  /**
   * `running -> failed` with a typed error.
   * @throws DomainInvariantError on any other source status
   */
  markFailed(error: SimulationJobError, at: Date = new Date()): void {
    if (this._status !== 'running') {
      throw new DomainInvariantError(`cannot mark a job ${this._status} as failed (only running -> failed)`);
    }
    this._status = 'failed';
    this._error = Object.freeze({ ...error });
    this._finishedAt = new Date(at.getTime());
  }

  /**
   * @returns true when the job is in a terminal status (done | failed)
   */
  isTerminal(): boolean {
    return this._status === 'done' || this._status === 'failed';
  }

  /**
   * Serializes the job to its JSON persistence shape.
   */
  toJson(): SimulationJobJson {
    return {
      id: this.id,
      buildingId: this.buildingId,
      inputHash: this.inputHash,
      status: this._status,
      resultId: this._resultId,
      error: this._error === null ? null : { ...this._error },
      createdAt: this.createdAt.toISOString(),
      startedAt: this._startedAt === null ? null : this._startedAt.toISOString(),
      finishedAt: this._finishedAt === null ? null : this._finishedAt.toISOString()
    };
  }
}

/**
 * Validates and builds a new queued {@link SimulationJob}.
 *
 * @throws TypeError when id/buildingId are empty or inputHash is not sha256 hex
 * @throws RangeError when createdAt is not a valid Date
 */
export function createSimulationJob(input: SimulationJobInput): SimulationJob {
  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    throw new TypeError('SimulationJob.id must be a non-empty string');
  }
  if (typeof input.buildingId !== 'string' || input.buildingId.trim().length === 0) {
    throw new TypeError('SimulationJob.buildingId must be a non-empty string');
  }
  if (!/^[0-9a-f]{64}$/.test(input.inputHash)) {
    throw new TypeError('SimulationJob.inputHash must be a sha256 hex string (64 chars)');
  }
  if (!(input.createdAt instanceof Date) || Number.isNaN(input.createdAt.getTime())) {
    throw new RangeError('SimulationJob.createdAt must be a valid Date');
  }
  return SimulationJob.create(input);
}

/**
 * Serializes a job to its JSON persistence shape.
 */
export function simulationJobToJson(job: SimulationJob): SimulationJobJson {
  return job.toJson();
}

/**
 * Revives a job from its JSON persistence shape.
 */
export function simulationJobFromJson(json: SimulationJobJson): SimulationJob {
  return SimulationJob.fromJson(json);
}
