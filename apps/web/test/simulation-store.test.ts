import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimulationStore } from '../src/store/simulation-store.ts';
import type { RunSimulationResponse, SimulationJobJson, SimulationResultJson } from '../src/types.ts';

const result: SimulationResultJson = {
  id: '22222222-2222-4222-8222-222222222222',
  buildingId: '11111111-1111-4111-8111-111111111111',
  inputHash: 'a'.repeat(64),
  engineVersion: '1.11.6',
  createdAt: '2026-11-20T10:00:00.000Z',
  consumptionKwh: 48522.767,
  consumptionKwhM2An: 219,
  emissionsKg: 7770.9,
  emissionsKgCo2M2An: 35,
  energyLabel: 'D',
  climateLabel: 'D',
  rawEngineOutput: {}
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('simulation store', () => {
  beforeEach(() => {
    useSimulationStore.getState().reset();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
  });

  it('sync run stores the result and reloads history', async () => {
    const runResponse: RunSimulationResponse = { mode: 'sync', cached: false, result };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/buildings/${result.buildingId}/simulations`) {
          if (init?.method === 'POST') {
            return jsonResponse(runResponse, 201);
          }
          return jsonResponse({ buildingId: result.buildingId, results: [result] }, 200);
        }
        throw new Error(`unexpected fetch ${url}`);
      })
    );
    await useSimulationStore.getState().run(result.buildingId);
    const state = useSimulationStore.getState();
    expect(state.status).toBe('done');
    expect(state.result?.id).toBe(result.id);
    expect(state.cached).toBe(false);
    expect(state.history).toHaveLength(1);
  });

  it('cached run exposes cached=true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return jsonResponse({ mode: 'cached', cached: true, result } satisfies RunSimulationResponse, 201);
        }
        return jsonResponse({ buildingId: result.buildingId, results: [result] }, 200);
      })
    );
    await useSimulationStore.getState().run(result.buildingId);
    expect(useSimulationStore.getState().cached).toBe(true);
    expect(useSimulationStore.getState().status).toBe('done');
  });

  it('queued run polls the job until done and stores the result', async () => {
    const job: SimulationJobJson = {
      id: '33333333-3333-4333-8333-333333333333',
      buildingId: result.buildingId,
      inputHash: result.inputHash,
      status: 'queued',
      resultId: null,
      error: null,
      createdAt: '2026-11-20T10:00:00.000Z',
      startedAt: null,
      finishedAt: null
    };
    const doneJob: SimulationJobJson = { ...job, status: 'done', resultId: result.id };
    let polls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(_input);
        if (init?.method === 'POST') {
          return jsonResponse({ mode: 'async', cached: false, job } satisfies RunSimulationResponse, 202);
        }
        if (url.includes('/jobs/')) {
          polls += 1;
          return jsonResponse(polls < 2 ? job : doneJob, 200);
        }
        return jsonResponse({ buildingId: result.buildingId, results: [result] }, 200);
      })
    );
    const runPromise = useSimulationStore.getState().run(result.buildingId);
    await vi.advanceTimersByTimeAsync(700);
    await vi.advanceTimersByTimeAsync(700);
    await vi.advanceTimersByTimeAsync(700);
    await runPromise;
    const state = useSimulationStore.getState();
    expect(state.status).toBe('done');
    expect(state.result?.id).toBe(result.id);
    expect(state.job?.status).toBe('done');
  });

  it('failed job surfaces the typed error', async () => {
    const job: SimulationJobJson = {
      id: '33333333-3333-4333-8333-333333333333',
      buildingId: result.buildingId,
      inputHash: result.inputHash,
      status: 'running',
      resultId: null,
      error: null,
      createdAt: '2026-11-20T10:00:00.000Z',
      startedAt: '2026-11-20T10:00:01.000Z',
      finishedAt: null
    };
    const failedJob: SimulationJobJson = {
      ...job,
      status: 'failed',
      error: { code: 'ENGINE_EXECUTION', message: 'boom' },
      finishedAt: '2026-11-20T10:00:02.000Z'
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(_input);
        if (init?.method === 'POST') {
          return jsonResponse({ mode: 'async', cached: false, job } satisfies RunSimulationResponse, 202);
        }
        if (url.includes('/jobs/')) {
          return jsonResponse(failedJob, 200);
        }
        return jsonResponse({ buildingId: result.buildingId, results: [] }, 200);
      })
    );
    const runPromise = useSimulationStore.getState().run(result.buildingId);
    await vi.advanceTimersByTimeAsync(700);
    await runPromise;
    const state = useSimulationStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toContain('ENGINE_EXECUTION');
  });

  it('API error on run sets status error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ statusCode: 404, error: 'Not Found', message: 'no building found with id x' }, 404)
      )
    );
    await useSimulationStore.getState().run('unknown');
    const state = useSimulationStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toContain('no building');
  });
});
