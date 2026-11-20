import { type BuildingCommand, inverseOfCommand } from './commands.ts';
import type { Either } from './either.ts';
import { type FieldChange, type DomainEvent, BuildingUpdated } from './events.ts';
import type { BuildingId } from './entities.ts';
import type { InvalidCommandError } from './command-errors.ts';

/**
 * Append-only audit entry of one applied building command (P4, FR-P4-03):
 * who / when / which command / old→new values / resulting aggregate version.
 */
export interface AuditEntry {
  readonly id: string;
  readonly buildingId: BuildingId;
  readonly userId: string;
  readonly timestamp: Date;
  readonly commandType: string;
  readonly command: BuildingCommand;
  readonly changes: readonly FieldChange[];
  readonly version: number;
}

/**
 * Input accepted by {@link createAuditEntry}. The id is minted by the caller
 * (application layer) because the domain stays free of Node built-ins.
 */
export interface AuditEntryInput {
  readonly id: string;
  readonly buildingId: BuildingId;
  readonly userId: string;
  readonly timestamp: Date;
  readonly command: BuildingCommand;
  readonly changes: readonly FieldChange[];
  readonly version: number;
}

/**
 * JSON shape of an AuditEntry (persistence + API contract).
 */
export interface AuditEntryJson {
  readonly id: string;
  readonly buildingId: BuildingId;
  readonly userId: string;
  readonly timestamp: string;
  readonly commandType: string;
  readonly command: BuildingCommand;
  readonly changes: readonly FieldChange[];
  readonly version: number;
}

/**
 * Validates and builds an immutable AuditEntry.
 *
 * @throws TypeError when id / userId are empty or timestamp is not a valid Date
 * @throws RangeError when version is not a non-negative integer
 */
export function createAuditEntry(input: AuditEntryInput): AuditEntry {
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new TypeError('AuditEntry.id must be a non-empty string');
  }
  if (typeof input.userId !== 'string' || input.userId.trim().length === 0) {
    throw new TypeError('AuditEntry.userId must be a non-empty string');
  }
  if (!(input.timestamp instanceof Date) || Number.isNaN(input.timestamp.getTime())) {
    throw new TypeError('AuditEntry.timestamp must be a valid Date');
  }
  if (!Number.isInteger(input.version) || input.version < 0) {
    throw new RangeError(`AuditEntry.version must be a non-negative integer, got ${String(input.version)}`);
  }
  return Object.freeze({
    id: input.id,
    buildingId: input.buildingId,
    userId: input.userId,
    timestamp: new Date(input.timestamp.getTime()),
    commandType: input.command.type,
    command: input.command,
    changes: Object.freeze([...input.changes]),
    version: input.version
  });
}

/**
 * Serializes an AuditEntry to its JSON shape.
 */
export function auditEntryToJson(entry: AuditEntry): AuditEntryJson {
  return {
    id: entry.id,
    buildingId: entry.buildingId,
    userId: entry.userId,
    timestamp: entry.timestamp.toISOString(),
    commandType: entry.commandType,
    command: entry.command,
    changes: entry.changes,
    version: entry.version
  };
}

/**
 * Revives an AuditEntry from its JSON shape.
 */
export function auditEntryFromJson(json: AuditEntryJson): AuditEntry {
  return createAuditEntry({
    id: json.id,
    buildingId: json.buildingId,
    userId: json.userId,
    timestamp: new Date(json.timestamp),
    command: json.command,
    changes: json.changes,
    version: json.version
  });
}

/**
 * Builds an AuditEntry from a {@link BuildingUpdated} domain event. The event
 * id is minted by the caller (domain stays free of Node built-ins).
 *
 * @param id - audit entry id (e.g. a UUID minted in the application layer)
 * @param event - the BuildingUpdated event emitted by Building.apply
 */
export function auditEntryFromEvent(id: string, event: BuildingUpdated): AuditEntry {
  return createAuditEntry({
    id,
    buildingId: event.buildingId,
    userId: event.userId,
    timestamp: event.occurredAt,
    command: event.command,
    changes: event.changes,
    version: event.version
  });
}

/**
 * Builds the inverse command of an audit entry (undo of the last change, P4
 * FR-P4-05): same type tag and element, every changed field restored to its
 * audited previous value.
 */
export function inverseOfAuditEntry(entry: AuditEntry): Either<InvalidCommandError, BuildingCommand> {
  return inverseOfCommand(entry.command, entry.changes);
}

/**
 * Re-exports so API/application code can work with audit entries without
 * knowing the internal module layout.
 */
export type { DomainEvent };
