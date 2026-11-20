/**
 * Confidence wrapper for every imported or inferred value.
 *
 * Rule (AGENTS.md §3): DPE files are frequently incomplete, so every value
 * carried by the domain is wrapped in `Confidence<T>`. A value taken verbatim
 * from the DPE XML is `measured` (confidence = 1, source = `dpe-xml:<path>`).
 * A value produced by an inference rule is `inferred` and MUST carry a
 * `source` naming the rule, a `confidence` strictly below 1, and the
 * `importDate` of the import that produced it. Inferred data is never
 * presented as measured.
 */
export interface Confidence<T> {
  readonly value: T;
  readonly source: string;
  readonly confidence: number;
  readonly importDate: Date;
}

/**
 * Source prefix used for values read verbatim from the DPE XML.
 */
export const MEASURED_SOURCE_PREFIX = 'dpe-xml:';

/**
 * Source used for values entered by a user in the editor (P4). User-supplied
 * values are stored with confidence 1.0: the user asserts them explicitly.
 */
export const USER_SOURCE = 'user';

/**
 * Wraps a user-supplied value (P4 editor): `source: "user"`, confidence 1.0.
 *
 * @param value - the value entered by the user
 * @param at - the date of the edit
 */
export function userSupplied<T>(value: T, at: Date): Confidence<T> {
  return createConfidence(value, USER_SOURCE, 1, at);
}

/**
 * JSON shape of a Confidence value (importDate as ISO-8601 string).
 */
export interface ConfidenceJson<T> {
  readonly value: T;
  readonly source: string;
  readonly confidence: number;
  readonly importDate: string;
}

/**
 * Builds a Confidence value object. All four fields are mandatory at the
 * type level: it is impossible to construct a Confidence without a source,
 * a confidence score and an import date.
 *
 * @param value - the carried value
 * @param source - non-empty provenance (`dpe-xml:<path>` or `inference:<rule>`)
 * @param confidence - score in [0, 1]
 * @param importDate - date of the import that produced this value
 * @throws TypeError when source is empty or importDate is not a valid Date
 * @throws RangeError when confidence is not a finite number in [0, 1]
 */
export function createConfidence<T>(
  value: T,
  source: string,
  confidence: number,
  importDate: Date
): Confidence<T> {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new TypeError('Confidence.source must be a non-empty string');
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RangeError(`Confidence.confidence must be a finite number in [0, 1], got ${String(confidence)}`);
  }
  if (!(importDate instanceof Date) || Number.isNaN(importDate.getTime())) {
    throw new TypeError('Confidence.importDate must be a valid Date');
  }
  return Object.freeze({ value, source, confidence, importDate: new Date(importDate.getTime()) });
}

/**
 * Wraps a value measured verbatim in the source document (confidence = 1).
 *
 * @param value - the measured value
 * @param source - non-empty provenance, conventionally `dpe-xml:<path>`
 * @param importDate - date of the import
 */
export function measured<T>(value: T, source: string, importDate: Date): Confidence<T> {
  return createConfidence(value, source, 1, importDate);
}

/**
 * Wraps a value produced by an inference rule. The confidence score MUST be
 * strictly below 1: an inferred value can never be presented as measured.
 *
 * @param value - the inferred value
 * @param source - non-empty rule name, conventionally `inference:<rule>`
 * @param confidence - score in [0, 1)
 * @param importDate - date of the import
 * @throws RangeError when confidence >= 1
 */
export function inferred<T>(
  value: T,
  source: string,
  confidence: number,
  importDate: Date
): Confidence<T> {
  if (Number.isFinite(confidence) && confidence >= 1) {
    throw new RangeError(
      'inferred() requires confidence < 1; use measured() for values read verbatim from the source document'
    );
  }
  return createConfidence(value, source, confidence, importDate);
}

/**
 * @param c - a Confidence value
 * @returns true when the value was measured (confidence === 1)
 */
export function isMeasured<T>(c: Confidence<T>): boolean {
  return c.confidence === 1;
}

/**
 * Serializes a Confidence value to plain JSON (importDate as ISO string).
 */
export function confidenceToJson<T>(c: Confidence<T>): ConfidenceJson<T> {
  return {
    value: c.value,
    source: c.source,
    confidence: c.confidence,
    importDate: c.importDate.toISOString()
  };
}

/**
 * Revives a Confidence value from its JSON shape, re-validating all fields.
 *
 * @throws TypeError when the JSON shape is invalid
 */
export function confidenceFromJson<T>(json: ConfidenceJson<T>): Confidence<T> {
  return createConfidence(
    json.value,
    json.source,
    json.confidence,
    new Date(json.importDate)
  );
}

/**
 * Deeply revives every Confidence-shaped object inside a parsed JSON value
 * (importDate strings back to Date). Used on the persistence read path so
 * nested entities (zones, walls, …) carry real Date objects again.
 */
export function reviveConfidenceDates<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => reviveConfidenceDates(item)) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    const rec = value as Record<string, unknown>;
    if (
      'value' in rec &&
      typeof rec['source'] === 'string' &&
      typeof rec['confidence'] === 'number' &&
      typeof rec['importDate'] === 'string'
    ) {
      return confidenceFromJson(rec as unknown as ConfidenceJson<unknown>) as unknown as T;
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(rec)) {
      out[key] = reviveConfidenceDates(v);
    }
    return out as T;
  }
  return value;
}
