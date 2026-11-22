import type {
  BuildingCommandJson,
  ConfidenceJson,
  FieldChangeJson,
  SimulationResultJson
} from '../types.ts';

/**
 * Plain-language rendering of an edit's impact (UX audit F4 / US 4): the
 * editor shows « Simulation relancée : −X kWh/an, étiquette D → C » plus a
 * value diff « U du mur wall-1 : 1,64 → 0,20 » (French decimal comma),
 * computed from the before/after SimulationResult and the audit entry.
 * Presentation only: the numbers come unchanged from the Open3CL results.
 */

const MINUS = '−';
const ARROW = '→';

/** French (fr-FR) grouping/decimal formatting of a number. */
function fr(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString('fr-FR', options);
}

/**
 * Formats a signed delta with its unit, e.g. `−1 234 kWh/an`, `+500 kg CO₂e/an`,
 * `0 kWh/an`. kWh/kg figures are whole units in DPE results, so they are
 * rounded to integers; the sign is always explicit (a saving is negative).
 *
 * @param delta the signed difference (after − before)
 * @param unit the unit suffix, e.g. `kWh/an`
 * @returns the formatted signed delta
 */
export function formatSignedDelta(delta: number, unit: string): string {
  if (delta === 0) return `0 ${unit}`;
  const sign = delta < 0 ? MINUS : '+';
  return `${sign}${fr(Math.abs(delta), { maximumFractionDigits: 0 })} ${unit}`;
}

/**
 * Plain-words label change: « étiquette D → C », honestly « étiquette D
 * inchangé » when the label does not move, and a bare « étiquette D » when
 * there is no previous result to compare with (first run).
 *
 * @param from the previous energy label, or null when there is no baseline
 * @param to the new energy label
 * @returns the French label-change phrase
 */
export function labelChangeText(from: string | null, to: string): string {
  if (from === null) return `étiquette ${to}`;
  if (from === to) return `étiquette ${to} inchangé`;
  return `étiquette ${from} ${ARROW} ${to}`;
}

/**
 * The impact line of an edit: « Simulation relancée : −X kWh/an, étiquette
 * D → C » (the CO₂ delta is added only when it changes). With no previous
 * result (first run) the line shows the result without any delta.
 *
 * @param before the SimulationResult before the edit, or null if none
 * @param after the SimulationResult after the edit
 * @returns the single-line French impact summary
 */
export function impactSummaryLine(before: SimulationResultJson | null, after: SimulationResultJson): string {
  const labelPart = labelChangeText(before === null ? null : before.energyLabel, after.energyLabel);
  if (before === null) {
    return `Simulation : ${labelPart}, ${fr(after.consumptionKwh, { maximumFractionDigits: 0 })} kWh/an`;
  }
  const parts = [
    `Simulation relancée : ${formatSignedDelta(after.consumptionKwh - before.consumptionKwh, 'kWh/an')}`,
    labelPart
  ];
  const co2Delta = after.emissionsKg - before.emissionsKg;
  if (co2Delta !== 0) {
    parts.push(formatSignedDelta(co2Delta, 'kg CO₂e/an'));
  }
  return parts.join(', ');
}

/**
 * Finds the result that was current before `result` in a history ordered
 * newest-first (the P2 history order): the entry just older than `result`.
 * Returns null when there is no baseline (first run, or unknown result).
 *
 * @param history simulation history, newest first
 * @param result the current result
 * @returns the previous result, or null
 */
export function previousResult(
  history: readonly SimulationResultJson[],
  result: SimulationResultJson | null
): SimulationResultJson | null {
  if (result === null) return null;
  const index = history.findIndex((r) => r.id === result.id);
  if (index < 0) return null;
  return history[index + 1] ?? null;
}

interface KindPhrase {
  readonly article: string;
  readonly noun: string;
  readonly idField: string;
}

const KIND_PHRASE: Record<string, KindPhrase> = {
  'building.wall.update.v1': { article: 'du', noun: 'mur', idField: 'wallId' },
  'building.window.update.v1': { article: 'de la', noun: 'fenêtre', idField: 'windowId' },
  'building.roof.update.v1': { article: 'de la', noun: 'toiture', idField: 'roofId' },
  'building.floor.update.v1': { article: 'du', noun: 'plancher bas', idField: 'floorId' },
  'building.heating-system.update.v1': { article: 'du', noun: 'système de chauffage', idField: 'systemId' },
  'building.ventilation-system.update.v1': { article: 'de la', noun: 'ventilation', idField: 'systemId' }
};

const FIELD_LABELS: Record<string, string> = {
  areaM2: 'surface',
  description: 'description',
  orientation: 'orientation',
  wallType: 'type de mur',
  adjacencyType: 'adjacence',
  roofType: 'type de toiture',
  floorType: 'type de plancher',
  count: 'nombre',
  solarFactorSw: 'facteur solaire Sw',
  glazingType: 'vitrage',
  frameMaterial: 'menuiserie',
  installationType: 'type d’installation',
  heatedAreaM2: 'surface chauffée',
  ventilationType: 'type de ventilation',
  ventilatedAreaM2: 'surface ventilée',
  q4paConv: 'q4pa conv'
};

/**
 * Formats one confidence-wrapped value in plain French: numbers with a
 * decimal comma (U values keep two decimals, « 1,64 → 0,20 »), strings as
 * they are, a missing value as « aucune valeur ».
 *
 * @param c the old or new confidence-wrapped value of the change
 * @param field the technical field name (drives number precision)
 * @returns the plain French rendering of the value
 */
export function formatPlainValue(c: ConfidenceJson<unknown> | null, field: string): string {
  if (c === null) return 'aucune valeur';
  if (typeof c.value === 'number') {
    if (field === 'uValueWm2K') {
      return fr(c.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return fr(c.value, { maximumFractionDigits: 2 });
  }
  return String(c.value);
}

/**
 * Plain-language diff line of one changed field of a command, e.g.
 * « U du mur wall-1 : 1,64 → 0,20 » (French decimal comma).
 *
 * @param command the saved command (gives the element kind and id)
 * @param change the audited field change (old → new)
 * @returns the single-line French diff
 */
export function fieldDiffLine(command: BuildingCommandJson, change: FieldChangeJson): string {
  const kind: KindPhrase = KIND_PHRASE[command.type] ?? {
    article: 'de',
    noun: command.type,
    idField: ''
  };
  const id = String((command as unknown as Record<string, unknown>)[kind.idField] ?? '');
  const label =
    change.field === 'uValueWm2K'
      ? command.type === 'building.window.update.v1'
        ? 'Uw'
        : 'U'
      : (FIELD_LABELS[change.field] ?? change.field);
  return `${label} ${kind.article} ${kind.noun} ${id} : ${formatPlainValue(change.oldValue, change.field)} ${ARROW} ${formatPlainValue(change.newValue, change.field)}`;
}
