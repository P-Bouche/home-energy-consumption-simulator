import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import { geometryToJson, ReconstructionService, type Building } from '@hes/domain';
import { geometryToMeshBuffers } from '../src/index.ts';

/**
 * Geometry reconstruction benchmark (AC-P3-01 / TR-P3-01): measures the full
 * server-side P3 pipeline per request — `ReconstructionService.reconstruct`
 * + `geometryToJson` (API payload) + `geometryToMeshBuffers` — over the
 * 15-fixture DPE corpus imported by the P1 importer.
 * Budget: p95 < 2000 ms (typical dwellings ≤ 300 m²).
 *
 * Run with: npm run benchmark:geometry
 * Writes docs/phases/P3-geometry-benchmark-report.md with machine specs.
 */

const fixturesDir = fileURLToPath(new URL('../../open3cl-adapter/test/fixtures', import.meta.url));
const reportPath = fileURLToPath(new URL('../../../docs/phases/P3-geometry-benchmark-report.md', import.meta.url));
const BUDGET_MS = 2000;
const RUNS_PER_FIXTURE = 5;
const importDate = new Date('2026-11-20T12:00:00.000Z');

interface Sample {
  fixture: string;
  sizeBytes: number;
  elements: number;
  vertices: number;
  meshHash: string;
  runsMs: number[];
}

function percentileNearestRank(sorted: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank - 1))] ?? 0;
}

const importer = new DpeXmlImporter();
const service = new ReconstructionService();
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.xml'))
  .sort();

const samples: Sample[] = [];
const buildings: Building[] = [];
for (const fixture of fixtures) {
  const xml = readFileSync(`${fixturesDir}/${fixture}`, 'utf8');
  const { building } = importer.importDpeXml(xml, importDate);
  buildings.push(building);
  service.reconstruct(building); // warm-up (JIT)
  const runsMs: number[] = [];
  let sample: Sample = { fixture, sizeBytes: Buffer.byteLength(xml, 'utf8'), elements: 0, vertices: 0, meshHash: '', runsMs };
  for (let i = 0; i < RUNS_PER_FIXTURE; i += 1) {
    const t0 = performance.now();
    const geometry = service.reconstruct(building);
    const json = geometryToJson(geometry);
    const buffers = geometryToMeshBuffers(geometry);
    runsMs.push(performance.now() - t0);
    sample = {
      fixture,
      sizeBytes: Buffer.byteLength(xml, 'utf8'),
      elements: geometry.elements.length,
      vertices: buffers.positions.length / 3,
      meshHash: geometry.meshHash,
      runsMs
    };
    void json;
  }
  samples.push(sample);
}

const allRuns = samples.flatMap((s) => s.runsMs).sort((a, b) => a - b);
const p50 = percentileNearestRank(allRuns, 50);
const p95 = percentileNearestRank(allRuns, 95);
const max = allRuns[allRuns.length - 1] ?? 0;
const mean = allRuns.reduce((a, b) => a + b, 0) / allRuns.length;
const pass = p95 < BUDGET_MS;

const cpu = os.cpus()[0]?.model ?? 'unknown';
const machine = `${cpu}, ${os.cpus().length} vCPU @ ${(os.cpus()[0]?.speed ?? 0) / 1000} GHz, ${(os.totalmem() / 2 ** 30).toFixed(1)} GB RAM, ${os.platform()} ${os.arch()}`;

const rows = samples
  .map(
    (s) =>
      `| ${s.fixture} | ${s.sizeBytes} | ${s.elements} | ${s.vertices} | ${s.meshHash} | ${Math.min(...s.runsMs).toFixed(2)} | ${Math.max(...s.runsMs).toFixed(2)} |`
  )
  .join('\n');

const markdown = `# P3 Geometry Reconstruction Benchmark Report

- Date: ${new Date().toISOString().slice(0, 10)}
- Machine: ${machine}
- Node: ${process.version} (budget measured on the .nvmrc runtime in CI)
- Corpus: ${fixtures.length} DPE fixtures (packages/open3cl-adapter/test/fixtures), imported by the P1 importer, then reconstructed
- Pipeline per sample: import is excluded; measured = ReconstructionService.reconstruct + geometryToJson + geometryToMeshBuffers (the work of GET /buildings/:id/geometry)
- Samples: ${RUNS_PER_FIXTURE} runs per fixture after 1 warm-up (${allRuns.length} timed runs)
- Percentiles: nearest-rank; budget p95 < ${BUDGET_MS} ms (AC-P3-01 / TR-P3-01)

## Results

| Metric | Value |
| --- | --- |
| p50 | ${p50.toFixed(2)} ms |
| p95 | ${p95.toFixed(2)} ms |
| max | ${max.toFixed(2)} ms |
| mean | ${mean.toFixed(2)} ms |

**AC-P3-01 (p95 < ${BUDGET_MS} ms): ${pass ? 'PASS' : 'FAIL'}**

## Per-fixture

| Fixture | XML bytes | elements | vertices | mesh hash | min ms | max ms |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

## Notes

- Reconstruction is pure CPU over small inputs (a dwelling ≤ 300 m² has tens of elements); the budget has orders of magnitude of headroom on the reference machine.
- Geometry is deterministic: the mesh hash per fixture is stable across runs (asserted in unit tests: same building → same hash).
`;

writeFileSync(reportPath, markdown);
console.log(`p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms → ${pass ? 'PASS' : 'FAIL'} (budget ${BUDGET_MS}ms)`);
console.log(`report written to ${reportPath}`);
if (!pass) {
  process.exitCode = 1;
}
