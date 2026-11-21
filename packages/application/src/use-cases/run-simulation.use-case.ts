import { randomUUID } from 'node:crypto';
import {
  createSimulationJob,
  type Building,
  type BuildingId,
  type DomainEvent,
  type SimulationInputHash,
  type SimulationJob,
  type SimulationResultRecord
} from '@hes/domain';
import { computeBuildingInputHash } from '../building-input-hash.ts';
import { BuildingNotFoundError, SimulationAlreadyInFlightError } from '../errors.ts';
import type { Logger } from '../logger.ts';
import { consoleLogger } from '../logger.ts';
import type { BuildingRepository, SimulationRepository, SimulationPort } from '../ports/index.ts';
import { runInlineSimulation } from './inline-simulation.ts';
import type { SimulationJobRunner } from './simulation-job-runner.ts';

/**
 * Default synchronous-execution budget: simulations expected to finish within
 * this budget run inline (HTTP 201); anything above runs as a queued job
 * (HTTP 202 + polling). Mirrors the 3 s performance budget (AC-P2-01).
 */
export const DEFAULT_SYNC_BUDGET_MS = 3000;

/**
 * Configuration of {@link RunSimulationUseCase}.
 */
export interface RunSimulationConfig {
  readonly syncBudgetMs: number;
  readonly forceAsync: boolean;
}

/**
 * Dependencies of {@link RunSimulationUseCase} (dependency injection).
 */
export interface RunSimulationUseCaseDeps {
  readonly buildingRepository: BuildingRepository;
  readonly simulationRepository: SimulationRepository;
  readonly simulation: SimulationPort;
  readonly runner: SimulationJobRunner;
  readonly config?: Partial<RunSimulationConfig>;
  readonly logger?: Logger;
  readonly now?: () => Date;
  /**
   * Optional sink for domain events (audit). Events are also returned in the
   * successful result; failures are reported through the sink before the
   * typed error is rethrown.
   */
  readonly eventSink?: (event: DomainEvent) => void;
}

/**
 * Outcome of {@link RunSimulationUseCase.execute}.
 */
export type RunSimulationResult =
  | { readonly kind: 'completed' | 'cached'; readonly record: SimulationResultRecord; readonly events: DomainEvent[] }
  | { readonly kind: 'queued'; readonly job: SimulationJob; readonly events: DomainEvent[] };

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const RUN_SIMULATION_USE_CASE = Symbol('RunSimulationUseCase');

/**
 * Estimates the duration of a building→simulation run from the retained
 * source document size. Calibrated on the P0/P1 corpus benchmarks on the
 * reference machine (raw engine p95 ≈ 26 ms and full import p95 ≈ 304 ms for
 * a 537 KB fixture): `60 ms + bytes / 400` is a conservative upper bound that
 * keeps every corpus fixture (≤ 537 KB → ≈ 1.4 s) on the sync path while
 * sending near-5 MB documents (≈ 12.6 s) to the queue.
 */
export function estimateSimulationMs(building: Building): number {
  const bytes = building.sourceDpeXml === null ? 0 : Buffer.byteLength(building.sourceDpeXml, 'utf8');
  return Math.ceil(60 + bytes / 400);
}

/**
 * Use case (P2): run an Open3CL simulation on the current state of a
 * persisted building, persist and historize the result, serve identical
 * re-runs from the input-hash cache, and queue long runs as jobs.
 *
 * Flow: load building (404) → input hash → cache hit (no engine call) →
 * in-flight duplicate (409) → sync path under budget | queued job path.
 * Errors from the engine propagate as typed SimulationError subclasses
 * (mapped to 422/500 by the API layer); on the sync path a failure also emits
 * SimulationFailed.
 *
 * The sync path delegates to the shared {@link runInlineSimulation} (one
 * cache/409/persist kernel, also used by the P5 scenario use cases). P5
 * scenario simulations deliberately NEVER queue: a scenario input is at most
 * baseline-sized (engine p95 ≈ 25 ms on the corpus), and the compare endpoint
 * must answer synchronously. Trade-off, documented per review: a ~5 MB source
 * DPE would make a scenario simulate an ~12 s inline HTTP request instead of
 * returning 202 — accepted for now (the baseline endpoint keeps the queued
 * path for such inputs).
 */
export class RunSimulationUseCase {
  private readonly buildingRepository: BuildingRepository;
  private readonly simulationRepository: SimulationRepository;
  private readonly simulation: SimulationPort;
  private readonly runner: SimulationJobRunner;
  private readonly config: RunSimulationConfig;
  private readonly logger: Logger;
  private readonly now: () => Date;
  private readonly eventSink: ((event: DomainEvent) => void) | null;

  constructor(deps: RunSimulationUseCaseDeps) {
    this.buildingRepository = deps.buildingRepository;
    this.simulationRepository = deps.simulationRepository;
    this.simulation = deps.simulation;
    this.runner = deps.runner;
    this.config = {
      syncBudgetMs: deps.config?.syncBudgetMs ?? DEFAULT_SYNC_BUDGET_MS,
      forceAsync: deps.config?.forceAsync ?? false
    };
    this.logger = deps.logger ?? consoleLogger;
    this.now = deps.now ?? (() => new Date());
    this.eventSink = deps.eventSink ?? null;
  }

  /**
   * @param buildingId - id of the persisted building
   * @param options - `forceAsync` forces the queued-job path (tests / ops)
   * @throws BuildingNotFoundError when the id is unknown (HTTP 404)
   * @throws SimulationAlreadyInFlightError when the same input hash is already queued/running (HTTP 409)
   * @throws SimulationError subclasses from the engine path (HTTP 422/500)
   */
  async execute(buildingId: BuildingId, options?: { forceAsync?: boolean }): Promise<RunSimulationResult> {
    const stored = await this.buildingRepository.findById(buildingId);
    if (stored === null) {
      throw new BuildingNotFoundError(buildingId);
    }
    const building = stored.building;
    const inputHash = computeBuildingInputHash(building);

    const cached = await this.simulationRepository.findResultByInputHash(buildingId, inputHash);
    if (cached !== null) {
      this.logger.log(`simulation cache hit for building ${buildingId} (hash ${inputHash}) — no engine call`);
      return { kind: 'cached', record: cached, events: [] };
    }

    const active = await this.simulationRepository.findActiveJobByInputHash(buildingId, inputHash);
    if (active !== null) {
      throw new SimulationAlreadyInFlightError(active.id, inputHash);
    }

    const forceAsync = options?.forceAsync ?? this.config.forceAsync;
    const estimateMs = estimateSimulationMs(building);
    if (!forceAsync && estimateMs <= this.config.syncBudgetMs) {
      return this.runSync(building, inputHash);
    }

    const job = createSimulationJob({
      id: randomUUID(),
      buildingId,
      inputHash,
      createdAt: this.now()
    });
    await this.simulationRepository.saveJob(job);
    this.logger.log(
      `simulation of building ${buildingId} queued as job ${job.id} (estimated ${estimateMs} ms > budget ${this.config.syncBudgetMs} ms)`
    );
    this.runner.enqueue(job.id);
    return { kind: 'queued', job, events: [] };
  }

  private async runSync(building: Building, inputHash: SimulationInputHash): Promise<RunSimulationResult> {
    void inputHash; // the shared path recomputes the hash from the building state
    return runInlineSimulation(
      {
        simulationRepository: this.simulationRepository,
        simulation: this.simulation,
        logger: this.logger,
        now: this.now,
        eventSink: this.eventSink ?? undefined
      },
      building
    );
  }
}
