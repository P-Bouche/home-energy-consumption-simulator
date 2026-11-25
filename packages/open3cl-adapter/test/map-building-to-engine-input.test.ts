import { describe, expect, it } from 'vitest';
import { buildEngineInput, Open3clAdapter } from '@hes/open3cl-adapter';
import {
  Building,
  inferred,
  measured,
  toSimulationView,
  type BuildingInput
} from '@hes/domain';
import { EngineExecutionError, UnsupportedDpeModelError } from '@hes/domain';

const date = new Date('2026-11-20T10:00:00.000Z');

function baseInput(overrides: Partial<BuildingInput> = {}): BuildingInput {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    dpeNumber: measured('2238E0097309E', 'dpe-xml:dpe/numero_dpe', date),
    status: null,
    address: null,
    banId: null,
    banCoordinates: null,
    constructionYear: measured(1961, 'dpe-xml:x', date),
    constructionPeriod: null,
    livingAreaM2: measured(80.84, 'dpe-xml:x', date),
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
    walls: [
      {
        kind: 'wall',
        id: 'wall-1',
        buildingId: '11111111-1111-4111-8111-111111111111',
        description: measured('Mur nord', 'dpe-xml:x', date),
        areaM2: measured(54.25, 'dpe-xml:x', date),
        uValueWm2K: measured(1.64, 'dpe-xml:x', date),
        orientation: measured('2', 'dpe-xml:x', date),
        wallType: null,
        adjacencyType: null
      }
    ],
    roofs: [],
    floors: [],
    windows: [],
    doors: [],
    thermalZones: [],
    heatingSystems: [
      {
        id: 'heating-1',
        buildingId: '11111111-1111-4111-8111-111111111111',
        description: measured('Chaudière gaz', 'dpe-xml:x', date),
        installationType: measured('1', 'dpe-xml:x', date),
        generatorType: measured('88', 'dpe-xml:x', date),
        heatedAreaM2: measured(80.84, 'dpe-xml:x', date)
      }
    ],
    ventilationSystems: [],
    photovoltaicSystems: [],
    importedAt: date,
    ...overrides
  };
}

describe('buildEngineInput', () => {
  it('uses the verbatim retained source document when present (measured, no defaults)', () => {
    const building = Building.createForImport(baseInput({ sourceDpeXml: '<dpe>raw</dpe>' }));
    const mapping = buildEngineInput(toSimulationView(building));
    expect(mapping.verbatimSource).toBe(true);
    expect(mapping.input).toEqual({ kind: 'xml', xml: '<dpe>raw</dpe>' });
    expect(mapping.defaults).toEqual([]);
  });

  it('reconstructs a DPE JSON input from the domain fields and logs defaults with confidence', () => {
    const building = Building.createForImport(baseInput());
    const mapping = buildEngineInput(toSimulationView(building));
    expect(mapping.verbatimSource).toBe(false);
    expect(mapping.input.kind).toBe('json');
    const json = (mapping.input as { kind: 'json'; json: Record<string, unknown> }).json;
    const dpe = json['dpe'] as Record<string, unknown>;
    expect(dpe['numero_dpe']).toBe('2238E0097309E');
    expect(dpe['administratif']).toEqual({ enum_modele_dpe_id: '1' });
    const logement = dpe['logement'] as Record<string, unknown>;
    const cg = logement['caracteristique_generale'] as Record<string, unknown>;
    expect(cg['surface_habitable_logement']).toBe(80.84);
    expect(cg['hsp']).toBe(2.5);
    const meteo = logement['meteo'] as Record<string, unknown>;
    expect(meteo['enum_zone_climatique_id']).toBe('1');
    const enveloppe = logement['enveloppe'] as Record<string, unknown>;
    const murs = (enveloppe['mur_collection'] as Record<string, unknown>)['mur'] as Record<string, unknown>[];
    expect(murs[0]?.['donnee_entree']).toMatchObject({ description: 'Mur nord', surface_paroi_totale: 54.25 });
    expect(murs[0]?.['donnee_intermediaire']).toMatchObject({ umur: 1.64 });

    const paths = mapping.defaults.map((d) => d.path);
    expect(paths).toContain('dpe/logement/caracteristique_generale/hsp');
    expect(paths).toContain('dpe/logement/meteo/enum_zone_climatique_id');
    expect(paths).toContain('dpe/administratif/enum_modele_dpe_id');
    for (const d of mapping.defaults) {
      expect(d.source.startsWith('inference:') || d.source.startsWith('default:')).toBe(true);
      expect(d.confidence).toBeGreaterThanOrEqual(0);
      expect(d.confidence).toBeLessThan(1);
    }
    const hsp = mapping.defaults.find((d) => d.path === 'dpe/logement/caracteristique_generale/hsp');
    expect(hsp?.source).toBe('inference:default-ceiling-height-2.5m');
    expect(hsp?.confidence).toBe(0.4);
  });
});

describe('Open3clAdapter.simulateBuilding', () => {
  it('logs engine-input defaults (never silent) on the reconstruction path', async () => {
    const warnings: string[] = [];
    const adapter = new Open3clAdapter({ warn: (m) => warnings.push(m) });
    const building = Building.createForImport(baseInput());
    await expect(adapter.simulateBuilding(building)).rejects.toThrow();
    expect(warnings.some((w) => w.includes('engine-input default') && w.includes('confidence'))).toBe(true);
  });

  it('maps engine failure modes to typed domain errors on the building path', async () => {
    const adapter = new Open3clAdapter({ warn: () => undefined });
    const building = Building.createForImport(baseInput({ sourceDpeXml: '<dpe><broken' }));
    await expect(adapter.simulateBuilding(building)).rejects.toBeInstanceOf(EngineExecutionError);

    const nonLogement = Building.createForImport(
      baseInput({ sourceDpeXml: '<dpe><administratif><enum_modele_dpe_id>2</enum_modele_dpe_id></administratif></dpe>' })
    );
    await expect(adapter.simulateBuilding(nonLogement)).rejects.toBeInstanceOf(UnsupportedDpeModelError);
  });
});
