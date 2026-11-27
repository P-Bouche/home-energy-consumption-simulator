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

/** Plain-language « all of this kind » label per target kind (gender agreement, issue #72). */
const KIND_ALL_LABEL: Record<string, string> = {
  walls: 'Tous les murs',
  roofs: 'Toutes les toitures',
  floors: 'Tous les planchers',
  windows: 'Toutes les fenêtres',
  heatingSystems: 'Tous les chauffages',
  ventilationSystems: 'Toutes les ventilations'
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
  /** e.g. « wall-1 · <DPE description> », truncated to {@link SECONDARY_MAX_CHARS} (issue #75) */
  readonly secondary: string;
  /** the untruncated secondary text — kept for the option's tooltip (`title`) */
  readonly secondaryFull: string;
}

/** Max length of the secondary line in the « Élément » select (issue #75). */
export const SECONDARY_MAX_CHARS = 80;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
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
  const secondaryFull = description === '' ? target.id : `${target.id} · ${description}`;
  return { id: target.id, primary, secondary: truncate(secondaryFull, SECONDARY_MAX_CHARS), secondaryFull };
}

/** Sentinel target id meaning « every element of the work's target kind » (issue #72). */
export const ALL_TARGETS_ID = '__all__';

/**
 * Selectable targets of one work, labeled in plain language. When the work
 * has more than one candidate target, a leading « Tous les … (N) » option
 * (id {@link ALL_TARGETS_ID}) applies the work to all of them at once.
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
  const targets = targetsForWork(id, building);
  const options = targets.map((t) => elementOptionFor(t, entry.targetKind, tables));
  if (targets.length > 1) {
    const allLabel = KIND_ALL_LABEL[entry.targetKind] ?? `Tous les ${(KIND_LABEL[entry.targetKind] ?? entry.targetKind).toLowerCase()}s`;
    const all: WorkElementOption = {
      id: ALL_TARGETS_ID,
      primary: `${allLabel} (${targets.length})`,
      secondary: 'Appliquer ce travail à tous les éléments de ce type',
      secondaryFull: 'Appliquer ce travail à tous les éléments de ce type'
    };
    return [all, ...options];
  }
  return options;
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
  return buildCommand(entry, targetId, values);
}

/**
 * Composes the frozen-vocabulary commands of one work row. A single target
 * yields one command; the {@link ALL_TARGETS_ID} sentinel yields one identical
 * command per element of the work's target kind (issue #72 — bulk renovation).
 *
 * @param workId - work id
 * @param targetId - raw element id, or {@link ALL_TARGETS_ID}
 * @param values - raw field values
 * @param building - loaded building (needed to expand ALL_TARGETS_ID)
 * @returns the command list ([] when the work is unknown or ALL has no targets)
 */
export function composeWorkCommands(
  workId: string,
  targetId: string,
  values: Record<string, string>,
  building: BuildingJson | null
): readonly BuildingCommandJson[] {
  if (targetId === ALL_TARGETS_ID) {
    return targetsForWork(workId, building).map((t) => composeWorkCommand(workId, t.id, values)).flatMap((c) => (c === undefined ? [] : [c]));
  }
  const command = composeWorkCommand(workId, targetId, values);
  return command === undefined ? [] : [command];
}

/** Structural shape of a work-first form row (issue #74 conversions). */
export interface WorkRowLike {
  readonly workId: string;
  readonly targetId: string;
  readonly values: Record<string, string>;
}

/** Structural shape of an advanced command-row form row (issue #74 conversions). */
export interface CommandRowLike {
  readonly type: string;
  readonly targetId: string;
  readonly values: Record<string, string>;
}

/**
 * Converts work-first rows into advanced command rows, one frozen command per
 * work (same type the work maps to). Used when toggling the form to advanced
 * mode so the in-progress draft is not lost (issue #74). Rows of unknown
 * works are dropped (they cannot be represented as a command).
 */
export function workRowsToCommandRows(works: readonly WorkRowLike[]): CommandRowLike[] {
  return works.flatMap((w) => {
    const entry = catalogEntryForWork(w.workId);
    return entry === undefined ? [] : [{ type: entry.type, targetId: w.targetId, values: { ...w.values } }];
  });
}

/**
 * Converts advanced command rows back into work-first rows (the work whose
 * first command type matches). Used when toggling back to work mode (issue
 * #74). Rows of unknown command types are dropped (no named work behind them).
 */
export function commandRowsToWorkRows(rows: readonly CommandRowLike[]): WorkRowLike[] {
  return rows.flatMap((r) => {
    const work = WORK_CATALOG.find((w) => w.commandTypes[0] === r.type);
    return work === undefined ? [] : [{ workId: work.id, targetId: r.targetId, values: { ...r.values } }];
  });
}
