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
  readonly jobId?: string;
  readonly code?: string;
}

/**
 * Simulation API contract (P2), mirrors the API DTOs in apps/api.
 */
export interface SimulationResultJson {
  readonly id: string;
  readonly buildingId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly createdAt: string;
  readonly consumptionKwh: number;
  readonly consumptionKwhM2An: number | null;
  readonly emissionsKg: number;
  readonly emissionsKgCo2M2An: number | null;
  readonly energyLabel: string;
  readonly climateLabel: string;
  readonly rawEngineOutput: Record<string, unknown>;
}

export interface SimulationJobJson {
  readonly id: string;
  readonly buildingId: string;
  readonly inputHash: string;
  readonly status: 'queued' | 'running' | 'done' | 'failed';
  readonly resultId: string | null;
  readonly error: { code: string; message: string } | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export interface RunSimulationResponse {
  readonly mode: 'sync' | 'cached' | 'async';
  readonly cached: boolean;
  readonly result?: SimulationResultJson;
  readonly job?: SimulationJobJson;
}

export interface SimulationHistoryResponse {
  readonly buildingId: string;
  readonly results: readonly SimulationResultJson[];
}
