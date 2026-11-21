import { randomUUID } from 'node:crypto';
import { Scenario, type BuildingId, type DomainEvent } from '@hes/domain';
import { BuildingNotFoundError } from '../errors.ts';
import type { BuildingRepository, ScenarioRepository } from '../ports/index.ts';
import { forkOrThrow, parseScenarioCommands, SCENARIO_USER_ID } from './scenario-commands.ts';

/**
 * Input of {@link CreateScenarioUseCase.execute} (`commands` is raw JSON —
 * parsed through the frozen P4 vocabulary; unknown tags/fields → 400).
 */
export interface CreateScenarioInput {
  readonly name: string;
  readonly description?: string;
  readonly commands: unknown;
}

/**
 * Dependencies of {@link CreateScenarioUseCase}.
 */
export interface CreateScenarioUseCaseDeps {
  readonly buildingRepository: BuildingRepository;
  readonly scenarioRepository: ScenarioRepository;
  readonly now?: () => Date;
  readonly eventSink?: (event: DomainEvent) => void;
}

/**
 * Result of {@link CreateScenarioUseCase.execute}.
 */
export interface CreateScenarioResult {
  readonly scenario: Scenario;
  readonly events: DomainEvent[];
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const CREATE_SCENARIO_USE_CASE = Symbol('CreateScenarioUseCase');

/**
 * Use case (P5, FR-P5-01): create a named scenario (declarative change-set of
 * P4 commands) on a building. The change-set is validated by forking the
 * building with it — an invalid command (unknown tag, bad value, unknown
 * target element) is rejected before anything is persisted.
 *
 * @throws BuildingNotFoundError when the building id is unknown (HTTP 404)
 * @throws InvalidCommandError / CommandValidationError on invalid commands (HTTP 400)
 * @throws ElementNotFoundError when a command targets an unknown element (HTTP 404)
 */
export class CreateScenarioUseCase {
  private readonly buildingRepository: BuildingRepository;
  private readonly scenarioRepository: ScenarioRepository;
  private readonly now: () => Date;
  private readonly eventSink: ((event: DomainEvent) => void) | null;

  constructor(deps: CreateScenarioUseCaseDeps) {
    this.buildingRepository = deps.buildingRepository;
    this.scenarioRepository = deps.scenarioRepository;
    this.now = deps.now ?? (() => new Date());
    this.eventSink = deps.eventSink ?? null;
  }

  async execute(buildingId: BuildingId, input: CreateScenarioInput): Promise<CreateScenarioResult> {
    const stored = await this.buildingRepository.findById(buildingId);
    if (stored === null) {
      throw new BuildingNotFoundError(buildingId);
    }
    const commands = parseScenarioCommands(input.commands, buildingId);
    // Validate the change-set against the building via the same pure fork the
    // simulate/apply paths use (throws typed CommandError on rejection).
    forkOrThrow(stored.building, commands, { now: this.now(), userId: SCENARIO_USER_ID });

    const scenario = Scenario.create({
      id: randomUUID(),
      buildingId,
      name: input.name,
      description: input.description ?? '',
      commands,
      baselineVersion: stored.building.version,
      createdAt: this.now()
    });
    await this.scenarioRepository.save(scenario);
    const events = scenario.pullDomainEvents();
    for (const event of events) {
      this.eventSink?.(event);
    }
    return { scenario, events };
  }
}
