import { describe, expect, it } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  createSimulationJob,
  createSimulationResultRecord,
  type SimulationJob,
  type SimulationResultRecord
} from '@hes/domain';
import { SimulationAlreadyInFlightError } from '@hes/application';
import { PostgresSimulationRepository } from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');
const hash = 'b'.repeat(64);

function makeRecord(overrides: Partial<Parameters<typeof createSimulationResultRecord>[0]> = {}): SimulationResultRecord {
  return createSimulationResultRecord({
    id: '22222222-2222-4222-8222-222222222222',
    buildingId: '11111111-1111-4111-8111-111111111111',
    inputHash: hash,
    engineVersion: '1.11.6',
    createdAt: date,
    consumptionKwh: 48522.767,
    emissionsKg: 7770.9,
    energyLabel: 'D',
    climateLabel: 'D',
    rawEngineOutput: { logement: { sortie: {} } },
    ...overrides
  });
}

function makeJob(overrides: Partial<Parameters<typeof createSimulationJob>[0]> = {}): SimulationJob {
  return createSimulationJob({
    id: '33333333-3333-4333-8333-333333333333',
    buildingId: '11111111-1111-4111-8111-111111111111',
    inputHash: hash,
    createdAt: date,
    ...overrides
  });
}

interface CapturedQuery {
  text: string;
  values?: unknown[];
}

type Row = Record<string, unknown>;

/**
 * Fake pool whose query handler is programmable per SQL pattern, so each
 * repository method is tested against its real SQL shape.
 */
function fakePool(handler: (text: string, values?: unknown[]) => Row[] = () => []): {
  pool: Pool;
  queries: CapturedQuery[];
} {
  const queries: CapturedQuery[] = [];
  const pool = {
    query: (text: string, values?: unknown[]): Promise<QueryResult> => {
      queries.push({ text, values });
      const rows = handler(text, values);
      return Promise.resolve({ rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as QueryResult);
    }
  } as unknown as Pool;
  return { pool, queries };
}

function jobRow(job: SimulationJob): Row {
  return {
    id: job.id,
    building_id: job.buildingId,
    input_hash: job.inputHash,
    status: job.status,
    result_id: job.resultId,
    error: job.error,
    created_at: job.createdAt,
    started_at: job.startedAt,
    finished_at: job.finishedAt
  };
}

describe('PostgresSimulationRepository', () => {
  it('saveResult inserts with ON CONFLICT DO NOTHING on (building_id, input_hash) — the cache — and returns the persisted record', async () => {
    const record = makeRecord();
    const recordJson = { ...record, createdAt: record.createdAt.toISOString() };
    const { pool, queries } = fakePool((text) => {
      if (text.includes('INSERT INTO simulations')) return [{ result: recordJson }];
      return [];
    });
    const repo = new PostgresSimulationRepository(pool);
    const saved = await repo.saveResult(record);
    expect(saved.id).toBe(record.id);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.text).toContain('INSERT INTO simulations');
    expect(queries[0]?.text).toContain('ON CONFLICT (building_id, input_hash) DO NOTHING');
    expect(queries[0]?.text).toContain('RETURNING result');
    const values = queries[0]?.values as unknown[];
    expect(values[0]).toBe('22222222-2222-4222-8222-222222222222');
    expect(values[2]).toBe(hash);
    expect(values[3]).toBe('1.11.6');
    const result = JSON.parse(values[4] as string) as { inputHash: string; energyLabel: string };
    expect(result.inputHash).toBe(hash);
    expect(result.energyLabel).toBe('D');
  });

  it('saveResult on conflict (rowCount 0) re-reads and returns the winning persisted row, never an unpersisted record', async () => {
    const loser = makeRecord();
    const winner = makeRecord({ id: '99999999-9999-4999-8999-999999999999' });
    const winnerJson = { ...winner, createdAt: winner.createdAt.toISOString() };
    const { pool, queries } = fakePool((text) => {
      if (text.includes('INSERT INTO simulations')) return []; // ON CONFLICT DO NOTHING: no row returned
      if (text.includes('input_hash = $2')) return [{ result: winnerJson }]; // the winner re-read
      return [];
    });
    const repo = new PostgresSimulationRepository(pool);
    const saved = await repo.saveResult(loser);
    expect(saved.id).toBe(winner.id);
    expect(queries).toHaveLength(2);
    expect(queries[1]?.text).toContain('SELECT result FROM simulations');
  });

  it('saveResult throws when a conflict has no winning row (defensive: impossible with the unique constraint)', async () => {
    const { pool } = fakePool(() => []);
    const repo = new PostgresSimulationRepository(pool);
    await expect(repo.saveResult(makeRecord())).rejects.toThrow(/conflict without a winning row/);
  });

  it('findResultById / findResultByInputHash / findResultsByBuildingId revive records from jsonb', async () => {
    const record = makeRecord();
    const recordJson = {
      ...record,
      createdAt: record.createdAt.toISOString()
    };
    const { pool } = fakePool((text, values) => {
      if (text.includes('WHERE id = $1') && values?.[0] === record.id) return [{ result: recordJson }];
      if (text.includes('input_hash = $2')) return [{ result: recordJson }];
      if (text.includes('ORDER BY created_at DESC')) return [{ result: recordJson }];
      return [];
    });
    const repo = new PostgresSimulationRepository(pool);
    const byId = await repo.findResultById(record.id);
    expect(byId?.id).toBe(record.id);
    expect(byId?.createdAt).toEqual(date);
    const byHash = await repo.findResultByInputHash(record.buildingId, hash);
    expect(byHash?.inputHash).toBe(hash);
    const history = await repo.findResultsByBuildingId(record.buildingId);
    expect(history).toHaveLength(1);
    expect(await repo.findResultById('unknown')).toBeNull();
  });

  it('saveJob inserts the queued job; the partial unique index guards in-flight duplicates', async () => {
    const { pool, queries } = fakePool();
    const repo = new PostgresSimulationRepository(pool);
    await repo.saveJob(makeJob());
    expect(queries[0]?.text).toContain('INSERT INTO simulation_jobs');
    const values = queries[0]?.values as unknown[];
    expect(values[3]).toBe('queued');
  });

  it('saveJob maps a unique violation (SQLSTATE 23505) from the partial index to SimulationAlreadyInFlightError (409, not 500)', async () => {
    const { pool } = fakePool(() => {
      const error = new Error('duplicate key value violates unique constraint') as Error & { code?: string };
      error.code = '23505';
      throw error;
    });
    const repo = new PostgresSimulationRepository(pool);
    const job = makeJob();
    await expect(repo.saveJob(job)).rejects.toBeInstanceOf(SimulationAlreadyInFlightError);
    await expect(repo.saveJob(job)).rejects.toMatchObject({ code: 'SIMULATION_IN_FLIGHT', jobId: job.id, inputHash: hash });
  });

  it('saveJob rethrows non-unique-violation errors unchanged', async () => {
    const failure = new Error('connection reset');
    const { pool } = fakePool(() => {
      throw failure;
    });
    const repo = new PostgresSimulationRepository(pool);
    await expect(repo.saveJob(makeJob())).rejects.toBe(failure);
  });

  it('updateJob writes the state transition (running/done/failed)', async () => {
    const { pool, queries } = fakePool();
    const repo = new PostgresSimulationRepository(pool);
    const job = makeJob();
    job.markRunning(date);
    job.markDone('22222222-2222-4222-8222-222222222222', date);
    await repo.updateJob(job);
    expect(queries[0]?.text).toContain('UPDATE simulation_jobs');
    const values = queries[0]?.values as unknown[];
    expect(values[1]).toBe('done');
    expect(values[2]).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('findJobById / findActiveJobByInputHash revive jobs and filter in-flight only', async () => {
    const job = makeJob();
    const { pool, queries } = fakePool((text) => {
      if (text.includes("status IN ('queued', 'running')")) return [jobRow(job)];
      return [jobRow(job)];
    });
    const repo = new PostgresSimulationRepository(pool);
    const found = await repo.findJobById(job.id);
    expect(found?.status).toBe('queued');
    const active = await repo.findActiveJobByInputHash(job.buildingId, hash);
    expect(active?.id).toBe(job.id);
    expect(queries[1]?.text).toContain("status IN ('queued', 'running')");
    const { pool: emptyPool } = fakePool(() => []);
    const emptyRepo = new PostgresSimulationRepository(emptyPool);
    expect(await emptyRepo.findJobById(job.id)).toBeNull();
    expect(await emptyRepo.findActiveJobByInputHash(job.buildingId, hash)).toBeNull();
  });

  it('failed jobs persist the typed error as jsonb', async () => {
    const job = makeJob();
    job.markRunning(date);
    job.markFailed({ code: 'ENGINE_EXECUTION', message: 'boom' }, date);
    const { pool, queries } = fakePool(() => [jobRow(job)]);
    const repo = new PostgresSimulationRepository(pool);
    const found = await repo.findJobById(job.id);
    expect(found?.status).toBe('failed');
    expect(found?.error).toEqual({ code: 'ENGINE_EXECUTION', message: 'boom' });
    await repo.updateJob(job);
    const update = queries.find((q) => q.text.includes('UPDATE simulation_jobs'));
    expect(JSON.parse((update?.values as unknown[])[3] as string)).toEqual({
      code: 'ENGINE_EXECUTION',
      message: 'boom'
    });
  });
});
