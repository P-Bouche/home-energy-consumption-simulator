import type { Building } from './building.ts';
import { createConfidence, type Confidence } from './confidence.ts';
import type { Door, Room, Window } from './entities.ts';
import {
  COORDINATE_SYSTEM,
  computeMeshHash,
  makeFace,
  meshArea,
  parseOrientation,
  v3,
  type Face,
  type Geometry,
  type GeometryElement,
  type GeometryElementKind,
  type Orientation,
  type Placement,
  type Vector3
} from './geometry.ts';

/**
 * Version of the inference rules (TR: versioned inference rules). Recorded on
 * every produced Geometry as `inferenceRulesVersion`; bump on any rule change.
 * The full catalog with confidences is documented in docs/geometry.md.
 */
export const INFERENCE_RULES_VERSION = '1.0.0';

/**
 * Default living area when the DPE gives none (m²). Rule `living-area-default-80`.
 */
export const DEFAULT_LIVING_AREA_M2 = 80;

/**
 * Assumed footprint aspect ratio width/depth. Rule `footprint-aspect-ratio-4-3`.
 */
export const FOOTPRINT_ASPECT_RATIO = 4 / 3;

/**
 * Default ceiling height per level (m). Rule `ceiling-height-default-2-5`.
 */
export const DEFAULT_CEILING_HEIGHT_M = 2.5;

/**
 * Default level count. Rule `level-count-default-1`.
 */
export const DEFAULT_LEVEL_COUNT = 1;

/**
 * Rendered wall thickness (m). Rule `wall-thickness-0-2` (display constant,
 * not part of element placement provenance).
 */
export const WALL_THICKNESS_M = 0.2;

/**
 * Assumed window height (m). Rule `window-height-1-2`.
 */
export const WINDOW_HEIGHT_M = 1.2;

/**
 * Assumed window sill height (m). Rule `window-sill-0-9`.
 */
export const WINDOW_SILL_M = 0.9;

/**
 * Assumed door height (m). Rule `door-height-2-0`.
 */
export const DOOR_HEIGHT_M = 2.0;

/**
 * Outward offset of opening panels from the host wall (m). Display constant.
 */
export const OPENING_OFFSET_M = 0.05;

type Cardinal = 'N' | 'E' | 'S' | 'W';

const SIDE_ORDER: readonly Cardinal[] = ['N', 'E', 'S', 'W'];

interface Rule {
  readonly source: string;
  readonly confidence: number;
}

const rule = (name: string, confidence: number): Rule => ({
  source: `inference:${name}`,
  confidence
});

const RULES = {
  livingAreaDefault: rule('living-area-default-80', 0.3),
  livingAreaFromZones: rule('living-area-from-zones', 0.7),
  livingAreaFromRooms: rule('living-area-from-rooms', 0.6),
  aspectRatio: rule('footprint-aspect-ratio-4-3', 0.5),
  ceilingHeightDefault: rule('ceiling-height-default-2-5', 0.6),
  levelCountDefault: rule('level-count-default-1', 0.6),
  wallThickness: rule('wall-thickness-0-2', 0.5),
  wallOrientationByCapacity: rule('wall-orientation-by-capacity', 0.4),
  wallLengthFromRemainingSide: rule('wall-length-from-remaining-side', 0.4),
  wallLengthClamped: rule('wall-length-clamped-to-side', 0.5),
  windowHeight: rule('window-height-1-2', 0.5),
  windowSill: rule('window-sill-0-9', 0.5),
  doorHeight: rule('door-height-2-0', 0.5),
  openingOrientationFromHostWall: rule('opening-orientation-from-host-wall', 0.6),
  openingHostWallByOrientation: rule('opening-host-wall-by-orientation', 0.6),
  openingHostWallLongest: rule('opening-host-wall-longest', 0.4),
  roofFromFootprint: rule('roof-from-footprint', 0.5),
  floorFromFootprint: rule('floor-from-footprint', 0.5),
  wallsFromPerimeter: rule('walls-from-perimeter', 0.3),
  roomFromFootprint: rule('room-from-footprint', 0.5),
  slabAreaEqualShare: rule('slab-area-equal-share', 0.4),
  roomAreaEqualShare: rule('room-area-equal-share', 0.4),
  openingCursorClamped: rule('opening-cursor-clamped-to-host-wall', 0.5)
} as const;

interface Provenance {
  readonly source: string;
  readonly confidence: number;
  readonly importDate: Date;
}

/**
 * Weakest-link provenance: the input Confidence with the lowest score wins
 * (ties: first). A fully measured element keeps confidence 1.
 */
function weakest(importDate: Date, inputs: readonly (Confidence<unknown> | Rule | null)[]): Provenance {
  let best: Provenance = { source: 'dpe-xml:building', confidence: 1, importDate };
  for (const input of inputs) {
    if (input === null) continue;
    const conf = 'value' in input ? (input as Confidence<unknown>).confidence : input.confidence;
    const source = 'value' in input ? (input as Confidence<unknown>).source : input.source;
    if (conf < best.confidence) best = { source, confidence: conf, importDate };
  }
  return best;
}

function placementConfidence(importDate: Date, value: Placement, inputs: readonly (Confidence<unknown> | Rule | null)[]): Confidence<Placement> {
  const p = weakest(importDate, inputs);
  return createConfidence(value, p.source, p.confidence, importDate);
}

function toCardinal(orientation: Orientation | null): Cardinal | null {
  if (orientation === null || orientation === 'horizontal') return null;
  switch (orientation) {
    case 'N':
    case 'NE':
    case 'NW':
      return 'N';
    case 'E':
    case 'SE':
      return 'E';
    case 'S':
      return 'S';
    case 'W':
    case 'SW':
      return 'W';
    default:
      return null;
  }
}

/**
 * Axis-aligned bounding box of the actual geometry (all face vertices), in the
 * building coordinate system.
 */
function computeAabb(elements: readonly GeometryElement[]): { min: Vector3; max: Vector3 } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const el of elements) {
    for (const face of el.mesh.faces) {
      for (const p of face.vertices) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.z < minZ) minZ = p.z;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
        if (p.z > maxZ) maxZ = p.z;
      }
    }
  }
  if (!Number.isFinite(minX)) {
    return { min: v3(0, 0, 0), max: v3(0, 0, 0) };
  }
  return { min: v3(minX, minY, minZ), max: v3(maxX, maxY, maxZ) };
}

function sortByNumericSuffix<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const na = Number(a.id.match(/(\d+)$/)?.[1] ?? 0);
    const nb = Number(b.id.match(/(\d+)$/)?.[1] ?? 0);
    return na !== nb ? na - nb : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

interface Footprint {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly provenance: readonly (Confidence<unknown> | Rule | null)[];
}

function sideLength(side: Cardinal, width: number, depth: number): number {
  return side === 'N' || side === 'S' ? width : depth;
}

/**
 * Wall quad on a side, wound so the normal points outward.
 * `from`/`to` are distances along the side (0 at the footprint corner side).
 */
function wallFace(side: Cardinal, from: number, to: number, height: number, width: number, depth: number, thickness: number): Face {
  const t = thickness / 2;
  switch (side) {
    case 'N': {
      const y = depth + t;
      return makeFace([v3(from, y, 0), v3(from, y, height), v3(to, y, height), v3(to, y, 0)]);
    }
    case 'S': {
      const y = -t;
      return makeFace([v3(from, y, 0), v3(to, y, 0), v3(to, y, height), v3(from, y, height)]);
    }
    case 'E': {
      const x = width + t;
      return makeFace([v3(x, from, 0), v3(x, to, 0), v3(x, to, height), v3(x, from, height)]);
    }
    case 'W': {
      const x = -t;
      return makeFace([v3(x, from, 0), v3(x, from, height), v3(x, to, height), v3(x, to, 0)]);
    }
  }
}

function wallOrigin(side: Cardinal, from: number, width: number, depth: number, thickness: number): Vector3 {
  const t = thickness / 2;
  switch (side) {
    case 'N':
      return v3(from, depth + t, 0);
    case 'S':
      return v3(from, -t, 0);
    case 'E':
      return v3(width + t, from, 0);
    case 'W':
      return v3(-t, from, 0);
  }
}

/**
 * Opening (window/door) quad on a host wall side, offset outward.
 */
function openingFace(
  side: Cardinal,
  from: number,
  to: number,
  z0: number,
  z1: number,
  width: number,
  depth: number,
  thickness: number,
  offset: number
): Face {
  const t = thickness / 2 + offset;
  switch (side) {
    case 'N': {
      const y = depth + t;
      return makeFace([v3(from, y, z0), v3(from, y, z1), v3(to, y, z1), v3(to, y, z0)]);
    }
    case 'S': {
      const y = -t;
      return makeFace([v3(from, y, z0), v3(to, y, z0), v3(to, y, z1), v3(from, y, z1)]);
    }
    case 'E': {
      const x = width + t;
      return makeFace([v3(x, from, z0), v3(x, to, z0), v3(x, to, z1), v3(x, from, z1)]);
    }
    case 'W': {
      const x = -t;
      return makeFace([v3(x, from, z0), v3(x, from, z1), v3(x, to, z1), v3(x, to, z0)]);
    }
  }
}

/**
 * Placement origin of an opening panel on a host wall side: on the wall plane
 * (offset outward by thickness/2 + opening offset), at the cursor position.
 */
function openingOrigin(side: Cardinal, from: number, z0: number, width: number, depth: number): Vector3 {
  const t = WALL_THICKNESS_M / 2 + OPENING_OFFSET_M;
  switch (side) {
    case 'N':
      return v3(from, depth + t, z0);
    case 'S':
      return v3(from, -t, z0);
    case 'E':
      return v3(width + t, from, z0);
    case 'W':
      return v3(-t, from, z0);
  }
}

function horizontalFace(x0: number, x1: number, depth: number, z: number, up: boolean): Face {
  return up
    ? makeFace([v3(x0, 0, z), v3(x1, 0, z), v3(x1, depth, z), v3(x0, depth, z)])
    : makeFace([v3(x0, 0, z), v3(x0, depth, z), v3(x1, depth, z), v3(x1, 0, z)]);
}

/**
 * Domain service (P3): reconstructs the 3D {@link Geometry} of a Building.
 *
 * Pure and deterministic: same Building → same Geometry (same meshHash).
 * Every rule that fills a gap is named (`inference:<rule>`) and versioned via
 * {@link INFERENCE_RULES_VERSION}; every element keeps the weakest-link
 * Confidence of the values it was built from, and `inferred` marks elements
 * whose own data was missing or synthesized.
 *
 * The reconstruction is a rectangular footprint (aspect 4:3 unless the living
 * area says otherwise is impossible — the DPE gives areas, not shapes), one
 * wall segment per DPE wall placed on the side matching its orientation,
 * openings as panels on their host wall, roof/floor as horizontal slabs,
 * rooms as floor strips. See docs/geometry.md for the full rules catalog.
 */
export class ReconstructionService {
  readonly inferenceRulesVersion = INFERENCE_RULES_VERSION;

  /**
   * Reconstructs the geometry of a building aggregate.
   *
   * @throws never on missing data — gaps are filled by documented inference
   * rules and marked with confidence < 1
   */
  reconstruct(building: Building): Geometry {
    const footprint = this.computeFootprint(building);

    const elements: GeometryElement[] = [];
    elements.push(...this.buildWalls(building, footprint));
    elements.push(...this.buildRoofs(building, footprint));
    elements.push(...this.buildFloors(building, footprint));
    elements.push(...this.buildOpenings(building, building.windows, 'window', footprint, elements));
    elements.push(...this.buildOpenings(building, building.doors, 'door', footprint, elements));
    elements.push(...this.buildRooms(building, footprint));

    const meshHash = computeMeshHash(this.inferenceRulesVersion, elements);
    return {
      buildingId: building.id,
      coordinateSystem: COORDINATE_SYSTEM,
      inferenceRulesVersion: this.inferenceRulesVersion,
      bounds: computeAabb(elements),
      elements: Object.freeze(elements),
      meshHash
    };
  }

  private computeFootprint(building: Building): Footprint {
    let area: number;
    let areaProvenance: Confidence<unknown> | Rule;
    if (building.livingAreaM2 !== null && Number.isFinite(building.livingAreaM2.value) && building.livingAreaM2.value > 0) {
      area = building.livingAreaM2.value;
      areaProvenance = building.livingAreaM2;
    } else {
      const zoneSum = building.zones.reduce((s, z) => s + (z.areaM2?.value ?? 0), 0);
      if (zoneSum > 0) {
        area = zoneSum;
        areaProvenance = RULES.livingAreaFromZones;
      } else {
        const roomSum = building.rooms.reduce((s, r) => s + (r.areaM2?.value ?? 0), 0);
        if (roomSum > 0) {
          area = roomSum;
          areaProvenance = RULES.livingAreaFromRooms;
        } else {
          area = DEFAULT_LIVING_AREA_M2;
          areaProvenance = RULES.livingAreaDefault;
        }
      }
    }
    const ceiling = building.ceilingHeightM !== null && Number.isFinite(building.ceilingHeightM.value) && building.ceilingHeightM.value > 0
      ? building.ceilingHeightM.value
      : DEFAULT_CEILING_HEIGHT_M;
    const levels = building.levelCount !== null && Number.isFinite(building.levelCount.value) && building.levelCount.value >= 1
      ? Math.floor(building.levelCount.value)
      : DEFAULT_LEVEL_COUNT;
    // The living area is total over all levels: the footprint of ONE level is
    // area / levels (rule `footprint-area-per-level`, recorded via levelCount
    // provenance below).
    const perLevelArea = area / levels;
    const width = Math.sqrt(perLevelArea * FOOTPRINT_ASPECT_RATIO);
    const depth = perLevelArea / width;
    return {
      width,
      depth,
      height: ceiling * levels,
      // Element-level provenance: area + height inputs. The footprint aspect
      // rule (always inferred — the DPE gives areas, not shapes) is recorded
      // at geometry level via inferenceRulesVersion, not per element.
      provenance: [
        areaProvenance,
        building.ceilingHeightM,
        building.ceilingHeightM === null ? RULES.ceilingHeightDefault : null,
        building.levelCount,
        building.levelCount === null ? RULES.levelCountDefault : null
      ]
    };
  }

  private buildWalls(building: Building, fp: Footprint): GeometryElement[] {
    const importDate = building.importedAt;
    const { width, depth, height } = fp;
    const walls = sortByNumericSuffix(building.walls);
    if (walls.length === 0) {
      return SIDE_ORDER.map((side, i) => {
        const len = sideLength(side, width, depth);
        const face = wallFace(side, 0, len, height, width, depth, WALL_THICKNESS_M);
        const placement: Placement = {
          origin: wallOrigin(side, 0, width, depth, WALL_THICKNESS_M),
          dimensions: { width: len, depth: WALL_THICKNESS_M, height },
          orientation: side
        };
        return {
          id: `wall-synthesized-${i + 1}`,
          kind: 'wall' as const,
          label: `Mur ${side} (inféré)`,
          mesh: { faces: [face] },
          areaM2: createConfidence(len * height, RULES.wallsFromPerimeter.source, RULES.wallsFromPerimeter.confidence, importDate),
          uValueWm2K: null,
          orientation: createConfidence(side as Orientation, RULES.wallsFromPerimeter.source, RULES.wallsFromPerimeter.confidence, importDate),
          placement: placementConfidence(importDate, placement, [RULES.wallsFromPerimeter, RULES.wallThickness]),
          inferred: true
        };
      });
    }

    const cursor: Record<Cardinal, number> = { N: 0, E: 0, S: 0, W: 0 };
    const countOnSide: Record<Cardinal, number> = { N: 0, E: 0, S: 0, W: 0 };
    for (const wall of walls) {
      const card = toCardinal(wall.orientation === null ? null : parseOrientation(wall.orientation.value));
      if (card !== null) countOnSide[card] += 1;
    }

    const out: GeometryElement[] = [];
    // Walls with a known orientation are placed first (document order), then
    // walls without one take the side with the most remaining capacity.
    const ordered = [
      ...walls.filter((w) => toCardinal(w.orientation === null ? null : parseOrientation(w.orientation.value)) !== null),
      ...walls.filter((w) => toCardinal(w.orientation === null ? null : parseOrientation(w.orientation.value)) === null)
    ];

    for (const wall of ordered) {
      const rawOrientation = wall.orientation === null ? null : parseOrientation(wall.orientation.value);
      let card = toCardinal(rawOrientation);
      let orientationConf: Confidence<unknown> | Rule = wall.orientation ?? RULES.wallOrientationByCapacity;
      if (card === null) {
        let best: Cardinal = 'N';
        let bestRemaining = -1;
        for (const side of SIDE_ORDER) {
          const remaining = sideLength(side, width, depth) - cursor[side];
          if (remaining > bestRemaining) {
            bestRemaining = remaining;
            best = side;
          }
        }
        card = best;
        orientationConf = RULES.wallOrientationByCapacity;
      }
      let side: Cardinal = card;
      const len0 = sideLength(side, width, depth);
      let length: number;
      let areaConf: Confidence<unknown> | Rule;
      if (wall.areaM2 !== null && Number.isFinite(wall.areaM2.value) && wall.areaM2.value > 0) {
        length = wall.areaM2.value / height;
        areaConf = wall.areaM2;
      } else {
        const remaining = Math.max(0, len0 - cursor[side]);
        const remainingWalls = ordered.slice(ordered.indexOf(wall)).filter((w) => {
          const c = toCardinal(w.orientation === null ? null : parseOrientation(w.orientation.value));
          return (c ?? side) === side && (w.areaM2 === null || !(w.areaM2.value > 0));
        }).length;
        length = remainingWalls > 0 ? remaining / remainingWalls : len0 / Math.max(1, countOnSide[side]);
        areaConf = RULES.wallLengthFromRemainingSide;
      }
      let remaining = len0 - cursor[side];
      if (length > remaining) {
        if (remaining <= 1e-9) {
          const next = SIDE_ORDER[(SIDE_ORDER.indexOf(side) + 1) % SIDE_ORDER.length] as Cardinal;
          if (sideLength(next, width, depth) - cursor[next] > 0) {
            cursor[side] = len0;
            side = next;
            remaining = sideLength(side, width, depth) - cursor[side];
          }
        }
        if (length > remaining) {
          length = Math.max(remaining, 0.1);
          areaConf = areaConf === RULES.wallLengthFromRemainingSide ? areaConf : RULES.wallLengthClamped;
        }
      }
      const from = cursor[side];
      cursor[side] = from + length;
      countOnSide[side] += 1;
      const face = wallFace(side, from, from + length, height, width, depth, WALL_THICKNESS_M);
      const orientation: Orientation = rawOrientation ?? (side as Orientation);
      const placement: Placement = {
        origin: wallOrigin(side, from, width, depth, WALL_THICKNESS_M),
        dimensions: { width: length, depth: WALL_THICKNESS_M, height },
        orientation: side
      };
      const prov = placementConfidence(importDate, placement, [areaConf, orientationConf, ...fp.provenance]);
      out.push({
        id: wall.id,
        kind: 'wall',
        label: wall.description.value || wall.id,
        mesh: { faces: [face] },
        areaM2: wall.areaM2,
        uValueWm2K: wall.uValueWm2K,
        orientation: wall.orientation === null
          ? createConfidence(orientation, orientationConf.source, orientationConf.confidence, importDate)
          : createConfidence(orientation, wall.orientation.source, wall.orientation.confidence, importDate),
        placement: prov,
        inferred: prov.confidence < 1
      });
    }
    return out;
  }

  private splitTop(elements: readonly { areaM2: Confidence<number> | null; id: string }[], totalArea: number, z: number, depth: number, up: boolean, kind: GeometryElementKind, label: (el: { id: string }, i: number) => string, importDate: Date, synthesizedRule: Rule): GeometryElement[] {
    const width = totalArea > 0 ? totalArea / depth : depth;
    if (elements.length === 0) {
      const face = horizontalFace(0, width, depth, z, up);
      const placement: Placement = {
        origin: v3(0, 0, z),
        dimensions: { width, depth, height: 0 },
        orientation: 'horizontal'
      };
      return [
        {
          id: `${kind}-synthesized-1`,
          kind,
          label: label({ id: `${kind}-synthesized-1` }, 0),
          mesh: { faces: [face] },
          areaM2: createConfidence(width * depth, synthesizedRule.source, synthesizedRule.confidence, importDate),
          uValueWm2K: null,
          orientation: createConfidence('horizontal', synthesizedRule.source, synthesizedRule.confidence, importDate),
          placement: placementConfidence(importDate, placement, [synthesizedRule]),
          inferred: true
        }
      ];
    }
    const areas = elements.map((el) => (el.areaM2 !== null && el.areaM2.value > 0 ? el.areaM2.value : totalArea / elements.length));
    const sum = areas.reduce((a, b) => a + b, 0);
    let x = 0;
    return elements.map((el, i) => {
      const w = (areas[i] as number) / sum * width;
      const face = horizontalFace(x, x + w, depth, z, up);
      const placement: Placement = {
        origin: v3(x, 0, z),
        dimensions: { width: w, depth, height: 0 },
        orientation: 'horizontal'
      };
      // null/zero area → equal-share fallback, recorded as a named rule
      const areaProvenance: Confidence<unknown> | Rule =
        el.areaM2 !== null && el.areaM2.value > 0 ? el.areaM2 : RULES.slabAreaEqualShare;
      const prov = placementConfidence(importDate, placement, [areaProvenance]);
      const out: GeometryElement = {
        id: el.id,
        kind,
        label: label(el, i),
        mesh: { faces: [face] },
        areaM2: el.areaM2,
        uValueWm2K: null,
        orientation: createConfidence('horizontal', 'domain:element-kind-horizontal', 1, importDate),
        placement: prov,
        inferred: prov.confidence < 1
      };
      x += w;
      return out;
    });
  }

  private buildRoofs(building: Building, fp: Footprint): GeometryElement[] {
    return this.splitTop(
      building.roofs,
      fp.width * fp.depth,
      fp.height,
      fp.depth,
      true,
      'roof',
      (el, i) => (building.roofs[i]?.description.value ?? el.id),
      building.importedAt,
      RULES.roofFromFootprint
    );
  }

  private buildFloors(building: Building, fp: Footprint): GeometryElement[] {
    return this.splitTop(
      building.floors,
      fp.width * fp.depth,
      0,
      fp.depth,
      false,
      'floor',
      (el, i) => (building.floors[i]?.description.value ?? el.id),
      building.importedAt,
      RULES.floorFromFootprint
    );
  }

  private buildOpenings(
    building: Building,
    openings: readonly (Window | Door)[],
    kind: 'window' | 'door',
    fp: Footprint,
    wallElements: readonly GeometryElement[]
  ): GeometryElement[] {
    const importDate = building.importedAt;
    const { width, depth } = fp;
    const sorted = sortByNumericSuffix(openings);
    if (sorted.length === 0) return [];

    const hostWalls = wallElements.filter((el) => el.kind === 'wall');
    const openingCursor = new Map<string, number>();
    const out: GeometryElement[] = [];

    for (const opening of sorted) {
      const openingOrientation = 'orientation' in opening ? opening.orientation : null;
      const rawOrientation = openingOrientation === null ? null : parseOrientation(openingOrientation.value);
      const card = toCardinal(rawOrientation);
      let host = card === null ? null : (hostWalls.find((w) => w.placement.value.orientation === card) ?? null);
      let hostRule: Rule = RULES.openingHostWallByOrientation;
      if (host === null) {
        host = [...hostWalls].sort((a, b) => meshArea(b.mesh) - meshArea(a.mesh))[0] ?? null;
        hostRule = RULES.openingHostWallLongest;
      }
      if (host === null) continue;
      const hostSide = host.placement.value.orientation as Cardinal;
      const hostLen = host.placement.value.dimensions.width;
      const area = opening.areaM2 !== null && opening.areaM2.value > 0 ? opening.areaM2.value : 1;
      const isWindow = kind === 'window';
      const h = isWindow ? WINDOW_HEIGHT_M : DOOR_HEIGHT_M;
      const z0 = isWindow ? WINDOW_SILL_M : 0;
      const w = Math.min(area / h, hostLen);
      const cursorKey = host.id;
      const unclampedFrom = openingCursor.get(cursorKey) ?? 0.1 * hostLen;
      // clamp the cursor so openings never overflow past the host wall corner
      const maxFrom = Math.max(0.05, hostLen - w - 0.05);
      const from = Math.min(unclampedFrom, maxFrom);
      const clamped = from < unclampedFrom;
      openingCursor.set(cursorKey, from + w + 0.1);
      const face = openingFace(hostSide, from, from + w, z0, z0 + h, width, depth, WALL_THICKNESS_M, OPENING_OFFSET_M);
      const orientation: Orientation = rawOrientation ?? (hostSide as Orientation);
      const orientationConf: Confidence<unknown> | Rule = openingOrientation ?? RULES.openingOrientationFromHostWall;
      const placement: Placement = {
        origin: openingOrigin(hostSide, from, z0, width, depth),
        dimensions: { width: w, depth: 0, height: h },
        orientation
      };
      const prov = placementConfidence(importDate, placement, [
        opening.areaM2,
        orientationConf,
        isWindow ? RULES.windowHeight : RULES.doorHeight,
        isWindow ? RULES.windowSill : null,
        hostRule,
        clamped ? RULES.openingCursorClamped : null
      ]);
      out.push({
        id: opening.id,
        kind,
        label: opening.description.value || opening.id,
        mesh: { faces: [face] },
        areaM2: opening.areaM2,
        uValueWm2K: opening.uValueWm2K,
        orientation: createConfidence(orientation, orientationConf.source, orientationConf.confidence, importDate),
        placement: prov,
        inferred: true
      });
    }
    return out;
  }

  private buildRooms(building: Building, fp: Footprint): GeometryElement[] {
    const importDate = building.importedAt;
    const { width, depth } = fp;
    const rooms = sortByNumericSuffix(building.rooms);
    if (rooms.length === 0) {
      const face = horizontalFace(0, width, depth, 0.001, true);
      const placement: Placement = {
        origin: v3(0, 0, 0.001),
        dimensions: { width, depth, height: 0 },
        orientation: null
      };
      return [
        {
          id: 'room-synthesized-1',
          kind: 'room',
          label: 'Pièce principale (inférée)',
          mesh: { faces: [face] },
          areaM2: createConfidence(width * depth, RULES.roomFromFootprint.source, RULES.roomFromFootprint.confidence, importDate),
          uValueWm2K: null,
          orientation: null,
          placement: placementConfidence(importDate, placement, [RULES.roomFromFootprint]),
          inferred: true
        }
      ];
    }
    const roomFallback = (width * depth) / rooms.length;
    const areas = rooms.map((r) => (r.areaM2 !== null && r.areaM2.value > 0 ? r.areaM2.value : roomFallback));
    const sum = areas.reduce((a, b) => a + b, 0);
    let x = 0;
    return rooms.map((room: Room, i: number) => {
      const w = (areas[i] as number) / sum * width;
      const face = horizontalFace(x, x + w, depth, 0.001, true);
      const placement: Placement = {
        origin: v3(x, 0, 0.001),
        dimensions: { width: w, depth, height: 0 },
        orientation: null
      };
      // null/zero area → equal-share fallback, recorded as a named rule
      const areaProvenance: Confidence<unknown> | Rule =
        room.areaM2 !== null && room.areaM2.value > 0 ? room.areaM2 : RULES.roomAreaEqualShare;
      const prov = placementConfidence(importDate, placement, [areaProvenance]);
      const el: GeometryElement = {
        id: room.id,
        kind: 'room',
        label: room.name.value || room.id,
        mesh: { faces: [face] },
        areaM2: room.areaM2,
        uValueWm2K: null,
        orientation: null,
        placement: prov,
        inferred: prov.confidence < 1
      };
      x += w;
      return el;
    });
  }
}
