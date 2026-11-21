import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScenarioStore } from '../src/store/scenario-store.ts';
import type {
  ApplyScenarioResponse,
  ComparisonResponse,
  ScenarioJson,
  ScenarioListResponse,
  SimulateScenarioResponse
} from '../src/types.ts';

const buildingId = '11111111-1111-4111-8111-111111111111';

const scenario: ScenarioJson = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  buildingId,
  name: 'Isolation des murs',
  description: 'U=0.2',
  commands: [{ type: 'building.wall.update.v1', buildingId, wallId: 'wall-1', uValueWm2K: 0.2 }],
  baselineVersion: 0,
  createdAt: '2026-11-21T10:00:00.000Z'
};

const simulateResponse: SimulateScenarioResponse = {
  scenarioId: scenario.id,
  mode: 'sync',
  result: {
    id: '22222222-2222-4222-8222-222222222222',
    buildingId,
    inputHash: 'a'.repeat(64),
    engineVersion: '1.11.6',
    createdAt: '2026-11-21T10:00:00.000Z',
    consumptionKwh: 7000,
    consumptionKwhM2An: 87,
    emissionsKg: 1400,
    emissionsKgCo2M2An: 17,
    energyLabel: 'C',
    climateLabel: 'C',
    rawEngineOutput: {}
  }
};

const comparison: ComparisonResponse = {
  buildingId,
  baseline: { ...simulateResponse.result, id: '33333333-3333-4333-8333-333333333333', consumptionKwh: 16400, emissionsKg: 3413, energyLabel: 'D', climateLabel: 'D' },
  entries: [
    {
      scenarioId: scenario.id,
      name: scenario.name,
      baselineVersion: 0,
      result: simulateResponse.result,
      deltaKwh: 7000 - 16400,
      deltaKgCo2: 1400 - 3413,
      energyLabelChange: { from: 'D', to: 'C' },
      climateLabelChange: { from: 'D', to: 'C' },
      rank: 1
    }
  ],
  simulatedNow: [],
  generatedAt: '2026-11-21T10:00:01.000Z'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === `/api/buildings/${buildingId}`) {
      return jsonResponse({
        building: { id: buildingId, walls: [{ id: 'wall-1', description: { value: 'Mur' } }], roofs: [], floors: [], windows: [], heatingSystems: [], ventilationSystems: [] },
        report: {}
      });
    }
    if (url === `/api/buildings/${buildingId}/scenarios`) {
      if (method === 'POST') return jsonResponse(scenario, 201);
      return jsonResponse({ buildingId, scenarios: [scenario] } satisfies ScenarioListResponse);
    }
    if (url === `/api/scenarios/${scenario.id}/simulate` && method === 'POST') return jsonResponse(simulateResponse, 201);
    if (url === `/api/scenarios/${scenario.id}/apply` && method === 'POST') {
      const apply: ApplyScenarioResponse = {
        scenarioId: scenario.id,
        previousVersion: 0,
        newVersion: 1,
        auditEntries: [],
        simulationMode: 'cached',
        simulation: simulateResponse.result
      };
      return jsonResponse(apply);
    }
    if (url === `/api/scenarios/${scenario.id}` && method === 'DELETE') return new Response(null, { status: 204 });
    if (url === `/api/buildings/${buildingId}/compare` && method === 'POST') return jsonResponse(comparison);
    return jsonResponse({ statusCode: 404, error: 'Not Found', message: `no route ${method} ${url}` }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('scenario store (P5)', () => {
  beforeEach(() => {
    useScenarioStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it('load fetches the building and the scenario list', async () => {
    stubFetch();
    await useScenarioStore.getState().load(buildingId);
    const state = useScenarioStore.getState();
    expect(state.status).toBe('ready');
    expect(state.building?.walls[0]?.id).toBe('wall-1');
    expect(state.scenarios).toHaveLength(1);
  });

  it('create posts the change-set and appends the scenario', async () => {
    stubFetch();
    await useScenarioStore.getState().load(buildingId);
    const created = await useScenarioStore.getState().create({
      name: 'Isolation des murs',
      description: 'U=0.2',
      commands: [{ type: 'building.wall.update.v1', buildingId, wallId: 'wall-1', uValueWm2K: 0.2 }]
    });
    expect(created.id).toBe(scenario.id);
    expect(useScenarioStore.getState().scenarios.map((s) => s.id)).toContain(scenario.id);
  });

  it('simulate stores the result per scenario and invalidates the comparison', async () => {
    stubFetch();
    await useScenarioStore.getState().load(buildingId);
    await useScenarioStore.getState().compare();
    expect(useScenarioStore.getState().comparison).not.toBeNull();
    await useScenarioStore.getState().simulate(scenario.id);
    const state = useScenarioStore.getState();
    expect(state.lastSimulations[scenario.id]?.result.energyLabel).toBe('C');
    expect(state.comparison).toBeNull();
  });

  it('compare stores the comparison; apply stores the version bump and reloads; remove filters the list', async () => {
    stubFetch();
    await useScenarioStore.getState().load(buildingId);
    await useScenarioStore.getState().compare();
    expect(useScenarioStore.getState().comparison?.entries[0]?.deltaKwh).toBe(-9400);
    await useScenarioStore.getState().apply(scenario.id);
    expect(useScenarioStore.getState().lastApply?.newVersion).toBe(1);
    await useScenarioStore.getState().remove(scenario.id);
    expect(useScenarioStore.getState().scenarios).toHaveLength(0);
  });

  it('surfaces API errors in state.error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ statusCode: 422, error: 'Unprocessable Entity', message: 'unknown command type' }, 422))
    );
    await useScenarioStore.getState().load(buildingId);
    expect(useScenarioStore.getState().status).toBe('error');
    expect(useScenarioStore.getState().error).toContain('unknown command type');
  });
});
