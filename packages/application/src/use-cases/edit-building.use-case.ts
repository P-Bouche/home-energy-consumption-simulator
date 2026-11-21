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
import type { BuildingRepository } from '../ports/index.ts';

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
  readonly logger?: Logger;
  readonly now?: () => Date;
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const EDIT_BUILDING_USE_CASE = Symbol('EditBuildingUseCase');

/**
 * Use case (P4): apply one validated domain command to a persisted building
 * and persist the result atomically with optimistic locking + audit trail.
 *
 * Flow: load (404) → version pre-check (409) → `Building.apply(command)`
 * (pure domain validation; typed CommandError → 400/404, nothing persisted) →
 * ONE `repository.update({ building, report, expectedVersion, auditEntry })`
 * call that writes the new state and the audit row in a single transaction
 * (409 on race — in which case nothing at all is written).
 *
 * After a successful edit the building's input hash changes, so the next P2
 * `POST /buildings/:id/simulations` is a cache miss and runs the engine again
 * (TR-P2-05) — re-simulation goes through the P2 use case only (ADR-0001).
 */
export class EditBuildingUseCase {
  private readonly buildingRepository: BuildingRepository;
  private readonly logger: Logger;
  private readonly now: () => Date;

  constructor(deps: EditBuildingUseCaseDeps) {
    this.buildingRepository = deps.buildingRepository;
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
    return this.executeInternal(buildingId, options, (building, ctx) => building.apply(command, ctx));
  }

  /**
   * Undo path (FR-P4-05): applies the inverse of an audit entry while
   * restoring the FULL original Confidence (source/confidence) of every
   * changed field — the building genuinely returns to its pre-edit provenance.
   *
   * @param buildingId - id of the building to undo
   * @param entry - the audit entry to undo (its inverse command is applied
   * and the undo itself is audit-logged)
   * @param options - expectedVersion (If-Match) + userId
   */
  async executeRestoration(
    buildingId: BuildingId,
    entry: AuditEntry,
    options: EditBuildingOptions
  ): Promise<EditBuildingResult> {
    return this.executeInternal(buildingId, options, (building, ctx) => building.applyRestoration(entry, ctx));
  }

  /**
   * Shared flow of {@link execute} and {@link executeRestoration}.
   */
  private async executeInternal(
    buildingId: BuildingId,
    options: EditBuildingOptions,
    applyFn: (building: Building, ctx: { now: Date; userId: string }) => ReturnType<Building['apply']>
  ): Promise<EditBuildingResult> {
    const stored = await this.buildingRepository.findById(buildingId);
    if (stored === null) {
      throw new BuildingNotFoundError(buildingId);
    }
    const { building, report } = stored;
    if (building.version !== options.expectedVersion) {
      throw new StaleVersionError(buildingId, options.expectedVersion, building.version);
    }
    const applied = applyFn(building, { now: this.now(), userId: options.userId });
    if (!applied.ok) {
      throw applied.error;
    }
    const next = applied.value;
    const events = next.pullDomainEvents();
    const updated = events.find((e): e is BuildingUpdated => e instanceof BuildingUpdated);
    if (updated === undefined) {
      throw new Error(`apply on building ${buildingId} did not emit a BuildingUpdated event`);
    }
    const entry = auditEntryFromEvent(randomUUID(), updated);
    await this.buildingRepository.update({ building: next, report, expectedVersion: options.expectedVersion, auditEntries: [entry] });
    this.logger.log(
      `building ${buildingId} updated by ${options.userId}: ${updated.commandType} → version ${next.version} (audit ${entry.id})`
    );
    return { building: next, entry, events };
  }
}
