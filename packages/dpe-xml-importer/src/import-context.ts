import {
  createImportReport,
  inferred,
  measured,
  MEASURED_SOURCE_PREFIX,
  type Confidence,
  type ImportReport,
  type InferredField,
  type MissingField,
  type ParsedField,
  type UnrecognizedField
} from '@hes/domain';
import { MAX_XML_DEPTH } from './parse-dpe-xml.ts';
import { asArray, decodePredefinedEntities, isRecord } from './xml-utils.ts';

/**
 * Mutable collector used while mapping a parsed DPE document: records parsed
 * fields, inferred fields (with full confidence metadata), missing fields,
 * and the set of "touched" element paths consumed by the mappers. After
 * mapping, {@link collectUnrecognized} walks the tree and aggregates every
 * leaf path that was never touched as an unrecognized field.
 */
export class ImportContext {
  readonly importDate: Date;
  private readonly parsed: ParsedField[] = [];
  private readonly inferredFields: InferredField[] = [];
  private readonly missing: MissingField[] = [];
  private readonly touched = new Set<string>();

  constructor(importDate: Date) {
    this.importDate = importDate;
  }

  /**
   * Records a field read verbatim from the XML.
   */
  recordParsed(path: string, rawValue: string): void {
    this.parsed.push({ path, value: rawValue });
    this.touched.add(path);
  }

  /**
   * Records a field produced by an inference rule. The Confidence metadata
   * (source / confidence / importDate) is stored in the report verbatim.
   */
  recordInferred<T>(path: string, value: T, rule: string, confidence: number): Confidence<T> {
    const c = inferred(value, `inference:${rule}`, confidence, this.importDate);
    this.inferredFields.push({
      path,
      value,
      source: c.source,
      confidence: c.confidence,
      importDate: c.importDate.toISOString()
    });
    this.touched.add(path);
    return c;
  }

  /**
   * Records a field absent from the file with no applicable inference rule.
   */
  recordMissing(path: string, reason: string): void {
    this.missing.push({ path, reason });
  }

  /**
   * Marks an element path as consumed by a mapper (the unrecognized-field
   * walker skips touched paths and their descendants).
   */
  touch(path: string): void {
    this.touched.add(path);
  }

  /**
   * @returns true when the path is touched or lives under a touched path
   */
  isTouched(path: string): boolean {
    for (const t of this.touched) {
      if (path === t || path.startsWith(`${t}/`)) return true;
    }
    return false;
  }

  /**
   * Builds a measured Confidence from a raw XML text value, recording the
   * parsed field. Returns null (and records a missing field) when the raw
   * value is absent or cannot be converted.
   *
   * @param path - element path (used as report key and source suffix)
   * @param raw - raw text value from the parser
   * @param convert - explicit conversion (str/num semantics live in the caller)
   * @param missingReason - reason recorded when the value is absent
   */
  measuredOrMissing<T>(
    path: string,
    raw: string | null,
    convert: (raw: string) => T | null,
    missingReason: string
  ): Confidence<T> | null {
    if (raw === null) {
      this.recordMissing(path, missingReason);
      return null;
    }
    const value = convert(raw);
    if (value === null) {
      this.recordMissing(path, `${missingReason} (unparseable value: ${raw})`);
      return null;
    }
    this.recordParsed(path, decodePredefinedEntities(raw));
    return measured(value, `${MEASURED_SOURCE_PREFIX}${path}`, this.importDate);
  }

  /**
   * Builds the immutable ImportReport v1, appending the unrecognized fields
   * collected from the parsed document.
   */
  buildReport(input: {
    dpeNumber: string | null;
    schemaVariant: string;
    doc: unknown;
  }): ImportReport {
    const unrecognized = collectUnrecognized(input.doc, this);
    return createImportReport({
      dpeNumber: input.dpeNumber,
      schemaVariant: input.schemaVariant,
      generatedAt: this.importDate,
      parsedFields: this.parsed,
      inferredFields: this.inferredFields,
      unrecognizedFields: unrecognized,
      missingFields: this.missing
    });
  }
}

/**
 * Walks the parsed document and aggregates every leaf element path that no
 * mapper touched. Paths are aggregated with occurrence counts so large
 * repeated collections (fiche_technique, ...) stay bounded in the report.
 */
function collectUnrecognized(doc: unknown, ctx: ImportContext): UnrecognizedField[] {
  const counts = new Map<string, number>();
  walk(doc, '', ctx, counts, 0);
  return [...counts.entries()]
    .map(([path, occurrences]) => ({ path, occurrences }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function walk(
  node: unknown,
  path: string,
  ctx: ImportContext,
  counts: Map<string, number>,
  depth: number
): void {
  if (depth > MAX_XML_DEPTH) return;
  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, path, ctx, counts, depth);
    }
    return;
  }
  if (!isRecord(node)) {
    if (!ctx.isTouched(path)) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const childPath = path === '' ? key : `${path}/${key}`;
    if (ctx.isTouched(childPath)) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        counts.set(childPath, (counts.get(childPath) ?? 0) + 1);
      } else {
        walk(value, childPath, ctx, counts, depth + 1);
      }
    } else if (isRecord(value)) {
      walk(value, childPath, ctx, counts, depth + 1);
    } else {
      counts.set(childPath, (counts.get(childPath) ?? 0) + 1);
    }
  }
}

/**
 * @returns the array of items for a fast-xml-parser collection node
 */
export function items(node: unknown): unknown[] {
  return asArray(node);
}
