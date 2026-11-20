import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DpeXmlImporter } from '../src/index.ts';

const fixturesDir = fileURLToPath(new URL('../../open3cl-adapter/test/fixtures', import.meta.url));
const importDate = new Date('2026-11-20T10:00:00.000Z');
const importer = new DpeXmlImporter();

describe('mapper: envelope sections (fixture 2364E0984413P — has roof, floor, door, PV)', () => {
  const xml = readFileSync(`${fixturesDir}/2364E0984413P.xml`, 'utf8');
  const { building, report } = importer.importDpeXml(xml, importDate);

  it('maps murs to Wall entities with area and U-value', () => {
    expect(building.walls.length).toBe(17);
    const wall = building.walls[0];
    expect(wall?.kind).toBe('wall');
    expect(wall?.buildingId).toBe(building.id);
    expect(wall?.areaM2?.value).toBeGreaterThan(0);
    expect(wall?.uValueWm2K?.value).toBeGreaterThan(0);
    expect(wall?.uValueWm2K?.confidence).toBe(1);
    expect(wall?.orientation?.value).toBeDefined();
  });

  it('maps plancher_haut to Roof and plancher_bas to Floor', () => {
    expect(building.roofs.length).toBe(1);
    expect(building.roofs[0]?.uValueWm2K?.value).toBeGreaterThan(0);
    expect(building.floors.length).toBe(2);
    for (const floor of building.floors) {
      expect(floor.buildingId).toBe(building.id);
    }
  });

  it('maps baie_vitree to Window with surface, count, uw, sw', () => {
    expect(building.windows.length).toBe(11);
    const win = building.windows[0];
    expect(win?.areaM2?.value).toBeGreaterThan(0);
    expect(win?.count.value).toBeGreaterThan(0);
    expect(win?.uValueWm2K?.value).toBeGreaterThan(0);
    expect(win?.solarFactorSw).not.toBeNull();
  });

  it('maps porte to Door', () => {
    expect(building.doors.length).toBe(1);
    expect(building.doors[0]?.areaM2?.value).toBeGreaterThan(0);
    expect(building.doors[0]?.uValueWm2K?.value).toBeGreaterThan(0);
  });

  it('maps panneaux_pv to PhotovoltaicSystem', () => {
    expect(building.photovoltaicSystems.length).toBe(1);
    const pv = building.photovoltaicSystems[0];
    expect(pv?.sensorAreaM2?.value).toBeCloseTo(15.6);
    expect(pv?.moduleCount?.value).toBe(13);
  });

  it('maps installation_chauffage to HeatingSystem with heated area', () => {
    expect(building.heatingSystems.length).toBe(1);
    expect(building.heatingSystems[0]?.heatedAreaM2?.value).toBeCloseTo(167.29);
    expect(building.thermalZones[0]?.heatedAreaM2?.value).toBeCloseTo(167.29);
  });

  it('maps ventilation to VentilationSystem', () => {
    expect(building.ventilationSystems.length).toBe(1);
    expect(building.ventilationSystems[0]?.ventilatedAreaM2?.value).toBeCloseTo(167.29);
    expect(building.ventilationSystems[0]?.q4paConv?.value).toBeGreaterThan(0);
  });

  it('maps general characteristics with measured confidence', () => {
    expect(building.livingAreaM2?.value).toBeCloseTo(167.29);
    expect(building.livingAreaM2?.confidence).toBe(1);
    expect(building.livingAreaM2?.source).toContain('surface_habitable_logement');
    expect(building.ceilingHeightM?.value).toBeGreaterThan(0);
    expect(building.ceilingHeightM?.confidence).toBe(1);
    expect(building.banCoordinates?.x.value).toBeGreaterThan(0);
  });

  it('report lists known-but-unmapped sections as unrecognized', () => {
    const paths = report.unrecognizedFields.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('dpe/logement/sortie/'))).toBe(true);
    expect(paths.some((p) => p.startsWith('dpe/fiche_technique_collection'))).toBe(true);
  });

  it('report lists the room gap as missing', () => {
    expect(report.missingFields.some((f) => f.path === 'logement/rooms')).toBe(true);
  });
});

describe('AC-P1-04: deliberately incomplete fixture lists every gap', () => {
  const xml = readFileSync(
    fileURLToPath(new URL('./fixtures/incomplete-dpe.xml', import.meta.url)),
    'utf8'
  );
  const { building, report } = importer.importDpeXml(xml, importDate);

  it('infers living area from the building area with confidence metadata', () => {
    expect(building.livingAreaM2?.value).toBeCloseTo(95.5);
    expect(building.livingAreaM2?.confidence).toBe(0.8);
    expect(building.livingAreaM2?.source).toBe('inference:living-area-from-building-area');
    expect(building.livingAreaM2?.importDate).toEqual(importDate);
  });

  it('infers ceiling height (2.5 m default) and level count', () => {
    expect(building.ceilingHeightM?.value).toBe(2.5);
    expect(building.ceilingHeightM?.confidence).toBe(0.4);
    expect(building.levelCount?.value).toBe(1);
    expect(building.levelCount?.confidence).toBe(0.5);
  });

  it('report lists every inferred field with full confidence metadata', () => {
    const paths = report.inferredFields.map((f) => f.path);
    expect(paths).toContain('dpe/logement/caracteristique_generale/surface_habitable_logement');
    expect(paths).toContain('dpe/logement/caracteristique_generale/hsp');
    expect(paths).toContain('dpe/logement/caracteristique_generale/nombre_niveau_logement');
    for (const field of report.inferredFields) {
      expect(field.source.startsWith('inference:')).toBe(true);
      expect(field.confidence).toBeLessThan(1);
      expect(field.importDate).toBe(importDate.toISOString());
    }
  });

  it('report lists missing fields (annee_construction, rooms, envelope surfaces)', () => {
    const paths = report.missingFields.map((f) => f.path);
    expect(paths).toContain('dpe/logement/caracteristique_generale/annee_construction');
    expect(paths).toContain('logement/rooms');
  });

  it('imports with zero envelope elements without crashing', () => {
    expect(building.walls).toHaveLength(0);
    expect(building.windows).toHaveLength(0);
    expect(building.heatingSystems).toHaveLength(0);
    expect(building.thermalZones[0]?.heatedAreaM2?.value).toBeCloseTo(95.5);
  });
});
