import { describe, expect, it } from 'vitest';
import { Building, inferred, measured, type BuildingInput } from '@hes/domain';
import { canonicalJson, computeBuildingInputHash } from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');

function baseInput(overrides: Partial<BuildingInput> = {}): BuildingInput {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    dpeNumber: measured('2238E0097309E', 'dpe-xml:dpe/numero_dpe', date),
    status: null,
    address: null,
    banId: null,
    banCoordinates: null,
    constructionYear: null,
    constructionPeriod: null,
    livingAreaM2: measured(80.84, 'dpe-xml:x/surface_habitable_logement', date),
    buildingLivingAreaM2: null,
    ceilingHeightM: inferred(2.5, 'inference:default-ceiling-height-2.5m', 0.4, date),
    levelCount: null,
    apartmentCount: null,
    climateZone: null,
    altitudeClass: null,
    altitudeM: null,
    thermalInertiaClass: null,
    zones: [{ id: 'zone-1', name: inferred('logement', 'inference:single-zone-from-logement', 0.9, date), areaM2: null }],
    rooms: [],
    walls: [],
    roofs: [],
    floors: [],
    windows: [],
    doors: [],
    thermalZones: [],
    heatingSystems: [],
    ventilationSystems: [],
    photovoltaicSystems: [],
    importedAt: date,
    ...overrides
  };
}

describe('computeBuildingInputHash', () => {
  it('hash is stable for an unchanged building and changes when the building changes', () => {
    const building = Building.createForImport(baseInput());
    const h1 = computeBuildingInputHash(building);
    const h2 = computeBuildingInputHash(
      Building.fromJson(JSON.parse(JSON.stringify(building.toJson())) as ReturnType<Building['toJson']>)
    );
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    const edited = Building.createForImport(baseInput({ livingAreaM2: measured(81, 'dpe-xml:x', date) }));
    expect(computeBuildingInputHash(edited)).not.toBe(h1);
  });
});

describe('canonicalJson', () => {
  it('sorts keys recursively regardless of insertion order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('sorts by code point, not locale (stable across machines)', () => {
    // localeCompare would order 'Z' < 'a' in many locales; code-point order is 'Z' < 'a' always.
    expect(canonicalJson({ a: 1, Z: 2 })).toBe('{"Z":2,"a":1}');
  });
});
