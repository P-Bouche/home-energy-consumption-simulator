import type { Building } from './building.ts';
import { createConfidence, type Confidence } from './confidence.ts';
import type { Door, Room, Wall, Window } from './entities.ts';
import {
  COORDINATE_SYSTEM,
  computeMeshHash,
  makeFace,
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
 * 2.0.0 = Class B (ADR-0005): pitched gable roof, openings as holes with
 * recessed frames, multi-level wall stacking with inter-level slabs.
 */
export const INFERENCE_RULES_VERSION = '2.0.0';

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
 * Default ridge height as a fraction of the short footprint span (the ridge
 * runs along the long axis). Rule `ridge-height-default`.
 */
export const DEFAULT_RIDGE_SPAN_FRACTION = 0.25;

/**
 * Ridge height as a fraction of the short span for finished attics under the
 * slopes — `type_plancher_haut` enum code 12, "combles aménagés sous rampant".
 * Rule `ridge-height-from-roof-type`.
 */
export const RIDGE_SPAN_FRACTION_FINISHED_ATTIC = 0.35;

/**
 * Ridge height as a fraction of the short span for pitched roof coverings —
 * `type_plancher_haut` enum codes 13 ("toiture en chaume") and 16 ("toitures
 * en bac acier"). Rule `ridge-height-from-roof-type`.
 */
export const RIDGE_SPAN_FRACTION_PITCHED_COVER = 0.3;

/**
 * Recess depth of opening frames into the wall thickness (m). Display
 * constant: the glazing sits this far behind the outer wall face, inside the
 * 0.2 m wall (Class B, ADR-0005).
 */
export const OPENING_RECESS_M = 0.15;

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
  openingCursorClamped: rule('opening-cursor-clamped-to-host-wall', 0.5),
  openingWidthScaledToFitHost: rule('opening-width-scaled-to-fit-host', 0.5),
  // Class B (ADR-0005, inferenceRulesVersion 2.0.0)
  ridgeHeightFromRoofType: rule('ridge-height-from-roof-type', 0.7),
  ridgeHeightDefault: rule('ridge-height-default', 0.4),
  openingHoleSubtraction: rule('opening-hole-subtraction', 0.5),
  wallStackingPerLevel: rule('per-level-wall-stacking', 0.5),
  interLevelFloorSlab: rule('inter-level-floor-slab', 0.5)
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

/** Cardinal of each compass orientation ('horizontal' has none). */
const ORIENTATION_CARDINAL: Record<Orientation, Cardinal | null> = {
  N: 'N',
  NE: 'N',
  NW: 'N',
  E: 'E',
  SE: 'E',
  S: 'S',
  W: 'W',
  SW: 'W',
  horizontal: null
};

function toCardinal(orientation: Orientation | null): Cardinal | null {
  return orientation === null ? null : ORIENTATION_CARDINAL[orientation];
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
  /** Total envelope height: ceiling × levels. */
  readonly height: number;
  /** Ceiling height of one level (m). */
  readonly ceiling: number;
  /** Number of stacked levels. */
  readonly levels: number;
  readonly provenance: readonly (Confidence<unknown> | Rule | null)[];
}

/**
 * A DPE wall (or a synthesized one) placed on a footprint side: `from`/`length`
 * in side coordinates. Openings are planned against these placements, then
 * the wall mesh is split around their holes (Class B, ADR-0005).
 */
interface PlacedWall {
  readonly wall: Wall | null;
  readonly id: string;
  readonly label: string;
  readonly side: Cardinal;
  readonly from: number;
  readonly length: number;
  readonly orientation: Orientation;
  readonly orientationConf: Confidence<unknown> | Rule;
  readonly areaConf: Confidence<unknown> | Rule;
  readonly areaM2: Confidence<number> | null;
  readonly uValueWm2K: Confidence<number> | null;
}

/**
 * A planned opening (window/door) on its host wall, in side coordinates
 * (`from` absolute along the side). The host wall band is split around the
 * hole [from, from+w] × [z0, z0+h] and the opening gets a recessed frame.
 */
interface OpeningPlan {
  readonly opening: Window | Door;
  readonly kind: 'window' | 'door';
  readonly host: PlacedWall;
  readonly from: number;
  readonly w: number;
  readonly z0: number;
  readonly h: number;
  readonly orientation: Orientation;
  readonly orientationConf: Confidence<unknown> | Rule;
  readonly hostRule: Rule;
  readonly clamped: boolean;
  readonly scaled: boolean;
}

function sideLength(side: Cardinal, width: number, depth: number): number {
  return side === 'N' || side === 'S' ? width : depth;
}

/**
 * Splits a total width along X into strip widths proportional to `areas`
 * (sum-normalized). Shared by floors, roof strips and rooms.
 */
function splitAlongX(areas: readonly number[], width: number): number[] {
  const sum = areas.reduce((a, b) => a + b, 0);
  return areas.map((a) => (a / sum) * width);
}

/**
 * Rebuilds a face with reversed winding when its computed normal does not point
 * along `outward` (dot < 0), so every emitted face has a deterministic outward
 * normal regardless of the side parametrization.
 */
function faceOutward(vertices: readonly Vector3[], outward: Vector3): Face {
  const face = makeFace(vertices);
  const dot = face.normal.x * outward.x + face.normal.y * outward.y + face.normal.z * outward.z;
  return dot < 0 ? makeFace([...vertices].reverse()) : face;
}

/**
 * Per-side geometry of the footprint parametrization (Z-up, N = +Y), shared
 * by every wall/opening helper: outward unit normal, unit vector along
 * increasing `from`, a point mapper (`u` along the side, `d` outward from
 * the footprint edge — the outer wall face sits at d = thickness/2 —, `z`
 * height) and the wall origin on the outer face.
 */
interface SideGeometry {
  readonly outward: Vector3;
  readonly along: Vector3;
  readonly point: (width: number, depth: number, u: number, d: number, z: number) => Vector3;
  readonly origin: (from: number, width: number, depth: number, t: number) => Vector3;
}

const SIDES: Record<Cardinal, SideGeometry> = {
  N: {
    outward: v3(0, 1, 0),
    along: v3(1, 0, 0),
    point: (_w, depth, u, d, z) => v3(u, depth + d, z),
    origin: (from, _w, depth, t) => v3(from, depth + t, 0)
  },
  S: {
    outward: v3(0, -1, 0),
    along: v3(1, 0, 0),
    point: (_w, _depth, u, d, z) => v3(u, -d, z),
    origin: (from, _w, _depth, t) => v3(from, -t, 0)
  },
  E: {
    outward: v3(1, 0, 0),
    along: v3(0, 1, 0),
    point: (width, _depth, u, d, z) => v3(width + d, u, z),
    origin: (from, width, _depth, t) => v3(width + t, from, 0)
  },
  W: {
    outward: v3(-1, 0, 0),
    along: v3(0, 1, 0),
    point: (_w, _depth, u, d, z) => v3(-d, u, z),
    origin: (from, _w, _depth, t) => v3(-t, from, 0)
  }
};

/** Outward unit normal of a wall side. */
function sideOutward(side: Cardinal): Vector3 {
  return SIDES[side].outward;
}

/** Unit vector along the side direction (increasing `from`). */
function sideAlong(side: Cardinal): Vector3 {
  return SIDES[side].along;
}

/**
 * Maps a wall-side parametrization to a point: `u` = distance along the side,
 * `d` = outward distance from the footprint edge (the outer wall face sits at
 * d = thickness/2), `z` = height.
 */
function sidePoint(side: Cardinal, width: number, depth: number, u: number, d: number, z: number): Vector3 {
  return SIDES[side].point(width, depth, u, d, z);
}

/**
 * Wall quad on a side, wound so the normal points outward.
 * `from`/`to` are distances along the side (0 at the footprint corner side),
 * `z0`/`z1` the vertical band (one level of a stacked wall).
 */
function wallFace(side: Cardinal, from: number, to: number, z0: number, z1: number, width: number, depth: number, thickness: number): Face {
  const t = thickness / 2;
  return faceOutward(
    [
      sidePoint(side, width, depth, from, t, z0),
      sidePoint(side, width, depth, from, t, z1),
      sidePoint(side, width, depth, to, t, z1),
      sidePoint(side, width, depth, to, t, z0)
    ],
    sideOutward(side)
  );
}

function wallOrigin(side: Cardinal, from: number, width: number, depth: number, thickness: number): Vector3 {
  return SIDES[side].origin(from, width, depth, thickness / 2);
}

/**
 * One rectangular opening punched through the wall band [from, to] × [z0, z1]
 * (side coordinates). The band is split into sub-faces around the hole (left /
 * below / above / right strips), so the wall surface = band minus opening.
 */
interface Hole {
  readonly from: number;
  readonly to: number;
  readonly z0: number;
  readonly z1: number;
}

function wallBandFaces(side: Cardinal, from: number, to: number, z0: number, z1: number, holes: readonly Hole[], width: number, depth: number, thickness: number): Face[] {
  if (holes.length === 0) {
    return [wallFace(side, from, to, z0, z1, width, depth, thickness)];
  }
  const faces: Face[] = [];
  const sorted = [...holes]
    .map((h) => ({ from: Math.max(h.from, from), to: Math.min(h.to, to), z0: Math.max(h.z0, z0), z1: Math.min(h.z1, z1) }))
    .filter((h) => h.to > h.from && h.z1 > h.z0)
    .sort((a, b) => a.from - b.from);
  let prev = from;
  for (const h of sorted) {
    const hf = Math.max(h.from, prev);
    const ht = h.to;
    if (ht <= hf) continue;
    if (hf > prev) faces.push(wallFace(side, prev, hf, z0, z1, width, depth, thickness)); // left strip
    if (h.z0 > z0) faces.push(wallFace(side, hf, ht, z0, h.z0, width, depth, thickness)); // below sill
    if (h.z1 < z1) faces.push(wallFace(side, hf, ht, h.z1, z1, width, depth, thickness)); // above lintel
    prev = ht;
  }
  if (to > prev) faces.push(wallFace(side, prev, to, z0, z1, width, depth, thickness)); // right strip
  return faces;
}

/**
 * Class B opening mesh: a recessed frame set into the wall thickness — glazing
 * quad at `thickness/2 - OPENING_RECESS_M` from the footprint edge plus the
 * four reveal quads connecting it to the outer wall face (no more +0.05 m
 * floating panel, ADR-0005).
 */
function openingFrameFaces(side: Cardinal, from: number, to: number, z0: number, z1: number, width: number, depth: number, thickness: number): Face[] {
  const dOut = thickness / 2;
  const dIn = dOut - OPENING_RECESS_M;
  const p = (u: number, d: number, z: number): Vector3 => sidePoint(side, width, depth, u, d, z);
  const along = sideAlong(side);
  return [
    faceOutward([p(from, dIn, z0), p(to, dIn, z0), p(to, dIn, z1), p(from, dIn, z1)], sideOutward(side)),
    faceOutward([p(from, dOut, z0), p(to, dOut, z0), p(to, dIn, z0), p(from, dIn, z0)], v3(0, 0, -1)),
    faceOutward([p(from, dOut, z1), p(to, dOut, z1), p(to, dIn, z1), p(from, dIn, z1)], v3(0, 0, 1)),
    faceOutward([p(from, dOut, z0), p(from, dOut, z1), p(from, dIn, z1), p(from, dIn, z0)], along),
    faceOutward([p(to, dOut, z0), p(to, dIn, z0), p(to, dIn, z1), p(to, dOut, z1)], v3(-along.x, -along.y, -along.z))
  ];
}

/**
 * Placement origin of an opening on a host wall side: on the outer wall plane
 * (thickness/2 out), at the cursor position and sill height.
 */
function openingOrigin(side: Cardinal, from: number, z0: number, width: number, depth: number): Vector3 {
  return sidePoint(side, width, depth, from, WALL_THICKNESS_M / 2, z0);
}

/**
 * Class B pitched gable roof over the footprint strip [x0, x1]: two sloped
 * quads (N and S) rising from the wall top to the ridge along the long X axis
 * at y = depth/2, plus a gable triangle on each end strip (west at x0 = 0,
 * east at x1 = width). Replaces the flat roof slab (ADR-0005).
 */
function pitchedRoofFaces(x0: number, x1: number, withWestGable: boolean, withEastGable: boolean, width: number, depth: number, wallTop: number, ridge: number, thickness: number): Face[] {
  const t = thickness / 2;
  const faces: Face[] = [
    faceOutward([v3(x0, depth / 2, wallTop + ridge), v3(x1, depth / 2, wallTop + ridge), v3(x1, depth + t, wallTop), v3(x0, depth + t, wallTop)], v3(0, 1, 1)),
    faceOutward([v3(x0, -t, wallTop), v3(x1, -t, wallTop), v3(x1, depth / 2, wallTop + ridge), v3(x0, depth / 2, wallTop + ridge)], v3(0, -1, 1))
  ];
  if (withWestGable) {
    faces.push(faceOutward([v3(-t, depth / 2, wallTop + ridge), v3(-t, depth + t, wallTop), v3(-t, -t, wallTop)], v3(-1, 0, 0)));
  }
  if (withEastGable) {
    faces.push(faceOutward([v3(width + t, -t, wallTop), v3(width + t, depth + t, wallTop), v3(width + t, depth / 2, wallTop + ridge)], v3(1, 0, 0)));
  }
  return faces;
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
 * wall segment per DPE wall placed on the side matching its orientation.
 * Class B (ADR-0005, inference rules 2.0.0): a pitched gable roof over the
 * footprint, openings punched as holes in their host wall with recessed
 * frames, multi-level buildings stacked per level with inter-level floor
 * slabs, and rooms as floor strips. See docs/geometry.md for the full rules
 * catalog.
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

    // Class B (ADR-0005): walls are placed first, openings planned against
    // them, then wall meshes are split around the opening holes.
    const placedWalls = this.placeWalls(building, footprint);
    // Windows and doors are planned together so they share each host wall
    // without overlapping (they are laid out side by side, see planOpenings).
    const openingInputs: { opening: Window | Door; kind: 'window' | 'door' }[] = [
      ...building.windows.map((opening) => ({ opening, kind: 'window' as const })),
      ...building.doors.map((opening) => ({ opening, kind: 'door' as const }))
    ];
    const plans = this.planOpenings(building, openingInputs, footprint, placedWalls);

    const elements: GeometryElement[] = [];
    elements.push(...this.wallElements(building, footprint, placedWalls, plans));
    elements.push(...this.roofElements(building, footprint));
    elements.push(...this.buildFloors(building, footprint));
    elements.push(...this.openingElements(building, footprint, plans));
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
      ceiling,
      levels,
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

  /**
   * Places every wall on a footprint side (same rules as before: orientation
   * match, else most remaining capacity; length = area / total height,
   * clamped to the side). Returns plain placements — the meshes (per-level
   * stacking + opening holes) are built by {@link wallElements}.
   */
  private placeWalls(building: Building, fp: Footprint): PlacedWall[] {
    const { width, depth, height } = fp;
    const walls = sortByNumericSuffix(building.walls);
    if (walls.length === 0) {
      return SIDE_ORDER.map((side, i) => ({
        wall: null,
        id: `wall-synthesized-${i + 1}`,
        label: `Mur ${side} (inféré)`,
        side,
        from: 0,
        length: sideLength(side, width, depth),
        orientation: side as Orientation,
        orientationConf: RULES.wallsFromPerimeter,
        areaConf: RULES.wallsFromPerimeter,
        areaM2: null,
        uValueWm2K: null
      }));
    }

    const cursor: Record<Cardinal, number> = { N: 0, E: 0, S: 0, W: 0 };
    const countOnSide: Record<Cardinal, number> = { N: 0, E: 0, S: 0, W: 0 };
    for (const wall of walls) {
      const card = toCardinal(wall.orientation === null ? null : parseOrientation(wall.orientation.value));
      if (card !== null) countOnSide[card] += 1;
    }

    const out: PlacedWall[] = [];
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
      const orientation: Orientation = rawOrientation ?? (side as Orientation);
      out.push({
        wall,
        id: wall.id,
        label: wall.description.value || wall.id,
        side,
        from,
        length,
        orientation,
        orientationConf,
        areaConf,
        areaM2: wall.areaM2,
        uValueWm2K: wall.uValueWm2K
      });
    }
    // Envelope closure: any side with no DPE wall gets a synthesized
    // full-length wall (same rule and id pattern as the zero-wall case) so
    // the model never shows an open side.
    for (const side of SIDE_ORDER) {
      if (countOnSide[side] === 0) {
        out.push({
          wall: null,
          id: `wall-synthesized-${SIDE_ORDER.indexOf(side) + 1}`,
          label: `Mur ${side} (inféré)`,
          side,
          from: 0,
          length: sideLength(side, width, depth),
          orientation: side as Orientation,
          orientationConf: RULES.wallsFromPerimeter,
          areaConf: RULES.wallsFromPerimeter,
          areaM2: null,
          uValueWm2K: null
        });
      }
    }
    return out;
  }

  /**
   * Class B wall meshes: the ground-level band is split into sub-faces around
   * the opening holes of this wall (rule `opening-hole-subtraction`), upper
   * levels stack as one quad per level from z = level × ceiling (rule
   * `per-level-wall-stacking`).
   */
  private wallElements(building: Building, fp: Footprint, placedWalls: readonly PlacedWall[], plans: readonly OpeningPlan[]): GeometryElement[] {
    const importDate = building.importedAt;
    const { width, depth, height, ceiling, levels } = fp;
    const holesByWall = new Map<string, Hole[]>();
    for (const plan of plans) {
      const list = holesByWall.get(plan.host.id) ?? [];
      list.push({ from: plan.from, to: plan.from + plan.w, z0: plan.z0, z1: plan.z0 + plan.h });
      holesByWall.set(plan.host.id, list);
    }
    return placedWalls.map((pw) => {
      const holes = holesByWall.get(pw.id) ?? [];
      const faces: Face[] = [
        ...wallBandFaces(pw.side, pw.from, pw.from + pw.length, 0, ceiling, holes, width, depth, WALL_THICKNESS_M)
      ];
      for (let level = 1; level < levels; level += 1) {
        faces.push(wallFace(pw.side, pw.from, pw.from + pw.length, level * ceiling, (level + 1) * ceiling, width, depth, WALL_THICKNESS_M));
      }
      const placement: Placement = {
        origin: wallOrigin(pw.side, pw.from, width, depth, WALL_THICKNESS_M),
        dimensions: { width: pw.length, depth: WALL_THICKNESS_M, height },
        orientation: pw.side
      };
      const prov = placementConfidence(importDate, placement, [
        pw.areaConf,
        pw.orientationConf,
        ...fp.provenance,
        holes.length > 0 ? RULES.openingHoleSubtraction : null,
        levels > 1 ? RULES.wallStackingPerLevel : null
      ]);
      const synthesized = pw.wall === null;
      return {
        id: pw.id,
        kind: 'wall' as const,
        label: pw.label,
        mesh: { faces },
        areaM2: synthesized
          ? createConfidence(pw.length * height, RULES.wallsFromPerimeter.source, RULES.wallsFromPerimeter.confidence, importDate)
          : pw.areaM2,
        uValueWm2K: pw.uValueWm2K,
        orientation: synthesized
          ? createConfidence(pw.orientation, RULES.wallsFromPerimeter.source, RULES.wallsFromPerimeter.confidence, importDate)
          : pw.wall !== null && pw.wall.orientation !== null
            ? createConfidence(pw.orientation, pw.wall.orientation.source, pw.wall.orientation.confidence, importDate)
            : createConfidence(pw.orientation, pw.orientationConf.source, pw.orientationConf.confidence, importDate),
        placement: prov,
        inferred: synthesized || prov.confidence < 1
      };
    });
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
    const widths = splitAlongX(areas, width);
    let x = 0;
    return elements.map((el, i) => {
      const w = widths[i] as number;
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

  /**
   * Ridge height (m) of the Class B gable roof: inferred from the first DPE
   * roof whose `roofType`/description denotes a pitched roof (rule
   * `ridge-height-from-roof-type`), else the named default rule
   * `ridge-height-default` (fraction of the short span). The ridge runs along
   * the long footprint axis, so the span is the short axis.
   */
  private ridgeHeight(building: Building, fp: Footprint): { readonly m: number; readonly rule: Rule } {
    const span = Math.min(fp.width, fp.depth);
    for (const roof of sortByNumericSuffix(building.roofs)) {
      const type = roof.roofType?.value ?? '';
      const text = `${type} ${roof.description.value}`.toLowerCase();
      // codes per the DPE importer enum table `type_plancher_haut` (domain roofType)
      if (type === '12' || /combles|rampant/.test(text)) {
        return { m: RIDGE_SPAN_FRACTION_FINISHED_ATTIC * span, rule: RULES.ridgeHeightFromRoofType }; // 12 = combles aménagés sous rampant
      }
      if (type === '13' || type === '16' || /toiture|chaume|bac acier/.test(text)) {
        return { m: RIDGE_SPAN_FRACTION_PITCHED_COVER * span, rule: RULES.ridgeHeightFromRoofType }; // 13 = chaume, 16 = bac acier
      }
    }
    return { m: DEFAULT_RIDGE_SPAN_FRACTION * span, rule: RULES.ridgeHeightDefault };
  }

  /**
   * Class B roofs: a pitched gable along the long axis (two sloped quads per
   * roof strip + gable triangles on the end strips) instead of a flat slab.
   * DPE roofs keep their id and area; strips split along X as before.
   */
  private roofElements(building: Building, fp: Footprint): GeometryElement[] {
    const importDate = building.importedAt;
    const { width, depth, height } = fp;
    const ridge = this.ridgeHeight(building, fp);
    const roofs = sortByNumericSuffix(building.roofs);
    const stripFaces = (x0: number, x1: number, i: number, n: number): Face[] =>
      pitchedRoofFaces(x0, x1, i === 0, i === n - 1, width, depth, height, ridge.m, WALL_THICKNESS_M);
    if (roofs.length === 0) {
      const placement: Placement = {
        origin: v3(0, 0, height),
        dimensions: { width, depth, height: ridge.m },
        orientation: 'horizontal'
      };
      return [
        {
          id: 'roof-synthesized-1',
          kind: 'roof',
          label: 'Toit (inféré)',
          mesh: { faces: stripFaces(0, width, 0, 1) },
          areaM2: createConfidence(width * depth, RULES.roofFromFootprint.source, RULES.roofFromFootprint.confidence, importDate),
          uValueWm2K: null,
          orientation: createConfidence('horizontal', RULES.roofFromFootprint.source, RULES.roofFromFootprint.confidence, importDate),
          placement: placementConfidence(importDate, placement, [RULES.roofFromFootprint, ridge.rule]),
          inferred: true
        }
      ];
    }
    const totalArea = width * depth;
    const areas = roofs.map((r) => (r.areaM2 !== null && r.areaM2.value > 0 ? r.areaM2.value : totalArea / roofs.length));
    const widths = splitAlongX(areas, width);
    let x = 0;
    return roofs.map((roof, i) => {
      const w = widths[i] as number;
      const x0 = x;
      x += w;
      const placement: Placement = {
        origin: v3(x0, 0, height),
        dimensions: { width: w, depth, height: ridge.m },
        orientation: 'horizontal'
      };
      // null/zero area → equal-share fallback, recorded as a named rule
      const areaProvenance: Confidence<unknown> | Rule =
        roof.areaM2 !== null && roof.areaM2.value > 0 ? roof.areaM2 : RULES.slabAreaEqualShare;
      const prov = placementConfidence(importDate, placement, [areaProvenance, ridge.rule]);
      const out: GeometryElement = {
        id: roof.id,
        kind: 'roof',
        label: roof.description.value || roof.id,
        mesh: { faces: stripFaces(x0, x, i, roofs.length) },
        areaM2: roof.areaM2,
        uValueWm2K: roof.uValueWm2K,
        orientation: createConfidence('horizontal', 'domain:element-kind-horizontal', 1, importDate),
        placement: prov,
        inferred: prov.confidence < 1
      };
      return out;
    });
  }

  private buildFloors(building: Building, fp: Footprint): GeometryElement[] {
    const importDate = building.importedAt;
    const ground = this.splitTop(
      building.floors,
      fp.width * fp.depth,
      0,
      fp.depth,
      false,
      'floor',
      (el, i) => (building.floors[i]?.description.value ?? el.id),
      importDate,
      RULES.floorFromFootprint
    );
    // Class B: horizontal slab at each intermediate level boundary (rule
    // `inter-level-floor-slab`), so stacked levels read as separate floors.
    const slabs: GeometryElement[] = [];
    if (fp.levels > 1) {
      // keep synthesized ids unique: the ground synthesized floor (if any) took index 1
      const base = building.floors.length === 0 ? 2 : 1;
      for (let level = 1; level < fp.levels; level += 1) {
        const z = level * fp.ceiling;
        const face = horizontalFace(0, fp.width, fp.depth, z, true);
        const placement: Placement = {
          origin: v3(0, 0, z),
          dimensions: { width: fp.width, depth: fp.depth, height: 0 },
          orientation: 'horizontal'
        };
        slabs.push({
          id: `floor-synthesized-${base + level - 1}`,
          kind: 'floor',
          label: `Plancher intermédiaire niveau ${level + 1} (inféré)`,
          mesh: { faces: [face] },
          areaM2: createConfidence(fp.width * fp.depth, RULES.interLevelFloorSlab.source, RULES.interLevelFloorSlab.confidence, importDate),
          uValueWm2K: null,
          orientation: createConfidence('horizontal', RULES.interLevelFloorSlab.source, RULES.interLevelFloorSlab.confidence, importDate),
          placement: placementConfidence(importDate, placement, [RULES.interLevelFloorSlab]),
          inferred: true
        });
      }
    }
    return [...ground, ...slabs];
  }

  /**
   * Plans each opening on its host wall (same orientation, else the longest
   * wall). Openings sharing a host are laid out side by side along the wall;
   * when their natural widths don't fit, every width is scaled down
   * proportionally (rule `opening-width-scaled-to-fit-host`) so openings never
   * stack on top of each other. `from` is absolute along the side.
   */
  private planOpenings(
    building: Building,
    openings: readonly { opening: Window | Door; kind: 'window' | 'door' }[],
    fp: Footprint,
    placedWalls: readonly PlacedWall[]
  ): OpeningPlan[] {
    if (openings.length === 0) return [];
    const sorted = sortByNumericSuffix(openings.map((o) => ({ id: o.opening.id, ...o })));

    interface Pending {
      readonly opening: Window | Door;
      readonly kind: 'window' | 'door';
      readonly host: PlacedWall;
      readonly hostRule: Rule;
      readonly w: number;
      readonly h: number;
      readonly z0: number;
      readonly orientation: Orientation;
      readonly orientationConf: Confidence<unknown> | Rule;
    }
    const pending: Pending[] = [];
    for (const item of sorted) {
      const { opening, kind } = item;
      const openingOrientation = 'orientation' in opening ? opening.orientation : null;
      const rawOrientation = openingOrientation === null ? null : parseOrientation(openingOrientation.value);
      const card = toCardinal(rawOrientation);
      let host = card === null ? null : (placedWalls.find((w) => w.side === card) ?? null);
      let hostRule: Rule = RULES.openingHostWallByOrientation;
      if (host === null) {
        host = [...placedWalls].sort((a, b) => b.length - a.length)[0] ?? null;
        hostRule = RULES.openingHostWallLongest;
      }
      if (host === null) continue;
      const area = opening.areaM2 !== null && opening.areaM2.value > 0 ? opening.areaM2.value : 1;
      const isWindow = kind === 'window';
      const h = isWindow ? WINDOW_HEIGHT_M : DOOR_HEIGHT_M;
      pending.push({
        opening,
        kind,
        host,
        hostRule,
        w: Math.min(area / h, host.length),
        h,
        z0: isWindow ? WINDOW_SILL_M : 0,
        orientation: rawOrientation ?? (host.side as Orientation),
        orientationConf: openingOrientation ?? RULES.openingOrientationFromHostWall
      });
    }

    // Side-by-side layout per host wall, with proportional width scaling when
    // the openings don't fit (they must never overlap or stack).
    const MARGIN = 0.05;
    const GAP = 0.1;
    const layout = new Map<Window | Door, { from: number; w: number; clamped: boolean; scaled: boolean }>();
    const hostIds = [...new Set(pending.map((p) => p.host.id))];
    for (const hostId of hostIds) {
      const host = (pending.find((p) => p.host.id === hostId) as Pending).host;
      const group = pending.filter((p) => p.host.id === hostId);
      const available = host.length - 2 * MARGIN;
      const sumW = group.reduce((s, p) => s + p.w, 0);
      const gaps = GAP * (group.length - 1);
      const scale = sumW > 0 && sumW + gaps > available ? Math.max(0.05, (available - gaps) / sumW) : 1;
      let rel = MARGIN;
      for (const p of group) {
        const w = p.w * scale;
        // safety clamp so an opening never overflows past the host wall corner
        const maxFrom = Math.max(MARGIN, host.length - w - MARGIN);
        const clampedFrom = Math.min(rel, maxFrom);
        layout.set(p.opening, { from: host.from + clampedFrom, w, clamped: clampedFrom < rel, scaled: scale < 1 });
        rel = clampedFrom + w + GAP;
      }
    }

    return pending.map((p) => {
      const l = layout.get(p.opening) as { from: number; w: number; clamped: boolean; scaled: boolean };
      return {
        opening: p.opening,
        kind: p.kind,
        host: p.host,
        from: l.from,
        w: l.w,
        z0: p.z0,
        h: p.h,
        orientation: p.orientation,
        orientationConf: p.orientationConf,
        hostRule: p.hostRule,
        clamped: l.clamped,
        scaled: l.scaled
      };
    });
  }

  /**
   * Class B opening elements: a recessed frame set into the wall thickness
   * (glazing + 4 reveals, rule `opening-hole-subtraction`) whose placement
   * origin sits on the wall plane — the +0.05 m floating panel is gone.
   */
  private openingElements(building: Building, fp: Footprint, plans: readonly OpeningPlan[]): GeometryElement[] {
    const importDate = building.importedAt;
    const { width, depth } = fp;
    return plans.map((plan) => {
      const { host, opening, kind } = plan;
      const faces = openingFrameFaces(host.side, plan.from, plan.from + plan.w, plan.z0, plan.z0 + plan.h, width, depth, WALL_THICKNESS_M);
      const placement: Placement = {
        origin: openingOrigin(host.side, plan.from, plan.z0, width, depth),
        dimensions: { width: plan.w, depth: WALL_THICKNESS_M, height: plan.h },
        orientation: plan.orientation
      };
      const isWindow = kind === 'window';
      const prov = placementConfidence(importDate, placement, [
        opening.areaM2,
        plan.orientationConf,
        isWindow ? RULES.windowHeight : RULES.doorHeight,
        isWindow ? RULES.windowSill : null,
        plan.hostRule,
        plan.clamped ? RULES.openingCursorClamped : null,
        plan.scaled ? RULES.openingWidthScaledToFitHost : null,
        RULES.openingHoleSubtraction
      ]);
      return {
        id: opening.id,
        kind,
        label: opening.description.value || opening.id,
        mesh: { faces },
        areaM2: opening.areaM2,
        uValueWm2K: opening.uValueWm2K,
        orientation: createConfidence(plan.orientation, plan.orientationConf.source, plan.orientationConf.confidence, importDate),
        placement: prov,
        inferred: true
      };
    });
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
    const widths = splitAlongX(areas, width);
    let x = 0;
    return rooms.map((room: Room, i: number) => {
      const w = widths[i] as number;
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
