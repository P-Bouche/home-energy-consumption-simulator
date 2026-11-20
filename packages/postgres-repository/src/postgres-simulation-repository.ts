import {
  simulationJobFromJson,
  simulationResultRecordFromJson,
  simulationResultRecordToJson,
  type BuildingId,
  type SimulationInputHash,
  type SimulationJob,
  type SimulationJobId,
  type SimulationResultId,
  type SimulationJobError,
  type SimulationResultRecord,
  type SimulationResultRecordJson
} from '@hes/domain';
import { SimulationAlreadyInFlightError, type SimulationRepository } from '@hes/application';
import type { Pool } from 'pg';

/**
 * Postgres adapter for the SimulationRepository port (pg, no ORM).
 *
 * Schema v2 (infrastructure/postgres/migrations/0002_simulations.sql):
 * - simulations(id uuid PK, building_id FK, input_hash, engine_version, status, result jsonb, created_at)
 *   with UNIQUE (building_id, input_hash) — the input-hash result cache
 * - simulation_jobs(id uuid PK, building_id FK, input_hash, status, result_id, error jsonb, timestamps)
 *   with a partial unique index allowing at most one in-flight job per (building_id, input_hash)
 */
export class PostgresSimulationRepository implements SimulationRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Persists a simulation result. Uses INSERT ... ON CONFLICT DO NOTHING on
   * (building_id, input_hash): a concurrent identical computation is the
   * cache path, not an error.
   */
  async saveResult(record: SimulationResultRecord): Promise<SimulationResultRecord> {
    const json = simulationResultRecordToJson(record);
    const inserted = await this.pool.query(
      `INSERT INTO simulations (id, building_id, input_hash, engine_version, status, result, created_at)
       VALUES ($1, $2, $3, $4, 'done', $5, $6)
       ON CONFLICT (building_id, input_hash) DO NOTHING
       RETURNING result`,
      [
        record.id,
        record.buildingId,
        record.inputHash,
        record.engineVersion,
        JSON.stringify(json),
        record.createdAt
      ]
    );
    if ((inserted.rowCount ?? 0) > 0) {
      return record;
    }
    // Lost the race: a concurrent request persisted the identical input
    // first. Re-read and return the winning row so the caller never holds an
    // unpersisted record (which would 404 on a later GET /simulations/:id).
    const winner = await this.findResultByInputHash(record.buildingId, record.inputHash);
    if (winner === null) {
      throw new Error(`simulation result conflict without a winning row for hash ${record.inputHash}`);
    }
    return winner;
  }

  async findResultById(id: SimulationResultId): Promise<SimulationResultRecord | null> {
    const result = await this.pool.query('SELECT result FROM simulations WHERE id = $1', [id]);
    const row = result.rows[0] as { result: unknown } | undefined;
    return row === undefined ? null : simulationResultRecordFromJson(row.result as SimulationResultRecordJson);
  }

  async findResultsByBuildingId(buildingId: BuildingId): Promise<readonly SimulationResultRecord[]> {
    const result = await this.pool.query(
      'SELECT result FROM simulations WHERE building_id = $1 ORDER BY created_at DESC',
      [buildingId]
    );
    return result.rows.map(
      (row) => simulationResultRecordFromJson((row as { result: unknown }).result as SimulationResultRecordJson)
    );
  }

  async findResultByInputHash(
    buildingId: BuildingId,
    inputHash: SimulationInputHash
  ): Promise<SimulationResultRecord | null> {
    const result = await this.pool.query(
      'SELECT result FROM simulations WHERE building_id = $1 AND input_hash = $2',
      [buildingId, inputHash]
    );
    const row = result.rows[0] as { result: unknown } | undefined;
    return row === undefined ? null : simulationResultRecordFromJson(row.result as SimulationResultRecordJson);
  }

  /**
   * Persists a newly queued job. The partial unique index on
   * (building_id, input_hash) WHERE status IN ('queued','running') rejects a
   * duplicate in-flight job with a unique violation (SQLSTATE 23505).
   */
  async saveJob(job: SimulationJob): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO simulation_jobs (id, building_id, input_hash, status, result_id, error, created_at, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        jobRowParams(job)
      );
    } catch (error) {
      // The partial unique index rejects a duplicate in-flight job with
      // SQLSTATE 23505: convert it to the typed 409 error instead of an
      // unhandled 500 (check-then-act race between findActiveJobByInputHash
      // and saveJob).
      if (isUniqueViolation(error)) {
        throw new SimulationAlreadyInFlightError(job.id, job.inputHash);
      }
      throw error;
    }
  }

  async updateJob(job: SimulationJob): Promise<void> {
    await this.pool.query(
      `UPDATE simulation_jobs
       SET status = $2, result_id = $3, error = $4, started_at = $5, finished_at = $6
       WHERE id = $1`,
      [job.id, job.status, job.resultId, job.error === null ? null : JSON.stringify(job.error), job.startedAt, job.finishedAt]
    );
  }

  async findJobById(id: SimulationJobId): Promise<SimulationJob | null> {
    const result = await this.pool.query('SELECT * FROM simulation_jobs WHERE id = $1', [id]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row === undefined ? null : simulationJobFromJson(rowToJobJson(row));
  }

  async findActiveJobByInputHash(
    buildingId: BuildingId,
    inputHash: SimulationInputHash
  ): Promise<SimulationJob | null> {
    const result = await this.pool.query(
      `SELECT * FROM simulation_jobs
       WHERE building_id = $1 AND input_hash = $2 AND status IN ('queued', 'running')
       ORDER BY created_at ASC LIMIT 1`,
      [buildingId, inputHash]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row === undefined ? null : simulationJobFromJson(rowToJobJson(row));
  }
}

function jobRowParams(job: SimulationJob): unknown[] {
  return [
    job.id,
    job.buildingId,
    job.inputHash,
    job.status,
    job.resultId,
    job.error === null ? null : JSON.stringify(job.error),
    job.createdAt,
    job.startedAt,
    job.finishedAt
  ];
}

function rowToJobJson(row: Record<string, unknown>): Parameters<typeof simulationJobFromJson>[0] {
  const toIso = (value: unknown): string | null =>
    value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : null;
  return {
    id: String(row['id']),
    buildingId: String(row['building_id']),
    inputHash: String(row['input_hash']),
    status: row['status'] as 'queued' | 'running' | 'done' | 'failed',
    resultId: row['result_id'] === null ? null : String(row['result_id']),
    error: row['error'] === null ? null : (row['error'] as SimulationJobError),
    createdAt: toIso(row['created_at']) as string,
    startedAt: toIso(row['started_at']),
    finishedAt: toIso(row['finished_at'])
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}
