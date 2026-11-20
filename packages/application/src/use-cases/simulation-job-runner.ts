import { randomUUID } from 'node:crypto';
import {
  createSimulationResultRecord,
  DomainInvariantError,
  SimulationError,
  SimulationFailed,
  type DomainEvent,
  type SimulationJob,
  type SimulationJobId
} from '@hes/domain';
import { consoleLogger, type Logger } from '../logger.ts';
import type { BuildingRepository, SimulationRepository, SimulationPort } from '../ports/index.ts';

/**
 * Dependencies of {@link SimulationJobRunner}.
 */
export interface SimulationJobRunnerDeps {
  readonly buildingRepository: BuildingRepository;
  readonly simulationRepository: SimulationRepository;
  readonly simulation: SimulationPort;
  readonly logger?: Logger;
  readonly now?: () => Date;
  readonly eventSink?: (event: DomainEvent) => void;
}

/**
 * Injection token for the runner (NestJS wiring in apps/api).
 */
export const SIMULATION_JOB_RUNNER = Symbol('SimulationJobRunner');

/**
 * Executes queued {@link SimulationJob}s (P2, TR-P2-04) in-process: loads the
 * job, drives the state machine queued -> running -> done | failed, persists
 * the result or the typed failure, and emits SimulationFailed on error.
 *
 * Single-process by design (the API is the only writer; the partial unique
 * index on (building_id, input_hash) guards duplicates at the DB level). A
 * distributed worker can reuse this class behind the same ports later.
 * `enqueue` is fire-and-forget: it never rejects and never swallows silently —
 * unexpected errors are logged and, when possible, recorded on the job.
 */
export class SimulationJobRunner {
  private readonly buildingRepository: BuildingRepository;
  private readonly simulationRepository: SimulationRepository;
  private readonly simulation: SimulationPort;
  private readonly logger: Logger;
  private readonly now: () => Date;
  private readonly eventSink: ((event: DomainEvent) => void) | null;

  constructor(deps: SimulationJobRunnerDeps) {
    this.buildingRepository = deps.buildingRepository;
    this.simulationRepository = deps.simulationRepository;
    this.simulation = deps.simulation;
    this.logger = deps.logger ?? consoleLogger;
    this.now = deps.now ?? (() => new Date());
    this.eventSink = deps.eventSink ?? null;
  }

  /**
   * Schedules asynchronous processing of a queued job. Never throws.
   */
  enqueue(jobId: SimulationJobId): void {
    void this.process(jobId).catch((error: unknown) => {
      this.logger.error(
        `simulation job ${jobId} crashed outside the state machine: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
      );
    });
  }

  /**
   * Processes one job to a terminal state. Safe to call once per job.
   */
  async process(jobId: SimulationJobId): Promise<void> {
    const job = await this.simulationRepository.findJobById(jobId);
    if (job === null) {
      this.logger.error(`simulation job ${jobId} not found — nothing to process`);
      return;
    }
    if (job.isTerminal()) {
      return;
    }
    try {
      job.markRunning(this.now());
    } catch (error) {
      if (error instanceof DomainInvariantError) {
        this.logger.warn(`simulation job ${jobId} is ${job.status}, not queued — skipped`);
        return;
      }
      throw error;
    }
    await this.simulationRepository.updateJob(job);

    const stored = await this.buildingRepository.findById(job.buildingId);
    if (stored === null) {
      await this.fail(job, 'UNEXPECTED', `building ${job.buildingId} no longer exists`);
      return;
    }

    try {
      const result = await this.simulation.simulateBuilding(stored.building);
      const record = createSimulationResultRecord({
        ...result,
        id: randomUUID(),
        buildingId: job.buildingId,
        inputHash: job.inputHash,
        engineVersion: this.simulation.getEngineVersion(),
        createdAt: this.now()
      });
      const persisted = await this.simulationRepository.saveResult(record);
      job.markDone(persisted.id, this.now());
      await this.simulationRepository.updateJob(job);
      this.logger.log(`simulation job ${jobId} done: result ${persisted.id}`);
    } catch (error) {
      const code = error instanceof SimulationError ? error.code : 'UNEXPECTED';
      const message = error instanceof Error ? error.message : String(error);
      await this.fail(job, code, message);
    }
  }

  private async fail(
    job: SimulationJob,
    code: 'UNEXPECTED' | SimulationError['code'],
    message: string
  ): Promise<void> {
    job.markFailed({ code, message }, this.now());
    await this.simulationRepository.updateJob(job);
    this.eventSink?.(
      new SimulationFailed({
        buildingId: job.buildingId,
        inputHash: job.inputHash,
        errorCode: code,
        message,
        jobId: job.id,
        occurredAt: this.now()
      })
    );
    this.logger.error(`simulation job ${job.id} failed: [${code}] ${message}`);
  }
}
