import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import { geometryToJson, ReconstructionService, type GeometryJson } from '@hes/domain';
import { useViewerStore } from '../src/store/viewer-store.ts';
import { colorForShare, overlayFromSimulation } from '../src/services/heat-loss.ts';
import { elementColor } from '../src/services/view-colors.ts';
import type { GeometryResponse, SimulationResultJson } from '../src/types.ts';

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
  consumptionKwh: 12000,
  emissionsKg: 2400,
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

describe('viewer store (P3)', () => {
  beforeEach(() => {
    useViewerStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it('loads the geometry from GET /api/buildings/:id/geometry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(geometryResponse), { status: 200 })));
    await useViewerStore.getState().loadGeometry(geometryResponse.buildingId);
    const state = useViewerStore.getState();
    expect(state.status).toBe('ready');
    expect(state.geometry?.meshHash).toBe(geometryJson.meshHash);
    expect(state.geometry?.elements.length).toBeGreaterThan(0);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(`/api/buildings/${geometryResponse.buildingId}/geometry`);
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
    expect(overlay.totalEnvelopeLossWk).toBeCloseTo(230, 6);
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

  it('elementColor priority: overlay > selected > hovered > inferred > kind', () => {
    const base = { kind: 'wall' as const, inferred: false, selected: false, hovered: false, lossShare: null };
    expect(elementColor({ ...base, lossShare: 0.9 })).toEqual(colorForShare(0.9));
    expect(elementColor({ ...base, selected: true })).toEqual([0.12, 0.45, 0.95]);
    expect(elementColor({ ...base, inferred: true })).toEqual([0.96, 0.62, 0.13]);
    const hovered = elementColor({ ...base, hovered: true });
    expect(hovered[0]).toBeGreaterThan(0.76);
  });
});
