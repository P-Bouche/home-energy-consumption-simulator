import { randomUUID } from 'node:crypto';
import {
  auditEntryFromEvent,
  BuildingUpdated,
  type AuditEntry,
  type Building,
  type BuildingCommand,
  type BuildingId,
  type DomainEvent
} from '@hes/domain';
import { BuildingNotFoundError, StaleVersionError } from '../errors.ts';
import type { Logger } from '../logger.ts';
import { consoleLogger } from '../logger.ts';
import type { AuditLog, BuildingRepository } from '../ports/index.ts';

/**
 * Options of {@link EditBuildingUseCase.execute}: optimistic-locking
 * precondition and audit provenance.
 */
export interface EditBuildingOptions {
  /**
   * The building version the caller based its edit on (HTTP `If-Match`).
   */
  readonly expectedVersion: number;
  /**
   * Who is editing (HTTP `x-user-id`, defaults to "anonymous" at the API
   * boundary). Recorded on the audit entry and the BuildingUpdated event.
   */
  readonly userId: string;
}

/**
 * Result of {@link EditBuildingUseCase.execute}.
 */
export interface EditBuildingResult {
  readonly building: Building;
  readonly entry: AuditEntry;
  readonly events: readonly DomainEvent[];
}

/**
 * Dependencies of {@link EditBuildingUseCase} (dependency injection).
 */
export interface EditBuildingUseCaseDeps {
  readonly buildingRepository: BuildingRepository;
  readonly auditLog: AuditLog;
  readonly logger?: Logger;
  readonly now?: () => Date;
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const EDIT_BUILDING_USE_CASE = Symbol('EditBuildingUseCase');

/**
 * Use case (P4): apply one validated domain command to a persisted building
 * and persist the result with optimistic locking + audit trail.
 *
 * Flow: load (404) → version pre-check (409) → `Building.apply(command)`
 * (pure domain validation; typed CommandError → 400/404, nothing persisted) →
 * repository.update with expectedVersion (409 on race) → auditLog.append
 * (append-only). The update is written before the audit row so a rejected
 * edit never leaves an orphan audit entry.
 *
 * After a successful edit the building's input hash changes, so the next P2
 * `POST /buildings/:id/simulations` is a cache miss and runs the engine again
 * (TR-P2-05) — re-simulation goes through the P2 use case only (ADR-0001).
 */
export class EditBuildingUseCase {
  private readonly buildingRepository: BuildingRepository;
  private readonly auditLog: AuditLog;
  private readonly logger: Logger;
  private readonly now: () => Date;

  constructor(deps: EditBuildingUseCaseDeps) {
    this.buildingRepository = deps.buildingRepository;
    this.auditLog = deps.auditLog;
    this.logger = deps.logger ?? consoleLogger;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * @param buildingId - id of the building to edit
   * @param command - a parsed, versioned domain command
   * @param options - expectedVersion (If-Match) + userId
   * @throws BuildingNotFoundError (404) when the id is unknown
   * @throws StaleVersionError (409) when expectedVersion is not current
   * @throws CommandError subclasses (400/404) when the domain rejects the command
   */
  async execute(buildingId: BuildingId, command: BuildingCommand, options: EditBuildingOptions): Promise<EditBuildingResult> {
    const stored = await this.buildingRepository.findById(buildingId);
    if (stored === null) {
      throw new BuildingNotFoundError(buildingId);
    }
    const { building, report } = stored;
    if (building.version !== options.expectedVersion) {
      throw new StaleVersionError(buildingId, options.expectedVersion, building.version);
    }
    const applied = building.apply(command, { now: this.now(), userId: options.userId });
    if (!applied.ok) {
      throw applied.error;
    }
    const next = applied.value;
    const events = next.pullDomainEvents();
    const updated = events.find((e): e is BuildingUpdated => e instanceof BuildingUpdated);
    const entry = auditEntryFromEvent(randomUUID(), updated ?? fallbackEvent(next, command, options));
    await this.buildingRepository.update({ building: next, report, expectedVersion: options.expectedVersion });
    await this.auditLog.append(entry);
    this.logger.log(
      `building ${buildingId} updated by ${options.userId}: ${command.type} → version ${next.version} (audit ${entry.id})`
    );
    return { building: next, entry, events };
  }
}

/**
 * Defensive fallback: apply() always emits exactly one BuildingUpdated event,
 * so this is only reachable if that invariant is broken.
 */
function fallbackEvent(building: Building, command: BuildingCommand, options: EditBuildingOptions): BuildingUpdated {
  return new BuildingUpdated({
    buildingId: building.id,
    userId: options.userId,
    command,
    changes: [],
    version: building.version,
    occurredAt: new Date()
  });
}
