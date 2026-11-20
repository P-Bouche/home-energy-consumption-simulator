import { describe, expect, it } from 'vitest';
import {
  Building,
  COORDINATE_SYSTEM,
  computeMeshHash,
  geometryFromJson,
  geometryToJson,
  INFERENCE_RULES_VERSION,
  measured,
  ReconstructionService,
  type BuildingInput,
  type Door,
  type Floor,
  type Roof,
  type Wall,
  type Window
} from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');
const BID = '11111111-1111-4111-8111-111111111111';

function wall(id: string, orientation: string | null, areaM2: number | null): Wall {
  return {
    kind: 'wall',
    id,
    buildingId: BID,
    description: measured(`Mur ${id}`, 'dpe-xml:mur/description', date),
    areaM2: areaM2 === null ? null : measured(areaM2, 'dpe-xml:mur/surface', date),
    uValueWm2K: measured(1.2, 'dpe-xml:mur/u', date),
    orientation:
      orientation === null ? null : measured(orientation, 'dpe-xml:mur/enum_orientation_id', date),
    wallType: null,
    adjacencyType: null
  };
}

function window(id: string, orientation: string | null, areaM2: number): Window {
  return {
    kind: 'window',
    id,
    buildingId: BID,
    description: measured(`Baie ${id}`, 'dpe-xml:baie/description', date),
    areaM2: measured(areaM2, 'dpe-xml:baie/surface', date),
    uValueWm2K: measured(2.5, 'dpe-xml:baie/u', date),
    orientation:
      orientation === null ? null : measured(orientation, 'dpe-xml:baie/enum_orientation_id', date),
    count: measured(1, 'dpe-xml:baie/count', date),
    solarFactorSw: null,
    glazingType: null,
    frameMaterial: null
  };
}

function door(id: string, areaM2: number): Door {
  return {
    kind: 'door',
    id,
    buildingId: BID,
    description: measured(`Porte ${id}`, 'dpe-xml:porte/description', date),
    areaM2: measured(areaM2, 'dpe-xml:porte/surface', date),
    uValueWm2K: measured(2.0, 'dpe-xml:porte/u', date),
    doorType: null,
    count: measured(1, 'dpe-xml:porte/count', date)
  };
}

function roof(id: string, areaM2: number): Roof {
  return {
    kind: 'roof',
    id,
    buildingId: BID,
    description: measured(`Plancher haut ${id}`, 'dpe-xml:ph/description', date),
    areaM2: measured(areaM2, 'dpe-xml:ph/surface', date),
    uValueWm2K: measured(0.3, 'dpe-xml:ph/u', date),
    roofType: null,
    adjacencyType: null
  };
}

function floor(id: string, areaM2: number): Floor {
  return {
    kind: 'floor',
    id,
    buildingId: BID,
    description: measured(`Plancher bas ${id}`, 'dpe-xml:pb/description', date),
    areaM2: measured(areaM2, 'dpe-xml:pb/surface', date),
    uValueWm2K: measured(0.4, 'dpe-xml:pb/u', date),
    floorType: null,
    adjacencyType: null
  };
}

/**
 * A "complete" building: every geometric input is measured (confidence 1).
 */
function completeInput(): BuildingInput {
  return {
    id: BID,
    dpeNumber: measured('2238E0097309E', 'dpe-xml:dpe/numero_dpe', date),
    status: measured('ACTIF', 'dpe-xml:dpe/statut', date),
    address: null,
    banId: null,
    banCoordinates: null,
    constructionYear: measured(1961, 'dpe-xml:x', date),
    constructionPeriod: null,
    livingAreaM2: measured(96, 'dpe-xml:x/surface_habitable_logement', date),
    buildingLivingAreaM2: null,
    ceilingHeightM: measured(2.5, 'dpe-xml:x/hsp', date),
    levelCount: measured(1, 'dpe-xml:x/niveau', date),
    apartmentCount: null,
    climateZone: null,
    altitudeClass: null,
    altitudeM: null,
    thermalInertiaClass: null,
    zones: [
      {
        id: 'zone-1',
        name: measured('logement', 'dpe-xml:x', date),
        areaM2: measured(96, 'dpe-xml:x', date)
      }
    ],
    rooms: [
      { id: 'room-1', zoneId: 'zone-1', name: measured('Séjour', 'dpe-xml:x', date), areaM2: measured(60, 'dpe-xml:x', date) },
      { id: 'room-2', zoneId: 'zone-1', name: measured('Chambre', 'dpe-xml:x', date), areaM2: measured(36, 'dpe-xml:x', date) }
    ],
    walls: [wall('wall-1', '1', 20), wall('wall-2', '3', 18), wall('wall-3', '5', 20), wall('wall-4', '7', 15)],
    roofs: [roof('roof-1', 96)],
    floors: [floor('floor-1', 96)],
    windows: [window('window-1', '5', 6)],
    doors: [door('door-1', 2)],
    thermalZones: [],
    heatingSystems: [],
    ventilationSystems: [],
    photovoltaicSystems: [],
    importedAt: date
  };
}

/**
 * An incomplete building: nothing geometric is measured (like the
 * incomplete-dpe.xml fixture).
 */
function incompleteInput(): BuildingInput {
  return {
    ...completeInput(),
    livingAreaM2: null,
    ceilingHeightM: null,
    levelCount: null,
    zones: [{ id: 'zone-1', name: measured('logement', 'dpe-xml:x', date), areaM2: null }],
    rooms: [],
    walls: [],
    roofs: [],
    floors: [],
    windows: [],
    doors: []
  };
}

describe('ReconstructionService (P3)', () => {
  const service = new ReconstructionService();

  it('records the versioned inference rules on the produced geometry', () => {
    const g = service.reconstruct(Building.createForImport(completeInput()));
    expect(g.inferenceRulesVersion).toBe(INFERENCE_RULES_VERSION);
    expect(g.inferenceRulesVersion).toBe('1.0.0');
    expect(g.buildingId).toBe(BID);
    expect(g.coordinateSystem).toEqual(COORDINATE_SYSTEM);
  });

  it('complete building → exact geometry from measured values (footprint from living area, aspect 4:3)', () => {
    const g = service.reconstruct(Building.createForImport(completeInput()));
    const expectedWidth = Math.sqrt(96 * (4 / 3));
    const expectedDepth = 96 / expectedWidth;
    expect(g.bounds.max.x).toBeCloseTo(expectedWidth, 6);
    expect(g.bounds.max.y).toBeCloseTo(expectedDepth, 6);
    expect(g.bounds.max.z).toBeCloseTo(2.5, 6);
    expect(g.bounds.min).toEqual({ x: 0, y: 0, z: 0 });
    const walls = g.elements.filter((e) => e.kind === 'wall');
    expect(walls.map((w) => w.id)).toEqual(['wall-1', 'wall-2', 'wall-3', 'wall-4']);
    // wall length = measured area / measured height
    expect(walls[0]?.placement.value.dimensions.width).toBeCloseTo(20 / 2.5, 6);
    // complete inputs → walls are NOT inferred (placement confidence 1)
    for (const w of walls) {
      expect(w.inferred).toBe(false);
      expect(w.placement.confidence).toBe(1);
      expect(w.placement.source).toContain('dpe-xml:');
    }
    // stable element ids are the domain entity ids (P4 relies on them)
    expect(g.elements.map((e) => e.id)).toContain('window-1');
    expect(g.elements.map((e) => e.id)).toContain('door-1');
    expect(g.elements.map((e) => e.id)).toContain('roof-1');
    expect(g.elements.map((e) => e.id)).toContain('floor-1');
    expect(g.elements.map((e) => e.id)).toContain('room-1');
  });

  it('coordinate system: N wall sits at y = depth + thickness/2 with outward normal +Y (Z-up, origin at footprint corner)', () => {
    const g = service.reconstruct(Building.createForImport(completeInput()));
    const expectedDepth = 96 / Math.sqrt(96 * (4 / 3));
    const north = g.elements.find((e) => e.id === 'wall-1');
    expect(north).toBeDefined();
    const face = north?.mesh.faces[0];
    expect(face?.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(face?.vertices[0]?.y).toBeCloseTo(expectedDepth + 0.1, 6);
    expect(face?.vertices[0]?.z).toBe(0);
    const south = g.elements.find((e) => e.id === 'wall-3');
    expect(south?.mesh.faces[0]?.normal).toEqual({ x: 0, y: -1, z: 0 });
    const east = g.elements.find((e) => e.id === 'wall-2');
    expect(east?.mesh.faces[0]?.normal).toEqual({ x: 1, y: 0, z: 0 });
    const west = g.elements.find((e) => e.id === 'wall-4');
    expect(west?.mesh.faces[0]?.normal).toEqual({ x: -1, y: 0, z: 0 });
    // roof at the top, normal +Z; floor at z=0, normal -Z
    const roofEl = g.elements.find((e) => e.id === 'roof-1');
    expect(roofEl?.mesh.faces[0]?.normal.z).toBe(1);
    expect(roofEl?.mesh.faces[0]?.vertices[0]?.z).toBeCloseTo(2.5, 6);
    const floorEl = g.elements.find((e) => e.id === 'floor-1');
    expect(floorEl?.mesh.faces[0]?.normal.z).toBe(-1);
    expect(floorEl?.mesh.faces[0]?.vertices[0]?.z).toBe(0);
  });

  it('windows/doors are panels on their host wall and are always marked inferred (dims never in the DPE)', () => {
    const g = service.reconstruct(Building.createForImport(completeInput()));
    const win = g.elements.find((e) => e.id === 'window-1');
    expect(win?.kind).toBe('window');
    expect(win?.inferred).toBe(true);
    expect(win?.placement.confidence).toBeLessThan(1);
    expect(win?.placement.source).toContain('inference:');
    expect(win?.orientation?.value).toBe('S');
    const face = win?.mesh.faces[0];
    // sill at 0.9 m, height 1.2 m (documented rules)
    const zs = face?.vertices.map((p) => p.z) ?? [];
    expect(Math.min(...zs)).toBeCloseTo(0.9, 6);
    expect(Math.max(...zs)).toBeCloseTo(2.1, 6);
    const dr = g.elements.find((e) => e.id === 'door-1');
    expect(dr?.inferred).toBe(true);
    const dzs = dr?.mesh.faces[0]?.vertices.map((p) => p.z) ?? [];
    expect(Math.min(...dzs)).toBe(0);
    expect(Math.max(...dzs)).toBeCloseTo(2.0, 6);
  });

  it('incomplete building → synthesized + inferred elements with confidence and rules version', () => {
    const g = service.reconstruct(Building.createForImport(incompleteInput()));
    expect(g.inferenceRulesVersion).toBe('1.0.0');
    const ids = g.elements.map((e) => e.id);
    expect(ids).toContain('wall-synthesized-1');
    expect(ids).toContain('roof-synthesized-1');
    expect(ids).toContain('floor-synthesized-1');
    expect(ids).toContain('room-synthesized-1');
    for (const el of g.elements) {
      expect(el.inferred).toBe(true);
      expect(el.placement.confidence).toBeLessThan(1);
      expect(el.placement.source).toContain('inference:');
      expect(el.placement.importDate).toEqual(date);
    }
    // default living area 80 m², aspect 4:3, default height 2.5 m × 1 level
    const w = Math.sqrt(80 * (4 / 3));
    expect(g.bounds.max.x).toBeCloseTo(w, 6);
    expect(g.bounds.max.z).toBeCloseTo(2.5, 6);
  });

  it('wall without orientation is placed on the side with the most remaining capacity (inferred rule)', () => {
    const input = { ...completeInput(), walls: [wall('wall-1', null, 20)] };
    const g = service.reconstruct(Building.createForImport(input));
    const w = g.elements.find((e) => e.id === 'wall-1');
    expect(w?.inferred).toBe(true);
    expect(w?.placement.source).toBe('inference:wall-orientation-by-capacity');
    expect(w?.orientation?.value).toBe('N');
  });

  it('determinism: same building → same geometry → same mesh hash (TR-P3-04)', () => {
    const building = Building.createForImport(completeInput());
    const g1 = service.reconstruct(building);
    const g2 = building.reconstructGeometry();
    const g3 = service.reconstruct(Building.fromJson(JSON.parse(JSON.stringify(building.toJson())) as ReturnType<Building['toJson']>));
    expect(g1.meshHash).toBe(g2.meshHash);
    expect(g2.meshHash).toBe(g3.meshHash);
    expect(JSON.stringify(geometryToJson(g1))).toBe(JSON.stringify(geometryToJson(g3)));
  });

  it('mesh hash survives the JSON API round-trip unchanged', () => {
    const g = service.reconstruct(Building.createForImport(completeInput()));
    const revived = geometryFromJson(JSON.parse(JSON.stringify(geometryToJson(g))) as ReturnType<typeof geometryToJson>);
    expect(computeMeshHash(revived.inferenceRulesVersion, revived.elements)).toBe(g.meshHash);
  });

  it('rooms are floor strips proportional to their measured area', () => {
    const g = service.reconstruct(Building.createForImport(completeInput()));
    const r1 = g.elements.find((e) => e.id === 'room-1');
    const r2 = g.elements.find((e) => e.id === 'room-2');
    const width = Math.sqrt(96 * (4 / 3));
    expect(r1?.placement.value.dimensions.width).toBeCloseTo((60 / 96) * width, 6);
    expect(r2?.placement.value.origin.x).toBeCloseTo((60 / 96) * width, 6);
    expect(r1?.label).toBe('Séjour');
  });
});
