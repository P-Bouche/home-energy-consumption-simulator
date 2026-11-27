import type { BuildingCommandJson } from '../types.ts';
import { ENUM_KINDS, type EnumLabelKind } from '../services/enum-labels.ts';

/**
 * Command catalog (P5 headless, built on the frozen P4 command vocabulary) —
 * DATA, not UI.
 *
 * Each entry describes one typed command the user can add to a scenario:
 * wall insulation, roof insulation, floor insulation, window replacement,
 * boiler (heating system) replacement, ventilation change. The `type` tags
 * are the versioned P4 vocabulary (`building.<element>.update.v1`); P4's
 * editor renders its forms over the same vocabulary. The `buildingId` is
 * stamped server-side from the URL.
 */
export interface CommandCatalogEntry {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  /** which building collection provides the target element ids */
  readonly targetKind: 'walls' | 'roofs' | 'floors' | 'windows' | 'heatingSystems' | 'ventilationSystems';
  readonly targetIdField: string;
  readonly fields: readonly CommandCatalogField[];
  /**
   * When one of these fields is set, the command is sent with the mapped type
   * instead (ADR-0004): `generatorType` only exists on
   * `building.heating-system.update.v2`, never on the v1 command.
   */
  readonly typeWhenFieldSet?: Readonly<Record<string, string>>;
}

export interface CommandCatalogField {
  readonly key: string;
  readonly label: string;
  readonly input: 'number' | 'text';
  readonly placeholder?: string;
  /**
   * Min/max bounds shown on numeric inputs. Presentation data only — these
   * mirror the domain invariants `U_VALUE_MAX` etc. (packages/domain/src/commands.ts);
   * the domain remains the enforcing layer (400 fieldErrors). 0 is exclusive
   * for U values: the valid range is (0, 4] W/m².K.
   */
  readonly min?: number;
  readonly max?: number;
  /** when set, the field is a DPE enum rendered as a labeled select (raw id still sent) */
  readonly enumKind?: EnumLabelKind;
  /** plain-language example promoted from the catalog description into helper text */
  readonly helper?: string;
}

export const COMMAND_CATALOG: readonly CommandCatalogEntry[] = [
  {
    type: 'building.wall.update.v1',
    label: 'Isolation d’un mur',
    description: 'Nouveau U du mur (W/m².K), ex. 0.2 pour une isolation par l’extérieur',
    targetKind: 'walls',
    targetIdField: 'wallId',
    fields: [
      { key: 'uValueWm2K', label: 'U (W/m².K)', input: 'number', placeholder: '0.2', min: 0, max: 4, helper: 'ex. 0,2 pour une isolation par l’extérieur' }
    ]
  },
  {
    type: 'building.roof.update.v1',
    label: 'Isolation du toit (plancher haut)',
    description: 'Nouveau U du plancher haut (W/m².K)',
    targetKind: 'roofs',
    targetIdField: 'roofId',
    fields: [{ key: 'uValueWm2K', label: 'U (W/m².K)', input: 'number', placeholder: '0.15', min: 0, max: 4 }]
  },
  {
    type: 'building.floor.update.v1',
    label: 'Isolation du plancher bas',
    description: 'Nouveau U du plancher bas (W/m².K)',
    targetKind: 'floors',
    targetIdField: 'floorId',
    fields: [{ key: 'uValueWm2K', label: 'U (W/m².K)', input: 'number', placeholder: '0.3', min: 0, max: 4 }]
  },
  {
    type: 'building.window.update.v1',
    label: 'Remplacement de fenêtre',
    description: 'Nouveau Uw de la baie (W/m².K), ex. 1.1 pour du double vitrage récent',
    targetKind: 'windows',
    targetIdField: 'windowId',
    fields: [
      { key: 'uValueWm2K', label: 'Uw (W/m².K)', input: 'number', placeholder: '1.1', min: 0, max: 4, helper: 'ex. 1,1 pour du double vitrage récent' }
    ]
  },
  {
    type: 'building.heating-system.update.v1',
    label: 'Remplacement de la chaudière',
    description: 'Nouveau type d’installation de chauffage (id enum DPE)',
    targetKind: 'heatingSystems',
    targetIdField: 'systemId',
    fields: [
      { key: 'installationType', label: 'Type d’installation', input: 'text', placeholder: '4', enumKind: 'installationType' },
      { key: 'generatorType', label: 'Type de générateur', input: 'text', placeholder: '97', enumKind: 'generatorType' },
      // issue #90: editable heated surface (mixed-heating renovation, ADR-0006)
      { key: 'heatedAreaM2', label: 'Surface chauffée (m²)', input: 'number', min: 0, max: 10000 }
    ],
    // generatorType is a v2-only field (ADR-0004): sending it on the v1
    // command is rejected by the domain ("unknown field")
    typeWhenFieldSet: { generatorType: 'building.heating-system.update.v2' }
  },
  {
    type: 'building.ventilation-system.update.v1',
    label: 'Changement de ventilation',
    description: 'Nouveau type de ventilation (id enum DPE)',
    targetKind: 'ventilationSystems',
    targetIdField: 'systemId',
    fields: [
      { key: 'ventilationType', label: 'Type de ventilation', input: 'text', placeholder: '2', enumKind: 'ventilationType' }
    ]
  }
];

/**
 * @returns the catalog entry for a command type tag, or undefined
 */
export function catalogEntryFor(type: string): CommandCatalogEntry | undefined {
  return COMMAND_CATALOG.find((entry) => entry.type === type);
}

/**
 * Effective command type for an entry + raw field values: when a
 * `typeWhenFieldSet` field is set, the mapped type is used (ADR-0004 —
 * `generatorType` requires `building.heating-system.update.v2`, the v1
 * command rejects it as an unknown field).
 */
export function effectiveCommandType(entry: CommandCatalogEntry, values: Record<string, string>): string {
  for (const [fieldKey, overrideType] of Object.entries(entry.typeWhenFieldSet ?? {})) {
    if ((values[fieldKey] ?? '').trim() !== '') return overrideType;
  }
  return entry.type;
}

/**
 * Builds a frozen-vocabulary command JSON from a catalog row (type tag +
 * target id + field values). Pure data assembly — validation happens
 * server-side (domain parser, HTTP 400/404).
 */
export function buildCommand(
  entry: CommandCatalogEntry,
  targetId: string,
  values: Record<string, string>
): BuildingCommandJson {
  const command: Record<string, unknown> = { type: effectiveCommandType(entry, values), [entry.targetIdField]: targetId };
  const enumKeys: ReadonlySet<string> = new Set(ENUM_KINDS);
  for (const [key, raw] of Object.entries(values)) {
    if (raw.trim().length === 0) continue;
    const field = entry.fields.find((f) => f.key === key);
    if (field !== undefined) {
      // coerce per field kind, like the P4 editor: number fields become numbers, enum ids stay strings
      command[key] = field.input === 'number' ? Number(raw) : raw;
    } else if (enumKeys.has(key)) {
      command[key] = raw;
    } else {
      const numeric = Number(raw);
      command[key] = Number.isNaN(numeric) ? raw : numeric;
    }
  }
  return command as BuildingCommandJson;
}
