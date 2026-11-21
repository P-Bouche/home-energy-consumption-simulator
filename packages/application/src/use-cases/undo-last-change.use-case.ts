import type { BuildingId } from '@hes/domain';
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
 * latest audit entry and restoring its previous values through the exact same
 * validated + optimistic-locked + atomically-audited path as a normal edit.
 * The restored fields keep their ORIGINAL Confidence (source/confidence from
 * the audit entry's oldValue, e.g. `dpe-xml:…`), not a fresh `user` stamp —
 * so the building genuinely returns to its pre-edit state (and the Open3CL
 * overlay does not treat the restored value as user-entered). The undo is
 * itself audit-logged.
 *
 * @throws BuildingNotFoundError (404) when the id is unknown
 * @throws NothingToUndoError (400) when no audit entry exists
 * @throws StaleVersionError (409) when expectedVersion is not current
 */
export class UndoLastChangeUseCase {
  private readonly buildingRepository: BuildingRepository;
  private readonly auditLog: AuditLog;
  private readonly edit: EditBuildingUseCase;
  private readonly logger: Logger;

  constructor(deps: UndoLastChangeUseCaseDeps) {
    this.buildingRepository = deps.buildingRepository;
    this.auditLog = deps.auditLog;
    this.logger = deps.logger ?? consoleLogger;
    this.edit = new EditBuildingUseCase({
      buildingRepository: deps.buildingRepository,
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
    this.logger.log(`undo of building ${buildingId}: restoration of audit entry ${latest.id} (${latest.commandType})`);
    return this.edit.executeRestoration(buildingId, latest, options);
  }
}
