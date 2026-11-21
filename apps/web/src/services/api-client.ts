import type {
  ApplyScenarioResponse,
  AuditLogResponse,
  BuildingCommandJson,
  ComparisonResponse,
  EditBuildingResponse,
  ErrorBody,
  GeometryResponse,
  GetBuildingResponse,
  ImportDpeResponse,
  RunSimulationResponse,
  ScenarioJson,
  ScenarioListResponse,
  SimulationHistoryResponse,
  SimulationJobJson,
  SimulateScenarioResponse
} from '../types.ts';

/**
 * Error thrown when the API answers with a non-2xx status. Carries the HTTP
 * status and the API error body (including schemaErrors on 422).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ErrorBody | null;

  constructor(status: number, body: ErrorBody | null, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Small API client. All HTTP calls of the app go through here (components
 * never fetch directly — no business logic in the UI).
 */

/**
 * Uploads a DPE XML file to POST /api/imports/dpe (multipart).
 *
 * @param fileName - original file name (must end with .xml)
 * @param content - raw XML content
 * @throws ApiError on non-2xx (422 invalid XML, 413 too large, ...)
 */
export async function uploadDpeXml(fileName: string, content: string): Promise<ImportDpeResponse> {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/xml' }), fileName);
  const response = await fetch('/api/imports/dpe', { method: 'POST', body: form });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, body, body?.message ?? `upload failed with status ${response.status}`);
  }
  return (await response.json()) as ImportDpeResponse;
}

/**
 * Fetches the reconstructed 3D geometry of a building from
 * GET /api/buildings/:id/geometry (P3, computed server-side).
 *
 * @param buildingId - building id (uuid)
 * @throws ApiError on non-2xx (404 unknown building, ...)
 */
export async function getBuildingGeometry(buildingId: string): Promise<GeometryResponse> {
  const response = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}/geometry`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, body, body?.message ?? `geometry fetch failed with status ${response.status}`);
  }
  return (await response.json()) as GeometryResponse;
}

/**
 * Runs an Open3CL simulation on a building: POST /api/buildings/:id/simulations.
 * Returns { mode: 'sync'|'cached', result } (201) or { mode: 'async', job } (202).
 *
 * @throws ApiError on non-2xx (404 unknown building, 409 in-flight duplicate, 422 mapping, 500 engine)
 */
export async function runSimulation(buildingId: string): Promise<RunSimulationResponse> {
  const response = await fetch(`/api/buildings/${buildingId}/simulations`, { method: 'POST' });
  if (!response.ok && response.status !== 202) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, body, body?.message ?? `simulation failed with status ${response.status}`);
  }
  return (await response.json()) as RunSimulationResponse;
}

/**
 * Lists the simulation history of a building: GET /api/buildings/:id/simulations.
 */
export async function getSimulationHistory(buildingId: string): Promise<SimulationHistoryResponse> {
  const response = await fetch(`/api/buildings/${buildingId}/simulations`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, body, body?.message ?? `history failed with status ${response.status}`);
  }
  return (await response.json()) as SimulationHistoryResponse;
}

/**
 * Polls one simulation job: GET /api/simulations/jobs/:id.
 */
export async function getSimulationJob(jobId: string): Promise<SimulationJobJson> {
  const response = await fetch(`/api/simulations/jobs/${jobId}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, body, body?.message ?? `job polling failed with status ${response.status}`);
  }
  return (await response.json()) as SimulationJobJson;
}

/**
 * Loads a building with its optimistic-locking version: GET /api/buildings/:id.
 */
export async function getBuilding(buildingId: string): Promise<GetBuildingResponse> {
  const response = await fetch(`/api/buildings/${buildingId}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, body, body?.message ?? `get building failed with status ${response.status}`);
  }
  return (await response.json()) as GetBuildingResponse;
}

/**
 * Applies an edit command: PATCH /api/buildings/:id with `If-Match: <version>`
 * and `x-user-id`. Throws ApiError with body.fieldErrors on 400 (validation)
 * and body.currentVersion on 409 (stale version).
 */
export async function patchBuilding(
  buildingId: string,
  command: BuildingCommandJson,
  version: number,
  userId: string
): Promise<EditBuildingResponse> {
  const response = await fetch(`/api/buildings/${buildingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'If-Match': String(version), 'x-user-id': userId },
    body: JSON.stringify(command)
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, body, body?.message ?? `edit failed with status ${response.status}`);
  }
  return (await response.json()) as EditBuildingResponse;
}

/**
 * Reads the audit trail: GET /api/buildings/:id/audit.
 */
export async function getAuditLog(buildingId: string): Promise<AuditLogResponse> {
  const response = await fetch(`/api/buildings/${buildingId}/audit`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, body, body?.message ?? `audit failed with status ${response.status}`);
  }
  return (await response.json()) as AuditLogResponse;
}

/**
 * Undoes the last change: POST /api/buildings/:id/undo with `If-Match`.
 */
export async function undoBuilding(buildingId: string, version: number, userId: string): Promise<EditBuildingResponse> {
  const response = await fetch(`/api/buildings/${buildingId}/undo`, {
    method: 'POST',
    headers: { 'If-Match': String(version), 'x-user-id': userId }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, body, body?.message ?? `undo failed with status ${response.status}`);
  }
  return (await response.json()) as EditBuildingResponse;
}

// ---------------------------------------------------------------------------
// P5 scenarios

async function readError(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  throw new ApiError(response.status, body, body?.message ?? fallback);
}

/**
 * Creates a scenario: POST /api/buildings/:id/scenarios. `commands` is the raw
 * change-set (frozen P4 vocabulary; `buildingId` is stamped server-side).
 * Throws ApiError 400 (invalid command) / 404 (unknown building/element).
 */
export async function createScenario(
  buildingId: string,
  input: { name: string; description?: string; commands: readonly BuildingCommandJson[] }
): Promise<ScenarioJson> {
  const response = await fetch(`/api/buildings/${buildingId}/scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!response.ok) await readError(response, `create scenario failed with status ${response.status}`);
  return (await response.json()) as ScenarioJson;
}

/**
 * Lists the scenarios of a building: GET /api/buildings/:id/scenarios.
 */
export async function listScenarios(buildingId: string): Promise<ScenarioListResponse> {
  const response = await fetch(`/api/buildings/${buildingId}/scenarios`);
  if (!response.ok) await readError(response, `scenario list failed with status ${response.status}`);
  return (await response.json()) as ScenarioListResponse;
}

/**
 * Patches a scenario: PATCH /api/scenarios/:id.
 */
export async function updateScenario(
  scenarioId: string,
  input: { name?: string; description?: string; commands?: readonly BuildingCommandJson[] }
): Promise<ScenarioJson> {
  const response = await fetch(`/api/scenarios/${scenarioId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!response.ok) await readError(response, `update scenario failed with status ${response.status}`);
  return (await response.json()) as ScenarioJson;
}

/**
 * Deletes a scenario (building and simulation results are kept): DELETE /api/scenarios/:id (204).
 */
export async function deleteScenario(scenarioId: string): Promise<void> {
  const response = await fetch(`/api/scenarios/${scenarioId}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 204) await readError(response, `delete scenario failed with status ${response.status}`);
}

/**
 * Simulates a scenario through the P2 pipeline: POST /api/scenarios/:id/simulate (201).
 */
export async function simulateScenario(scenarioId: string): Promise<SimulateScenarioResponse> {
  const response = await fetch(`/api/scenarios/${scenarioId}/simulate`, { method: 'POST' });
  if (!response.ok) await readError(response, `scenario simulation failed with status ${response.status}`);
  return (await response.json()) as SimulateScenarioResponse;
}

/**
 * Applies a scenario to its building: POST /api/scenarios/:id/apply (200).
 */
export async function applyScenario(scenarioId: string, userId = 'anonymous'): Promise<ApplyScenarioResponse> {
  const response = await fetch(`/api/scenarios/${scenarioId}/apply`, {
    method: 'POST',
    headers: { 'x-user-id': userId }
  });
  if (!response.ok) await readError(response, `apply scenario failed with status ${response.status}`);
  return (await response.json()) as ApplyScenarioResponse;
}

/**
 * Compares baseline + scenarios: POST /api/buildings/:id/compare (200).
 */
export async function compareScenarios(buildingId: string, scenarioIds?: readonly string[]): Promise<ComparisonResponse> {
  const response = await fetch(`/api/buildings/${buildingId}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scenarioIds === undefined ? {} : { scenarioIds })
  });
  if (!response.ok) await readError(response, `compare failed with status ${response.status}`);
  return (await response.json()) as ComparisonResponse;
}
