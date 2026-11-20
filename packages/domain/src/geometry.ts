import {
  confidenceFromJson,
  confidenceToJson,
  reviveConfidenceDates,
  type Confidence,
  type ConfidenceJson
} from './confidence.ts';
import type { BuildingId } from './entities.ts';

/**
 * 3D reconstruction value objects (P3).
 *
 * Coordinate system (TR-P3-06, documented in docs/geometry.md and unit-tested
 * in packages/domain/test/geometry.test.ts):
 * - unit: meters;
 * - Z-up: X = east, Y = north, Z = up;
 * - origin: the building footprint corner with the smallest X and Y, at the
 *   bottom of the ground floor (z = 0).
 */

/**
 * A 3D point/vector in meters (coordinate system above).
 */
export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Box dimensions in meters: width along X, depth along Y, height along Z.
 */
export interface Dimensions {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/**
 * Compass orientation of an envelope element, seen from outside the building
 * (`N` = outward normal points north/+Y, …). `horizontal` is used for roofs
 * and floors (normal along ±Z).
 */
export type Orientation = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'horizontal';

/**
 * All valid orientations.
 */
export const ORIENTATIONS: readonly Orientation[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'horizontal'];

/**
 * Parses a DPE orientation value into an {@link Orientation}.
 *
 * The importer stores `enum_orientation_id` verbatim (3CL-DPE enum:
 * 1=N, 2=NE, 3=E, 4=SE, 5=S, 6=SW, 7=W, 8=NW, 9=horizontal). French and
 * English compass words are also accepted so user-edited values (P4) parse.
 *
 * @returns the orientation, or null when the raw value is unknown/missing
 */
export function parseOrientation(raw: string | null | undefined): Orientation | null {
  if (raw === null || raw === undefined) return null;
  const v = raw.trim().toLowerCase();
  if (v.length === 0) return null;
  const byId: Record<string, Orientation> = {
    '1': 'N', '2': 'NE', '3': 'E', '4': 'SE', '5': 'S', '6': 'SW', '7': 'W', '8': 'NW', '9': 'horizontal'
  };
  if (v in byId) return byId[v] as Orientation;
  const byWord: Record<string, Orientation> = {
    nord: 'N', 'nord-est': 'NE', est: 'E', 'sud-est': 'SE', sud: 'S', 'sud-ouest': 'SW',
    ouest: 'W', 'nord-ouest': 'NW',
    n: 'N', ne: 'NE', e: 'E', se: 'SE', s: 'S', sw: 'SW', w: 'W', nw: 'NW',
    north: 'N', 'north-east': 'NE', east: 'E', 'south-east': 'SE', south: 'S', 'south-west': 'SW',
    west: 'W', 'north-west': 'NW',
    horizontal: 'horizontal', horizontale: 'horizontal'
  };
  return byWord[v] ?? null;
}

/**
 * The documented coordinate system of every reconstructed {@link Geometry}.
 */
export interface CoordinateSystem {
  readonly unit: 'm';
  readonly upAxis: 'Z';
  readonly axes: { readonly x: 'east'; readonly y: 'north'; readonly z: 'up' };
  readonly origin: 'building-footprint-corner';
}

/**
 * Canonical coordinate system constant attached to every produced Geometry.
 */
export const COORDINATE_SYSTEM: CoordinateSystem = Object.freeze({
  unit: 'm',
  upAxis: 'Z',
  axes: Object.freeze({ x: 'east', y: 'north', z: 'up' }),
  origin: 'building-footprint-corner'
});

/**
 * A polygonal face (3 or 4 vertices) with its outward unit normal.
 */
export interface Face {
  readonly vertices: readonly Vector3[];
  readonly normal: Vector3;
}

/**
 * A plain-data mesh: a list of faces in meters, building coordinate system.
 * Framework-free (no three.js): adapters convert it to render buffers.
 */
export interface Mesh {
  readonly faces: readonly Face[];
}

/**
 * Where an element was placed and how big it is. Wrapped in a Confidence by
 * every GeometryElement: the placement is measured (confidence 1) only when
 * every input it was derived from was measured; otherwise it carries the
 * weakest inference rule as source with confidence < 1.
 */
export interface Placement {
  readonly origin: Vector3;
  readonly dimensions: Dimensions;
  readonly orientation: Orientation | null;
}

/**
 * Kind of a reconstructed element. `room` elements are floor labels/areas.
 */
export type GeometryElementKind = 'wall' | 'roof' | 'floor' | 'window' | 'door' | 'room';

/**
 * One pickable element of the reconstructed geometry. The id is STABLE
 * (P4 relies on it): it is the domain entity id (`wall-1`, `window-2`, …)
 * or a deterministic synthesized id (`roof-synthesized-1`, …) when the DPE
 * had no such element.
 */
export interface GeometryElement {
  readonly id: string;
  readonly kind: GeometryElementKind;
  readonly label: string;
  readonly mesh: Mesh;
  readonly areaM2: Confidence<number> | null;
  readonly uValueWm2K: Confidence<number> | null;
  readonly orientation: Confidence<Orientation> | null;
  readonly placement: Confidence<Placement>;
  readonly inferred: boolean;
}

/**
 * The reconstructed geometry of a building: pure data, deterministic
 * (same building → same meshHash), no I/O.
 */
export interface Geometry {
  readonly buildingId: BuildingId;
  readonly coordinateSystem: CoordinateSystem;
  readonly inferenceRulesVersion: string;
  readonly bounds: { readonly min: Vector3; readonly max: Vector3 };
  readonly elements: readonly GeometryElement[];
  readonly meshHash: string;
}

/**
 * JSON shape of a Face (plain data, identical to Face).
 */
export type FaceJson = Face;

/**
 * JSON shape of a Mesh.
 */
export interface MeshJson {
  readonly faces: readonly FaceJson[];
}

/**
 * JSON shape of a GeometryElement (Confidence values flattened).
 */
export interface GeometryElementJson {
  readonly id: string;
  readonly kind: GeometryElementKind;
  readonly label: string;
  readonly mesh: MeshJson;
  readonly areaM2: ConfidenceJson<number> | null;
  readonly uValueWm2K: ConfidenceJson<number> | null;
  readonly orientation: ConfidenceJson<Orientation> | null;
  readonly placement: ConfidenceJson<Placement>;
  readonly inferred: boolean;
}

/**
 * JSON shape of a Geometry — the API contract of GET /buildings/:id/geometry.
 */
export interface GeometryJson {
  readonly buildingId: BuildingId;
  readonly coordinateSystem: CoordinateSystem;
  readonly inferenceRulesVersion: string;
  readonly bounds: { readonly min: Vector3; readonly max: Vector3 };
  readonly elements: readonly GeometryElementJson[];
  readonly meshHash: string;
}

function cToJ<T>(c: Confidence<T> | null): ConfidenceJson<T> | null {
  return c === null ? null : confidenceToJson(c);
}

function cFromJ<T>(j: ConfidenceJson<T> | null): Confidence<T> | null {
  return j === null ? null : confidenceFromJson(j);
}

/**
 * Serializes a Geometry to its JSON (API) shape.
 */
export function geometryToJson(geometry: Geometry): GeometryJson {
  return {
    buildingId: geometry.buildingId,
    coordinateSystem: geometry.coordinateSystem,
    inferenceRulesVersion: geometry.inferenceRulesVersion,
    bounds: geometry.bounds,
    meshHash: geometry.meshHash,
    elements: geometry.elements.map((el) => ({
      id: el.id,
      kind: el.kind,
      label: el.label,
      mesh: el.mesh,
      areaM2: cToJ(el.areaM2),
      uValueWm2K: cToJ(el.uValueWm2K),
      orientation: cToJ(el.orientation),
      placement: confidenceToJson(el.placement),
      inferred: el.inferred
    }))
  };
}

/**
 * Revives a Geometry from its JSON shape, re-validating all Confidence values.
 */
export function geometryFromJson(json: GeometryJson): Geometry {
  const revived = reviveConfidenceDates(json);
  return {
    buildingId: revived.buildingId,
    coordinateSystem: revived.coordinateSystem,
    inferenceRulesVersion: revived.inferenceRulesVersion,
    bounds: revived.bounds,
    meshHash: revived.meshHash,
    elements: revived.elements.map((el) => ({
      id: el.id,
      kind: el.kind,
      label: el.label,
      mesh: el.mesh,
      areaM2: cFromJ(el.areaM2),
      uValueWm2K: cFromJ(el.uValueWm2K),
      orientation: cFromJ(el.orientation),
      placement: confidenceFromJson(el.placement),
      inferred: el.inferred
    }))
  };
}

/**
 * Rounds to 6 decimal places so the serialized geometry and the mesh hash are
 * bit-stable across runs and engines (float ops are deterministic per IEEE-754
 * given identical operation order; rounding removes representation noise).
 */
export function round6(n: number): number {
  const r = Math.round(n * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

/**
 * Creates a Vector3 with coordinates rounded to 6 decimals.
 */
export function v3(x: number, y: number, z: number): Vector3 {
  return { x: round6(x), y: round6(y), z: round6(z) };
}

function sub(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function norm(a: Vector3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

/**
 * Builds a Face from 3 or 4 vertices; the normal is computed from the winding
 * (right-hand rule: normal = normalize(cross(v1 - v0, v3 - v0)) for quads).
 */
export function makeFace(vertices: readonly Vector3[]): Face {
  if (vertices.length !== 3 && vertices.length !== 4) {
    throw new RangeError(`Face must have 3 or 4 vertices, got ${vertices.length}`);
  }
  const a = vertices[0] as Vector3;
  const b = vertices[1] as Vector3;
  const d = vertices[vertices.length - 1] as Vector3;
  const c = cross(sub(b, a), sub(d, a));
  const len = norm(c);
  const normal: Vector3 = len === 0 ? { x: 0, y: 0, z: 1 } : v3(c.x / len, c.y / len, c.z / len);
  return { vertices: Object.freeze([...vertices]), normal };
}

/**
 * Area of a face in m² (shoelace over the fan triangulation, using |normal|).
 */
export function faceArea(face: Face): number {
  const vs = face.vertices;
  let area = 0;
  for (let i = 1; i < vs.length - 1; i += 1) {
    const a = vs[0] as Vector3;
    const b = vs[i] as Vector3;
    const c = vs[i + 1] as Vector3;
    area += norm(cross(sub(b, a), sub(c, a))) / 2;
  }
  return area;
}

/**
 * Total surface area of a mesh in m².
 */
export function meshArea(mesh: Mesh): number {
  return mesh.faces.reduce((sum, face) => sum + faceArea(face), 0);
}

/**
 * Deterministic non-cryptographic 64-bit hash (cyrb53) of a string, as 16 hex
 * chars. Pure TypeScript (Math.imul is spec-deterministic), so it computes
 * identically in Node and in the browser — the mesh hash is verifiable on both
 * sides of the API.
 */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function canonicalElement(el: GeometryElement): string {
  const faces = el.mesh.faces
    .map(
      (f) =>
        `f(${f.vertices.map((p) => `${p.x},${p.y},${p.z}`).join(';')})n(${f.normal.x},${f.normal.y},${f.normal.z})`
    )
    .join('|');
  return `${el.id}:${el.kind}:${faces}`;
}

/**
 * Computes the deterministic mesh hash of a geometry: hash of the canonical
 * serialization of every element (id, kind, faces with 6-decimal coordinates)
 * plus the inference rules version. Same building + same rules → same hash.
 */
export function computeMeshHash(
  inferenceRulesVersion: string,
  elements: readonly GeometryElement[]
): string {
  const sorted = [...elements].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return hashString(`${inferenceRulesVersion}::${sorted.map(canonicalElement).join('::')}`);
}
