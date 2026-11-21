/**
 * Render-layer translation of the raw API/domain validation messages into
 * plain French. The store keeps the raw message untouched (the command
 * contract is frozen); only the display is translated here. Unknown message
 * templates fall back to the raw message — never invent a translation.
 */

/**
 * A translated field error: the French message to display, plus the raw
 * technical message kept for the detail expander.
 */
export interface TranslatedFieldError {
  readonly french: string;
  readonly raw: string;
}

/**
 * French subject used in messages, per command field (domain field names,
 * see packages/domain/src/commands.ts). `subject` overrides it (e.g. "Uw"
 * for a window's uValueWm2K).
 */
const FIELD_SUBJECTS: Record<string, string> = {
  uValueWm2K: 'U',
  areaM2: 'La surface',
  heatedAreaM2: 'La surface chauffée',
  ventilatedAreaM2: 'La surface ventilée',
  count: 'Le nombre',
  solarFactorSw: 'Le facteur solaire Sw',
  q4paConv: 'q4pa conv',
  description: 'La description',
  orientation: "L'orientation",
  wallType: 'Le type de mur',
  roofType: 'Le type de toiture',
  floorType: 'Le type de plancher',
  adjacencyType: "L'adjacence",
  glazingType: 'Le vitrage',
  frameMaterial: 'La menuiserie',
  installationType: "Le type d'installation",
  ventilationType: 'Le type de ventilation'
};

// `must be in (0, 4] W/m².K` / `must be in (0, 10000] m²` (half-open range + unit)
const HALF_OPEN_RANGE = /^must be in \(([^,]+), ([^\]]+)\] ?(.*)$/;
// `must be in [0, 1]` / `must be in [0, 3] m³/(h.m²)` (closed range, optional unit)
const CLOSED_RANGE = /^must be in \[([^,]+), ([^\]]+)\](?: (.*))?$/;

/**
 * Builds the French range message. U/Uw keep the canonical phrasing
 * "U doit être compris entre 0 et 4 W/m².K"; other subjects use an impersonal
 * form to avoid French agreement issues.
 */
function rangeMessage(subject: string, min: string | undefined, max: string | undefined, unit: string | undefined): string {
  const suffix = unit === undefined || unit === '' ? '' : ` ${unit}`;
  if (subject === 'U' || subject === 'Uw') {
    return `${subject} doit être compris entre ${String(min)} et ${String(max)}${suffix}`;
  }
  return `${subject} : valeur attendue entre ${String(min)} et ${String(max)}${suffix}`;
}

const FIXED_TEMPLATES: readonly { readonly raw: string; readonly build: (subject: string) => string }[] = [
  { raw: 'must be a finite number', build: (s) => `${s} doit être un nombre valide` },
  { raw: 'must be a non-empty string', build: (s) => `${s} ne doit pas être vide` },
  { raw: 'must be a positive integer', build: (s) => `${s} doit être un nombre entier positif` },
  { raw: 'description cannot be null', build: () => 'La description ne doit pas être vide' }
];

/**
 * Translates one raw field-level error message into plain French.
 *
 * @param field - command field the error belongs to (domain field name)
 * @param rawMessage - raw message from the API (400 fieldErrors), kept verbatim in `raw`
 * @param subject - optional French subject override (e.g. "Uw" for a window U)
 * @returns the French message plus the raw one; unknown templates fall back to the raw message
 */
export function translateFieldError(field: string, rawMessage: string, subject?: string): TranslatedFieldError {
  const name = subject ?? FIELD_SUBJECTS[field] ?? field;
  const halfOpen = HALF_OPEN_RANGE.exec(rawMessage);
  if (halfOpen !== null) {
    const [, min, max, unit] = halfOpen;
    return { french: rangeMessage(name, min, max, unit), raw: rawMessage };
  }
  const closed = CLOSED_RANGE.exec(rawMessage);
  if (closed !== null) {
    const [, min, max, unit] = closed;
    return { french: rangeMessage(name, min, max, unit), raw: rawMessage };
  }
  for (const template of FIXED_TEMPLATES) {
    if (rawMessage === template.raw) return { french: template.build(name), raw: rawMessage };
  }
  return { french: rawMessage, raw: rawMessage };
}
