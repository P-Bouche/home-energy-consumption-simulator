import type { BuildingId } from '@hes/domain';

/**
 * Raised when no building exists for the requested id (mapped to HTTP 404).
 */
export class BuildingNotFoundError extends Error {
  readonly code = 'BUILDING_NOT_FOUND';
  readonly buildingId: BuildingId;

  constructor(buildingId: BuildingId) {
    super(`no building found with id ${buildingId}`);
    this.name = 'BuildingNotFoundError';
    this.buildingId = buildingId;
  }
}
