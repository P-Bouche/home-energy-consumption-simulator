import { BufferAttribute, BufferGeometry } from 'three';
import type { MeshBuffers } from './buffers.ts';

/**
 * three.js adapter (P3): converts plain {@link MeshBuffers} into a
 * `THREE.BufferGeometry` for React Three Fiber. Exposed only through the
 * `@hes/geometry/three` subpath so Node consumers (API, benchmarks) never load
 * three.js.
 */

/**
 * Builds a non-indexed THREE.BufferGeometry with `position` and `normal`
 * attributes from plain mesh buffers.
 */
export function toThreeBufferGeometry(buffers: MeshBuffers): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(buffers.normals, 3));
  return geometry;
}
