import { describe, expect, it } from 'vitest';
import {
  InvalidCommandError,
  Scenario,
  ScenarioCreated,
  type BuildingCommand,
  type ScenarioJson
} from '@hes/domain';
import { testDate } from './helpers.ts';

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';

const commands: BuildingCommand[] = [
  { type: 'building.wall.update.v1', buildingId: BUILDING_ID, wallId: 'wall-1', uValueWm2K: 0.2 }
];

function makeInput(overrides: Partial<Parameters<typeof Scenario.create>[0]> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    buildingId: BUILDING_ID,
    name: 'Isolation des murs',
    description: 'Murs isolés par l’extérieur (U = 0.2)',
    commands,
    baselineVersion: 0,
    createdAt: testDate,
    ...overrides
  };
}

function scenarioJsonWithCommands(rawCommands: unknown[]): ScenarioJson {
  return { ...Scenario.create(makeInput()).toJson(), commands: rawCommands as ScenarioJson['commands'] };
}

describe('Scenario aggregate (P5)', () => {
  it('creates a scenario and emits ScenarioCreated', () => {
    const scenario = Scenario.create(makeInput());
    expect(scenario.name).toBe('Isolation des murs');
    expect(scenario.baselineVersion).toBe(0);
    expect(scenario.commands[0]?.type).toBe('building.wall.update.v1');
    const events = scenario.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(ScenarioCreated);
    expect(events[0]?.type).toBe('ScenarioCreated');
  });

  it('validates its fields', () => {
    expect(() => Scenario.create(makeInput({ name: '' }))).toThrow(TypeError);
    expect(() => Scenario.create(makeInput({ baselineVersion: -1 }))).toThrow(TypeError);
    expect(() => Scenario.create(makeInput({ baselineVersion: 1.5 }))).toThrow(TypeError);
    expect(() => Scenario.create(makeInput({ createdAt: new Date('invalid') }))).toThrow(TypeError);
    expect(() => Scenario.create(makeInput({ id: ' ' }))).toThrow(TypeError);
  });

  it('round-trips through JSON with command type tags intact', () => {
    const scenario = Scenario.create(makeInput());
    const revived = Scenario.fromJson(JSON.parse(JSON.stringify(scenario.toJson())) as ScenarioJson);
    expect(revived.toJson()).toEqual(scenario.toJson());
    expect(revived.commands[0]?.type).toBe('building.wall.update.v1');
    expect(revived.pullDomainEvents()).toHaveLength(0); // read path emits nothing
  });

  it('rejects JSON with an unknown command tag', () => {
    const json = scenarioJsonWithCommands([
      { type: 'TeleportWall', version: 1, wallId: 'wall-1', uValueWm2K: 0.2 }
    ]);
    expect(() => Scenario.fromJson(json)).toThrow(InvalidCommandError);
  });

  it('rejects creation with a command outside the frozen vocabulary', () => {
    const bad = [{ type: 'UpdateWall', version: 1, wallId: 'wall-1', uValueWm2K: 0.2 }] as unknown as BuildingCommand[];
    expect(() => Scenario.create(makeInput({ commands: bad }))).toThrow(InvalidCommandError);
  });

  it('withUpdates returns a new instance without mutating or emitting', () => {
    const scenario = Scenario.create(makeInput());
    const updated = scenario.withUpdates({ name: 'New name', description: 'd2' });
    expect(updated).not.toBe(scenario);
    expect(updated.name).toBe('New name');
    expect(scenario.name).toBe('Isolation des murs');
    expect(updated.pullDomainEvents()).toHaveLength(0);
    expect(() => updated.withUpdates({ name: '' })).toThrow(TypeError);
  });
});
