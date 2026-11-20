/**
 * API contract types shared with the API (apps/api). The report shape mirrors
 * ImportReportJson in packages/domain.
 */
export interface ParsedField {
  readonly path: string;
  readonly value: string;
}

export interface InferredField {
  readonly path: string;
  readonly value: unknown;
  readonly source: string;
  readonly confidence: number;
  readonly importDate: string;
}

export interface UnrecognizedField {
  readonly path: string;
  readonly occurrences: number;
}

export interface MissingField {
  readonly path: string;
  readonly reason: string;
}

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

export interface ImportDpeResponse {
  readonly buildingId: string;
  readonly report: ImportReportJson;
}

export interface ErrorBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly schemaErrors?: readonly string[];
}
