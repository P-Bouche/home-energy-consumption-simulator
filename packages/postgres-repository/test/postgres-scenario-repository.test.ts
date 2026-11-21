import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { Scenario, type BuildingCommand, type BuildingId, type ScenarioId, type SimulationResultId } from '@hes/domain';
import { PostgresScenarioRepository } from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');
const buildingId: BuildingId = '11111111-1111-4111-8111-111111111111';
const scenarioId: ScenarioId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const simulationId: SimulationResultId = '22222222-2222-4222-8222-222222222222';

interface Row {
  [key: string]: unknown;
}

function fakePool(handler: (text: string, values?: unknown[]) => Row[] = () => []): {
  pool: Pool;
  queries: { text: string; values?: unknown[] }[];
} {
  const queries: { text: string; values?: unknown[] }[] = [];
  const pool = {
    query: (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      const rows = handler(text, values);
      return Promise.resolve({ rows, rowCount: rows.length });
    }
  } as unknown as Pool;
  return { pool, queries };
}

const wallCommand: BuildingCommand = {
  type: 'building.wall.update.v1',
  buildingId,
  wallId: 'wall-1',
  uValueWm2K: 0.2
};

function makeScenario(overrides: Partial<Parameters<typeof Scenario.create>[0]> = {}): Scenario {
  return Scenario.create({
    id: scenarioId,
    buildingId,
    name: 'Isolation murs',
    description: '',
    commands: [wallCommand],
    baselineVersion: 0, // building version at import (schema v3 semantics)
    createdAt: date,
    ...overrides
  });
}

function scenarioRow(scenario: Scenario): Row {
  return {
    id: scenario.id,
    building_id: scenario.buildingId,
    name: scenario.name,
    description: scenario.description,
    commands: scenario.toJson().commands,
    baseline_version: scenario.baselineVersion,
    created_at: date
  };
}

describe('PostgresScenarioRepository (fake pool, schema v4)', () => {
  it('save inserts the scenario with commands JSONB (frozen P4 type tags preserved)', async () => {
    const { pool, queries } = fakePool();
    const repo = new PostgresScenarioRepository(pool);
    await repo.save(makeScenario());
    const insert = queries.find((q) => q.text.includes('INSERT INTO scenarios'))!;
    expect(insert).toBeDefined();
    const commands = JSON.parse(insert.values?.[4] as string) as unknown[];
    expect(commands[0]).toMatchObject({ type: 'building.wall.update.v1', buildingId, wallId: 'wall-1', uValueWm2K: 0.2 });
    expect(insert.values?.[5]).toBe(0); // baseline_version
  });

  it('findById / findByBuildingId revive the aggregate with re-parsed P4 commands; unknown id → null', async () => {
    const scenario = makeScenario();
    const { pool } = fakePool((text) => (text.includes('SELECT') ? [scenarioRow(scenario)] : []));
    const repo = new PostgresScenarioRepository(pool);
    const found = await repo.findById(scenario.id);
    expect(found?.toJson()).toEqual(scenario.toJson());
    expect(found?.commands[0]?.type).toBe('building.wall.update.v1');
    const list = await repo.findByBuildingId(buildingId);
    expect(list).toHaveLength(1);
    const { pool: emptyPool } = fakePool(() => []);
    expect(await new PostgresScenarioRepository(emptyPool).findById(scenario.id)).toBeNull();
  });

  it('findById fails loudly on a stored command outside the frozen vocabulary', async () => {
    const scenario = makeScenario();
    const row = { ...scenarioRow(scenario), commands: [{ type: 'UpdateWall', version: 1, wallId: 'wall-1', uValueWm2K: 0.2 }] };
    const { pool } = fakePool(() => [row]);
    const repo = new PostgresScenarioRepository(pool);
    await expect(repo.findById(scenario.id)).rejects.toThrow(/unknown or missing command type tag/);
  });

  it('update rewrites name/description/commands and bumps updated_at only', async () => {
    const { pool, queries } = fakePool();
    const repo = new PostgresScenarioRepository(pool);
    const updated = makeScenario({ name: 'Renamed' });
    await repo.update(updated);
    const q = queries.find((x) => x.text.includes('UPDATE scenarios'))!;
    expect(q.text).toContain('updated_at = now()');
    expect(q.values?.[0]).toBe(scenarioId);
    expect(q.values?.[1]).toBe('Renamed');
    expect(JSON.parse(q.values?.[3] as string)[0]).toMatchObject({ type: 'building.wall.update.v1' });
  });

  it('linkResult is idempotent (ON CONFLICT DO NOTHING); findLatestResultId returns the newest; findResultLinks lists them', async () => {
    const { pool, queries } = fakePool((text) => {
      if (text.includes('ORDER BY created_at DESC, id DESC LIMIT 1')) {
        return [{ simulation_id: simulationId }];
      }
      if (text.includes('ORDER BY created_at DESC, id DESC')) {
        return [{ scenario_id: scenarioId, simulation_id: simulationId, created_at: date }];
      }
      return [];
    });
    const repo = new PostgresScenarioRepository(pool);
    await repo.linkResult({ scenarioId, simulationId, createdAt: date });
    const insert = queries.find((q) => q.text.includes('INSERT INTO scenario_results'))!;
    expect(insert.text).toContain('ON CONFLICT (scenario_id, simulation_id) DO NOTHING');
    expect(await repo.findLatestResultId(scenarioId)).toBe(simulationId);
    expect(await repo.findResultLinks(scenarioId)).toEqual([{ scenarioId, simulationId, createdAt: date }]);
    const { pool: emptyPool } = fakePool(() => []);
    expect(await new PostgresScenarioRepository(emptyPool).findLatestResultId(scenarioId)).toBeNull();
  });

  it('delete removes only the scenario row (cascade removes links, never simulations or the building)', async () => {
    const { pool, queries } = fakePool();
    const repo = new PostgresScenarioRepository(pool);
    await repo.delete(scenarioId);
    const del = queries.find((q) => q.text.includes('DELETE FROM scenarios'))!;
    expect(del.values).toEqual([scenarioId]);
    expect(queries.some((q) => q.text.includes('DELETE FROM simulations'))).toBe(false);
    expect(queries.some((q) => q.text.includes('DELETE FROM buildings'))).toBe(false);
  });
});
