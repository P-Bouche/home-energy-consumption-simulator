import type { Building, Geometry } from '@hes/domain';

/**
 * Port (hexagonal architecture) for reconstructing the 3D geometry of a
 * Building (Phase P3). Implemented by the geometry adapter
 * (packages/geometry, `GeometryAdapter`); the application layer depends on
 * this interface only.
 */
export interface GeometryPort {
  /**
   * Reconstructs the deterministic 3D geometry of a building aggregate
   * (pure domain computation, no I/O): same Building → same Geometry
   * (same mesh hash).
   */
  reconstruct(building: Building): Geometry;
}

/**
 * Injection token for the GeometryPort (NestJS wiring in apps/api).
 */
export const GEOMETRY_PORT = Symbol('GeometryPort');
