/**
 * Plain-language reading of a U / Uw value (W/m².K) for the guided inputs.
 * Presentation only: the numeric value is still what gets sent; the domain
 * remains the enforcing layer for the (0, 4] range.
 *
 * Thresholds (stated in the PR body):
 * - U > 1.5            -> "<noun> non isolé(e)"   (e.g. "mur non isolé")
 * - 0.8 < U <= 1.5     -> "<noun> peu isolé(e)"
 * - 0.4 < U <= 0.8     -> "isolation moyenne"
 * - 0.2 < U <= 0.4     -> "bonne isolation"
 * - U <= 0.2           -> "très bonne isolation"
 */

export type UBand = 'non-isole' | 'peu-isole' | 'moyen' | 'bon' | 'tres-bon';

const BANDS: readonly { readonly max: number; readonly band: UBand; readonly text: string }[] = [
  { max: 0.2, band: 'tres-bon', text: 'très bonne isolation' },
  { max: 0.4, band: 'bon', text: 'bonne isolation' },
  { max: 0.8, band: 'moyen', text: 'isolation moyenne' },
  { max: 1.5, band: 'peu-isole', text: '' }, // filled with the noun below
  { max: Number.POSITIVE_INFINITY, band: 'non-isole', text: '' }
];

/**
 * Maps one U value to its plain-language band.
 *
 * @param u - U/Uw value in W/m².K (must be finite)
 * @returns the band, or null when the value is not a finite number
 */
export function uBand(u: number): UBand | null {
  if (!Number.isFinite(u) || u <= 0) return null; // non-positive U is invalid, not "well insulated"
  for (const entry of BANDS) {
    if (u <= entry.max) return entry.band;
  }
  return null;
}

/**
 * Plain-language reading of one U value, e.g. "mur non isolé" or
 * "très bonne isolation". Returns an empty string for non-finite values
 * (no reading shown while the field is empty or not a number).
 *
 * @param u - U/Uw value in W/m².K
 * @param noun - French noun of the element ("mur", "toiture", "plancher", "baie vitrée")
 * @param gender - grammatical gender of the noun, for "isolé(e)"
 */
export function describeU(u: number, noun = 'paroi', gender: 'm' | 'f' = 'm'): string {
  const band = uBand(u);
  if (band === null) return '';
  if (band === 'non-isole') return `${noun} non isolé${gender === 'f' ? 'e' : ''}`;
  if (band === 'peu-isole') return `${noun} peu isolé${gender === 'f' ? 'e' : ''}`;
  return BANDS.find((b) => b.band === band)?.text ?? '';
}
