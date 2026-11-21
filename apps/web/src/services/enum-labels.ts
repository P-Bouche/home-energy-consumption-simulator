import { ApiError } from './api-client.ts';

/**
 * Enum kinds used by the editor dialog and the scenario catalog. Mirror of
 * the adapter's `EnumLabelKind` — `apps/web` must NOT depend on
 * `@hes/open3cl-adapter` (ADR-0001), so the kind union is redeclared here and
 * the label tables are fetched from the read-only API endpoint
 * `GET /api/enums/:kind`.
 */
export type EnumLabelKind =
  | 'orientation'
  | 'wallType'
  | 'roofType'
  | 'floorType'
  | 'adjacencyType'
  | 'glazingType'
  | 'frameMaterial'
  | 'installationType'
  | 'ventilationType';

/**
 * Every enum kind the editor/scenario catalog needs, one lookup each.
 */
export const ENUM_KINDS: readonly EnumLabelKind[] = [
  'orientation',
  'wallType',
  'roofType',
  'floorType',
  'adjacencyType',
  'glazingType',
  'frameMaterial',
  'installationType',
  'ventilationType'
];

/**
 * Raw DPE enum id -> French label, as served by `GET /api/enums/:kind`.
 */
export type EnumLabelTable = Record<string, string>;

interface EnumLabelsResponse {
  readonly kind: string;
  readonly labels: EnumLabelTable;
}

/**
 * Per-kind cache of in-flight/settled fetch promises: one network lookup per
 * enum kind per app session, shared by the editor dialog and the scenario
 * form. Failures are not cached (the next caller retries).
 */
const labelCache = new Map<EnumLabelKind, Promise<EnumLabelTable>>();

/**
 * Fetches (and caches) the label table of one enum kind.
 *
 * @param kind - enum kind (domain command field name)
 * @throws ApiError on non-2xx (404 unknown kind, network error, ...)
 */
export function getEnumLabels(kind: EnumLabelKind): Promise<EnumLabelTable> {
  const cached = labelCache.get(kind);
  if (cached !== undefined) return cached;
  const promise = (async (): Promise<EnumLabelTable> => {
    const response = await fetch(`/api/enums/${encodeURIComponent(kind)}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new ApiError(response.status, body as never, body?.message ?? `enum labels fetch failed with status ${response.status}`);
    }
    return ((await response.json()) as EnumLabelsResponse).labels;
  })();
  promise.catch(() => labelCache.delete(kind)); // do not cache failures
  labelCache.set(kind, promise);
  return promise;
}

/**
 * Clears the label cache (tests only).
 */
export function clearEnumLabelCache(): void {
  labelCache.clear();
}

/**
 * One selectable option: French label first, raw id kept as secondary info.
 */
export interface EnumOption {
  readonly id: string;
  readonly label: string;
  /** false when the id is absent from the table — never guess a label */
  readonly known: boolean;
}

/**
 * Builds the sorted option list of one enum kind. Unknown current values are
 * appended at the end so a prefilled select can still display them honestly.
 *
 * @param table - fetched label table, or null while loading / on error
 * @param currentId - raw id currently selected (prefill), included even when unknown
 */
export function enumOptions(table: EnumLabelTable | null, currentId = ''): EnumOption[] {
  if (table === null) {
    return currentId === '' ? [] : [{ id: currentId, label: currentId, known: false }];
  }
  const options = Object.entries(table)
    .map(([id, label]) => ({ id, label, known: true }))
    .sort((a, b) => Number(a.id) - Number(b.id) || a.label.localeCompare(b.label, 'fr'));
  if (currentId !== '' && !(currentId in table)) {
    options.push({ id: currentId, label: currentId, known: false });
  }
  return options;
}

/**
 * Resolves one raw enum id to its display label. An unknown id resolves to
 * the raw id itself with `known: false` — the UI must flag it, never guess.
 *
 * @param table - fetched label table, or null while loading / on error
 * @param id - raw enum id as sent in `building.*.update.v1` commands
 */
export function resolveEnumLabel(
  table: EnumLabelTable | null | undefined,
  id: string
): { readonly label: string; readonly known: boolean } {
  const label = table?.[id];
  if (label !== undefined) return { label, known: true };
  return { label: id, known: false };
}
