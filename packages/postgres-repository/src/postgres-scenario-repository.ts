import { createHash } from 'node:crypto';
import { Scenario, type BuildingId, type ScenarioId, type SimulationResultId } from '@hes/domain';
import type { ScenarioRepository, ScenarioResultLink } from '@hes/application';
import type { Pool } from 'pg';

/**
 * Postgres adapter for the ScenarioRepository port (pg, no ORM).
 *
 * Schema v4 (infrastructure/postgres/migrations/0004_scenarios.sql):
 * - scenarios(id uuid PK, building_id FK CASCADE, name, description,
 *   commands jsonb (versioned command tags), baseline_version, timestamps)
 * - scenario_results(id uuid PK, scenario_id FK CASCADE, simulation_id FK
 *   CASCADE, created_at) with UNIQUE (scenario_id, simulation_id)
 */
export class PostgresScenarioRepository implements ScenarioRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async save(scenario: Scenario): Promise<void> {
    const json = scenario.toJson();
    await this.pool.query(
      `INSERT INTO scenarios (id, building_id, name, description, commands, baseline_version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [json.id, json.buildingId, json.name, json.description, JSON.stringify(json.commands), json.baselineVersion, json.createdAt]
    );
  }

  async findById(id: ScenarioId): Promise<Scenario | null> {
    const result = await this.pool.query('SELECT commands, building_id, name, description, baseline_version, created_at FROM scenarios WHERE id = $1', [id]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (row === undefined) {
      return null;
    }
    return rowToScenario(id, row);
  }

  async findByBuildingId(buildingId: BuildingId): Promise<readonly Scenario[]> {
    const result = await this.pool.query(
      `SELECT id, building_id, name, description, commands, baseline_version, created_at
       FROM scenarios WHERE building_id = $1 ORDER BY created_at ASC`,
      [buildingId]
    );
    return result.rows.map((row) => rowToScenario(String((row as Record<string, unknown>)['id']), row as Record<string, unknown>));
  }

  async update(scenario: Scenario): Promise<void> {
    const json = scenario.toJson();
    await this.pool.query(
      `UPDATE scenarios SET name = $2, description = $3, commands = $4, updated_at = now()
       WHERE id = $1`,
      [json.id, json.name, json.description, JSON.stringify(json.commands)]
    );
  }

  async delete(id: ScenarioId): Promise<void> {
    // scenario_results rows are removed by ON DELETE CASCADE; the simulations
    // rows (shared cache) and the building are never touched (FR-P5-06).
    await this.pool.query('DELETE FROM scenarios WHERE id = $1', [id]);
  }

  async linkResult(link: ScenarioResultLink): Promise<void> {
    await this.pool.query(
      `INSERT INTO scenario_results (id, scenario_id, simulation_id, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scenario_id, simulation_id) DO NOTHING`,
      [linkId(link), link.scenarioId, link.simulationId, link.createdAt]
    );
  }

  async findLatestResultId(scenarioId: ScenarioId): Promise<SimulationResultId | null> {
    const result = await this.pool.query(
      `SELECT simulation_id FROM scenario_results WHERE scenario_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [scenarioId]
    );
    const row = result.rows[0] as { simulation_id: string } | undefined;
    return row === undefined ? null : row.simulation_id;
  }

  async findResultLinks(scenarioId: ScenarioId): Promise<readonly ScenarioResultLink[]> {
    const result = await this.pool.query(
      `SELECT scenario_id, simulation_id, created_at FROM scenario_results
       WHERE scenario_id = $1 ORDER BY created_at DESC, id DESC`,
      [scenarioId]
    );
    return result.rows.map((row) => {
      const r = row as { scenario_id: string; simulation_id: string; created_at: Date };
      return { scenarioId: r.scenario_id, simulationId: r.simulation_id, createdAt: r.created_at };
    });
  }
}

function rowToScenario(id: string, row: Record<string, unknown>): Scenario {
  const createdAt = row['created_at'];
  return Scenario.fromJson({
    id,
    buildingId: String(row['building_id']),
    name: String(row['name']),
    description: String(row['description']),
    commands: row['commands'] as never,
    baselineVersion: Number(row['baseline_version']),
    createdAt: (createdAt instanceof Date ? createdAt : new Date(String(createdAt))).toISOString()
  });
}

function linkId(link: ScenarioResultLink): string {
  // Deterministic id from the (unique) pair so re-linking is idempotent even
  // without the ON CONFLICT clause being hit first.
  return stableUuid(`${link.scenarioId}:${link.simulationId}`);
}

/**
 * Derives a deterministic UUID-shaped id from a string (sha-256 based, so
 * the same (scenario, simulation) pair always maps to the same row id).
 */
function stableUuid(input: string): string {
  const hex = createHash('sha256').update(input, 'utf8').digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
