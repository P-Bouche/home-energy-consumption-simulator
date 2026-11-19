import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../src/run-cli.ts';

const fixturesDir = fileURLToPath(
  new URL('../../../packages/open3cl-adapter/test/fixtures', import.meta.url)
);
const malformedFile = fileURLToPath(new URL('./malformed.xml', import.meta.url));

function makeIo(): { io: CliIo; readOut(): string; readErr(): string } {
  let out = '';
  let err = '';
  const io: CliIo = {
    writeOut(chunk: string) {
      out += chunk;
    },
    writeErr(chunk: string) {
      err += chunk;
    }
  };
  return { io, readOut: () => out, readErr: () => err };
}

describe('runCli (in-process)', () => {
  it('simulates a valid fixture: exit 0 and JSON result on stdout', async () => {
    const { io, readOut, readErr } = makeIo();
    const code = await runCli(['simulate', `${fixturesDir}/2260E1364581G.xml`], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(readOut()) as Record<string, unknown>;
    expect(parsed['engineVersion']).toBe('1.11.6');
    expect(typeof parsed['consumptionKwh']).toBe('number');
    expect(parsed['energyLabel']).toMatch(/^[A-G]$/);
    expect(parsed['climateLabel']).toMatch(/^[A-G]$/);
    expect(readErr()).toBe('');
  });

  it('malformed XML: exit 1 with an explicit error on stderr', async () => {
    const { io, readOut, readErr } = makeIo();
    const code = await runCli(['simulate', malformedFile], io);
    expect(code).toBe(1);
    expect(readOut()).toBe('');
    expect(readErr()).toContain('Error [ENGINE_EXECUTION]');
  });

  it('missing file: exit 1 with an explicit error on stderr', async () => {
    const { io, readErr } = makeIo();
    const code = await runCli(['simulate', `${fixturesDir}/nope.xml`], io);
    expect(code).toBe(1);
    expect(readErr()).toContain('Error: cannot read file');
  });

  it('no arguments: exit 2 with usage on stderr', async () => {
    const { io, readErr } = makeIo();
    const code = await runCli([], io);
    expect(code).toBe(2);
    expect(readErr()).toContain('Usage: node . simulate <file.xml>');
  });

  it('unknown command: exit 2 with usage on stderr', async () => {
    const { io, readErr } = makeIo();
    const code = await runCli(['frobnicate'], io);
    expect(code).toBe(2);
    expect(readErr()).toContain('Usage');
  });
});
