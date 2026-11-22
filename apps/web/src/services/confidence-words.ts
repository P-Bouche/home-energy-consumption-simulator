/**
 * Plain-words rendering of confidence metadata (UX audit F6 / US 7 wording):
 * instead of raw `confiance 0,7` chips and source paths, the UI says
 * « mesuré par le DPE » vs « estimé — à vérifier ». Generic on purpose —
 * wave 2 (mission D) reuses this helper in the editor, the import report and
 * the 3D panel; it only needs `{ source, confidence }`.
 */
export interface ConfidenceWordsInput {
  readonly source: string;
  readonly confidence: number;
}

/**
 * Returns the plain-words provenance of a value. Branch order matters: a
 * value with confidence < 1 is inferred whatever its source, so it must
 * never be labeled "mesuré" — even if its source string starts with
 * `dpe-xml` (possible on building element ConfidenceJson values, where no
 * domain guarantee restricts the source of sub-1 scores).
 *
 * - source `user` → "saisi par vous" (entered in the editor)
 * - confidence < 1 → "estimé — à vérifier" (inferred, never presented as certain)
 * - source `dpe-xml:…` at full confidence → "mesuré par le DPE" (read from the diagnostic)
 * - any other source at full confidence → "mesuré"
 *
 * @param c the confidence metadata to render
 * @returns a short French label for the UI
 */
export function confidenceInWords(c: ConfidenceWordsInput): string {
  if (c.source === 'user') return 'saisi par vous';
  if (c.confidence < 1) return 'estimé — à vérifier';
  if (c.source.startsWith('dpe-xml')) return 'mesuré par le DPE';
  return 'mesuré';
}
