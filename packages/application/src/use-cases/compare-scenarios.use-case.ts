import {
  ComparisonService,
  type BuildingId,
  type ScenarioComparison,
  type ScenarioId,
  type SimulationResultRecord
} from '@hes/domain';
import { computeBuildingInputHash } from '../building-input-hash.ts';
import { BuildingNotFoundError, ScenarioNotFoundError } from '../errors.ts';
import type { BuildingRepository, ScenarioRepository, SimulationRepository } from '../ports/index.ts';
import type { InlineSimulationDeps } from './inline-simulation.ts';
import { runInlineSimulation } from './inline-simulation.ts';
import { expectedScenarioHash, simulateScenarioAndGetRecord, type SimulateScenarioUseCaseDeps } from './simulate-scenario.use-case.ts';

/**
 * Dependencies of {@link CompareScenariosUseCase}.
 */
export interface CompareScenariosUseCaseDeps extends InlineSimulationDeps, SimulateScenarioUseCaseDeps {
  readonly simulationRepository: SimulationRepository;
}

/**
 * Options of {@link CompareScenariosUseCase.execute}.
 */
export interface CompareScenariosOptions {
  /** restrict the comparison to these scenario ids (default: all) */
  readonly scenarioIds?: readonly ScenarioId[];
}

/**
 * Result of {@link CompareScenariosUseCase.execute}.
 */
export interface CompareScenariosResult {
  readonly comparison: ScenarioComparison;
  /** ids of the scenarios that had to be (re-)simulated now (missing or stale cached result) */
  readonly simulatedNow: readonly ScenarioId[];
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const COMPARE_SCENARIOS_USE_CASE = Symbol('CompareScenariosUseCase');

/**
 * Use case (P5, FR-P5-03 / FR-P5-04 / TR-P5-02): compare the baseline and the
 * scenarios of a building.
 *
 * Staleness is detected by HASH VERIFICATION, not by link bookkeeping: before
 * serving a scenario's linked result, its `inputHash` is compared against
 * `computeBuildingInputHash(building.fork(scenario.commands))` — if they
 * differ (the scenario was PATCHed with new commands, or an apply moved the
 * baseline under it), the scenario is re-simulated inline through the shared
 * pipeline and the fresh result is linked and served. The baseline itself is
 * always current by construction: it is looked up by the hash of the current
 * stored building.
 *
 * The comparison itself is the pure domain {@link ComparisonService} — no
 * engine call and p95 < 1 s when every result is current and cached.
 *
 * @throws BuildingNotFoundError (404) / ScenarioNotFoundError (404)
 * @throws SimulationAlreadyInFlightError (409) when a needed input hash is in flight
 */
export class CompareScenariosUseCase {
  private readonly buildingRepository: BuildingRepository;
  private readonly scenarioRepository: ScenarioRepository;
  private readonly simulationRepository: SimulationRepository;
  private readonly inlineDeps: InlineSimulationDeps;
  private readonly simulateDeps: SimulateScenarioUseCaseDeps;
  private readonly now: () => Date;

  constructor(deps: CompareScenariosUseCaseDeps) {
    this.buildingRepository = deps.buildingRepository;
    this.scenarioRepository = deps.scenarioRepository;
    this.simulationRepository = deps.simulationRepository;
    this.inlineDeps = deps;
    this.simulateDeps = deps;
    this.now = deps.now ?? (() => new Date());
  }

  async execute(buildingId: BuildingId, options?: CompareScenariosOptions): Promise<CompareScenariosResult> {
    const stored = await this.buildingRepository.findById(buildingId);
    if (stored === null) {
      throw new BuildingNotFoundError(buildingId);
    }
    const building = stored.building;

    // Baseline: cache lookup keyed by the hash of the CURRENT building state.
    const baselineOutcome = await runInlineSimulation({ ...this.inlineDeps, now: this.now }, building);
    const baseline: SimulationResultRecord = baselineOutcome.record;

    let scenarios = await this.scenarioRepository.findByBuildingId(buildingId);
    if (options?.scenarioIds !== undefined) {
      const known = new Set(scenarios.map((s) => s.id));
      for (const id of options.scenarioIds) {
        if (!known.has(id)) {
          throw new ScenarioNotFoundError(id);
        }
      }
      const requested = new Set(options.scenarioIds);
      scenarios = scenarios.filter((s) => requested.has(s.id));
    }

    const simulatedNow: ScenarioId[] = [];
    const entries: { scenarioId: ScenarioId; name: string; baselineVersion: number; result: SimulationResultRecord }[] = [];
    for (const scenario of scenarios) {
      // Staleness oracle: hash of the fork with the scenario's CURRENT commands.
      const expectedHash = expectedScenarioHash(building, scenario, this.now());
      const latestId = await this.scenarioRepository.findLatestResultId(scenario.id);
      let record = latestId === null ? null : await this.simulationRepository.findResultById(latestId);
      if (record === null || record.inputHash !== expectedHash) {
        // Missing or stale (PATCHed commands / moved baseline): re-simulate
        // inline through the shared pipeline and link the fresh result.
        record = await simulateScenarioAndGetRecord(this.simulateDeps, scenario, building, this.now);
        simulatedNow.push(scenario.id);
      }
      entries.push({ scenarioId: scenario.id, name: scenario.name, baselineVersion: scenario.baselineVersion, result: record });
    }

    return {
      comparison: ComparisonService.compare(baseline, entries, { now: this.now() }),
      simulatedNow
    };
  }
}

// re-export for convenience of callers/tests
export { computeBuildingInputHash };
