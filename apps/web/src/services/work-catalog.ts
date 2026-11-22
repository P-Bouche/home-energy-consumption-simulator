import {
  buildCommand,
  catalogEntryFor,
  type CommandCatalogEntry
} from '../components/command-catalog.ts';
import { resolveEnumLabel, type EnumLabelTable } from './enum-labels.ts';
import type {
  BuildingCommandJson,
  BuildingJson,
  FloorJson,
  HeatingSystemJson,
  RoofJson,
  VentilationSystemJson,
  WallJson,
  WindowJson
} from '../types.ts';

/**
 * Work-first catalog for scenario creation (UX US 10 / audit F7). DATA, not UI:
 * each named renovation work a homeowner would pick maps internally to the
 * frozen command type(s) of the existing command catalog
 * (`building.*.update.v1`) — the scenario payloads are unchanged, only the
 * presentation starts from the work.
 *
 * Reuses mission B's services by composition: enum labels come from
 * `services/enum-labels.ts` (raw DPE ids are resolved to French labels, never
 * guessed), and command assembly goes through the exact same `buildCommand`
 * the command-row editor uses, so a scenario built work-first produces a
 * byte-identical command list.
 */

/** Stable ids of the named works (not shown to the user). */
export type WorkId =
  | 'wall-insulation'
  | 'roof-insulation'
  | 'floor-insulation'
  | 'window-replacement'
  | 'heating-change'
  | 'ventilation-change';

export interface WorkCatalogEntry {
  readonly id: WorkId;
  /** user-facing name of the work, e.g. « Isolation des murs » */
  readonly label: string;
  /** plain-language hint of what the work changes */
  readonly hint: string;
  /** frozen command vocabulary type(s) this work maps to */
  readonly commandTypes: readonly string[];
}

export const WORK_CATALOG: readonly WorkCatalogEntry[] = [
  {
    id: 'wall-insulation',
    label: 'Isolation des murs',
    hint: 'Isoler un mur (nouveau U en W/m².K)',
    commandTypes: ['building.wall.update.v1']
  },
  {
    id: 'roof-insulation',
    label: 'Isolation de la toiture',
    hint: 'Isoler la toiture / le plancher haut (nouveau U en W/m².K)',
    commandTypes: ['building.roof.update.v1']
  },
  {
    id: 'floor-insulation',
    label: 'Isolation du plancher',
    hint: 'Isoler le plancher bas (nouveau U en W/m².K)',
    commandTypes: ['building.floor.update.v1']
  },
  {
    id: 'window-replacement',
    label: 'Remplacement des fenêtres',
    hint: 'Remplacer une baie vitrée (nouveau Uw en W/m².K)',
    commandTypes: ['building.window.update.v1']
  },
  {
    id: 'heating-change',
    label: 'Changement du chauffage',
    hint: "Changer le type d'installation de chauffage",
    commandTypes: ['building.heating-system.update.v1']
  },
  {
    id: 'ventilation-change',
    label: 'Changement de la ventilation',
    hint: 'Changer le type de ventilation',
    commandTypes: ['building.ventilation-system.update.v1']
  }
];

/** Any building element a work can target. */
export type WorkTarget =
  | WallJson
  | RoofJson
  | FloorJson
  | WindowJson
  | HeatingSystemJson
  | VentilationSystemJson;

/** Plain-language kind label per catalog target kind. */
const KIND_LABEL: Record<string, string> = {
  walls: 'Mur',
  roofs: 'Toiture',
  floors: 'Plancher',
  windows: 'Fenêtre',
  heatingSystems: 'Chauffage',
  ventilationSystems: 'Ventilation'
};

/** noun + gender for the guided U reading (`describeU`), per catalog target kind */
const U_NOUN: Record<string, { noun: string; gender: 'm' | 'f' }> = {
  walls: { noun: 'mur', gender: 'm' },
  roofs: { noun: 'toiture', gender: 'f' },
  floors: { noun: 'plancher', gender: 'm' },
  windows: { noun: 'baie vitrée', gender: 'f' },
  heatingSystems: { noun: 'paroi', gender: 'f' },
  ventilationSystems: { noun: 'paroi', gender: 'f' }
};

/**
 * @param id - work id
 * @returns the catalog entry of a work, or undefined for an unknown id
 */
export function workEntryFor(id: string): WorkCatalogEntry | undefined {
  return WORK_CATALOG.find((w) => w.id === id);
}

/**
 * @param id - work id
 * @returns the frozen command type(s) the work maps to ([] for an unknown work)
 */
export function commandTypesForWork(id: string): readonly string[] {
  return workEntryFor(id)?.commandTypes ?? [];
}

/**
 * The command-catalog entry behind a work (the entry of its first command
 * type — the one whose fields and target kind drive the form).
 *
 * @param id - work id
 * @returns the catalog entry, or undefined when the work or its command type is unknown
 */
export function catalogEntryForWork(id: string): CommandCatalogEntry | undefined {
  const type = commandTypesForWork(id)[0];
  return type === undefined ? undefined : catalogEntryFor(type);
}

/**
 * Target elements a work can be applied to: the building collection matching
 * the work's target kind (target-kind filtering).
 *
 * @param id - work id
 * @param building - loaded building, or null while loading
 * @returns the candidate targets ([] when the work is unknown or no building is loaded)
 */
export function targetsForWork(id: string, building: BuildingJson | null): readonly WorkTarget[] {
  const entry = catalogEntryForWork(id);
  if (entry === undefined || building === null) return [];
  return building[entry.targetKind] as readonly WorkTarget[];
}

/**
 * @param targetKind - catalog target kind (`walls`, `windows`, ...)
 * @returns the noun + grammatical gender used by the guided U reading
 */
export function uNounForTargetKind(targetKind: string): { readonly noun: string; readonly gender: 'm' | 'f' } {
  return U_NOUN[targetKind] ?? { noun: 'paroi', gender: 'f' };
}

/** Label tables needed to render element options (orientation). Structurally compatible with the hook's `EnumLabelTables`. */
export interface WorkLabelTables {
  readonly orientation?: EnumLabelTable | null;
}

/** One selectable target element: plain-language primary, raw id in secondary. */
export interface WorkElementOption {
  readonly id: string;
  /** e.g. « Mur nord — 54,25 m² » (labeled kind + orientation label + area) */
  readonly primary: string;
  /** e.g. « wall-1 · <DPE description> » — the raw id is always kept visible */
  readonly secondary: string;
}

/** raw orientation enum id of an envelope element, when the DPE carried one */
function orientationIdOf(target: WorkTarget): string | null {
  return 'orientation' in target && target.orientation !== null ? String(target.orientation.value) : null;
}

/** area in m² of an envelope element, when the DPE carried one */
function areaOf(target: WorkTarget): number | null {
  return 'areaM2' in target && target.areaM2 !== null ? target.areaM2.value : null;
}

/**
 * Plain-language option for one target element: labeled kind + orientation
 * label (resolved through the DPE enum table, raw id kept when unknown) +
 * area, e.g. « Mur nord — 54,25 m² »; the raw id and DPE description go to the
 * secondary line.
 *
 * @param target - building element
 * @param targetKind - catalog target kind of the work
 * @param tables - fetched enum label tables (orientation)
 */
export function elementOptionFor(
  target: WorkTarget,
  targetKind: string,
  tables: WorkLabelTables
): WorkElementOption {
  const kindLabel = KIND_LABEL[targetKind] ?? targetKind;
  let primary = kindLabel;
  const orientationId = orientationIdOf(target);
  if (orientationId !== null) {
    const orientation = resolveEnumLabel(tables.orientation, orientationId);
    primary += ` ${orientation.label}`;
  }
  const area = areaOf(target);
  if (area !== null) {
    primary += ` — ${area.toLocaleString('fr-FR')} m²`;
  }
  const description = target.description.value.trim();
  const secondary = description === '' ? target.id : `${target.id} · ${description}`;
  return { id: target.id, primary, secondary };
}

/**
 * Selectable targets of one work, labeled in plain language.
 *
 * @param id - work id
 * @param building - loaded building, or null while loading
 * @param tables - fetched enum label tables (orientation)
 */
export function elementOptionsForWork(
  id: string,
  building: BuildingJson | null,
  tables: WorkLabelTables
): readonly WorkElementOption[] {
  const entry = catalogEntryForWork(id);
  if (entry === undefined) return [];
  return targetsForWork(id, building).map((t) => elementOptionFor(t, entry.targetKind, tables));
}

/**
 * Composes the frozen-vocabulary command of one work row. Goes through the
 * exact same `buildCommand` + catalog entry as the advanced command-row
 * editor, so the payload is byte-identical (same `type`, same field keys,
 * raw DPE enum ids, numeric U).
 *
 * @param workId - work id
 * @param targetId - raw element id (sent as-is)
 * @param values - raw field values (strings; numeric fields are converted by `buildCommand`)
 * @returns the command JSON, or undefined when the work is unknown
 */
export function composeWorkCommand(
  workId: string,
  targetId: string,
  values: Record<string, string>
): BuildingCommandJson | undefined {
  const entry = catalogEntryForWork(workId);
  if (entry === undefined) return undefined;
  return buildCommand(entry.type, entry.targetIdField, targetId, values);
}
