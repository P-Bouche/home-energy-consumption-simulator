import { parseBuildingCommand, type BuildingCommand } from './commands.ts';
import type { BuildingId } from './entities.ts';
import { ScenarioCreated, type DomainEvent } from './events.ts';

/**
 * Identifier of a scenario (UUID).
 */
export type ScenarioId = string;

/**
 * Input accepted by {@link Scenario.create}.
 */
export interface ScenarioInput {
  readonly id: ScenarioId;
  readonly buildingId: BuildingId;
  readonly name: string;
  readonly description: string;
  readonly commands: readonly BuildingCommand[];
  readonly baselineVersion: number;
  readonly createdAt: Date;
}

/**
 * JSON shape of a Scenario (commands stored with their versioned type tags —
 * the frozen P4 vocabulary, `building.*.update.v1`; createdAt as ISO string).
 * This is the persistence contract of the `scenarios.commands` JSONB column.
 */
export interface ScenarioJson {
  readonly id: ScenarioId;
  readonly buildingId: BuildingId;
  readonly name: string;
  readonly description: string;
  readonly commands: readonly BuildingCommand[];
  readonly baselineVersion: number;
  readonly createdAt: string;
}

/**
 * Aggregate root of the Scenario Management bounded context (P5).
 *
 * A scenario is a named, declarative change-set: a list of P4
 * {@link BuildingCommand}s applied to a copy of the building via
 * `Building.fork(commands)` — the frozen P4 command vocabulary reused
 * headlessly (no editor UI needed). `baselineVersion` records the building
 * version the scenario was created against; it is surfaced in comparison
 * payloads as informational context (staleness itself is detected by input-hash
 * verification, never by this field).
 */
export class Scenario {
  readonly id: ScenarioId;
  readonly buildingId: BuildingId;
  readonly name: string;
  readonly description: string;
  readonly commands: readonly BuildingCommand[];
  readonly baselineVersion: number;
  readonly createdAt: Date;
  private readonly events: DomainEvent[] = [];

  private constructor(input: ScenarioInput) {
    this.id = input.id;
    this.buildingId = input.buildingId;
    this.name = input.name;
    this.description = input.description;
    this.commands = Object.freeze([...input.commands]);
    this.baselineVersion = input.baselineVersion;
    this.createdAt = new Date(input.createdAt.getTime());
  }

  /**
   * Creates a scenario and emits {@link ScenarioCreated}.
   *
   * @throws TypeError when a field is invalid (empty id/name, bad date, …)
   * @throws InvalidCommandError when a command fails vocabulary parsing
   */
  static create(input: ScenarioInput): Scenario {
    assertValid(input);
    const scenario = new Scenario(input);
    scenario.events.push(new ScenarioCreated(scenario.id, scenario.buildingId, scenario.createdAt));
    return scenario;
  }

  /**
   * Rebuilds a scenario from its JSON shape (persistence read path). Every
   * command is re-parsed through the frozen P4 vocabulary parser — a stored
   * command with an unknown tag/version fails loudly here. Does not re-emit
   * events.
   *
   * @throws TypeError when the JSON shape is invalid
   * @throws InvalidCommandError when a stored command is not in the vocabulary
   */
  static fromJson(json: ScenarioJson): Scenario {
    const commands = json.commands.map((raw) => {
      const parsed = parseBuildingCommand(raw);
      if (!parsed.ok) {
        throw parsed.error;
      }
      return parsed.value;
    });
    const input: ScenarioInput = {
      id: json.id,
      buildingId: json.buildingId,
      name: json.name,
      description: json.description,
      commands,
      baselineVersion: json.baselineVersion,
      createdAt: new Date(json.createdAt)
    };
    assertValid(input);
    return new Scenario(input);
  }

  /**
   * Returns a copy of this scenario with updated metadata and/or commands.
   * Pure: returns a new instance, no event emitted (PATCH is bookkeeping, not
   * a domain event).
   */
  withUpdates(updates: {
    name?: string;
    description?: string;
    commands?: readonly BuildingCommand[];
  }): Scenario {
    const input: ScenarioInput = {
      id: this.id,
      buildingId: this.buildingId,
      name: updates.name ?? this.name,
      description: updates.description ?? this.description,
      commands: updates.commands ?? this.commands,
      baselineVersion: this.baselineVersion,
      createdAt: this.createdAt
    };
    assertValid(input);
    return new Scenario(input);
  }

  /**
   * Returns and clears the pending domain events.
   */
  pullDomainEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events.length = 0;
    return events;
  }

  /**
   * Serializes the scenario to its JSON persistence shape.
   */
  toJson(): ScenarioJson {
    return {
      id: this.id,
      buildingId: this.buildingId,
      name: this.name,
      description: this.description,
      commands: this.commands.map((command) => ({ ...command })),
      baselineVersion: this.baselineVersion,
      createdAt: this.createdAt.toISOString()
    };
  }
}

function assertValid(input: ScenarioInput): void {
  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    throw new TypeError('Scenario.id must be a non-empty string');
  }
  if (typeof input.buildingId !== 'string' || input.buildingId.trim().length === 0) {
    throw new TypeError('Scenario.buildingId must be a non-empty string');
  }
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    throw new TypeError('Scenario.name must be a non-empty string');
  }
  if (typeof input.description !== 'string') {
    throw new TypeError('Scenario.description must be a string');
  }
  if (!Number.isInteger(input.baselineVersion) || input.baselineVersion < 0) {
    throw new TypeError(`Scenario.baselineVersion must be an integer >= 0, got ${String(input.baselineVersion)}`);
  }
  if (!(input.createdAt instanceof Date) || Number.isNaN(input.createdAt.getTime())) {
    throw new TypeError('Scenario.createdAt must be a valid Date');
  }
  for (const command of input.commands) {
    const parsed = parseBuildingCommand(command);
    if (!parsed.ok) {
      throw parsed.error;
    }
  }
}
