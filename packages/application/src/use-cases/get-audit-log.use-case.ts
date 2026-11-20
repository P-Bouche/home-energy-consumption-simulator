import type { AuditEntry, BuildingId } from '@hes/domain';
import { BuildingNotFoundError } from '../errors.ts';
import type { AuditLog, BuildingRepository } from '../ports/index.ts';

/**
 * Result of {@link GetAuditLogUseCase.execute}.
 */
export interface GetAuditLogResult {
  readonly buildingId: BuildingId;
  readonly entries: readonly AuditEntry[];
}

/**
 * Dependencies of {@link GetAuditLogUseCase}.
 */
export interface GetAuditLogUseCaseDeps {
  readonly buildingRepository: BuildingRepository;
  readonly auditLog: AuditLog;
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const GET_AUDIT_LOG_USE_CASE = Symbol('GetAuditLogUseCase');

/**
 * Use case (P4): read the append-only audit trail of a building, oldest first
 * (backing `GET /buildings/:id/audit`).
 */
export class GetAuditLogUseCase {
  private readonly buildingRepository: BuildingRepository;
  private readonly auditLog: AuditLog;

  constructor(deps: GetAuditLogUseCaseDeps) {
    this.buildingRepository = deps.buildingRepository;
    this.auditLog = deps.auditLog;
  }

  /**
   * @throws BuildingNotFoundError when the building id is unknown (HTTP 404)
   */
  async execute(buildingId: BuildingId): Promise<GetAuditLogResult> {
    const stored = await this.buildingRepository.findById(buildingId);
    if (stored === null) {
      throw new BuildingNotFoundError(buildingId);
    }
    const entries = await this.auditLog.listByBuilding(buildingId);
    return { buildingId, entries };
  }
}
