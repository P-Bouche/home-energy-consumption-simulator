/**
 * Import report v1. Lists every parsed field, every inferred field (with its
 * full confidence metadata), every unrecognized element and every missing
 * field, so no gap in the source DPE file is ever silent.
 */
export const REPORT_VERSION = 1 as const;

/**
 * A field read verbatim from the DPE XML. `value` is the raw XML text.
 */
export interface ParsedField {
  readonly path: string;
  readonly value: string;
}

/**
 * A field produced by an inference rule. Carries the same metadata as the
 * Confidence value stored in the aggregate: source, confidence, importDate.
 */
export interface InferredField {
  readonly path: string;
  readonly value: unknown;
  readonly source: string;
  readonly confidence: number;
  readonly importDate: string;
}

/**
 * An XML element present in the file but not mapped to the domain model v1.
 * Occurrences are aggregated per element path to keep the report bounded.
 */
export interface UnrecognizedField {
  readonly path: string;
  readonly occurrences: number;
}

/**
 * A field absent from the file for which no inference rule applies.
 */
export interface MissingField {
  readonly path: string;
  readonly reason: string;
}

/**
 * The import report. `reportVersion` is part of the persisted contract
 * (P1 exit criterion: report format versioned, v1 here).
 */
export interface ImportReport {
  readonly reportVersion: typeof REPORT_VERSION;
  readonly dpeNumber: string | null;
  readonly schemaVariant: string;
  readonly generatedAt: Date;
  readonly parsedFields: readonly ParsedField[];
  readonly inferredFields: readonly InferredField[];
  readonly unrecognizedFields: readonly UnrecognizedField[];
  readonly missingFields: readonly MissingField[];
}

/**
 * Input accepted by {@link createImportReport}.
 */
export interface ImportReportInput {
  readonly dpeNumber: string | null;
  readonly schemaVariant: string;
  readonly generatedAt: Date;
  readonly parsedFields: readonly ParsedField[];
  readonly inferredFields: readonly InferredField[];
  readonly unrecognizedFields: readonly UnrecognizedField[];
  readonly missingFields: readonly MissingField[];
}

/**
 * Validates and builds an ImportReport value object.
 *
 * @throws RangeError when generatedAt is not a valid Date
 */
export function createImportReport(input: ImportReportInput): ImportReport {
  if (!(input.generatedAt instanceof Date) || Number.isNaN(input.generatedAt.getTime())) {
    throw new RangeError('ImportReport.generatedAt must be a valid Date');
  }
  for (const field of input.inferredFields) {
    if (typeof field.source !== 'string' || field.source.length === 0) {
      throw new TypeError(`inferred field ${field.path} must carry a non-empty source`);
    }
    if (!Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence >= 1) {
      throw new RangeError(
        `inferred field ${field.path} must carry a confidence in [0, 1), got ${String(field.confidence)}`
      );
    }
    if (Number.isNaN(Date.parse(field.importDate))) {
      throw new TypeError(`inferred field ${field.path} must carry a valid ISO importDate`);
    }
  }
  return Object.freeze({
    reportVersion: REPORT_VERSION,
    dpeNumber: input.dpeNumber,
    schemaVariant: input.schemaVariant,
    generatedAt: new Date(input.generatedAt.getTime()),
    parsedFields: Object.freeze([...input.parsedFields]),
    inferredFields: Object.freeze([...input.inferredFields]),
    unrecognizedFields: Object.freeze([...input.unrecognizedFields]),
    missingFields: Object.freeze([...input.missingFields])
  });
}

/**
 * JSON shape of an ImportReport (generatedAt as ISO-8601 string).
 */
export interface ImportReportJson {
  readonly reportVersion: 1;
  readonly dpeNumber: string | null;
  readonly schemaVariant: string;
  readonly generatedAt: string;
  readonly parsedFields: readonly ParsedField[];
  readonly inferredFields: readonly InferredField[];
  readonly unrecognizedFields: readonly UnrecognizedField[];
  readonly missingFields: readonly MissingField[];
}

/**
 * Serializes an ImportReport to plain JSON.
 */
export function importReportToJson(report: ImportReport): ImportReportJson {
  return {
    reportVersion: REPORT_VERSION,
    dpeNumber: report.dpeNumber,
    schemaVariant: report.schemaVariant,
    generatedAt: report.generatedAt.toISOString(),
    parsedFields: report.parsedFields,
    inferredFields: report.inferredFields,
    unrecognizedFields: report.unrecognizedFields,
    missingFields: report.missingFields
  };
}

/**
 * Revives an ImportReport from its JSON shape.
 */
export function importReportFromJson(json: ImportReportJson): ImportReport {
  return createImportReport({
    dpeNumber: json.dpeNumber,
    schemaVariant: json.schemaVariant,
    generatedAt: new Date(json.generatedAt),
    parsedFields: json.parsedFields,
    inferredFields: json.inferredFields,
    unrecognizedFields: json.unrecognizedFields,
    missingFields: json.missingFields
  });
}
