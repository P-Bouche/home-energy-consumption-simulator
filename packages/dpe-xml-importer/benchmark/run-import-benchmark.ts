import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DpeXmlImporter } from '../src/index.ts';

/**
 * Import benchmark (AC-P1-01 / TR-P1-04): measures the full import pipeline
 * (well-formedness check + hardened parse + schema validation + mapping to
 * the Building aggregate + report build) over the 15-fixture DPE corpus.
 * Budget: p95 < 1000 ms for files up to 5 MB.
 *
 * Run with: npm run benchmark:import
 * Writes docs/phases/P1-import-benchmark-report.md with machine specs.
 */

const fixturesDir = fileURLToPath(new URL('../../open3cl-adapter/test/fixtures', import.meta.url));
const reportPath = fileURLToPath(new URL('../../../docs/phases/P1-import-benchmark-report.md', import.meta.url));
const BUDGET_MS = 1000;
const RUNS_PER_FIXTURE = 5;
const importDate = new Date('2026-11-20T12:00:00.000Z');

interface Sample {
  fixture: string;
  sizeBytes: number;
  runsMs: number[];
  variant: string;
}

function percentileNearestRank(sorted: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank - 1))] ?? 0;
}

const importer = new DpeXmlImporter();
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.xml'))
  .sort();

const samples: Sample[] = [];
for (const fixture of fixtures) {
  const xml = readFileSync(`${fixturesDir}/${fixture}`, 'utf8');
  importer.importDpeXml(xml, importDate); // warm-up (JIT)
  const runsMs: number[] = [];
  let variant = '';
  for (let i = 0; i < RUNS_PER_FIXTURE; i += 1) {
    const t0 = performance.now();
    const { report } = importer.importDpeXml(xml, importDate);
    runsMs.push(performance.now() - t0);
    variant = report.schemaVariant;
  }
  samples.push({ fixture, sizeBytes: Buffer.byteLength(xml, 'utf8'), runsMs, variant });
}

const allRuns = samples.flatMap((s) => s.runsMs).sort((a, b) => a - b);
const p50 = percentileNearestRank(allRuns, 50);
const p95 = percentileNearestRank(allRuns, 95);
const max = allRuns[allRuns.length - 1] ?? 0;
const mean = allRuns.reduce((a, b) => a + b, 0) / allRuns.length;
const pass = p95 < BUDGET_MS;

const cpu = os.cpus()[0]?.model ?? 'unknown';
const machine = {
  cpu: `${cpu} (${os.cpus().length} vCPU)`,
  ram: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`,
  platform: `${os.platform()} ${os.arch()}`,
  node: process.version
};

const table = samples
  .map(
    (s) =>
      `| ${s.fixture} | ${s.sizeBytes} | ${s.variant} | ${s.runsMs.map((r) => r.toFixed(1)).join(', ')} |`
  )
  .join('\n');

const markdown = `# P1 Import Benchmark Report — DPE XML Import Latency

Generated: ${new Date().toISOString()}

## Machine

- CPU: ${machine.cpu}
- RAM: ${machine.ram}
- Platform: ${machine.platform}
- Node.js: ${machine.node}

## Method

- ${fixtures.length} DPE XML fixtures (P0 corpus, sizes ${Math.min(...samples.map((s) => s.sizeBytes))}–${Math.max(...samples.map((s) => s.sizeBytes))} bytes)
- 1 warm-up run per fixture, then ${RUNS_PER_FIXTURE} timed runs per fixture (${allRuns.length} samples total)
- Latency measured around the full import pipeline: well-formedness validation + hardened fast-xml-parser parse + DPE schema validation + mapping to the Building aggregate + ImportReport v1 build (no HTTP, no DB — the API adds a few ms of multipart/JSONB handling)
- Percentiles: nearest-rank; budget p95 < ${BUDGET_MS} ms (AC-P1-01, files up to 5 MB)

## Results

| Metric | Latency (ms) |
| --- | --- |
| min | ${allRuns[0]?.toFixed(1)} |
| p50 | ${p50.toFixed(1)} |
| p95 | ${p95.toFixed(1)} |
| max | ${max.toFixed(1)} |
| mean | ${mean.toFixed(1)} |

**AC-P1-01 (p95 < ${BUDGET_MS} ms): ${pass ? 'PASS' : 'FAIL'}**

## Schema variants covered

${[...new Set(samples.map((s) => s.variant))].sort().map((v) => `- ${v}`).join('\n')}

## Fixtures

| Fixture | Size (bytes) | Variant | Runs (ms) |
| --- | --- | --- | --- |
${table}

## Notes

- Fixtures are the real DPE XML corpus checked in at packages/open3cl-adapter/test/fixtures/ (from the Open3CL engine clone corpus); no data was invented.
- The owner-provided ADEME DPE XML + DPE report will join the corpus after privacy review.
- Parsing is bounded (5 MB cap), not streaming; see TR-P1-03 note in docs/phases/P1-dpe-import.md.
`;

writeFileSync(reportPath, markdown);
console.log(`p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms → ${pass ? 'PASS' : 'FAIL'} (budget ${BUDGET_MS}ms)`);
console.log(`report written to ${reportPath}`);
if (!pass) {
  process.exitCode = 1;
}
