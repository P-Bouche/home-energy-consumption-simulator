import type { Building, ImportReport } from '@hes/domain';
import { BuildingNotFoundError } from '../errors.ts';
import type { BuildingRepository } from '../ports/index.ts';

/**
 * Result of {@link GetBuildingUseCase.execute} (FR-P1-06).
 */
export interface GetBuildingResult {
  readonly building: Building;
  readonly report: ImportReport;
}

/**
 * Dependencies of {@link GetBuildingUseCase}.
 */
export interface GetBuildingUseCaseDeps {
  readonly repository: BuildingRepository;
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const GET_BUILDING_USE_CASE = Symbol('GetBuildingUseCase');

/**
 * Use case: read a persisted Building aggregate and its import report
 * (round-trip counterpart of ImportDpeXmlUseCase).
 */
export class GetBuildingUseCase {
  private readonly repository: BuildingRepository;

  constructor(deps: GetBuildingUseCaseDeps) {
    this.repository = deps.repository;
  }

  /**
   * @param id - building id
   * @throws BuildingNotFoundError (mapped to HTTP 404) when the id is unknown
   */
  async execute(id: string): Promise<GetBuildingResult> {
    const stored = await this.repository.findById(id);
    if (stored === null) {
      throw new BuildingNotFoundError(id);
    }
    return stored;
  }
}
