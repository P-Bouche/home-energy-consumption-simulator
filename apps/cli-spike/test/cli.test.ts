import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cliDir = fileURLToPath(new URL('..', import.meta.url));
const fixturesDir = fileURLToPath(
  new URL('../../../packages/open3cl-adapter/test/fixtures', import.meta.url)
);

interface CliSuccess {
  stdout: string;
  stderr: string;
}

async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result: CliSuccess = await execFileAsync(process.execPath, ['.', ...args], {
      cwd: cliDir,
      maxBuffer: 64 * 1024 * 1024
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? ''
    };
  }
}

const malformedFile = fileURLToPath(new URL('./malformed.xml', import.meta.url));

describe('cli-spike: node . simulate <file.xml>', () => {
  const fixtureFiles = readdirSync(fixturesDir).filter((file) => file.endsWith('.xml'));

  it('AC-P0-01: simulates every checked-in fixture, exit 0, JSON on stdout', async () => {
    expect(fixtureFiles.length).toBeGreaterThanOrEqual(10);
    for (const fixture of fixtureFiles) {
      const { code, stdout, stderr } = await runCli([
        'simulate',
        `${fixturesDir}/${fixture}`
      ]);
      expect(code, `fixture ${fixture} should exit 0 (stderr: ${stderr.slice(0, 200)})`).toBe(0);
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      expect(parsed['engineVersion']).toBe('1.11.6');
      expect(typeof parsed['consumptionKwh']).toBe('number');
      expect(typeof parsed['emissionsKg']).toBe('number');
      expect(parsed['energyLabel']).toMatch(/^[A-G]$/);
      expect(parsed['climateLabel']).toMatch(/^[A-G]$/);
      expect(parsed['rawEngineOutput']).toBeTypeOf('object');
    }
  }, 120_000);

  it('exits non-zero with an explicit error on a malformed XML file', async () => {
    const { code, stderr } = await runCli(['simulate', malformedFile]);
    expect(code).not.toBe(0);
    expect(stderr).toContain('Error');
  });

  it('exits non-zero with an explicit error on a missing file', async () => {
    const { code, stderr } = await runCli(['simulate', `${fixturesDir}/does-not-exist.xml`]);
    expect(code).not.toBe(0);
    expect(stderr).toContain('Error');
  });

  it('exits 2 with usage when called without arguments', async () => {
    const { code, stderr } = await runCli([]);
    expect(code).toBe(2);
    expect(stderr).toContain('Usage');
  });
});
