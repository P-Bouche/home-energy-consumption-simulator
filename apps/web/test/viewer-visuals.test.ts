import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import { geometryToJson, ReconstructionService, type GeometryJson, type HeatLossShare } from '@hes/domain';
import { colorForShare, formatSharePercent, maxLossShare, normalizedLossShares } from '../src/services/heat-loss.ts';
import { elementColor, SELECTION_OUTLINE_COLOR } from '../src/services/view-colors.ts';
import { useViewerStore } from '../src/store/viewer-store.ts';
import type { GeometryResponse } from '../src/types.ts';

const fixturePath = fileURLToPath(
  new URL('../../../packages/dpe-xml-importer/test/fixtures/incomplete-dpe.xml', import.meta.url)
);
const importDate = new Date('2026-11-20T10:00:00.000Z');

function fixtureGeometryJson(): GeometryJson {
  const xml = readFileSync(fixturePath, 'utf8');
  const building = new DpeXmlImporter().importDpeXml(xml, importDate).building;
  return JSON.parse(JSON.stringify(geometryToJson(new ReconstructionService().reconstruct(building)))) as GeometryJson;
}

function shares(entries: readonly (readonly [string, number])[]): HeatLossShare[] {
  return entries.map(([elementId, share]) => ({ elementId, kind: 'wall', lossWk: share * 100, share }));
}

describe('normalizedLossShares (UI audit F10 — per-run normalization of the heat-loss ramp)', () => {
  it('divides every raw share by the run maxShare so the worst element maps to 1 (red reachable)', () => {
    // raw shares over ~11 envelope elements: max ≈ 0.2, everything was green before
    const map = normalizedLossShares(shares([['wall-1', 0.2], ['wall-2', 0.1], ['roof-1', 0.05]]));
    expect(map.get('wall-1')).toBeCloseTo(1, 12);
    expect(map.get('wall-2')).toBeCloseTo(0.5, 12);
    expect(map.get('roof-1')).toBeCloseTo(0.25, 12);
    // the normalized worst element renders red, the weakest green
    expect(colorForShare(map.get('wall-1') ?? 0)).toEqual(colorForShare(1));
    expect(colorForShare(map.get('roof-1') ?? 1)).toEqual(colorForShare(0.25));
  });

  it('single-element edge case: the only element gets normalized share 1 (red), not the raw share', () => {
    const map = normalizedLossShares(shares([['wall-1', 1]]));
    expect(map.get('wall-1')).toBe(1);
    expect(colorForShare(map.get('wall-1') ?? 0)).toEqual(colorForShare(1));
  });

  it('guards maxShare = 0: every element maps to 0, never NaN/Infinity', () => {
    const map = normalizedLossShares(shares([['wall-1', 0], ['wall-2', 0]]));
    expect(map.get('wall-1')).toBe(0);
    expect(map.get('wall-2')).toBe(0);
    expect(Number.isFinite(map.get('wall-1') ?? Number.NaN)).toBe(true);
  });

  it('empty overlay → empty map; maxLossShare of an empty overlay is 0', () => {
    expect(normalizedLossShares([]).size).toBe(0);
    expect(maxLossShare([])).toBe(0);
  });

  it('formatSharePercent renders a French percentage for the tooltip', () => {
    expect(formatSharePercent(0.184)).toBe('18,4 %');
    expect(formatSharePercent(1)).toBe('100,0 %');
    expect(formatSharePercent(0)).toBe('0,0 %');
  });
});

describe('elementColor picking affordances (UI audit F11)', () => {
  const base = { kind: 'wall' as const, inferred: false, selected: false, hovered: false, lossShare: null };

  it('hover applies a strong visible lift on the element color (emissive-like, clamped at 1)', () => {
    const hovered = elementColor({ ...base, hovered: true });
    expect(hovered[0]).toBeCloseTo(Math.min(1, 0.76 + 0.3), 9);
    expect(hovered[1]).toBeCloseTo(Math.min(1, 0.73 + 0.3), 9);
    // clamped for bright bases (e.g. room color)
    const roomHovered = elementColor({ ...base, kind: 'room', hovered: true });
    expect(roomHovered[0]).toBe(1);
  });

  it('selection keeps the 50/50 color mix and exposes the outline accent color', () => {
    const selected = elementColor({ ...base, selected: true });
    expect(selected).toEqual([(0.76 + 0.12) / 2, (0.73 + 0.45) / 2, (0.68 + 0.95) / 2]);
    expect(SELECTION_OUTLINE_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('selection stays visible under the heat-loss overlay (blend with the loss color)', () => {
    const selectedLoss = elementColor({ ...base, lossShare: 1, selected: true });
    const lossRed = colorForShare(1);
    expect(selectedLoss[0]).toBeCloseTo((lossRed[0] + 0.12) / 2, 9);
  });
});

describe('viewer store presentation state (F12)', () => {
  beforeEach(() => {
    useViewerStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it('room labels are shown by default and toggleable', () => {
    expect(useViewerStore.getState().showRoomLabels).toBe(true);
    useViewerStore.getState().toggleRoomLabels();
    expect(useViewerStore.getState().showRoomLabels).toBe(false);
    useViewerStore.getState().toggleRoomLabels();
    expect(useViewerStore.getState().showRoomLabels).toBe(true);
  });

  it('reset restores the default presentation state', () => {
    useViewerStore.getState().toggleRoomLabels();
    useViewerStore.getState().reset();
    expect(useViewerStore.getState().showRoomLabels).toBe(true);
    expect(useViewerStore.getState().dpeNumber).toBeNull();
  });

  it('loadGeometry picks up the DPE number from GET /buildings/:id (best-effort, F12 header)', async () => {
    const geometryJson = fixtureGeometryJson();
    const geometryResponse: GeometryResponse = { buildingId: '11111111-1111-4111-8111-111111111111', geometry: geometryJson };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/geometry')) return new Response(JSON.stringify(geometryResponse), { status: 200 });
        if (url.endsWith('/simulations')) return new Response(JSON.stringify({ buildingId: 'b', results: [] }), { status: 200 });
        if (/\/buildings\/[^/]+$/.test(url)) {
          return new Response(JSON.stringify({ building: {}, version: 1, report: { dpeNumber: '2387E0888781I' } }), { status: 200 });
        }
        return new Response(JSON.stringify({ statusCode: 404 }), { status: 404 });
      })
    );
    await useViewerStore.getState().loadGeometry(geometryResponse.buildingId);
    await vi.waitFor(() => expect(useViewerStore.getState().dpeNumber).toBe('2387E0888781I'));
    expect(useViewerStore.getState().status).toBe('ready');
  });

  it('loadGeometry keeps dpeNumber null when the building fetch fails (header falls back to the id)', async () => {
    const geometryJson = fixtureGeometryJson();
    const geometryResponse: GeometryResponse = { buildingId: '11111111-1111-4111-8111-111111111111', geometry: geometryJson };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/geometry')) return new Response(JSON.stringify(geometryResponse), { status: 200 });
        return new Response(JSON.stringify({ statusCode: 404 }), { status: 404 });
      })
    );
    await useViewerStore.getState().loadGeometry(geometryResponse.buildingId);
    await vi.waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([u]) => !String(u).endsWith('/geometry'))).toBe(true)
    );
    expect(useViewerStore.getState().dpeNumber).toBeNull();
    expect(useViewerStore.getState().status).toBe('ready');
  });
});
