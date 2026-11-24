/**
 * Plain-language readings of numeric building values for the guided inputs.
 * Presentation only: the numeric value is still what gets sent; the domain
 * remains the enforcing layer for the (0, 4] U range.
 *
 * U thresholds, per element kind (issue #48):
 * - walls / roofs / floors (U):
 *   U > 1.5 -> "<noun> non isolé(e)" · 0.8 < U <= 1.5 -> "peu isolé(e)" ·
 *   0.4 < U <= 0.8 -> "isolation moyenne" · 0.2 < U <= 0.4 -> "bonne isolation" ·
 *   U <= 0.2 -> "très bonne isolation"
 * - windows (Uw, different scale: simple glazing is ~4-6, recent double ~1.1):
 *   Uw > 2.8 -> "non isolée" (simple vitrage) · 1.8 < Uw <= 2.8 -> "peu isolée"
 *   (double vitrage ancien) · 1.3 < Uw <= 1.8 -> "isolation moyenne" ·
 *   0.8 < Uw <= 1.3 -> "bonne isolation" (double vitrage récent) ·
 *   Uw <= 0.8 -> "très bonne isolation" (triple vitrage)
 *
 * Sw (solar factor, 0..1): >= 0.5 forts apports solaires · >= 0.25 apports
 * modérés · > 0 faibles apports.
 * q4pa (m³/h.m²): <= 0.6 excellente étanchéité à l'air · <= 1.0 bonne ·
 * <= 1.5 moyenne · > 1.5 faible.
 */

export type UBand = 'non-isole' | 'peu-isole' | 'moyen' | 'bon' | 'tres-bon';

/** Element kind whose U value is read: windows (Uw) use their own thresholds. */
export type UKind = 'wall' | 'window';

interface BandEntry {
  readonly max: number;
  readonly band: UBand;
  readonly text: string;
}

const WALL_BANDS: readonly BandEntry[] = [
  { max: 0.2, band: 'tres-bon', text: 'très bonne isolation' },
  { max: 0.4, band: 'bon', text: 'bonne isolation' },
  { max: 0.8, band: 'moyen', text: 'isolation moyenne' },
  { max: 1.5, band: 'peu-isole', text: '' }, // filled with the noun below
  { max: Number.POSITIVE_INFINITY, band: 'non-isole', text: '' }
];

const WINDOW_BANDS: readonly BandEntry[] = [
  { max: 0.8, band: 'tres-bon', text: 'très bonne isolation' },
  { max: 1.3, band: 'bon', text: 'bonne isolation' },
  { max: 1.8, band: 'moyen', text: 'isolation moyenne' },
  { max: 2.8, band: 'peu-isole', text: '' }, // filled with the noun below
  { max: Number.POSITIVE_INFINITY, band: 'non-isole', text: '' }
];

/**
 * Maps one U value to its plain-language band.
 *
 * @param u - U/Uw value in W/m².K (must be finite)
 * @param kind - element kind: 'window' uses the Uw thresholds, else the wall ones
 * @returns the band, or null when the value is not a finite positive number
 */
export function uBand(u: number, kind: UKind = 'wall'): UBand | null {
  if (!Number.isFinite(u) || u <= 0) return null; // non-positive U is invalid, not "well insulated"
  for (const entry of (kind === 'window' ? WINDOW_BANDS : WALL_BANDS)) {
    if (u <= entry.max) return entry.band;
  }
  return null;
}

/**
 * Plain-language reading of one U value, e.g. "mur non isolé" or
 * "très bonne isolation". Returns an empty string for non-finite or
 * non-positive values (no reading shown while the field is empty or not a number).
 *
 * @param u - U/Uw value in W/m².K
 * @param noun - French noun of the element ("mur", "toiture", "plancher", "baie vitrée")
 * @param gender - grammatical gender of the noun, for "isolé(e)"
 * @param kind - element kind: 'window' uses the Uw thresholds, else the wall ones
 */
export function describeU(u: number, noun = 'paroi', gender: 'm' | 'f' = 'm', kind: UKind = 'wall'): string {
  const band = uBand(u, kind);
  if (band === null) return '';
  if (band === 'non-isole') return `${noun} non isolé${gender === 'f' ? 'e' : ''}`;
  if (band === 'peu-isole') return `${noun} peu isolé${gender === 'f' ? 'e' : ''}`;
  return (kind === 'window' ? WINDOW_BANDS : WALL_BANDS).find((b) => b.band === band)?.text ?? '';
}

/**
 * Plain-language reading of the solar factor Sw (0..1): how much solar gain
 * the glazing lets through. Empty string for non-finite or non-positive values.
 */
export function describeSw(sw: number): string {
  if (!Number.isFinite(sw) || sw <= 0) return '';
  if (sw >= 0.5) return 'forts apports solaires';
  if (sw >= 0.25) return 'apports solaires modérés';
  return 'faibles apports solaires';
}

/**
 * Plain-language reading of q4pa (m³/h.m², air permeability): how leaky the
 * envelope is. Empty string for non-finite or non-positive values.
 */
export function describeQ4pa(q: number): string {
  if (!Number.isFinite(q) || q <= 0) return '';
  if (q <= 0.6) return 'excellente étanchéité à l’air';
  if (q <= 1.0) return 'bonne étanchéité à l’air';
  if (q <= 1.5) return 'étanchéité à l’air moyenne';
  return 'étanchéité à l’air faible';
}
