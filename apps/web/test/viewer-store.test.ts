import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import { geometryToJson, ReconstructionService, type GeometryJson } from '@hes/domain';
import { useViewerStore } from '../src/store/viewer-store.ts';
import { colorForShare, overlayFromSimulation, tryOverlayFromSimulation } from '../src/services/heat-loss.ts';
import { elementColor } from '../src/services/view-colors.ts';
import type { GeometryResponse, SimulationHistoryResponse, SimulationResultJson } from '../src/types.ts';

const fixturePath = fileURLToPath(
  new URL('../../../packages/dpe-xml-importer/test/fixtures/incomplete-dpe.xml', import.meta.url)
);
const importDate = new Date('2026-11-20T10:00:00.000Z');

function fixtureGeometryJson(): GeometryJson {
  const xml = readFileSync(fixturePath, 'utf8');
  const building = new DpeXmlImporter().importDpeXml(xml, importDate).building;
  return JSON.parse(JSON.stringify(geometryToJson(new ReconstructionService().reconstruct(building)))) as GeometryJson;
}

const geometryJson = fixtureGeometryJson();
const geometryResponse: GeometryResponse = {
  buildingId: '11111111-1111-4111-8111-111111111111',
  geometry: geometryJson
};

const mockSimulation: SimulationResultJson = {
  id: '22222222-2222-4222-8222-222222222222',
  buildingId: '11111111-1111-4111-8111-111111111111',
  inputHash: 'abc123',
  engineVersion: '1.11.6',
  createdAt: '2026-11-20T11:00:00.000Z',
  consumptionKwh: 12000,
  consumptionKwhM2An: 148.5,
  emissionsKg: 2400,
  emissionsKgCo2M2An: 29.7,
  energyLabel: 'E',
  climateLabel: 'D',
  rawEngineOutput: {
    logement: {
      sortie: {
        deperdition: {
          deperdition_mur: 120,
          deperdition_plancher_bas: 30,
          deperdition_plancher_haut: 45,
          deperdition_baie_vitree: 25,
          deperdition_porte: 10
        }
      }
    }
  }
};

const emptyHistory: SimulationHistoryResponse = {
  buildingId: geometryResponse.buildingId,
  results: []
};

function stubFetch(history: SimulationHistoryResponse = emptyHistory): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/geometry')) return new Response(JSON.stringify(geometryResponse), { status: 200 });
      if (url.endsWith('/simulations')) return new Response(JSON.stringify(history), { status: 200 });
      return new Response(JSON.stringify({ statusCode: 404, error: 'Not Found', message: 'no building found' }), { status: 404 });
    })
  );
}

describe('viewer store (P3)', () => {
  beforeEach(() => {
    useViewerStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it('loads the geometry from GET /api/buildings/:id/geometry', async () => {
    stubFetch();
    await useViewerStore.getState().loadGeometry(geometryResponse.buildingId);
    const state = useViewerStore.getState();
    expect(state.status).toBe('ready');
    expect(state.geometry?.meshHash).toBe(geometryJson.meshHash);
    expect(state.geometry?.elements.length).toBeGreaterThan(0);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(`/api/buildings/${geometryResponse.buildingId}/geometry`);
  });

  it('wires the latest persisted SimulationResult (P2 history) into the store; empty history keeps the overlay hidden', async () => {
    stubFetch({ buildingId: geometryResponse.buildingId, results: [mockSimulation] });
    await useViewerStore.getState().loadGeometry(geometryResponse.buildingId);
    await vi.waitFor(() => expect(useViewerStore.getState().simulation?.id).toBe(mockSimulation.id));
    expect(useViewerStore.getState().showHeatLoss).toBe(false); // toggle still off by default

    useViewerStore.getState().reset();
    stubFetch();
    await useViewerStore.getState().loadGeometry(geometryResponse.buildingId);
    await vi.waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).endsWith('/simulations'))).toBe(true));
    expect(useViewerStore.getState().simulation).toBeNull();
  });

  it('exposes the API error on a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ statusCode: 404, error: 'Not Found', message: 'no building found with id x' }), { status: 404 }))
    );
    await useViewerStore.getState().loadGeometry('99999999-9999-4999-8999-999999999999');
    const state = useViewerStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toMatch(/no building found/);
    expect(state.geometry).toBeNull();
  });

  it('tryOverlayFromSimulation degrades to an error instead of throwing on a result without deperdition data', () => {
    const bad: SimulationResultJson = { ...mockSimulation, rawEngineOutput: {} };
    const ok = tryOverlayFromSimulation(bad, geometryJson);
    expect(ok.overlay).toBeNull();
    expect(ok.error).toMatch(/deperdition/);
    const good = tryOverlayFromSimulation(mockSimulation, geometryJson);
    expect(good.error).toBeNull();
    expect(good.overlay?.shares.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 9);
  });

  it('tracks selection and hover', () => {
    useViewerStore.getState().select('wall-synthesized-1');
    useViewerStore.getState().setHovered('window-1', [1, 2, 3]);
    const state = useViewerStore.getState();
    expect(state.selectedElementId).toBe('wall-synthesized-1');
    expect(state.hoveredElementId).toBe('window-1');
    expect(state.hoverPoint).toEqual([1, 2, 3]);
    useViewerStore.getState().select(null);
    expect(useViewerStore.getState().selectedElementId).toBeNull();
  });

  it('keeps the heat-loss overlay hidden without a SimulationResult; toggle is a no-op', () => {
    expect(useViewerStore.getState().simulation).toBeNull();
    useViewerStore.getState().toggleHeatLoss();
    expect(useViewerStore.getState().showHeatLoss).toBe(false);
    useViewerStore.getState().setSimulation(mockSimulation);
    useViewerStore.getState().toggleHeatLoss();
    expect(useViewerStore.getState().showHeatLoss).toBe(true);
    useViewerStore.getState().setSimulation(null);
    expect(useViewerStore.getState().showHeatLoss).toBe(false);
  });
});

describe('heat-loss overlay projection (FR-P3-04, mocked SimulationResult)', () => {
  it('projects engine-reported losses onto the fixture geometry; shares sum to 100%', () => {
    const overlay = overlayFromSimulation(mockSimulation, geometryJson);
    expect(overlay.buildingId).toBe(geometryJson.buildingId);
    // the incomplete fixture has walls + synthesized roof/floor/room but no
    // windows/doors: unmatched categories (baie 25, porte 10) are excluded
    expect(overlay.totalEnvelopeLossWk).toBeCloseTo(120 + 30 + 45, 6);
    const sum = overlay.shares.reduce((a, s) => a + s.share, 0);
    expect(sum).toBeCloseTo(1, 9);
    // only envelope elements are colored
    expect(overlay.shares.every((s) => s.kind !== 'room')).toBe(true);
    // every share maps to an existing geometry element
    const ids = new Set(geometryJson.elements.map((e) => e.id));
    expect(overlay.shares.every((s) => ids.has(s.elementId))).toBe(true);
  });
});

describe('viewer color mapping (presentation)', () => {
  it('colorForShare: 0 → green, 1 → red, clamped outside [0,1]', () => {
    expect(colorForShare(0)).toEqual([0x2e / 255, 0x7d / 255, 0x32 / 255]);
    expect(colorForShare(1)).toEqual([0xc6 / 255, 0x28 / 255, 0x28 / 255]);
    expect(colorForShare(-5)).toEqual(colorForShare(0));
    expect(colorForShare(5)).toEqual(colorForShare(1));
  });

  it('elementColor priority: selected blends with the underlying color (visible under the overlay), then hover > loss > inferred > kind', () => {
    const base = { kind: 'wall' as const, inferred: false, selected: false, hovered: false, lossShare: null };
    expect(elementColor({ ...base, lossShare: 0.9 })).toEqual(colorForShare(0.9));
    const selected = elementColor({ ...base, selected: true });
    expect(selected).toEqual([(0.76 + 0.12) / 2, (0.73 + 0.45) / 2, (0.68 + 0.95) / 2]);
    // selected under the overlay: 50/50 blend of the loss color and the selection blue
    const selectedLoss = elementColor({ ...base, lossShare: 1, selected: true });
    const lossRed = colorForShare(1);
    expect(selectedLoss[0]).toBeCloseTo((lossRed[0] + 0.12) / 2, 9);
    expect(elementColor({ ...base, inferred: true })).toEqual([0.96, 0.62, 0.13]);
    const hovered = elementColor({ ...base, hovered: true });
    expect(hovered[0]).toBeGreaterThan(0.76);
  });
});
