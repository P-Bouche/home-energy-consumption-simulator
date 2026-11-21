import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import type { MeshBuffers } from './buffers.ts';

/**
 * three.js adapter (P3): converts plain {@link MeshBuffers} into a
 * `THREE.BufferGeometry` for React Three Fiber. Exposed only through the
 * `@hes/geometry/three` subpath so Node consumers (API, benchmarks) never load
 * three.js.
 *
 * Axis conversion (UI audit 2026-11-21, F8): the domain geometry is Z-up
 * (`COORDINATE_SYSTEM` in `@hes/domain`, `upAxis: 'Z'`) while three.js and
 * OrbitControls are Y-up. The conversion happens ONCE here, at the rendering
 * boundary, as a component remap `(x, y, z) -> (x, z, -y)` — mathematically
 * identical to a -PI/2 rotation about the X axis. Chosen over a root-group
 * rotation so that every consumer of this adapter (meshes, edge outlines,
 * label anchors) is directly in three.js space and scene dressing (ground
 * plane, contact shadows) needs no per-object conversion. Domain objects,
 * the plain mesh buffers and the mesh hash are read-only here: this module
 * never mutates its input, so `meshHash` is unaffected.
 */

/**
 * A point/vector in domain space (meters, Z-up): structurally compatible with
 * the domain `Vector3` without importing the domain package.
 */
export interface DomainPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Converts one domain position/vector (Z-up) into three.js space (Y-up):
 * `(x, y, z) -> (x, z, -y)`. The same mapping applies to normals (it is a pure
 * rotation, no translation).
 */
export function domainToThree(point: DomainPoint): [number, number, number] {
  return [point.x, point.z, -point.y];
}

/**
 * Builds a non-indexed THREE.BufferGeometry with `position` and `normal`
 * attributes from plain mesh buffers, converting the Z-up domain axes to the
 * Y-up three.js axes (see {@link domainToThree}). The input buffers are never
 * mutated; new typed arrays are allocated.
 */
export function toThreeBufferGeometry(buffers: MeshBuffers): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(buffers.positions.length);
  const normals = new Float32Array(buffers.normals.length);
  for (let i = 0; i < buffers.positions.length; i += 3) {
    const px = buffers.positions[i] ?? 0;
    const py = buffers.positions[i + 1] ?? 0;
    const pz = buffers.positions[i + 2] ?? 0;
    const [tx, ty, tz] = domainToThree({ x: px, y: py, z: pz });
    positions[i] = tx;
    positions[i + 1] = ty;
    positions[i + 2] = tz;
    const nx = buffers.normals[i] ?? 0;
    const ny = buffers.normals[i + 1] ?? 0;
    const nz = buffers.normals[i + 2] ?? 0;
    const [nrx, nry, nrz] = domainToThree({ x: nx, y: ny, z: nz });
    normals[i] = nrx;
    normals[i + 1] = nry;
    normals[i + 2] = nrz;
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  return geometry;
}

/**
 * A default 3/4 perspective camera frame for a domain bounding box, expressed
 * in three.js (Y-up) space.
 */
export interface CameraFrame {
  /** Camera position (three.js space). */
  readonly position: [number, number, number];
  /** OrbitControls target: the converted bounding-sphere center. */
  readonly target: [number, number, number];
  /** Bounding-sphere radius (m), axes-invariant under the conversion. */
  readonly radius: number;
  /** Camera distance from the target (m). */
  readonly distance: number;
}

/**
 * Options of {@link cameraFrameForBounds}.
 */
export interface CameraFrameOptions {
  /** Vertical field of view in degrees (default 50). */
  readonly fovDeg?: number;
  /** Azimuth around the target in degrees, from +Z towards +X (default 45). */
  readonly azimuthDeg?: number;
  /** Elevation above the horizon in degrees (default 30). */
  readonly elevationDeg?: number;
  /**
   * Camera distance as a multiple of the bounding-sphere DIAMETER (default
   * 1.8, per UI audit F8), raised when the frustum-fit distance is larger so
   * the whole model always fits the view.
   */
  readonly diameterFactor?: number;
}

/**
 * Computes a 3/4 camera frame (azimuth ~45°, elevation ~30°, distance ~1.8x the
 * bounding sphere) for domain bounds, converted to three.js space. Pure math
 * (three.js `Box3`/`Sphere` are plain objects — no GPU/WebGL needed), so it is
 * unit-testable in Node.
 */
export function cameraFrameForBounds(
  bounds: { readonly min: DomainPoint; readonly max: DomainPoint },
  options: CameraFrameOptions = {}
): CameraFrame {
  const fovDeg = options.fovDeg ?? 50;
  const azimuthDeg = options.azimuthDeg ?? 45;
  const elevationDeg = options.elevationDeg ?? 30;
  const diameterFactor = options.diameterFactor ?? 1.8;
  const box = new Box3(
    new Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
    new Vector3(bounds.max.x, bounds.max.y, bounds.max.z)
  );
  const sphere = box.getBoundingSphere(new Sphere());
  const radius = sphere.radius > 0 && Number.isFinite(sphere.radius) ? sphere.radius : 1;
  const target = domainToThree(sphere.center);
  const fitDistance = radius / Math.sin((fovDeg * Math.PI) / 360);
  const distance = Math.max(diameterFactor * 2 * radius, fitDistance * 1.02);
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  const direction: [number, number, number] = [
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth)
  ];
  const position: [number, number, number] = [
    target[0] + direction[0] * distance,
    target[1] + direction[1] * distance,
    target[2] + direction[2] * distance
  ];
  return { position, target, radius, distance };
}
