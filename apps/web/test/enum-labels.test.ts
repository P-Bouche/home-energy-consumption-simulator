import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearEnumLabelCache,
  ENUM_KINDS,
  enumOptions,
  getEnumLabels,
  resolveEnumLabel
} from '../src/services/enum-labels.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(handler: (url: string) => Response | Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => handler(String(input))));
}

const ORIENTATION = { '1': 'sud', '2': 'nord', '3': 'est', '4': 'ouest', '5': 'horizontal' };

describe('enum-labels service (web)', () => {
  beforeEach(() => {
    clearEnumLabelCache();
    vi.unstubAllGlobals();
  });

  it('fetches GET /api/enums/:kind once per kind and caches the table (shared promise)', async () => {
    let calls = 0;
    stubFetch((url) => {
      if (url === '/api/enums/orientation') {
        calls += 1;
        return jsonResponse({ kind: 'orientation', labels: ORIENTATION });
      }
      throw new Error(`unexpected ${url}`);
    });
    const [a, b] = await Promise.all([getEnumLabels('orientation'), getEnumLabels('orientation')]);
    expect(a).toEqual(ORIENTATION);
    expect(b).toEqual(ORIENTATION);
    expect(calls).toBe(1);
    expect(await getEnumLabels('orientation')).toEqual(ORIENTATION);
    expect(calls).toBe(1);
  });

  it('does not cache failures: a 404 rejects and the next call retries', async () => {
    let calls = 0;
    stubFetch((_url) => {
      calls += 1;
      if (calls === 1) return jsonResponse({ message: 'unknown enum kind' }, 404);
      return jsonResponse({ kind: 'wallType', labels: { '13': 'murs en béton banché' } });
    });
    await expect(getEnumLabels('wallType')).rejects.toMatchObject({ status: 404 });
    expect(await getEnumLabels('wallType')).toEqual({ '13': 'murs en béton banché' });
    expect(calls).toBe(2);
  });

  it('lists every enum kind used by the editor and scenario catalog', () => {
    expect(ENUM_KINDS).toEqual([
      'orientation',
      'wallType',
      'roofType',
      'floorType',
      'adjacencyType',
      'glazingType',
      'frameMaterial',
      'installationType',
      'ventilationType'
    ]);
  });

  it('enumOptions sorts by numeric id and appends an unknown current id honestly', () => {
    const options = enumOptions({ '2': 'nord', '10': 'autre', '1': 'sud' }, '99');
    expect(options.map((o) => o.id)).toEqual(['1', '2', '10', '99']);
    expect(options.find((o) => o.id === '2')).toMatchObject({ label: 'nord', known: true });
    expect(options.find((o) => o.id === '99')).toMatchObject({ label: '99', known: false });
    expect(enumOptions(null, '')).toEqual([]);
    expect(enumOptions(null, '7')).toEqual([{ id: '7', label: '7', known: false }]);
  });

  it('resolveEnumLabel maps known ids and returns the raw id + known=false for unknown ones (never guesses)', () => {
    expect(resolveEnumLabel(ORIENTATION, '2')).toEqual({ label: 'nord', known: true });
    expect(resolveEnumLabel(ORIENTATION, '999')).toEqual({ label: '999', known: false });
    expect(resolveEnumLabel(null, '3')).toEqual({ label: '3', known: false });
  });
});
