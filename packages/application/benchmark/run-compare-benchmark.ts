import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import {
  createSimulationResult,
  Scenario,
  type Building,
  type BuildingCommand,
  type BuildingId,
  type ScenarioId,
  type SimulationInputHash,
  type SimulationJob,
  type SimulationJobId,
  type SimulationResult,
  type SimulationResultId,
  type SimulationResultRecord
} from '@hes/domain';
import {
  CompareScenariosUseCase,
  type BuildingRepository,
  type SaveBuildingInput,
  type ScenarioRepository,
  type ScenarioResultLink,
  type SimulationPort,
  type SimulationRepository,
  type StoredBuilding,
  type UpdateBuildingInput
} from '../src/index.ts';

/**
 * AC-P5-01 / TR-P5-03 benchmark: scenario comparison p95 < 1 s for ≤ 10
 * scenarios when all results are cached (FR-P5-04).
 *
 * Setup: one real corpus fixture imported into a Building, 10 scenarios
 * (P4 wall-update commands with distinct U-values) simulated once through the
 * shared inline pipeline (fake port + real cache semantics), then the
 * CompareScenariosUseCase is timed over 100 iterations with a warm cache —
 * including its hash-verification staleness oracle, which must not trigger a
 * re-simulation when nothing changed. The engine call counter must not move
 * during the timed phase.
 */

const COMPARE_BUDGET_MS = 1000;
const SCENARIO_COUNT = 10;
const ITERATIONS = 100;

const fixturePath = fileURLToPath(
  new URL('../../open3cl-adapter/test/fixtures/2238E0097309E.xml', import.meta.url)
);
const reportPath = fileURLToPath(
  new URL('../../../docs/phases/P5-comparison-benchmark-report.md', import.meta.url)
);
const importDate = new Date('2026-11-21T10:00:00.000Z');

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] as number;
}

class MemBuildingRepository implements BuildingRepository {
  private readonly store = new Map<BuildingId, StoredBuilding>();
  async save(input: SaveBuildingInput): Promise<BuildingId> {
    this.store.set(input.building.id, { building: input.building, report: input.report });
    return input.building.id;
  }
  async findById(id: BuildingId): Promise<StoredBuilding | null> {
    return this.store.get(id) ?? null;
  }
  async update(input: UpdateBuildingInput): Promise<StoredBuilding> {
    const stored: StoredBuilding = { building: input.building, report: input.report };
    this.store.set(input.building.id, stored);
    return stored;
  }
}

class MemSimulationRepository implements SimulationRepository {
  readonly results = new Map<SimulationResultId, SimulationResultRecord>();
  async saveResult(record: SimulationResultRecord): Promise<SimulationResultRecord> {
    const existing = [...this.results.values()].find(
      (r) => r.buildingId === record.buildingId && r.inputHash === record.inputHash
    );
    if (existing !== undefined) return existing;
    this.results.set(record.id, record);
    return record;
  }
  async findResultById(id: SimulationResultId): Promise<SimulationResultRecord | null> {
    return this.results.get(id) ?? null;
  }
  async findResultsByBuildingId(buildingId: BuildingId): Promise<readonly SimulationResultRecord[]> {
    return [...this.results.values()].filter((r) => r.buildingId === buildingId);
  }
  async findResultByInputHash(buildingId: BuildingId, inputHash: SimulationInputHash): Promise<SimulationResultRecord | null> {
    return [...this.results.values()].find((r) => r.buildingId === buildingId && r.inputHash === inputHash) ?? null;
  }
  async saveJob(_job: SimulationJob): Promise<void> {}
  async updateJob(_job: SimulationJob): Promise<void> {}
  async findJobById(_id: SimulationJobId): Promise<SimulationJob | null> {
    return null;
  }
  async findActiveJobByInputHash(): Promise<SimulationJob | null> {
    return null;
  }
}

class MemScenarioRepository implements ScenarioRepository {
  readonly scenarios = new Map<ScenarioId, Scenario>();
  readonly links: ScenarioResultLink[] = [];
  async save(scenario: Scenario): Promise<void> {
    this.scenarios.set(scenario.id, scenario);
  }
  async findById(id: ScenarioId): Promise<Scenario | null> {
    return this.scenarios.get(id) ?? null;
  }
  async findByBuildingId(buildingId: BuildingId): Promise<readonly Scenario[]> {
    return [...this.scenarios.values()].filter((s) => s.buildingId === buildingId);
  }
  async update(scenario: Scenario): Promise<void> {
    this.scenarios.set(scenario.id, scenario);
  }
  async delete(id: ScenarioId): Promise<void> {
    this.scenarios.delete(id);
  }
  async linkResult(link: ScenarioResultLink): Promise<void> {
    this.links.push(link);
  }
  async findLatestResultId(scenarioId: ScenarioId): Promise<SimulationResultId | null> {
    const links = this.links.filter((l) => l.scenarioId === scenarioId);
    return links.length === 0 ? null : (links[links.length - 1]?.simulationId ?? null);
  }
  async findResultLinks(scenarioId: ScenarioId): Promise<readonly ScenarioResultLink[]> {
    return this.links.filter((l) => l.scenarioId === scenarioId);
  }
}

/** Fake engine: deterministic content-derived result + call counter. */
class FakePort implements SimulationPort {
  calls = 0;
  async simulate(_dpeXml: string): Promise<SimulationResult> {
    this.calls += 1;
    return this.produce(1.6393);
  }
  async simulateBuilding(building: Building): Promise<SimulationResult> {
    this.calls += 1;
    const wallU = building.walls.reduce((s, w) => s + (w.uValueWm2K?.value ?? 0), 0);
    return this.produce(wallU);
  }
  getEngineVersion(): string {
    return '1.11.6';
  }
  private produce(wallU: number): SimulationResult {
    const consumptionKwh = Math.round((5000 + wallU * 10000) * 100) / 100;
    return createSimulationResult({
      consumptionKwh,
      emissionsKg: Math.round(consumptionKwh * 0.2 * 100) / 100,
      energyLabel: consumptionKwh < 8000 ? 'C' : 'D',
      climateLabel: consumptionKwh < 8000 ? 'C' : 'D',
      rawEngineOutput: { benchmark: true }
    });
  }
}

async function main(): Promise<void> {
  const xml = readFileSync(fixturePath, 'utf8');
  const importer = new DpeXmlImporter();
  const { building, report: importReport } = importer.importDpeXml(xml, importDate);
  building.pullDomainEvents();

  const buildings = new MemBuildingRepository();
  const simulations = new MemSimulationRepository();
  const scenarios = new MemScenarioRepository();
  const port = new FakePort();
  await buildings.save({ building, report: importReport });

  // 10 scenarios: P4 wall-update commands with distinct U-values.
  for (let i = 0; i < SCENARIO_COUNT; i += 1) {
    const commands: BuildingCommand[] = [
      {
        type: 'building.wall.update.v1',
        buildingId: building.id,
        wallId: 'wall-1',
        uValueWm2K: 0.1 + i * 0.05
      }
    ];
    await scenarios.save(
      Scenario.create({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
        buildingId: building.id,
        name: `Scénario ${i + 1}`,
        description: '',
        commands,
        baselineVersion: building.version,
        createdAt: importDate
      })
    );
  }

  const compare = new CompareScenariosUseCase({
    buildingRepository: buildings,
    scenarioRepository: scenarios,
    simulationRepository: simulations,
    simulation: port,
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
    now: () => new Date()
  });

  // Warm-up: first compare simulates baseline + all 10 scenarios (cold cache).
  const warm = await compare.execute(building.id);
  if (warm.simulatedNow.length !== SCENARIO_COUNT) {
    throw new Error(`expected ${SCENARIO_COUNT} scenario simulations on the cold run, got ${warm.simulatedNow.length}`);
  }
  const callsAfterWarmup = port.calls;

  // Timed phase: 100 cached compares (hash verification must be a no-op here).
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const start = performance.now();
    const result = await compare.execute(building.id);
    samples.push(performance.now() - start);
    if (result.comparison.entries.length !== SCENARIO_COUNT) {
      throw new Error('comparison must return all 10 scenario entries');
    }
    if (result.simulatedNow.length !== 0) {
      throw new Error('cached compare must not simulate anything');
    }
  }
  if (port.calls !== callsAfterWarmup) {
    throw new Error(`engine call counter moved during cached compares: ${callsAfterWarmup} -> ${port.calls}`);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const max = sorted[sorted.length - 1] as number;

  const machine = `${platform()} ${arch()}, ${cpus().length} vCPU, ${(totalmem() / 1024 ** 3).toFixed(1)} GB RAM`;
  const report = `# P5 — Scenario comparison benchmark (AC-P5-01 / TR-P5-03)

| Field | Value |
| --- | --- |
| Budget | comparison p95 < ${COMPARE_BUDGET_MS} ms for ≤ ${SCENARIO_COUNT} scenarios, all results cached (FR-P5-04) |
| Measured on | Node ${process.version}, ${machine} |
| Date | ${new Date().toISOString()} |
| Fixture | packages/open3cl-adapter/test/fixtures/2238E0097309E.xml (real DPE import) |
| Scenarios | ${SCENARIO_COUNT} (P4 \`building.wall.update.v1\` commands, distinct U-values) |
| Iterations | ${ITERATIONS} cached compares of baseline + ${SCENARIO_COUNT} scenarios |
| Engine calls during timed phase | 0 (input-hash cache + hash-verification staleness oracle; counter asserted unchanged) |

| Metric | ms |
| --- | --- |
| p50 | ${p50.toFixed(3)} |
| p95 | ${p95.toFixed(3)} |
| max | ${max.toFixed(3)} |

Result: ${p95 < COMPARE_BUDGET_MS ? `PASS (p95 ${p95.toFixed(3)} ms < ${COMPARE_BUDGET_MS} ms)` : `FAIL (p95 ${p95.toFixed(3)} ms >= ${COMPARE_BUDGET_MS} ms)`}

The comparison itself is pure domain computation (ComparisonService over cached SimulationResultRecords); the timed phase performs no engine call and no I/O beyond the in-memory repositories.
`;
  mkdirSync(fileURLToPath(new URL('../../../docs/phases', import.meta.url)), { recursive: true });
  writeFileSync(reportPath, report);
  console.log(report);
  if (p95 >= COMPARE_BUDGET_MS) {
    console.error(`FAIL: comparison p95 ${p95.toFixed(3)} ms >= ${COMPARE_BUDGET_MS} ms`);
    process.exit(1);
  }
}

void main();
