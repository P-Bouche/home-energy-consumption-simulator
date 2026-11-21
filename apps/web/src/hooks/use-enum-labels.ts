import { useEffect, useState } from 'react';
import { getEnumLabels, type EnumLabelKind, type EnumLabelTable } from '../services/enum-labels.ts';

/**
 * Label tables per enum kind, `null` while loading (or on fetch error — the
 * UI then falls back to raw ids with an honest "unknown" flag). Fetching goes
 * through the cached enum-labels service: one request per kind per session,
 * shared by every component that asks for the same kinds.
 */
export type EnumLabelTables = Partial<Record<EnumLabelKind, EnumLabelTable | null>>;

/**
 * Loads the label tables of the given enum kinds (cached per kind).
 *
 * @param kinds - enum kinds needed by the component
 */
export function useEnumLabels(kinds: readonly EnumLabelKind[]): EnumLabelTables {
  const [tables, setTables] = useState<EnumLabelTables>({});
  const key = kinds.join(',');
  useEffect(() => {
    let cancelled = false;
    const list = key.split(',') as EnumLabelKind[];
    void Promise.all(
      list.map(async (kind): Promise<[EnumLabelKind, EnumLabelTable | null]> => {
        try {
          return [kind, await getEnumLabels(kind)];
        } catch {
          return [kind, null]; // fetch failed: render raw ids, never guess
        }
      })
    ).then((entries) => {
      if (!cancelled) setTables(Object.fromEntries(entries) as EnumLabelTables);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return tables;
}
