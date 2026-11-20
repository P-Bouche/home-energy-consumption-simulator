import type {
  ErrorBody,
  GeometryResponse,
  ImportDpeResponse,
  RunSimulationResponse,
  SimulationHistoryResponse,
  SimulationJobJson
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
