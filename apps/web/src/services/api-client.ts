import type { ErrorBody, ImportDpeResponse } from '../types.ts';

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
