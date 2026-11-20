import { inverseOfAuditEntry, type BuildingId } from '@hes/domain';
import { BuildingNotFoundError, NothingToUndoError, StaleVersionError } from '../errors.ts';
import type { Logger } from '../logger.ts';
import { consoleLogger } from '../logger.ts';
import type { AuditLog, BuildingRepository } from '../ports/index.ts';
import { EditBuildingUseCase, type EditBuildingOptions, type EditBuildingResult } from './edit-building.use-case.ts';

/**
 * Dependencies of {@link UndoLastChangeUseCase} (dependency injection).
 */
export interface UndoLastChangeUseCaseDeps {
  readonly buildingRepository: BuildingRepository;
  readonly auditLog: AuditLog;
  readonly logger?: Logger;
  readonly now?: () => Date;
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const UNDO_LAST_CHANGE_USE_CASE = Symbol('UndoLastChangeUseCase');

/**
 * Use case (P4, FR-P4-05): undo the last change of a building by reading the
 * latest audit entry and applying its inverse command through the exact same
 * validated + optimistic-locked + audited path as a normal edit (the undo is
 * itself audit-logged).
 *
 * @throws BuildingNotFoundError (404) when the id is unknown
 * @throws NothingToUndoError (400) when no audit entry exists
 * @throws StaleVersionError (409) when expectedVersion is not current
 */
export class UndoLastChangeUseCase {
  private readonly edit: EditBuildingUseCase;
  private readonly buildingRepository: BuildingRepository;
  private readonly auditLog: AuditLog;
  private readonly logger: Logger;

  constructor(deps: UndoLastChangeUseCaseDeps) {
    this.buildingRepository = deps.buildingRepository;
    this.auditLog = deps.auditLog;
    this.logger = deps.logger ?? consoleLogger;
    this.edit = new EditBuildingUseCase({
      buildingRepository: deps.buildingRepository,
      auditLog: deps.auditLog,
      logger: deps.logger,
      now: deps.now
    });
  }

  /**
   * @param buildingId - id of the building to undo
   * @param options - expectedVersion (If-Match) + userId
   */
  async execute(buildingId: BuildingId, options: EditBuildingOptions): Promise<EditBuildingResult> {
    const stored = await this.buildingRepository.findById(buildingId);
    if (stored === null) {
      throw new BuildingNotFoundError(buildingId);
    }
    if (stored.building.version !== options.expectedVersion) {
      throw new StaleVersionError(buildingId, options.expectedVersion, stored.building.version);
    }
    const latest = await this.auditLog.latestByBuilding(buildingId);
    if (latest === null) {
      throw new NothingToUndoError(buildingId);
    }
    const inverse = inverseOfAuditEntry(latest);
    if (!inverse.ok) {
      throw inverse.error;
    }
    this.logger.log(`undo of building ${buildingId}: inverse of audit entry ${latest.id} (${latest.commandType})`);
    return this.edit.execute(buildingId, inverse.value, options);
  }
}
