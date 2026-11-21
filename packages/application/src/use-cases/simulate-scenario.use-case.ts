import {
  ScenarioSimulated,
  type Building,
  type DomainEvent,
  type Scenario,
  type ScenarioId,
  type SimulationResultRecord
} from '@hes/domain';
import { computeBuildingInputHash } from '../building-input-hash.ts';
import { BuildingNotFoundError, ScenarioNotFoundError } from '../errors.ts';
import type { BuildingRepository, ScenarioRepository } from '../ports/index.ts';
import type { InlineSimulationDeps, InlineSimulationOutcome } from './inline-simulation.ts';
import { runInlineSimulation } from './inline-simulation.ts';
import { forkOrThrow, SCENARIO_USER_ID } from './scenario-commands.ts';

/**
 * Dependencies of {@link SimulateScenarioUseCase}.
 */
export interface SimulateScenarioUseCaseDeps extends InlineSimulationDeps {
  readonly buildingRepository: BuildingRepository;
  readonly scenarioRepository: ScenarioRepository;
  readonly now?: () => Date;
  readonly eventSink?: (event: DomainEvent) => void;
}

/**
 * Result of {@link SimulateScenarioUseCase.execute}.
 */
export interface SimulateScenarioResult {
  readonly scenario: Scenario;
  readonly outcome: InlineSimulationOutcome;
  readonly events: DomainEvent[];
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const SIMULATE_SCENARIO_USE_CASE = Symbol('SimulateScenarioUseCase');

/**
 * Shared P5 simulation path: fork the building with the scenario commands and
 * simulate the fork through the single shared inline pipeline (same
 * SimulationPort, same input-hash cache — never a parallel calculation path,
 * ADR-0001), then link the persisted result to the scenario.
 */
async function simulateScenario(
  deps: SimulateScenarioUseCaseDeps,
  scenario: Scenario,
  building: Building,
  now: () => Date
): Promise<SimulateScenarioResult> {
  const forked = forkOrThrow(building, scenario.commands, { now: now(), userId: SCENARIO_USER_ID });
  const outcome = await runInlineSimulation({ ...deps, now }, forked);
  await deps.scenarioRepository.linkResult({
    scenarioId: scenario.id,
    simulationId: outcome.record.id,
    createdAt: now()
  });
  const events: DomainEvent[] = [
    ...outcome.events,
    new ScenarioSimulated(scenario.id, scenario.buildingId, outcome.record.id, outcome.record.inputHash, now())
  ];
  for (const event of events) {
    deps.eventSink?.(event);
  }
  return { scenario, outcome, events };
}

/**
 * Use case (P5, FR-P5-02 / TR-P5-01): simulate a scenario via Open3CL on the
 * forked building state, persist the result (shared input-hash cache) and link
 * it to the scenario.
 *
 * @throws ScenarioNotFoundError when the scenario id is unknown (HTTP 404)
 * @throws BuildingNotFoundError when the building is unknown (HTTP 404)
 * @throws SimulationAlreadyInFlightError when the identical input hash is already queued/running (HTTP 409)
 * @throws SimulationError subclasses from the engine path (HTTP 422/500)
 */
export class SimulateScenarioUseCase {
  private readonly deps: SimulateScenarioUseCaseDeps;
  private readonly now: () => Date;

  constructor(deps: SimulateScenarioUseCaseDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => new Date());
  }

  async execute(scenarioId: ScenarioId): Promise<SimulateScenarioResult> {
    const scenario = await this.deps.scenarioRepository.findById(scenarioId);
    if (scenario === null) {
      throw new ScenarioNotFoundError(scenarioId);
    }
    const stored = await this.deps.buildingRepository.findById(scenario.buildingId);
    if (stored === null) {
      throw new BuildingNotFoundError(scenario.buildingId);
    }
    return simulateScenario(this.deps, scenario, stored.building, this.now);
  }
}

/**
 * Fork + hash of a scenario against the current building state — the staleness
 * oracle of the comparison use case: a linked result is current iff its
 * inputHash equals the hash of the fork with the scenario's CURRENT commands.
 */
export function scenarioFork(building: Building, scenario: Scenario, now: Date): Building {
  return forkOrThrow(building, scenario.commands, { now, userId: SCENARIO_USER_ID });
}

/**
 * @returns the input hash a scenario's result must have to be considered current
 */
export function expectedScenarioHash(building: Building, scenario: Scenario, now: Date): string {
  return computeBuildingInputHash(scenarioFork(building, scenario, now));
}

/**
 * Simulates a scenario (used by CompareScenariosUseCase when its linked result
 * is missing or stale) and returns the record.
 */
export async function simulateScenarioAndGetRecord(
  deps: SimulateScenarioUseCaseDeps,
  scenario: Scenario,
  building: Building,
  now: () => Date
): Promise<SimulationResultRecord> {
  const result = await simulateScenario(deps, scenario, building, now);
  return result.outcome.record;
}
