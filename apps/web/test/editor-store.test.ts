import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../src/store/editor-store.ts';
import { useSimulationStore } from '../src/store/simulation-store.ts';
import type {
  AuditEntryJson,
  BuildingCommandJson,
  BuildingJson,
  EditBuildingResponse,
  GetBuildingResponse
} from '../src/types.ts';

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';

function makeBuilding(): BuildingJson {
  return {
    id: BUILDING_ID,
    walls: [
      {
        kind: 'wall',
        id: 'wall-1',
        buildingId: BUILDING_ID,
        description: { value: 'Mur', source: 'dpe-xml:x', confidence: 1, importDate: '2026-11-20T10:00:00.000Z' },
        areaM2: { value: 54.25, source: 'dpe-xml:x', confidence: 1, importDate: '2026-11-20T10:00:00.000Z' },
        uValueWm2K: { value: 1.64, source: 'dpe-xml:x', confidence: 1, importDate: '2026-11-20T10:00:00.000Z' },
        orientation: null,
        wallType: null,
        adjacencyType: null
      }
    ],
    windows: [],
    roofs: [],
    floors: [],
    heatingSystems: [],
    ventilationSystems: []
  };
}

const command: BuildingCommandJson = {
  type: 'building.wall.update.v1',
  buildingId: BUILDING_ID,
  wallId: 'wall-1',
  uValueWm2K: 0.25
};

function makeEntry(version: number): AuditEntryJson {
  return {
    id: `entry-${version}`,
    buildingId: BUILDING_ID,
    userId: 'local-user',
    timestamp: '2026-11-21T09:30:00.000Z',
    commandType: 'building.wall.update.v1',
    command,
    changes: [
      {
        field: 'uValueWm2K',
        oldValue: { value: 1.64, source: 'dpe-xml:x', confidence: 1, importDate: '2026-11-20T10:00:00.000Z' },
        newValue: { value: 0.25, source: 'user', confidence: 1, importDate: '2026-11-21T09:30:00.000Z' }
      }
    ],
    version
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function editedBuilding(): BuildingJson {
  const b = makeBuilding();
  return {
    ...b,
    walls: [
      {
        ...b.walls[0]!,
        uValueWm2K: { value: 0.25, source: 'user', confidence: 1, importDate: '2026-11-21T09:30:00.000Z' }
      }
    ]
  };
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}

const getResponse: GetBuildingResponse = { building: makeBuilding(), version: 0, report: {} as GetBuildingResponse['report'] };
const editResponse: EditBuildingResponse = { building: editedBuilding(), version: 1, auditEntry: makeEntry(1) };
const undoResponse: EditBuildingResponse = { building: makeBuilding(), version: 2, auditEntry: makeEntry(2) };

describe('editor store (P4)', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    useSimulationStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it('load() fetches the building with its version and the audit trail', async () => {
    stubFetch((url) => {
      if (url === `/api/buildings/${BUILDING_ID}`) return jsonResponse(getResponse);
      if (url === `/api/buildings/${BUILDING_ID}/audit`) return jsonResponse({ buildingId: BUILDING_ID, entries: [] });
      throw new Error(`unexpected ${url}`);
    });
    await useEditorStore.getState().load(BUILDING_ID);
    const state = useEditorStore.getState();
    expect(state.building?.id).toBe(BUILDING_ID);
    expect(state.version).toBe(0);
    expect(state.audit).toHaveLength(0);
    expect(state.status).toBe('idle');
  });

  it('save() PATCHes with If-Match + x-user-id, updates version/audit and triggers a P2 re-simulation', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url === `/api/buildings/${BUILDING_ID}` && init?.method === 'PATCH') return jsonResponse(editResponse);
      if (url === `/api/buildings/${BUILDING_ID}`) return jsonResponse(getResponse);
      if (url === `/api/buildings/${BUILDING_ID}/audit`) return jsonResponse({ buildingId: BUILDING_ID, entries: [makeEntry(1)] });
      if (url === `/api/buildings/${BUILDING_ID}/simulations`) return jsonResponse({ mode: 'sync', cached: false, result: { id: 'r1' } }, 201);
      if (url === `/api/buildings/${BUILDING_ID}/simulations` && init === undefined) return jsonResponse({ buildingId: BUILDING_ID, results: [] });
      throw new Error(`unexpected ${url}`);
    });
    await useEditorStore.getState().load(BUILDING_ID);
    const ok = await useEditorStore.getState().save(command);
    expect(ok).toBe(true);
    const patchCall = calls.find((c) => c.init?.method === 'PATCH');
    expect(patchCall?.init?.headers).toMatchObject({ 'If-Match': '0', 'x-user-id': 'local-user' });
    expect(JSON.parse(String(patchCall?.init?.body))).toMatchObject({ type: 'building.wall.update.v1', wallId: 'wall-1', uValueWm2K: 0.25 });
    const state = useEditorStore.getState();
    expect(state.version).toBe(1);
    expect(state.building?.walls[0]?.uValueWm2K?.source).toBe('user');
    expect(state.audit).toHaveLength(1);
    // re-simulation was triggered through the P2 endpoint
    expect(calls.some((c) => c.url.endsWith('/simulations') && c.init?.method === 'POST')).toBe(true);
    await vi.waitFor(() => expect(useSimulationStore.getState().status).toBe('done'));
  });

  it('save() maps a 400 fieldErrors response onto the form and does not simulate', async () => {
    stubFetch((url, init) => {
      if (init?.method === 'PATCH') {
        return jsonResponse(
          { statusCode: 400, error: 'Bad Request', message: 'invalid', code: 'COMMAND_VALIDATION', fieldErrors: [{ field: 'uValueWm2K', message: 'must be in (0, 4] W/m².K' }] },
          400
        );
      }
      if (url === `/api/buildings/${BUILDING_ID}`) return jsonResponse(getResponse);
      if (url.endsWith('/audit')) return jsonResponse({ buildingId: BUILDING_ID, entries: [] });
      throw new Error(`unexpected ${url}`);
    });
    await useEditorStore.getState().load(BUILDING_ID);
    const ok = await useEditorStore.getState().save({ ...command, uValueWm2K: -1 });
    expect(ok).toBe(false);
    const state = useEditorStore.getState();
    expect(state.fieldErrors['uValueWm2K']).toEqual(['must be in (0, 4] W/m².K']);
    expect(state.version).toBe(0);
    expect(useSimulationStore.getState().status).toBe('idle');
  });

  it('save() on 409 sets conflict, reloads the current version and does not simulate', async () => {
    let patchCount = 0;
    stubFetch((url, init) => {
      if (init?.method === 'PATCH') {
        patchCount += 1;
        return jsonResponse(
          { statusCode: 409, error: 'Conflict', message: 'stale', code: 'STALE_VERSION', expectedVersion: 0, currentVersion: 5 },
          409
        );
      }
      if (url === `/api/buildings/${BUILDING_ID}`) return jsonResponse({ ...getResponse, version: 5 });
      if (url.endsWith('/audit')) return jsonResponse({ buildingId: BUILDING_ID, entries: [] });
      throw new Error(`unexpected ${url}`);
    });
    await useEditorStore.getState().load(BUILDING_ID);
    const ok = await useEditorStore.getState().save(command);
    expect(ok).toBe(false);
    expect(patchCount).toBe(1);
    const state = useEditorStore.getState();
    expect(state.conflict).toBe(true);
    expect(state.version).toBe(5); // reloaded
    expect(useSimulationStore.getState().status).toBe('idle');
  });

  it('undo() POSTs with If-Match, updates state and re-simulates', async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (init?.method === 'POST' && url.endsWith('/undo')) return jsonResponse(undoResponse);
      if (url === `/api/buildings/${BUILDING_ID}`) return jsonResponse({ ...getResponse, version: 1, building: editedBuilding() });
      if (url.endsWith('/audit')) return jsonResponse({ buildingId: BUILDING_ID, entries: [makeEntry(1), makeEntry(2)] });
      if (url.endsWith('/simulations') && init?.method === 'POST') return jsonResponse({ mode: 'sync', cached: false, result: { id: 'r2' } }, 201);
      if (url.endsWith('/simulations')) return jsonResponse({ buildingId: BUILDING_ID, results: [] });
      throw new Error(`unexpected ${url}`);
    });
    await useEditorStore.getState().load(BUILDING_ID);
    // pretend an edit happened
    useEditorStore.setState({ version: 1, building: editedBuilding() });
    await useEditorStore.getState().undo();
    const state = useEditorStore.getState();
    expect(state.version).toBe(2);
    expect(state.audit).toHaveLength(2);
    expect(calls.some((c) => c === `POST /api/buildings/${BUILDING_ID}/undo`)).toBe(true);
    expect(calls.some((c) => c === `POST /api/buildings/${BUILDING_ID}/simulations`)).toBe(true);
  });
});
