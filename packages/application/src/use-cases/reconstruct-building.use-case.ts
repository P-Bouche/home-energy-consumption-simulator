import type { Building, Geometry } from '@hes/domain';
import { BuildingNotFoundError } from '../errors.ts';
import type { BuildingRepository, GeometryPort } from '../ports/index.ts';

/**
 * Result of {@link ReconstructBuildingUseCase.execute} (FR-P3-01).
 */
export interface ReconstructBuildingResult {
  readonly building: Building;
  readonly geometry: Geometry;
}

/**
 * Dependencies of {@link ReconstructBuildingUseCase}.
 */
export interface ReconstructBuildingUseCaseDeps {
  readonly repository: BuildingRepository;
  readonly geometry: GeometryPort;
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const RECONSTRUCT_BUILDING_USE_CASE = Symbol('ReconstructBuildingUseCase');

/**
 * Use case (P3): load a persisted Building and reconstruct its 3D geometry
 * through the GeometryPort. Feeds `GET /buildings/:id/geometry`.
 */
export class ReconstructBuildingUseCase {
  private readonly repository: BuildingRepository;
  private readonly geometry: GeometryPort;

  constructor(deps: ReconstructBuildingUseCaseDeps) {
    this.repository = deps.repository;
    this.geometry = deps.geometry;
  }

  /**
   * @param id - building id
   * @throws BuildingNotFoundError (mapped to HTTP 404) when the id is unknown
   */
  async execute(id: string): Promise<ReconstructBuildingResult> {
    const stored = await this.repository.findById(id);
    if (stored === null) {
      throw new BuildingNotFoundError(id);
    }
    return { building: stored.building, geometry: this.geometry.reconstruct(stored.building) };
  }
}
