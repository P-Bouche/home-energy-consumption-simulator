import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Open3clAdapter } from '../src/index.ts';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';

const LATENCY_BUDGET_MS = 3000;
const RUNS_PER_FIXTURE = 3;

const fixturesDir = fileURLToPath(new URL('../test/fixtures', import.meta.url));
const reportPath = fileURLToPath(
  new URL('../../../docs/phases/P2-simulation-benchmark-report.md', import.meta.url)
);
const importDate = new Date('2026-11-20T10:00:00.000Z');

interface Sample {
  fixture: string;
  ms: number;
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] as number;
}

/**
 * AC-P2-01 benchmark: full building→simulation path per corpus fixture —
 * DPE XML import into the Building aggregate, then Open3clAdapter.simulateBuilding
 * (view projection + engine-input mapping + pinned engine + result mapping).
 */
async function main(): Promise<void> {
  const adapter = new Open3clAdapter({ warn: () => undefined });
  const importer = new DpeXmlImporter();
  const engineVersion = adapter.getEngineVersion();
  const fixtureFiles = readdirSync(fixturesDir)
    .filter((file) => file.endsWith('.xml'))
    .sort();

  const samples: Sample[] = [];
  const perFixture: { fixture: string; sizeBytes: number; runs: number[] }[] = [];

  for (const fixture of fixtureFiles) {
    const xml = readFileSync(`${fixturesDir}/${fixture}`, 'utf8');
    const { building } = importer.importDpeXml(xml, importDate);
    await adapter.simulateBuilding(building); // warm-up
    const runs: number[] = [];
    for (let run = 0; run < RUNS_PER_FIXTURE; run += 1) {
      const start = performance.now();
      await adapter.simulateBuilding(building);
      const ms = performance.now() - start;
      runs.push(ms);
      samples.push({ fixture, ms });
    }
    perFixture.push({ fixture, sizeBytes: statSync(`${fixturesDir}/${fixture}`).size, runs });
  }

  const all = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  const p50 = percentile(all, 50);
  const p95 = percentile(all, 95);
  const max = all[all.length - 1] as number;
  const min = all[0] as number;
  const mean = all.reduce((sum, value) => sum + value, 0) / all.length;
  const pass = p95 < LATENCY_BUDGET_MS;

  const cpu = cpus()[0];
  const machine = {
    cpu: cpu ? `${cpu.model.trim()} (${cpus().length} vCPU)` : 'unknown',
    ram: `${(totalmem() / 1024 ** 3).toFixed(1)} GB`,
    platform: `${platform()} ${arch()}`,
    node: process.version,
    engine: `@open3cl/engine ${engineVersion}`
  };

  const lines: string[] = [];
  lines.push('# P2 Simulation Benchmark Report — Building → Open3CL Simulation Latency', '');
  lines.push(`Generated: ${new Date().toISOString()}`, '');
  lines.push('## Machine', '');
  lines.push(`- CPU: ${machine.cpu}`);
  lines.push(`- RAM: ${machine.ram}`);
  lines.push(`- Platform: ${machine.platform}`);
  lines.push(`- Node.js: ${machine.node}`);
  lines.push(`- Engine: ${machine.engine} (pinned)`, '');
  lines.push('## Method', '');
  lines.push(
    `- ${fixtureFiles.length} DPE XML fixtures (P0/P1 corpus, sizes ${Math.min(...perFixture.map((f) => f.sizeBytes))}–${Math.max(...perFixture.map((f) => f.sizeBytes))} bytes)`
  );
  lines.push('- Each fixture is imported once into the Building aggregate (DpeXmlImporter), then `Open3clAdapter.simulateBuilding(building)` is timed');
  lines.push(`- 1 warm-up run per fixture, then ${RUNS_PER_FIXTURE} timed runs per fixture (total ${all.length} samples)`);
  lines.push('- Latency covers view projection + Building→engine input mapping + pinned engine + result mapping (no HTTP, no DB)');
  lines.push('- Percentiles: nearest-rank; budget p95 < 3000 ms (AC-P2-01)', '');
  lines.push('## Results', '');
  lines.push('| Metric | Latency (ms) |');
  lines.push('| --- | --- |');
  lines.push(`| min | ${min.toFixed(1)} |`);
  lines.push(`| p50 | ${p50.toFixed(1)} |`);
  lines.push(`| p95 | ${p95.toFixed(1)} |`);
  lines.push(`| max | ${max.toFixed(1)} |`);
  lines.push(`| mean | ${mean.toFixed(1)} |`, '');
  lines.push(`**AC-P2-01 (p95 < ${LATENCY_BUDGET_MS} ms): ${pass ? 'PASS' : 'FAIL'}**`, '');
  lines.push('## Fixtures', '');
  lines.push('| Fixture | Size (bytes) | Runs (ms) |');
  lines.push('| --- | --- | --- |');
  for (const entry of perFixture) {
    lines.push(`| ${entry.fixture} | ${entry.sizeBytes} | ${entry.runs.map((r) => r.toFixed(1)).join(', ')} |`);
  }
  lines.push('');
  lines.push('## Notes', '');
  lines.push('- Fixtures are the real DPE XML corpus checked in at packages/open3cl-adapter/test/fixtures/; no data was invented.');
  lines.push('- The owner-provided ADEME DPE XML + DPE report will join this corpus after privacy review.');
  lines.push('- The engine logs diagnostics to stderr; stdout of the benchmark stays clean JSON.');
  lines.push('');

  mkdirSync(fileURLToPath(new URL('../../../docs/phases', import.meta.url)), { recursive: true });
  writeFileSync(reportPath, lines.join('\n'));

  process.stdout.write(
    JSON.stringify(
      {
        path: 'building->simulation',
        engineVersion,
        node: process.version,
        fixtures: fixtureFiles.length,
        samples: all.length,
        minMs: Number(min.toFixed(1)),
        p50Ms: Number(p50.toFixed(1)),
        p95Ms: Number(p95.toFixed(1)),
        maxMs: Number(max.toFixed(1)),
        budgetMs: LATENCY_BUDGET_MS,
        pass
      },
      null,
      2
    ) + '\n'
  );
  process.stdout.write(`Report written to ${reportPath}\n`);
  if (!pass) {
    process.exitCode = 1;
  }
}

await main();
