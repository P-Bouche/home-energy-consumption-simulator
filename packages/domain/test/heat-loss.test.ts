import { describe, expect, it } from 'vitest';
import {
  Building,
  createSimulationResult,
  HeatLossProjectionError,
  measured,
  projectHeatLoss,
  ReconstructionService,
  type BuildingInput
} from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');
const BID = '11111111-1111-4111-8111-111111111111';

function buildingWith(areas: { wall1: number; wall2: number; window: number }): Building {
  const input: BuildingInput = {
    id: BID,
    dpeNumber: null,
    status: null,
    address: null,
    banId: null,
    banCoordinates: null,
    constructionYear: null,
    constructionPeriod: null,
    livingAreaM2: measured(96, 'dpe-xml:x', date),
    buildingLivingAreaM2: null,
    ceilingHeightM: measured(2.5, 'dpe-xml:x', date),
    levelCount: measured(1, 'dpe-xml:x', date),
    apartmentCount: null,
    climateZone: null,
    altitudeClass: null,
    altitudeM: null,
    thermalInertiaClass: null,
    zones: [{ id: 'zone-1', name: measured('logement', 'dpe-xml:x', date), areaM2: measured(96, 'dpe-xml:x', date) }],
    rooms: [],
    walls: [
      {
        kind: 'wall', id: 'wall-1', buildingId: BID,
        description: measured('m1', 'dpe-xml:x', date),
        areaM2: measured(areas.wall1, 'dpe-xml:x', date), uValueWm2K: null,
        orientation: measured('1', 'dpe-xml:x', date), wallType: null, adjacencyType: null
      },
      {
        kind: 'wall', id: 'wall-2', buildingId: BID,
        description: measured('m2', 'dpe-xml:x', date),
        areaM2: measured(areas.wall2, 'dpe-xml:x', date), uValueWm2K: null,
        orientation: measured('5', 'dpe-xml:x', date), wallType: null, adjacencyType: null
      }
    ],
    roofs: [],
    floors: [],
    windows: [
      {
        kind: 'window', id: 'window-1', buildingId: BID,
        description: measured('b1', 'dpe-xml:x', date),
        areaM2: measured(areas.window, 'dpe-xml:x', date), uValueWm2K: null,
        orientation: measured('5', 'dpe-xml:x', date), count: measured(1, 'dpe-xml:x', date),
        solarFactorSw: null, glazingType: null, frameMaterial: null
      }
    ],
    doors: [],
    thermalZones: [],
    heatingSystems: [],
    ventilationSystems: [],
    photovoltaicSystems: [],
    importedAt: date
  };
  return Building.createForImport(input);
}

function mockResult(deperdition: Record<string, unknown>) {
  return createSimulationResult({
    consumptionKwh: 10000,
    emissionsKg: 2000,
    energyLabel: 'D',
    climateLabel: 'D',
    rawEngineOutput: { logement: { sortie: { deperdition } } }
  });
}

describe('projectHeatLoss (read-only overlay projection, FR-P3-04)', () => {
  const geometry = new ReconstructionService().reconstruct(buildingWith({ wall1: 10, wall2: 30, window: 5 }));

  it('distributes engine-reported category losses across elements by area; shares sum to 100%', () => {
    const overlay = projectHeatLoss(
      mockResult({ deperdition_mur: 100, deperdition_baie_vitree: 50, deperdition_porte: 0, deperdition_plancher_bas: 0, deperdition_plancher_haut: 0 }),
      geometry
    );
    expect(overlay.buildingId).toBe(BID);
    expect(overlay.totalEnvelopeLossWk).toBeCloseTo(150, 6);
    const sum = overlay.shares.reduce((a, s) => a + s.share, 0);
    expect(sum).toBeCloseTo(1, 9);
    const wall1 = overlay.shares.find((s) => s.elementId === 'wall-1');
    const wall2 = overlay.shares.find((s) => s.elementId === 'wall-2');
    const win = overlay.shares.find((s) => s.elementId === 'window-1');
    // mur 100 W/K split 10:30 between the walls; baie 50 W/K on the single window
    expect(wall1?.share).toBeCloseTo((100 / 150) * (10 / 40), 9);
    expect(wall2?.share).toBeCloseTo((100 / 150) * (30 / 40), 9);
    expect(win?.share).toBeCloseTo(50 / 150, 9);
    expect(wall1?.lossWk).toBeCloseTo(25, 6);
    expect(win?.lossWk).toBeCloseTo(50, 6);
    // rooms are not envelope elements
    expect(overlay.shares.some((s) => s.kind === 'room')).toBe(false);
  });

  it('categories without matching geometry elements are excluded from the total (shares stay proportional to totalEnvelopeLossWk)', () => {
    // the test geometry has walls + one window, but no doors: deperdition_porte
    // must not inflate the total nor appear in the shares
    const overlay = projectHeatLoss(
      mockResult({ deperdition_mur: 100, deperdition_baie_vitree: 50, deperdition_porte: 50 }),
      geometry
    );
    expect(overlay.totalEnvelopeLossWk).toBeCloseTo(150, 6);
    expect(overlay.shares.some((s) => s.kind === 'door')).toBe(false);
    expect(overlay.shares.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 9);
    // share × total = lossWk for every share
    for (const s of overlay.shares) {
      expect(s.share * overlay.totalEnvelopeLossWk).toBeCloseTo(s.lossWk, 6);
    }
  });

  it('sum of shares × 100 rounded is exactly 100 (display contract)', () => {
    const overlay = projectHeatLoss(
      mockResult({ deperdition_mur: 71.229, deperdition_baie_vitree: 49.698, deperdition_porte: 12.5 }),
      geometry
    );
    expect(overlay.shares.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 9);
  });

  it('throws a typed error when the engine output has no deperdition data (never invent losses)', () => {
    expect(() => projectHeatLoss(mockResult({}), geometry)).toThrow(HeatLossProjectionError);
    expect(() =>
      projectHeatLoss(
        createSimulationResult({ consumptionKwh: 1, emissionsKg: 1, energyLabel: 'A', climateLabel: 'A', rawEngineOutput: {} }),
        geometry
      )
    ).toThrow(HeatLossProjectionError);
  });

  it('throws when all engine-reported losses are zero', () => {
    expect(() =>
      projectHeatLoss(mockResult({ deperdition_mur: 0, deperdition_baie_vitree: 0 }), geometry)
    ).toThrow(HeatLossProjectionError);
  });
});
