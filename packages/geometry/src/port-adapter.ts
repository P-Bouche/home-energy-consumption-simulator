import type { GeometryPort } from '@hes/application';
import { ReconstructionService, type Building, type Geometry } from '@hes/domain';

/**
 * Adapter implementing the application {@link GeometryPort} with the domain
 * {@link ReconstructionService} (dependency direction: application ←
 * geometry ← domain). Pure, no I/O: the reconstruction is deterministic, so
 * `GET /buildings/:id/geometry` is stable and cheap enough to compute on
 * every request inside the < 2 s budget.
 */
export class GeometryAdapter implements GeometryPort {
  private readonly service = new ReconstructionService();

  /**
   * Reconstructs the 3D geometry of a building aggregate.
   */
  reconstruct(building: Building): Geometry {
    return this.service.reconstruct(building);
  }
}
