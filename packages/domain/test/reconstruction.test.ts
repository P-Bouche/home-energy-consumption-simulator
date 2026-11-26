import { describe, expect, it } from 'vitest';
import {
  Building,
  COORDINATE_SYSTEM,
  computeMeshHash,
  geometryFromJson,
  geometryToJson,
  INFERENCE_RULES_VERSION,
  measured,
  meshArea,
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

function roof(id: string, areaM2: number, roofType: string | null = null): Roof {
  return {
    kind: 'roof',
    id,
    buildingId: BID,
    description: measured(`Plancher haut ${id}`, 'dpe-xml:ph/description', date),
    areaM2: measured(areaM2, 'dpe-xml:ph/surface', date),
    uValueWm2K: measured(0.3, 'dpe-xml:ph/u', date),
    roofType: roofType === null ? null : measured(roofType, 'dpe-xml:ph/enum_type_plancher_haut_id', date),
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
    expect(g.inferenceRulesVersion).toBe('2.0.0');
    expect(g.buildingId).toBe(BID);
    expect(g.coordinateSystem).toEqual(COORDINATE_SYSTEM);
  });

  it('complete building → exact geometry from measured values (footprint from living area, aspect 4:3)', () => {
    const g = service.reconstruct(Building.createForImport(completeInput()));
    const expectedWidth = Math.sqrt(96 * (4 / 3));
    const expectedDepth = 96 / expectedWidth;
    const ridge = 0.25 * expectedDepth; // default rule ridge-height-default (no roofType)
    // AABB: walls/roof sit half a thickness outside the footprint; the pitched
    // roof ridge rises above the wall top; openings stay inside the wall band
    expect(g.bounds.max.x).toBeCloseTo(expectedWidth + 0.1, 6);
    expect(g.bounds.max.y).toBeCloseTo(expectedDepth + 0.1, 6);
    expect(g.bounds.max.z).toBeCloseTo(2.5 + ridge, 6);
    expect(g.bounds.min.x).toBeCloseTo(-0.1, 6);
    expect(g.bounds.min.y).toBeCloseTo(-0.1, 6);
    expect(g.bounds.min.z).toBe(0);
    const walls = g.elements.filter((e) => e.kind === 'wall');
    expect(walls.map((w) => w.id)).toEqual(['wall-1', 'wall-2', 'wall-3', 'wall-4']);
    // wall length = measured area / measured height
    expect(walls[0]?.placement.value.dimensions.width).toBeCloseTo(20 / 2.5, 6);
    // complete inputs → walls without openings are NOT inferred (placement confidence 1)
    // (wall-1 hosts the door hole, wall-3 the window hole → those two ARE inferred)
    for (const w of walls.filter((el) => el.id === 'wall-2' || el.id === 'wall-4')) {
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
    // Class B roof: pitched gable — 2 sloped quads (normals ±Y, +Z) + 2 gable
    // triangles (normals ±X), ridge above the wall top; floor at z=0, normal -Z
    const roofEl = g.elements.find((e) => e.id === 'roof-1');
    const roofFaces = roofEl?.mesh.faces ?? [];
    expect(roofFaces).toHaveLength(4);
    const gables = roofFaces.filter((f) => f.vertices.length === 3);
    const slopes = roofFaces.filter((f) => f.vertices.length === 4);
    expect(gables).toHaveLength(2);
    expect(gables.map((f) => f.normal.x).sort((a, b) => a - b)).toEqual([-1, 1]);
    expect(slopes).toHaveLength(2);
    const slopeNy = slopes.map((f) => f.normal.y).sort((a, b) => a - b);
    expect(slopeNy[0]).toBeLessThan(0);
    expect(slopeNy[1]).toBeGreaterThan(0);
    for (const s of slopes) expect(s.normal.z).toBeGreaterThan(0);
    const roofTopZ = Math.max(...roofFaces.flatMap((f) => f.vertices.map((p) => p.z)));
    expect(roofTopZ).toBeCloseTo(2.5 + 0.25 * expectedDepth, 6);
    const floorEl = g.elements.find((e) => e.id === 'floor-1');
    expect(floorEl?.mesh.faces[0]?.normal.z).toBe(-1);
    expect(floorEl?.mesh.faces[0]?.vertices[0]?.z).toBe(0);
  });

  it('windows/doors are recessed frames set into the wall thickness (holes, not +0.05 m panels) and are always marked inferred', () => {
    const g = service.reconstruct(Building.createForImport(completeInput()));
    const win = g.elements.find((e) => e.id === 'window-1');
    expect(win?.kind).toBe('window');
    expect(win?.inferred).toBe(true);
    expect(win?.placement.confidence).toBeLessThan(1);
    expect(win?.placement.source).toContain('inference:');
    expect(win?.orientation?.value).toBe('S');
    // recessed frame: glazing quad + 4 reveal quads, all inside the 0.2 m wall band
    expect(win?.mesh.faces).toHaveLength(5);
    const ys = win?.mesh.faces.flatMap((f) => f.vertices.map((p) => p.y)) ?? [];
    expect(Math.min(...ys)).toBeCloseTo(-0.1, 6); // S wall outer face
    expect(Math.max(...ys)).toBeCloseTo(0.05, 6); // glazing set back 0.15 m into the wall
    // sill at 0.9 m, height 1.2 m (documented rules)
    const zs = win?.mesh.faces.flatMap((f) => f.vertices.map((p) => p.z)) ?? [];
    expect(Math.min(...zs)).toBeCloseTo(0.9, 6);
    expect(Math.max(...zs)).toBeCloseTo(2.1, 6);
    // placement origin moved onto the wall plane, frame spans the wall thickness
    expect(win?.placement.value.origin.y).toBeCloseTo(-0.1, 6);
    expect(win?.placement.value.dimensions.depth).toBeCloseTo(0.2, 6);
    const dr = g.elements.find((e) => e.id === 'door-1');
    expect(dr?.inferred).toBe(true);
    const dzs = dr?.mesh.faces.flatMap((f) => f.vertices.map((p) => p.z)) ?? [];
    expect(Math.min(...dzs)).toBe(0);
    expect(Math.max(...dzs)).toBeCloseTo(2.0, 6);
  });

  it('incomplete building → synthesized + inferred elements with confidence and rules version', () => {
    const g = service.reconstruct(Building.createForImport(incompleteInput()));
    expect(g.inferenceRulesVersion).toBe('2.0.0');
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
    // default living area 80 m², aspect 4:3, default height 2.5 m × 1 level,
    // default ridge height = 0.25 × depth (rule ridge-height-default)
    const w = Math.sqrt(80 * (4 / 3));
    const d = 80 / w;
    expect(g.bounds.max.x).toBeCloseTo(w + 0.1, 6);
    expect(g.bounds.max.z).toBeCloseTo(2.5 + 0.25 * d, 6);
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

  it('roof/floor/room with null area → equal-share fallback recorded as a named inference rule (never silent)', () => {
    const input = {
      ...completeInput(),
      roofs: [{ ...roof('roof-1', 96), areaM2: null }],
      rooms: [
        { id: 'room-1', zoneId: 'zone-1', name: measured('Séjour', 'dpe-xml:x', date), areaM2: null },
        { id: 'room-2', zoneId: 'zone-1', name: measured('Chambre', 'dpe-xml:x', date), areaM2: measured(36, 'dpe-xml:x', date) }
      ]
    };
    const g = service.reconstruct(Building.createForImport(input));
    const roofEl = g.elements.find((e) => e.id === 'roof-1');
    expect(roofEl?.inferred).toBe(true);
    expect(roofEl?.placement.source).toBe('inference:slab-area-equal-share');
    expect(roofEl?.placement.confidence).toBeLessThan(1);
    const room1 = g.elements.find((e) => e.id === 'room-1');
    expect(room1?.inferred).toBe(true);
    expect(room1?.placement.source).toBe('inference:room-area-equal-share');
    // equal-share fallback: room-1 gets footprint/2 = 48 m² vs room-2's 36 m²
    const width = Math.sqrt(96 * (4 / 3));
    expect(room1?.placement.value.dimensions.width).toBeCloseTo((48 / 84) * width, 6);
  });

  it('footprint is the per-level area: livingArea / levelCount (2 levels → half footprint, full height + ridge)', () => {
    const input = { ...completeInput(), levelCount: measured(2, 'dpe-xml:x/niveau', date) };
    const g = service.reconstruct(Building.createForImport(input));
    const perLevel = 96 / 2;
    const depth = perLevel / Math.sqrt(perLevel * (4 / 3));
    expect(g.bounds.max.x).toBeCloseTo(Math.sqrt(perLevel * (4 / 3)) + 0.1, 6);
    expect(g.bounds.max.z).toBeCloseTo(5.0 + 0.25 * depth, 6); // 2 × 2.5 m walls + default ridge
  });

  it('opening placement origin sits on the host wall plane (E wall → x = width + thickness/2)', () => {
    const input = {
      ...completeInput(),
      windows: [window('window-1', '3', 6), window('window-2', '5', 6)]
    };
    const g = service.reconstruct(Building.createForImport(input));
    const width = Math.sqrt(96 * (4 / 3));
    const onEast = g.elements.find((e) => e.id === 'window-1');
    expect(onEast?.orientation?.value).toBe('E');
    expect(onEast?.placement.value.origin.x).toBeCloseTo(width + 0.1, 6);
    expect(onEast?.placement.value.origin.z).toBeCloseTo(0.9, 6);
    const onSouth = g.elements.find((e) => e.id === 'window-2');
    expect(onSouth?.placement.value.origin.y).toBeCloseTo(-0.1, 6);
  });

  it('opening cursor is clamped to the host wall (no overflow past the corner)', () => {
    const manyWindows = Array.from({ length: 12 }, (_, i) => window(`window-${i + 1}`, '5', 6));
    const input = { ...completeInput(), windows: manyWindows };
    const g = service.reconstruct(Building.createForImport(input));
    const host = g.elements.find((e) => e.id === 'wall-3'); // S wall, length 20/2.5 = 8
    const hostLen = host?.placement.value.dimensions.width ?? 0;
    for (const el of g.elements.filter((e) => e.kind === 'window')) {
      const origin = el.placement.value.origin;
      const w = el.placement.value.dimensions.width;
      expect(origin.x + w).toBeLessThanOrEqual(hostLen + 1e-6);
    }
  });

  it('bounds are the geometry AABB (walls extend outward by half the thickness, openings stay inside)', () => {
    const g = service.reconstruct(Building.createForImport(completeInput()));
    expect(g.bounds.min.x).toBeCloseTo(-0.1, 6); // W wall / gable outer face
    expect(g.bounds.min.y).toBeCloseTo(-0.1, 6); // S wall outer face
    expect(g.bounds.min.z).toBe(0);
    const width = Math.sqrt(96 * (4 / 3));
    const depth = 96 / width;
    expect(g.bounds.max.x).toBeCloseTo(width + 0.1, 6); // E wall / gable outer face
    expect(g.bounds.max.y).toBeCloseTo(depth + 0.1, 6); // N wall outer face
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

  it('Class B: pitched gable roof along the long axis — ridge height from the default rule when roofType is absent', () => {
    const g = service.reconstruct(Building.createForImport(completeInput()));
    const roofEl = g.elements.find((e) => e.id === 'roof-1');
    expect(roofEl?.mesh.faces).toHaveLength(4); // 2 slopes + 2 gable triangles
    const depth = 96 / Math.sqrt(96 * (4 / 3));
    const ridge = 0.25 * depth;
    // ridge runs along X (long axis) at y = depth/2, z = wallTop + ridge
    const ridgeZ = Math.max(...(roofEl?.mesh.faces ?? []).flatMap((f) => f.vertices.map((p) => p.z)));
    expect(ridgeZ).toBeCloseTo(2.5 + ridge, 6);
    for (const f of roofEl?.mesh.faces ?? []) {
      for (const p of f.vertices) {
        if (p.z === ridgeZ) expect(p.y).toBeCloseTo(depth / 2, 6);
      }
    }
    // ridge height is always an inference: named default rule, weakest-link provenance
    expect(roofEl?.placement.source).toBe('inference:ridge-height-default');
    expect(roofEl?.placement.confidence).toBeLessThan(1);
    expect(roofEl?.placement.value.dimensions.height).toBeCloseTo(ridge, 6);
    expect(roofEl?.inferred).toBe(true);
  });

  it('Class B: ridge height inferred from roofType when the DPE gives a pitched roof type', () => {
    const input = { ...completeInput(), roofs: [roof('roof-1', 96, '12')] }; // combles aménagés sous rampant
    const g = service.reconstruct(Building.createForImport(input));
    const roofEl = g.elements.find((e) => e.id === 'roof-1');
    const depth = 96 / Math.sqrt(96 * (4 / 3));
    const ridge = 0.35 * depth; // steeper ridge for finished attics
    const ridgeZ = Math.max(...(roofEl?.mesh.faces ?? []).flatMap((f) => f.vertices.map((p) => p.z)));
    expect(ridgeZ).toBeCloseTo(2.5 + ridge, 6);
    expect(roofEl?.placement.source).toBe('inference:ridge-height-from-roof-type');
    expect(roofEl?.placement.confidence).toBe(0.7);
    expect(roofEl?.inferred).toBe(true);
    expect(g.bounds.max.z).toBeCloseTo(2.5 + ridge, 6);
  });

  it('Class B: openings are real holes — host wall splits into sub-faces around the opening, wall area = quad minus opening', () => {
    const g = service.reconstruct(Building.createForImport(completeInput()));
    // window-1 (S, area 6 m² → 5 m wide × 1.2 m high at sill 0.9) is hosted on wall-3 (S, 8 m × 2.5 m = 20 m²)
    const host = g.elements.find((e) => e.id === 'wall-3');
    expect(host?.mesh.faces).toHaveLength(4); // left / below sill / above lintel / right
    expect(meshArea(host?.mesh ?? { faces: [] })).toBeCloseTo(20 - 6, 6);
    // the hole subtraction is a named inference on the host wall (weakest link)
    expect(host?.placement.source).toBe('inference:opening-hole-subtraction');
    expect(host?.inferred).toBe(true);
    // the opening frame is recessed inside the 0.2 m wall: no vertex beyond the outer face
    const win = g.elements.find((e) => e.id === 'window-1');
    const ys = win?.mesh.faces.flatMap((f) => f.vertices.map((p) => p.y)) ?? [];
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.1 - 1e-9);
    // door reaches the ground (z = 0) on its host wall (longest = wall-1, N)
    const doorHost = g.elements.find((e) => e.id === 'wall-1');
    expect(meshArea(doorHost?.mesh ?? { faces: [] })).toBeCloseTo(20 - 2, 6);
    const dr = g.elements.find((e) => e.id === 'door-1');
    expect(dr?.placement.value.origin.y).toBeCloseTo(96 / Math.sqrt(96 * (4 / 3)) + 0.1, 6);
  });

  it('Class B: multi-level stacking — per-level wall quads, inter-level floor slab, named rules', () => {
    // 2 levels → wall length = area / total height (20 / 5 = 4 m); small window so the hole is a real sub-face split
    const input = {
      ...completeInput(),
      levelCount: measured(2, 'dpe-xml:x/niveau', date),
      windows: [window('window-1', '5', 1.5)]
    };
    const g = service.reconstruct(Building.createForImport(input));
    expect(g.inferenceRulesVersion).toBe('2.0.0');
    // wall-2 (E) hosts no opening → one quad per level
    const wall2 = g.elements.find((e) => e.id === 'wall-2');
    expect(wall2?.mesh.faces).toHaveLength(2);
    const zRanges = (wall2?.mesh.faces ?? []).map((f) => [Math.min(...f.vertices.map((p) => p.z)), Math.max(...f.vertices.map((p) => p.z))]);
    expect(zRanges).toContainEqual([0, 2.5]);
    expect(zRanges).toContainEqual([2.5, 5]);
    expect(wall2?.placement.source).toBe('inference:per-level-wall-stacking');
    expect(wall2?.inferred).toBe(true);
    // wall-3 (S, 4 m × 5 m) hosts the window on the ground level → 4 sub-faces + 1 upper-level quad
    const wall3 = g.elements.find((e) => e.id === 'wall-3');
    expect(wall3?.mesh.faces).toHaveLength(5);
    // ground band = 4 m × 2.5 m minus the 1.5 m² hole; upper level = 4 m × 2.5 m
    expect(meshArea(wall3?.mesh ?? { faces: [] })).toBeCloseTo(10 - 1.5 + 10, 6);
    // inter-level floor slab between the two levels
    const slab = g.elements.find((e) => e.kind === 'floor' && e.id.startsWith('floor-synthesized-'));
    expect(slab).toBeDefined();
    expect(slab?.placement.value.origin.z).toBeCloseTo(2.5, 6);
    expect(slab?.placement.source).toBe('inference:inter-level-floor-slab');
    expect(slab?.inferred).toBe(true);
    expect(slab?.placement.confidence).toBe(0.5);
    // total height: 2 levels + ridge on the per-level footprint
    const perLevel = 48;
    const depth = perLevel / Math.sqrt(perLevel * (4 / 3));
    expect(g.bounds.max.z).toBeCloseTo(5 + 0.25 * depth, 6);
    // rooms stay on the ground level layout
    const r1 = g.elements.find((e) => e.id === 'room-1');
    expect(r1?.placement.value.origin.z).toBeCloseTo(0.001, 6);
  });
});
