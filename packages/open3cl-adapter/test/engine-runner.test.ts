import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EngineRunner, getEngineRunner, type EngineTask } from '../src/index.ts';

const fixtureDir = fileURLToPath(new URL('./fixtures', import.meta.url));
const fixtureXml = readFileSync(`${fixtureDir}/2238E0097309E.xml`, 'utf8');

describe('EngineRunner (worker thread)', () => {
  it('is a process-wide singleton', () => {
    expect(getEngineRunner()).toBe(getEngineRunner());
  });

  it('runs an xml task in the worker and returns the raw engine result', async () => {
    const runner = new EngineRunner();
    try {
      const result = await runner.run({ kind: 'xml', xml: fixtureXml } satisfies EngineTask);
      expect(result).not.toBeNull();
      const logement = (result as Record<string, unknown>)['logement'] as Record<string, unknown>;
      expect(typeof logement).toBe('object');
    } finally {
      await runner.dispose();
    }
  });

  it('serializes concurrent runs and maps engine throws to rejections', async () => {
    const runner = new EngineRunner();
    try {
      const tasks: EngineTask[] = [
        { kind: 'xml', xml: fixtureXml },
        { kind: 'xml', xml: fixtureXml },
        { kind: 'xml', xml: '<not-a-dpe>boom</not-a-dpe>' }
      ];
      const settled = await Promise.allSettled(tasks.map((task) => runner.run(task)));
      expect(settled[0]?.status).toBe('fulfilled');
      expect(settled[1]?.status).toBe('fulfilled');
      expect(settled[2]?.status).toBe('rejected');
      if (settled[2]?.status === 'rejected') {
        expect(settled[2].reason).toBeInstanceOf(Error);
      }
    } finally {
      await runner.dispose();
    }
  });

  it('dispose rejects pending runs and is idempotent', async () => {
    const runner = new EngineRunner();
    await runner.run({ kind: 'xml', xml: fixtureXml });
    await runner.dispose();
    await expect(runner.dispose()).resolves.toBeUndefined();
  });
});
