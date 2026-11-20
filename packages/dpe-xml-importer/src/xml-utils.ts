/**
 * Small typed helpers over the object tree produced by fast-xml-parser
 * (configured with parseTagValue: false, so every text value is a string).
 */

/**
 * @returns true when the value is a plain record
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalizes a fast-xml-parser node to an array (repeated elements become
 * arrays, single elements stay objects).
 */
export function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * @returns the child record at `key`, or undefined
 */
export function child(node: unknown, key: string): unknown {
  return isRecord(node) ? node[key] : undefined;
}

/**
 * @returns the child record at `key` when it is a record, else undefined
 */
export function childRecord(node: unknown, key: string): Record<string, unknown> | undefined {
  const value = child(node, key);
  return isRecord(value) ? value : undefined;
}

/**
 * Decodes only the five predefined XML entities and numeric character
 * references. Custom/general entities are never expanded (processEntities is
 * false), so this cannot be abused for XXE or entity bombs.
 */
export function decodePredefinedEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (match, entity: string) => {
    switch (entity) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        const code = entity.startsWith('#x') || entity.startsWith('#X')
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
    }
  });
}

/**
 * Normalizes a raw text value to a trimmed string (predefined entities
 * decoded).
 *
 * @returns the trimmed string, or null when absent/empty/not a string
 */
export function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = decodePredefinedEntities(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Parses a raw text value as a finite number.
 *
 * @returns the number, or null when absent/not numeric/not finite
 */
export function num(value: unknown): number | null {
  const s = str(value);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
