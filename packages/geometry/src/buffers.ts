import { geometryFromJson, type Geometry, type GeometryElementKind, type GeometryJson, type Vector3 } from '@hes/domain';

/**
 * Pure adapter core (P3): converts a domain {@link Geometry} into plain,
 * non-indexed mesh buffers (positions + normals as Float32Array) plus one
 * pickable group per element. No three.js import in this file — the three.js
 * conversion lives in the `./three` subpath (used by the web app only), so
 * this module also runs in Node (API, benchmarks, tests).
 *
 * Buffers are non-indexed: each face is fan-triangulated and its vertices are
 * duplicated per triangle, so a raycast hit maps to an element by
 * `vertexIndex = faceIndex * 3` via {@link elementAtVertex}.
 */

/**
 * One pickable element range inside merged buffers. `start`/`count` are
 * VERTEX offsets (not byte offsets, not indices).
 */
export interface MeshGroup {
  readonly elementId: string;
  readonly kind: GeometryElementKind;
  readonly label: string;
  readonly inferred: boolean;
  readonly start: number;
  readonly count: number;
  readonly labelPosition: Vector3 | null;
}

/**
 * Plain mesh buffers for rendering (merged by material class via
 * {@link filterByKinds} to limit draw calls, TR-P3-02).
 */
export interface MeshBuffers {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly groups: readonly MeshGroup[];
}

/**
 * Converts a domain Geometry to merged non-indexed mesh buffers. Deterministic:
 * same Geometry → identical arrays.
 */
export function geometryToMeshBuffers(geometry: Geometry): MeshBuffers {
  const positions: number[] = [];
  const normals: number[] = [];
  const groups: MeshGroup[] = [];
  for (const el of geometry.elements) {
    const start = positions.length / 3;
    for (const face of el.mesh.faces) {
      const vs = face.vertices;
      for (let i = 1; i < vs.length - 1; i += 1) {
        for (const v of [vs[0], vs[i], vs[i + 1]]) {
          const vertex = v as Vector3;
          positions.push(vertex.x, vertex.y, vertex.z);
          normals.push(face.normal.x, face.normal.y, face.normal.z);
        }
      }
    }
    const count = positions.length / 3 - start;
    const p = el.placement.value;
    groups.push({
      elementId: el.id,
      kind: el.kind,
      label: el.label,
      inferred: el.inferred,
      start,
      count,
      labelPosition:
        el.kind === 'room'
          ? {
              x: p.origin.x + p.dimensions.width / 2,
              y: p.origin.y + p.dimensions.depth / 2,
              z: p.origin.z + 0.02
            }
          : null
    });
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    groups: Object.freeze(groups)
  };
}

/**
 * Converts the JSON geometry returned by `GET /buildings/:id/geometry` to mesh
 * buffers (web app path).
 */
export function geometryJsonToMeshBuffers(json: GeometryJson): MeshBuffers {
  return geometryToMeshBuffers(geometryFromJson(json));
}

/**
 * Maps a vertex index (e.g. `faceIndex * 3` of a raycast hit on non-indexed
 * buffers) to its pickable element group, or null when out of range.
 */
export function elementAtVertex(buffers: MeshBuffers, vertexIndex: number): MeshGroup | null {
  for (const group of buffers.groups) {
    if (vertexIndex >= group.start && vertexIndex < group.start + group.count) return group;
  }
  return null;
}

/**
 * Extracts the sub-buffers for a set of element kinds (used to merge geometry
 * by material class: envelope / openings / rooms → few draw calls).
 * Group starts are re-based onto the sub-buffers.
 */
export function filterByKinds(buffers: MeshBuffers, kinds: readonly GeometryElementKind[]): MeshBuffers {
  const positions: number[] = [];
  const normals: number[] = [];
  const groups: MeshGroup[] = [];
  for (const group of buffers.groups) {
    if (!kinds.includes(group.kind)) continue;
    const start = positions.length / 3;
    const from = group.start * 3;
    const to = (group.start + group.count) * 3;
    for (let i = from; i < to; i += 1) {
      positions.push(buffers.positions[i] ?? 0);
      normals.push(buffers.normals[i] ?? 0);
    }
    groups.push({ ...group, start });
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    groups: Object.freeze(groups)
  };
}
