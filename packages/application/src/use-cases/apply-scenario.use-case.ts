import { randomUUID } from 'node:crypto';
import {
  auditEntryFromEvent,
  BuildingUpdated,
  ScenarioApplied,
  type AuditEntry,
  type DomainEvent,
  type ScenarioId
} from '@hes/domain';
import { BuildingNotFoundError, ScenarioNotFoundError } from '../errors.ts';
import type { BuildingRepository, ScenarioRepository } from '../ports/index.ts';
import type { InlineSimulationDeps, InlineSimulationOutcome } from './inline-simulation.ts';
import { runInlineSimulation } from './inline-simulation.ts';
import { SCENARIO_USER_ID } from './scenario-commands.ts';

/**
 * Dependencies of {@link ApplyScenarioUseCase}.
 */
export interface ApplyScenarioUseCaseDeps extends InlineSimulationDeps {
  readonly buildingRepository: BuildingRepository;
  readonly scenarioRepository: ScenarioRepository;
  readonly now?: () => Date;
  readonly eventSink?: (event: DomainEvent) => void;
}

/**
 * Options of {@link ApplyScenarioUseCase.execute}.
 */
export interface ApplyScenarioOptions {
  /** audit provenance of the apply (HTTP `x-user-id`; defaults to "scenario") */
  readonly userId?: string;
}

/**
 * Result of {@link ApplyScenarioUseCase.execute}.
 */
export interface ApplyScenarioResult {
  readonly previousVersion: number;
  readonly newVersion: number;
  /** one audit entry per applied scenario command (written in ONE transaction with the state update) */
  readonly auditEntries: readonly AuditEntry[];
  readonly simulation: InlineSimulationOutcome;
  readonly events: DomainEvent[];
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const APPLY_SCENARIO_USE_CASE = Symbol('ApplyScenarioUseCase');

/**
 * Use case (P5, FR-P5-05): apply a scenario to its building. The scenario's
 * commands are applied ONE BY ONE through the same validated domain path as
 * the P4 editor (`Building.apply`), each incrementing the aggregate version
 * and producing one `BuildingUpdated` event → one audit row; the new state
 * and ALL audit rows are written in a SINGLE `BuildingRepository.update`
 * transaction with optimistic locking (409 `StaleVersionError` on a
 * concurrent edit — nothing is written). A `ScenarioApplied` event is emitted
 * on top, and the baseline is re-simulated through the shared inline pipeline
 * (cache hit when the applied state equals a previously simulated state).
 *
 * @throws ScenarioNotFoundError (404) / BuildingNotFoundError (404)
 * @throws StaleVersionError (409) when the building changed concurrently
 * @throws CommandError subclasses (400/404) when the domain rejects a command
 * @throws SimulationAlreadyInFlightError (409) / SimulationError subclasses (422/500)
 */
export class ApplyScenarioUseCase {
  private readonly buildingRepository: BuildingRepository;
  private readonly scenarioRepository: ScenarioRepository;
  private readonly inlineDeps: InlineSimulationDeps;
  private readonly now: () => Date;
  private readonly eventSink: ((event: DomainEvent) => void) | null;

  constructor(deps: ApplyScenarioUseCaseDeps) {
    this.buildingRepository = deps.buildingRepository;
    this.scenarioRepository = deps.scenarioRepository;
    this.inlineDeps = deps;
    this.now = deps.now ?? (() => new Date());
    this.eventSink = deps.eventSink ?? null;
  }

  async execute(scenarioId: ScenarioId, options?: ApplyScenarioOptions): Promise<ApplyScenarioResult> {
    const scenario = await this.scenarioRepository.findById(scenarioId);
    if (scenario === null) {
      throw new ScenarioNotFoundError(scenarioId);
    }
    const stored = await this.buildingRepository.findById(scenario.buildingId);
    if (stored === null) {
      throw new BuildingNotFoundError(scenario.buildingId);
    }

    const userId = options?.userId ?? SCENARIO_USER_ID;
    const ctx = { now: this.now(), userId };
    const expectedVersion = stored.building.version;

    // Apply the scenario commands one by one through the P4 validated path.
    let current = stored.building;
    const auditEntries: AuditEntry[] = [];
    for (const command of scenario.commands) {
      const applied = current.apply(command, ctx);
      if (!applied.ok) {
        throw applied.error;
      }
      const next = applied.value;
      const updated = next.pullDomainEvents().find((e): e is BuildingUpdated => e instanceof BuildingUpdated);
      if (updated === undefined) {
        throw new Error(`apply on building ${scenario.buildingId} did not emit a BuildingUpdated event`);
      }
      auditEntries.push(auditEntryFromEvent(randomUUID(), updated));
      current = next;
    }

    // ONE transaction: new state + all per-command audit rows, optimistic lock.
    await this.buildingRepository.update({
      building: current,
      report: stored.report,
      expectedVersion,
      auditEntries
    });

    // Re-simulate the baseline on the new state (shared pipeline; cache hit
    // when the applied state was already simulated, e.g. as the scenario).
    const simulation = await runInlineSimulation({ ...this.inlineDeps, now: this.now }, current);

    const events: DomainEvent[] = [
      new ScenarioApplied(scenario.id, scenario.buildingId, expectedVersion, current.version, this.now())
    ];
    for (const event of events) {
      this.eventSink?.(event);
    }
    return {
      previousVersion: expectedVersion,
      newVersion: current.version,
      auditEntries,
      simulation,
      events
    };
  }
}
