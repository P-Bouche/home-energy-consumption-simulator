import { type Either, left, right } from './either.ts';
import { CommandValidationError, InvalidCommandError, type FieldError } from './command-errors.ts';
import type { BuildingId, SystemId, WallId, WindowId, RoofId, FloorId } from './entities.ts';

/**
 * Version of the building-command vocabulary (P4). The command type tags are a
 * shared, versioned contract with P5 scenarios (a scenario is a set of
 * commands): bump this constant and add new `.vN` tags on any breaking change,
 * never rename existing tags.
 */
// Stays 1: adding the v2 heating tag is additive (v1 untouched, per ADR-0004);
// the bump rule applies to breaking changes only.
export const COMMAND_VOCABULARY_VERSION = 1;

/**
 * Versioned command type tags. Frozen contract shared with P5 — do not rename.
 */
export type CommandTypeTag =
  | 'building.wall.update.v1'
  | 'building.window.update.v1'
  | 'building.roof.update.v1'
  | 'building.floor.update.v1'
  | 'building.heating-system.update.v1'
  | 'building.heating-system.update.v2'
  | 'building.ventilation-system.update.v1';

/**
 * Fields shared by every command: the target aggregate and the element id.
 */
interface CommandBase {
  readonly buildingId: BuildingId;
}

/**
 * Edits a wall (DPE `mur`). Every provided field replaces the current value and
 * is stored with `Confidence { source: "user", confidence: 1.0 }`; a `null`
 * value clears a nullable field. Absent fields are left unchanged.
 */
export interface UpdateWallCommand extends CommandBase {
  readonly type: 'building.wall.update.v1';
  readonly wallId: WallId;
  readonly uValueWm2K?: number | null;
  readonly areaM2?: number | null;
  readonly description?: string;
  readonly orientation?: string | null;
  readonly wallType?: string | null;
  readonly adjacencyType?: string | null;
}

/**
 * Edits a glazed opening (DPE `baie_vitree`). Invariant: the total window area
 * of the building must not exceed its total wall area.
 */
export interface UpdateWindowCommand extends CommandBase {
  readonly type: 'building.window.update.v1';
  readonly windowId: WindowId;
  readonly uValueWm2K?: number | null;
  readonly areaM2?: number | null;
  readonly description?: string;
  readonly orientation?: string | null;
  readonly count?: number | null;
  readonly solarFactorSw?: number | null;
  readonly glazingType?: string | null;
  readonly frameMaterial?: string | null;
}

/**
 * Edits an upper floor / roof slab (DPE `plancher_haut`).
 */
export interface UpdateRoofCommand extends CommandBase {
  readonly type: 'building.roof.update.v1';
  readonly roofId: RoofId;
  readonly uValueWm2K?: number | null;
  readonly areaM2?: number | null;
  readonly description?: string;
  readonly roofType?: string | null;
  readonly adjacencyType?: string | null;
}

/**
 * Edits a lower floor slab (DPE `plancher_bas`).
 */
export interface UpdateFloorCommand extends CommandBase {
  readonly type: 'building.floor.update.v1';
  readonly floorId: FloorId;
  readonly uValueWm2K?: number | null;
  readonly areaM2?: number | null;
  readonly description?: string;
  readonly floorType?: string | null;
  readonly adjacencyType?: string | null;
}

/**
 * Edits a heating installation (DPE `installation_chauffage`).
 */
export interface UpdateHeatingSystemCommand extends CommandBase {
  readonly type: 'building.heating-system.update.v1';
  readonly systemId: SystemId;
  readonly description?: string;
  readonly installationType?: string | null;
  readonly heatedAreaM2?: number | null;
}

/**
 * Edits a heating installation (DPE `installation_chauffage`), v2 superset of
 * v1 adding `generatorType` (DPE `enum_type_generateur_ch_id`, ADR-0004).
 * The v1 tag is frozen and never extended in place.
 */
export interface UpdateHeatingSystemV2Command extends CommandBase {
  readonly type: 'building.heating-system.update.v2';
  readonly systemId: SystemId;
  readonly description?: string;
  readonly installationType?: string | null;
  readonly generatorType?: string | null;
  readonly heatedAreaM2?: number | null;
}

/**
 * Edits a ventilation installation (DPE `ventilation`).
 */
export interface UpdateVentilationSystemCommand extends CommandBase {
  readonly type: 'building.ventilation-system.update.v1';
  readonly systemId: SystemId;
  readonly description?: string;
  readonly ventilationType?: string | null;
  readonly ventilatedAreaM2?: number | null;
  readonly q4paConv?: number | null;
}

/**
 * Discriminated union of every editable-element command (P4 vocabulary v1).
 */
export type BuildingCommand =
  | UpdateWallCommand
  | UpdateWindowCommand
  | UpdateRoofCommand
  | UpdateFloorCommand
  | UpdateHeatingSystemCommand
  | UpdateHeatingSystemV2Command
  | UpdateVentilationSystemCommand;

/**
 * Maps a command type tag to the name of its element-id field and to the
 * element kind used in error messages.
 */
export const COMMAND_ELEMENT: Record<CommandTypeTag, { idField: string; kind: string }> = {
  'building.wall.update.v1': { idField: 'wallId', kind: 'wall' },
  'building.window.update.v1': { idField: 'windowId', kind: 'window' },
  'building.roof.update.v1': { idField: 'roofId', kind: 'roof' },
  'building.floor.update.v1': { idField: 'floorId', kind: 'floor' },
  'building.heating-system.update.v1': { idField: 'systemId', kind: 'heating-system' },
  'building.heating-system.update.v2': { idField: 'systemId', kind: 'heating-system' },
  'building.ventilation-system.update.v1': { idField: 'systemId', kind: 'ventilation-system' }
};

/**
 * Editable (non-id) fields per command tag, with their expected JSON type.
 * Used by the parser and by the field-level validator.
 */
export const COMMAND_EDITABLE_FIELDS: Record<CommandTypeTag, Readonly<Record<string, 'number' | 'string'>>> = {
  'building.wall.update.v1': {
    uValueWm2K: 'number',
    areaM2: 'number',
    description: 'string',
    orientation: 'string',
    wallType: 'string',
    adjacencyType: 'string'
  },
  'building.window.update.v1': {
    uValueWm2K: 'number',
    areaM2: 'number',
    description: 'string',
    orientation: 'string',
    count: 'number',
    solarFactorSw: 'number',
    glazingType: 'string',
    frameMaterial: 'string'
  },
  'building.roof.update.v1': {
    uValueWm2K: 'number',
    areaM2: 'number',
    description: 'string',
    roofType: 'string',
    adjacencyType: 'string'
  },
  'building.floor.update.v1': {
    uValueWm2K: 'number',
    areaM2: 'number',
    description: 'string',
    floorType: 'string',
    adjacencyType: 'string'
  },
  'building.heating-system.update.v1': {
    description: 'string',
    installationType: 'string',
    heatedAreaM2: 'number'
  },
  'building.heating-system.update.v2': {
    description: 'string',
    installationType: 'string',
    generatorType: 'string',
    heatedAreaM2: 'number'
  },
  'building.ventilation-system.update.v1': {
    description: 'string',
    ventilationType: 'string',
    ventilatedAreaM2: 'number',
    q4paConv: 'number'
  }
};

/**
 * Physical range checks applied by {@link validateCommandFields}. A U-value
 * must be positive and below a generous physical ceiling; areas must be
 * positive; counts are positive integers; the solar factor is in [0, 1];
 * q4pa_conv is in [0, 3] m³/(h.m²). These keep the aggregate in a state the
 * Open3CL engine can simulate — an un-simulable state is never persisted.
 */
const U_VALUE_MAX = 4;
/** Windows (Uw) have their own ceiling: single glazing reaches ~6 W/m².K (issue #48). */
const WINDOW_U_VALUE_MAX = 6;
const AREA_MAX_M2 = 10_000;
const Q4PA_MAX = 3;

/**
 * Validates the field values of a parsed command against domain ranges.
 *
 * @param command - a parsed command
 * @returns the list of field-level errors (empty when the command is valid)
 */
export function validateCommandFields(command: BuildingCommand): FieldError[] {
  const errors: FieldError[] = [];
  const fields = COMMAND_EDITABLE_FIELDS[command.type];
  const rec = command as unknown as Record<string, unknown>;
  for (const [field, kind] of Object.entries(fields)) {
    const value = rec[field];
    if (value === undefined) continue;
    if (value === null) {
      // null clears a nullable field; description is the only non-nullable one
      if (field === 'description') {
        errors.push({ field, message: 'description cannot be null' });
      }
      continue;
    }
    if (kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      errors.push({ field, message: 'must be a finite number' });
      continue;
    }
    if (kind === 'string' && (typeof value !== 'string' || value.trim().length === 0)) {
      errors.push({ field, message: 'must be a non-empty string' });
      continue;
    }
    if (typeof value !== 'number') continue;
    if (field === 'uValueWm2K') {
      const max = command.type === 'building.window.update.v1' ? WINDOW_U_VALUE_MAX : U_VALUE_MAX;
      if (value <= 0 || value > max) {
        errors.push({ field, message: `must be in (0, ${max}] W/m².K` });
      }
    }
    if ((field === 'areaM2' || field === 'heatedAreaM2' || field === 'ventilatedAreaM2') && (value <= 0 || value > AREA_MAX_M2)) {
      errors.push({ field, message: `must be in (0, ${AREA_MAX_M2}] m²` });
    }
    if (field === 'count' && (!Number.isInteger(value) || value < 1)) {
      errors.push({ field, message: 'must be a positive integer' });
    }
    if (field === 'solarFactorSw' && (value < 0 || value > 1)) {
      errors.push({ field, message: 'must be in [0, 1]' });
    }
    if (field === 'q4paConv' && (value < 0 || value > Q4PA_MAX)) {
      errors.push({ field, message: `must be in [0, ${Q4PA_MAX}] m³/(h.m²)` });
    }
  }
  return errors;
}

/**
 * Parses and structurally validates an untrusted JSON value into a
 * {@link BuildingCommand}. Only known type tags (vocabulary v1) and known
 * fields are accepted; anything else is an {@link InvalidCommandError}.
 *
 * @param json - untrusted JSON (HTTP body)
 */
export function parseBuildingCommand(json: unknown): Either<InvalidCommandError, BuildingCommand> {
  const issues: string[] = [];
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return left(new InvalidCommandError(['body must be a JSON object']));
  }
  const rec = json as Record<string, unknown>;
  const type = rec['type'];
  if (typeof type !== 'string' || !Object.hasOwn(COMMAND_ELEMENT, type)) {
    return left(
      new InvalidCommandError([`unknown or missing command type tag; expected one of ${Object.keys(COMMAND_ELEMENT).join(', ')}`])
    );
  }
  const tag = type as CommandTypeTag;
  const { idField } = COMMAND_ELEMENT[tag];
  if (typeof rec['buildingId'] !== 'string' || (rec['buildingId'] as string).length === 0) {
    issues.push('buildingId must be a non-empty string');
  }
  if (typeof rec[idField] !== 'string' || (rec[idField] as string).length === 0) {
    issues.push(`${idField} must be a non-empty string`);
  }
  const allowed = new Set(['type', 'buildingId', idField, ...Object.keys(COMMAND_EDITABLE_FIELDS[tag])]);
  for (const key of Object.keys(rec)) {
    if (!allowed.has(key)) {
      issues.push(`unknown field "${key}" for command ${tag}`);
    }
  }
  const fields = COMMAND_EDITABLE_FIELDS[tag];
  for (const [field, kind] of Object.entries(fields)) {
    const value = rec[field];
    if (value === undefined || value === null) continue;
    if (kind === 'number' && typeof value !== 'number') {
      issues.push(`field "${field}" must be a number or null`);
    }
    if (kind === 'string' && typeof value !== 'string') {
      issues.push(`field "${field}" must be a string or null`);
    }
  }
  if (issues.length > 0) {
    return left(new InvalidCommandError(issues));
  }
  return right(json as unknown as BuildingCommand);
}

/**
 * Builds the inverse command of an audit entry (used by undo): same type tag
 * and element id, every changed field restored to its previous value. The
 * result is re-validated through {@link parseBuildingCommand}, so a corrupted
 * audit entry can never produce an invalid command.
 *
 * @param command - the audited command
 * @param changes - the audited field changes (old/new values)
 */
export function inverseOfCommand(
  command: BuildingCommand,
  changes: readonly { field: string; oldValue: unknown }[]
): Either<InvalidCommandError, BuildingCommand> {
  const { idField } = COMMAND_ELEMENT[command.type];
  const rec = command as unknown as Record<string, unknown>;
  const inverse: Record<string, unknown> = {
    type: command.type,
    buildingId: command.buildingId,
    [idField]: rec[idField]
  };
  for (const change of changes) {
    const old = change.oldValue;
    inverse[change.field] =
      old !== null && typeof old === 'object' && 'value' in (old as Record<string, unknown>)
        ? (old as { value: unknown }).value
        : null;
  }
  return parseBuildingCommand(inverse);
}

/**
 * Throws when the field-level validation of a command fails. Convenience
 * wrapper for callers that want the domain error as an exception.
 *
 * @param command - a parsed command
 * @throws CommandValidationError when {@link validateCommandFields} reports errors
 */
export function assertCommandFieldsValid(command: BuildingCommand): void {
  const errors = validateCommandFields(command);
  if (errors.length > 0) {
    throw new CommandValidationError(errors);
  }
}
