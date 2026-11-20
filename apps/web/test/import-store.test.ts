import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useImportStore } from '../src/store/import-store.ts';
import type { ImportDpeResponse } from '../src/types.ts';

const report = {
  reportVersion: 1 as const,
  dpeNumber: '2238E0097309E',
  schemaVariant: 'modele=1/version=2',
  generatedAt: '2026-11-20T10:00:00.000Z',
  parsedFields: [{ path: 'dpe/numero_dpe', value: '2238E0097309E' }],
  inferredFields: [
    {
      path: 'logement/zone',
      value: 'logement',
      source: 'inference:single-zone-from-logement',
      confidence: 0.9,
      importDate: '2026-11-20T10:00:00.000Z'
    }
  ],
  unrecognizedFields: [{ path: 'dpe/logement/sortie', occurrences: 1 }],
  missingFields: [{ path: 'logement/rooms', reason: 'no rooms in DPE' }]
};

describe('import store', () => {
  beforeEach(() => {
    useImportStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it('stores buildingId and report after a successful upload', async () => {
    const response: ImportDpeResponse = { buildingId: '11111111-1111-4111-8111-111111111111', report };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(response), { status: 201 }))
    );
    await useImportStore.getState().upload('fixture.xml', '<dpe/>');
    const state = useImportStore.getState();
    expect(state.status).toBe('done');
    expect(state.buildingId).toBe('11111111-1111-4111-8111-111111111111');
    expect(state.report?.reportVersion).toBe(1);
    expect(state.error).toBeNull();
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/imports/dpe',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('exposes the API error message on a 422', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              statusCode: 422,
              error: 'Unprocessable Entity',
              message: 'DPE XML failed schema validation',
              schemaErrors: ['dpe/logement: missing <logement> section']
            }),
            { status: 422 }
          )
      )
    );
    await useImportStore.getState().upload('bad.xml', '<dpe/>');
    const state = useImportStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toContain('schema validation');
    expect(state.report).toBeNull();
  });

  it('reset() returns to the idle state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 201 })));
    await useImportStore.getState().upload('f.xml', '<dpe/>');
    useImportStore.getState().reset();
    expect(useImportStore.getState().status).toBe('idle');
  });
});
