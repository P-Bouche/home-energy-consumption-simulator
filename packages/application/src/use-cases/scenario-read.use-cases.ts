import type { BuildingId, Scenario, ScenarioId } from '@hes/domain';
import { BuildingNotFoundError, ScenarioNotFoundError } from '../errors.ts';
import type { BuildingRepository, ScenarioRepository } from '../ports/index.ts';
import { forkOrThrow, parseScenarioCommands, SCENARIO_USER_ID } from './scenario-commands.ts';

/**
 * Dependencies shared by the scenario read/update/delete use cases.
 */
export interface ScenarioReadUseCaseDeps {
  readonly buildingRepository: BuildingRepository;
  readonly scenarioRepository: ScenarioRepository;
}

/**
 * Injection token for NestJS wiring.
 */
export const LIST_SCENARIOS_USE_CASE = Symbol('ListScenariosUseCase');

/**
 * Use case (P5): list the scenarios of a building, oldest first.
 *
 * @throws BuildingNotFoundError when the building id is unknown (HTTP 404)
 */
export class ListScenariosUseCase {
  private readonly buildingRepository: BuildingRepository;
  private readonly scenarioRepository: ScenarioRepository;

  constructor(deps: ScenarioReadUseCaseDeps) {
    this.buildingRepository = deps.buildingRepository;
    this.scenarioRepository = deps.scenarioRepository;
  }

  async execute(buildingId: BuildingId): Promise<readonly Scenario[]> {
    const stored = await this.buildingRepository.findById(buildingId);
    if (stored === null) {
      throw new BuildingNotFoundError(buildingId);
    }
    return this.scenarioRepository.findByBuildingId(buildingId);
  }
}

/**
 * Injection token for NestJS wiring.
 */
export const GET_SCENARIO_USE_CASE = Symbol('GetScenarioUseCase');

/**
 * Use case (P5): load one scenario by id.
 *
 * @throws ScenarioNotFoundError when the id is unknown (HTTP 404)
 */
export class GetScenarioUseCase {
  private readonly scenarioRepository: ScenarioRepository;

  constructor(deps: { scenarioRepository: ScenarioRepository }) {
    this.scenarioRepository = deps.scenarioRepository;
  }

  async execute(id: ScenarioId): Promise<Scenario> {
    const scenario = await this.scenarioRepository.findById(id);
    if (scenario === null) {
      throw new ScenarioNotFoundError(id);
    }
    return scenario;
  }
}

/**
 * Input of {@link UpdateScenarioUseCase.execute}.
 */
export interface UpdateScenarioInput {
  readonly name?: string;
  readonly description?: string;
  readonly commands?: unknown;
}

/**
 * Injection token for NestJS wiring.
 */
export const UPDATE_SCENARIO_USE_CASE = Symbol('UpdateScenarioUseCase');

/**
 * Use case (P5): patch a scenario's name/description/commands. When commands
 * are provided they are parsed through the P4 vocabulary and validated against
 * the building (fork) before saving — a rejected change-set never reaches the
 * stored scenario, so the comparison can never serve a result for commands
 * that were never valid (stale links are additionally hash-verified at compare
 * time).
 *
 * @throws ScenarioNotFoundError (404) / BuildingNotFoundError (404)
 * @throws InvalidCommandError / CommandValidationError (400) / ElementNotFoundError (404)
 */
export class UpdateScenarioUseCase {
  private readonly buildingRepository: BuildingRepository;
  private readonly scenarioRepository: ScenarioRepository;
  private readonly now: () => Date;

  constructor(deps: ScenarioReadUseCaseDeps & { now?: () => Date }) {
    this.buildingRepository = deps.buildingRepository;
    this.scenarioRepository = deps.scenarioRepository;
    this.now = deps.now ?? (() => new Date());
  }

  async execute(id: ScenarioId, input: UpdateScenarioInput): Promise<Scenario> {
    const scenario = await this.scenarioRepository.findById(id);
    if (scenario === null) {
      throw new ScenarioNotFoundError(id);
    }
    let commands = scenario.commands;
    if (input.commands !== undefined) {
      commands = parseScenarioCommands(input.commands, scenario.buildingId);
      const stored = await this.buildingRepository.findById(scenario.buildingId);
      if (stored === null) {
        throw new BuildingNotFoundError(scenario.buildingId);
      }
      forkOrThrow(stored.building, commands, { now: this.now(), userId: SCENARIO_USER_ID });
    }
    const updated = scenario.withUpdates({ name: input.name, description: input.description, commands });
    await this.scenarioRepository.update(updated);
    return updated;
  }
}

/**
 * Injection token for NestJS wiring.
 */
export const DELETE_SCENARIO_USE_CASE = Symbol('DeleteScenarioUseCase');

/**
 * Use case (P5, FR-P5-06): delete a scenario. Only the scenario and its result
 * links are removed — the building and the simulation results (shared cache)
 * are never touched.
 *
 * @throws ScenarioNotFoundError when the id is unknown (HTTP 404)
 */
export class DeleteScenarioUseCase {
  private readonly scenarioRepository: ScenarioRepository;

  constructor(deps: { scenarioRepository: ScenarioRepository }) {
    this.scenarioRepository = deps.scenarioRepository;
  }

  async execute(id: ScenarioId): Promise<void> {
    const scenario = await this.scenarioRepository.findById(id);
    if (scenario === null) {
      throw new ScenarioNotFoundError(id);
    }
    await this.scenarioRepository.delete(id);
  }
}
