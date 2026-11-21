import type { BuildingCommandJson } from '../types.ts';

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
}

export interface CommandCatalogField {
  readonly key: string;
  readonly label: string;
  readonly input: 'number' | 'text';
  readonly placeholder?: string;
}

export const COMMAND_CATALOG: readonly CommandCatalogEntry[] = [
  {
    type: 'building.wall.update.v1',
    label: 'Isolation d’un mur',
    description: 'Nouveau U du mur (W/m².K), ex. 0.2 pour une isolation par l’extérieur',
    targetKind: 'walls',
    targetIdField: 'wallId',
    fields: [{ key: 'uValueWm2K', label: 'U (W/m².K)', input: 'number', placeholder: '0.2' }]
  },
  {
    type: 'building.roof.update.v1',
    label: 'Isolation du toit (plancher haut)',
    description: 'Nouveau U du plancher haut (W/m².K)',
    targetKind: 'roofs',
    targetIdField: 'roofId',
    fields: [{ key: 'uValueWm2K', label: 'U (W/m².K)', input: 'number', placeholder: '0.15' }]
  },
  {
    type: 'building.floor.update.v1',
    label: 'Isolation du plancher bas',
    description: 'Nouveau U du plancher bas (W/m².K)',
    targetKind: 'floors',
    targetIdField: 'floorId',
    fields: [{ key: 'uValueWm2K', label: 'U (W/m².K)', input: 'number', placeholder: '0.3' }]
  },
  {
    type: 'building.window.update.v1',
    label: 'Remplacement de fenêtre',
    description: 'Nouveau Uw de la baie (W/m².K), ex. 1.1 pour du double vitrage récent',
    targetKind: 'windows',
    targetIdField: 'windowId',
    fields: [{ key: 'uValueWm2K', label: 'Uw (W/m².K)', input: 'number', placeholder: '1.1' }]
  },
  {
    type: 'building.heating-system.update.v1',
    label: 'Remplacement de la chaudière',
    description: 'Nouveau type d’installation de chauffage (id enum DPE)',
    targetKind: 'heatingSystems',
    targetIdField: 'systemId',
    fields: [{ key: 'installationType', label: 'Type d’installation (id)', input: 'text', placeholder: '4' }]
  },
  {
    type: 'building.ventilation-system.update.v1',
    label: 'Changement de ventilation',
    description: 'Nouveau type de ventilation (id enum DPE)',
    targetKind: 'ventilationSystems',
    targetIdField: 'systemId',
    fields: [{ key: 'ventilationType', label: 'Type de ventilation (id)', input: 'text', placeholder: '2' }]
  }
];

/**
 * @returns the catalog entry for a command type tag, or undefined
 */
export function catalogEntryFor(type: string): CommandCatalogEntry | undefined {
  return COMMAND_CATALOG.find((entry) => entry.type === type);
}

/**
 * Builds a frozen-vocabulary command JSON from a catalog row (type tag +
 * target id + field values). Pure data assembly — validation happens
 * server-side (domain parser, HTTP 400/404).
 */
export function buildCommand(
  type: string,
  targetIdField: string,
  targetId: string,
  values: Record<string, string>
): BuildingCommandJson {
  const command: Record<string, unknown> = { type, [targetIdField]: targetId };
  for (const [key, raw] of Object.entries(values)) {
    if (raw.trim().length === 0) continue;
    const numeric = Number(raw);
    command[key] = Number.isNaN(numeric) ? raw : numeric;
  }
  return command as BuildingCommandJson;
}
