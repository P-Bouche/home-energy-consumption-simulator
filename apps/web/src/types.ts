import type { GeometryJson } from '@hes/domain';

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

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export interface ErrorBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly schemaErrors?: readonly string[];
  readonly jobId?: string;
  readonly code?: string;
  readonly fieldErrors?: readonly FieldError[];
  readonly issues?: readonly string[];
  readonly expectedVersion?: number;
  readonly currentVersion?: number;
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

/**
 * P3: geometry API contract types. Re-exported from the domain (type-only —
 * erased at runtime, so the web bundle never loads domain code for these).
 */
export type {
  CoordinateSystem,
  FaceJson,
  GeometryElementJson,
  GeometryJson,
  MeshJson,
  Vector3
} from '@hes/domain';

/**
 * Response of GET /buildings/:id/geometry.
 */
export interface GeometryResponse {
  readonly buildingId: string;
  readonly geometry: GeometryJson;
}

/**
 * JSON shape of a SimulationResult (P2). Until P2 lands, the viewer store
 * keeps `simulation: null` and the heat-loss overlay stays hidden.
 */
export interface SimulationResultJson {
  readonly consumptionKwh: number;
  readonly emissionsKg: number;
  readonly energyLabel: string;
  readonly climateLabel: string;
  readonly rawEngineOutput: Record<string, unknown>;
}

/**
 * P4 editor API contract (mirrors packages/domain JSON shapes).
 */
export interface ConfidenceJson<T> {
  readonly value: T;
  readonly source: string;
  readonly confidence: number;
  readonly importDate: string;
}

export interface EnvelopeElementJson {
  readonly id: string;
  readonly buildingId: string;
  readonly description: ConfidenceJson<string>;
  readonly areaM2: ConfidenceJson<number> | null;
  readonly uValueWm2K: ConfidenceJson<number> | null;
}

export interface WallJson extends EnvelopeElementJson {
  readonly kind: 'wall';
  readonly orientation: ConfidenceJson<string> | null;
  readonly wallType: ConfidenceJson<string> | null;
  readonly adjacencyType: ConfidenceJson<string> | null;
}

export interface WindowJson extends EnvelopeElementJson {
  readonly kind: 'window';
  readonly orientation: ConfidenceJson<string> | null;
  readonly count: ConfidenceJson<number>;
  readonly solarFactorSw: ConfidenceJson<number> | null;
  readonly glazingType: ConfidenceJson<string> | null;
  readonly frameMaterial: ConfidenceJson<string> | null;
}

export interface RoofJson extends EnvelopeElementJson {
  readonly kind: 'roof';
  readonly roofType: ConfidenceJson<string> | null;
  readonly adjacencyType: ConfidenceJson<string> | null;
}

export interface FloorJson extends EnvelopeElementJson {
  readonly kind: 'floor';
  readonly floorType: ConfidenceJson<string> | null;
  readonly adjacencyType: ConfidenceJson<string> | null;
}

export interface HeatingSystemJson {
  readonly id: string;
  readonly buildingId: string;
  readonly description: ConfidenceJson<string>;
  readonly installationType: ConfidenceJson<string> | null;
  readonly generatorType: ConfidenceJson<string> | null;
  readonly heatedAreaM2: ConfidenceJson<number> | null;
}

export interface VentilationSystemJson {
  readonly id: string;
  readonly buildingId: string;
  readonly description: ConfidenceJson<string>;
  readonly ventilationType: ConfidenceJson<string> | null;
  readonly ventilatedAreaM2: ConfidenceJson<number> | null;
  readonly q4paConv: ConfidenceJson<number> | null;
}

export interface BuildingJson {
  readonly id: string;
  readonly walls: readonly WallJson[];
  readonly windows: readonly WindowJson[];
  readonly roofs: readonly RoofJson[];
  readonly floors: readonly FloorJson[];
  readonly heatingSystems: readonly HeatingSystemJson[];
  readonly ventilationSystems: readonly VentilationSystemJson[];
}

export interface GetBuildingResponse {
  readonly building: BuildingJson;
  readonly version: number;
  readonly report: ImportReportJson;
}

/**
 * Versioned P4 command vocabulary (COMMAND_VOCABULARY_VERSION = 1) — shared
 * contract with the API and P5 scenarios.
 */
export type BuildingCommandJson =
  | { readonly type: 'building.wall.update.v1'; readonly buildingId: string; readonly wallId: string; readonly uValueWm2K?: number | null; readonly areaM2?: number | null; readonly description?: string; readonly orientation?: string | null; readonly wallType?: string | null; readonly adjacencyType?: string | null }
  | { readonly type: 'building.window.update.v1'; readonly buildingId: string; readonly windowId: string; readonly uValueWm2K?: number | null; readonly areaM2?: number | null; readonly description?: string; readonly orientation?: string | null; readonly count?: number | null; readonly solarFactorSw?: number | null; readonly glazingType?: string | null; readonly frameMaterial?: string | null }
  | { readonly type: 'building.roof.update.v1'; readonly buildingId: string; readonly roofId: string; readonly uValueWm2K?: number | null; readonly areaM2?: number | null; readonly description?: string; readonly roofType?: string | null; readonly adjacencyType?: string | null }
  | { readonly type: 'building.floor.update.v1'; readonly buildingId: string; readonly floorId: string; readonly uValueWm2K?: number | null; readonly areaM2?: number | null; readonly description?: string; readonly floorType?: string | null; readonly adjacencyType?: string | null }
  | { readonly type: 'building.heating-system.update.v1'; readonly buildingId: string; readonly systemId: string; readonly description?: string; readonly installationType?: string | null; readonly heatedAreaM2?: number | null }
  | { readonly type: 'building.ventilation-system.update.v1'; readonly buildingId: string; readonly systemId: string; readonly description?: string; readonly ventilationType?: string | null; readonly ventilatedAreaM2?: number | null; readonly q4paConv?: number | null };

export interface FieldChangeJson {
  readonly field: string;
  readonly oldValue: ConfidenceJson<unknown> | null;
  readonly newValue: ConfidenceJson<unknown> | null;
}

export interface AuditEntryJson {
  readonly id: string;
  readonly buildingId: string;
  readonly userId: string;
  readonly timestamp: string;
  readonly commandType: string;
  readonly command: BuildingCommandJson;
  readonly changes: readonly FieldChangeJson[];
  readonly version: number;
}

export interface EditBuildingResponse {
  readonly building: BuildingJson;
  readonly version: number;
  readonly auditEntry: AuditEntryJson;
}

export interface AuditLogResponse {
  readonly buildingId: string;
  readonly entries: readonly AuditEntryJson[];
}

/**
 * P5 scenario API contract (mirrors apps/api scenarios DTOs). Commands are the
 * frozen P4 vocabulary (BuildingCommandJson).
 */
export type CommandJson = BuildingCommandJson;

export interface ScenarioJson {
  readonly id: string;
  readonly buildingId: string;
  readonly name: string;
  readonly description: string;
  readonly commands: readonly BuildingCommandJson[];
  readonly baselineVersion: number;
  readonly createdAt: string;
}

export interface ScenarioListResponse {
  readonly buildingId: string;
  readonly scenarios: readonly ScenarioJson[];
}

export interface SimulateScenarioResponse {
  readonly scenarioId: string;
  readonly mode: 'sync' | 'cached';
  readonly result: SimulationResultJson;
}

export interface ApplyScenarioResponse {
  readonly scenarioId: string;
  readonly previousVersion: number;
  readonly newVersion: number;
  readonly auditEntries: readonly AuditEntryJson[];
  readonly simulationMode: 'sync' | 'cached';
  readonly simulation: SimulationResultJson;
}

export interface ComparisonEntryJson {
  readonly scenarioId: string;
  readonly name: string;
  readonly baselineVersion: number;
  readonly result: SimulationResultJson;
  readonly deltaKwh: number;
  readonly deltaKgCo2: number;
  readonly energyLabelChange: { readonly from: string; readonly to: string } | null;
  readonly climateLabelChange: { readonly from: string; readonly to: string } | null;
  readonly rank: number;
}

export interface ComparisonResponse {
  readonly buildingId: string;
  readonly baseline: SimulationResultJson;
  readonly entries: readonly ComparisonEntryJson[];
  readonly simulatedNow: readonly string[];
  readonly generatedAt: string;
}
