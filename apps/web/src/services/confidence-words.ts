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
 * Returns the plain-words provenance of a value.
 *
 * - source `dpe-xml:…` → "mesuré par le DPE" (read from the diagnostic)
 * - source `user` → "saisi par vous" (entered in the editor)
 * - confidence < 1 → "estimé — à vérifier" (inferred, never presented as certain)
 * - any other source at full confidence → "mesuré"
 *
 * @param c the confidence metadata to render
 * @returns a short French label for the UI
 */
export function confidenceInWords(c: ConfidenceWordsInput): string {
  if (c.source.startsWith('dpe-xml')) return 'mesuré par le DPE';
  if (c.source === 'user') return 'saisi par vous';
  if (c.confidence < 1) return 'estimé — à vérifier';
  return 'mesuré';
}
