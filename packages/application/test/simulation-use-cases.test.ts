import { describe, expect, it } from 'vitest';
import {
  Building,
  createImportReport,
  createSimulationResult,
  EngineExecutionError,
  inferred,
  measured,
  SimulationJob,
  SimulationMappingError,
  type BuildingId,
  type BuildingInput,
  type DomainEvent,
  type ImportReport,
  type SimulationInputHash,
  type SimulationJobId,
  type SimulationResult,
  type SimulationResultId,
  type SimulationResultRecord,
  type SimulationResultRecordJson,
  simulationResultRecordFromJson,
  simulationResultRecordToJson
} from '@hes/domain';
import {
  BuildingNotFoundError,
  computeBuildingInputHash,
  GetSimulationHistoryUseCase,
  GetSimulationJobUseCase,
  GetSimulationUseCase,
  RunSimulationUseCase,
  estimateSimulationMs,
  SimulationAlreadyInFlightError,
  SimulationJobNotFoundError,
  SimulationJobRunner,
  SimulationNotFoundError,
  type BuildingRepository,
  type SaveBuildingInput,
  type SimulationPort,
  type SimulationRepository,
  type StoredBuilding
} from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');

function makeBuilding(id: string, overrides: Partial<BuildingInput> = {}): Building {
  const input: BuildingInput = {
    id,
    dpeNumber: measured('X', 'dpe-xml:dpe/numero_dpe', date),
    status: null,
    address: null,
    banId: null,
    banCoordinates: null,
    constructionYear: null,
    constructionPeriod: null,
    livingAreaM2: measured(50, 'dpe-xml:x', date),
    buildingLivingAreaM2: null,
    ceilingHeightM: inferred(2.5, 'inference:default-ceiling-height-2.5m', 0.4, date),
    levelCount: null,
    apartmentCount: null,
    climateZone: null,
    altitudeClass: null,
    altitudeM: null,
    thermalInertiaClass: null,
    zones: [{ id: 'zone-1', name: inferred('logement', 'inference:single-zone-from-logement', 0.9, date), areaM2: null }],
    rooms: [],
    walls: [],
    roofs: [],
    floors: [],
    windows: [],
    doors: [],
    thermalZones: [],
    heatingSystems: [],
    ventilationSystems: [],
    photovoltaicSystems: [],
    importedAt: date,
    sourceDpeXml: '<dpe/>',
    ...overrides
  };
  return Building.createForImport(input);
}

function makeReport(): ImportReport {
  return createImportReport({
    dpeNumber: 'X',
    schemaVariant: 'modele=1/version=2.3',
    generatedAt: date,
    parsedFields: [],
    inferredFields: [],
    unrecognizedFields: [],
    missingFields: []
  });
}

class FakeBuildingRepository implements BuildingRepository {
  readonly store = new Map<BuildingId, StoredBuilding>();
  async save(input: SaveBuildingInput): Promise<BuildingId> {
    this.store.set(input.building.id, { building: input.building, report: input.report });
    return input.building.id;
  }
  async findById(id: BuildingId): Promise<StoredBuilding | null> {
    return this.store.get(id) ?? null;
  }
}

class FakeSimulationRepository implements SimulationRepository {
  readonly results = new Map<SimulationResultId, SimulationResultRecord>();
  readonly jobs = new Map<SimulationJobId, SimulationJob>();
  engineSaves = 0;

  async saveResult(record: SimulationResultRecord): Promise<SimulationResultRecord> {
    const existing = [...this.results.values()].find(
      (r) => r.buildingId === record.buildingId && r.inputHash === record.inputHash
    );
    if (existing !== undefined) {
      return existing;
    }
    this.results.set(record.id, record);
    this.engineSaves += 1;
    return record;
  }
  async findResultById(id: SimulationResultId): Promise<SimulationResultRecord | null> {
    return this.results.get(id) ?? null;
  }
  async findResultsByBuildingId(buildingId: BuildingId): Promise<readonly SimulationResultRecord[]> {
    return [...this.results.values()]
      .filter((r) => r.buildingId === buildingId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async findResultByInputHash(buildingId: BuildingId, inputHash: SimulationInputHash): Promise<SimulationResultRecord | null> {
    return [...this.results.values()].find((r) => r.buildingId === buildingId && r.inputHash === inputHash) ?? null;
  }
  async saveJob(job: SimulationJob): Promise<void> {
    this.jobs.set(job.id, job);
  }
  async updateJob(job: SimulationJob): Promise<void> {
    this.jobs.set(job.id, job);
  }
  async findJobById(id: SimulationJobId): Promise<SimulationJob | null> {
    return this.jobs.get(id) ?? null;
  }
  async findActiveJobByInputHash(buildingId: BuildingId, inputHash: SimulationInputHash): Promise<SimulationJob | null> {
    return (
      [...this.jobs.values()].find(
        (j) => j.buildingId === buildingId && j.inputHash === inputHash && !j.isTerminal()
      ) ?? null
    );
  }
}

class FakeSimulationPort implements SimulationPort {
  calls = 0;
  delayMs = 0;
  error: Error | null = null;

  async simulate(_dpeXml: string): Promise<SimulationResult> {
    this.calls += 1;
    return this.produce();
  }
  async simulateBuilding(_building: Building): Promise<SimulationResult> {
    this.calls += 1;
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.error !== null) {
      throw this.error;
    }
    return this.produce();
  }
  getEngineVersion(): string {
    return '1.11.6';
  }
  private produce(): SimulationResult {
    return createSimulationResult({
      consumptionKwh: 1000,
      emissionsKg: 100,
      energyLabel: 'C',
      climateLabel: 'C',
      rawEngineOutput: {}
    });
  }
}

interface Harness {
  buildings: FakeBuildingRepository;
  simulations: FakeSimulationRepository;
  port: FakeSimulationPort;
  runner: SimulationJobRunner;
  run: RunSimulationUseCase;
  events: DomainEvent[];
}

function makeHarness(config?: { forceAsync?: boolean; autoRun?: boolean }): Harness {
  const buildings = new FakeBuildingRepository();
  const simulations = new FakeSimulationRepository();
  const port = new FakeSimulationPort();
  const events: DomainEvent[] = [];
  const runner = new SimulationJobRunner({
    buildingRepository: buildings,
    simulationRepository: simulations,
    simulation: port,
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
    now: () => new Date(date.getTime() + events.length),
    eventSink: (e) => events.push(e)
  });
  if (config?.autoRun !== true) {
    // deterministic tests: enqueue records nothing and does not execute; tests
    // drive the runner explicitly via runner.process(jobId)
    runner.enqueue = () => undefined;
  }
  const run = new RunSimulationUseCase({
    buildingRepository: buildings,
    simulationRepository: simulations,
    simulation: port,
    runner,
    config,
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
    now: () => new Date(),
    eventSink: (e) => events.push(e)
  });
  return { buildings, simulations, port, runner, run, events };
}

describe('RunSimulationUseCase', () => {
  it('runs the sync path, persists the result and emits SimulationCompleted', async () => {
    const h = makeHarness();
    const building = makeBuilding('b1');
    await h.buildings.save({ building, report: makeReport() });

    const outcome = await h.run.execute('b1');
    expect(outcome.kind).toBe('completed');
    if (outcome.kind !== 'completed') return;
    expect(outcome.record.buildingId).toBe('b1');
    expect(outcome.record.inputHash).toBe(computeBuildingInputHash(building));
    expect(outcome.record.engineVersion).toBe('1.11.6');
    expect(outcome.record.energyLabel).toBe('C');
    expect(h.port.calls).toBe(1);
    expect(h.simulations.results.size).toBe(1);
    expect(h.events.map((e) => e.type)).toContain('SimulationCompleted');
  });

  it('serves an identical re-run from the cache with zero engine calls (AC-P2-04)', async () => {
    const h = makeHarness();
    await h.buildings.save({ building: makeBuilding('b1'), report: makeReport() });
    await h.run.execute('b1');
    const second = await h.run.execute('b1');
    expect(second.kind).toBe('cached');
    if (second.kind !== 'cached') return;
    expect(h.port.calls).toBe(1);
    expect(second.record.id).toBe([...h.simulations.results.keys()][0]);
  });

  it('invalidates the cache automatically when the building changes', async () => {
    const h = makeHarness();
    await h.buildings.save({ building: makeBuilding('b1'), report: makeReport() });
    await h.run.execute('b1');
    await h.buildings.save({
      building: makeBuilding('b1', { livingAreaM2: measured(51, 'user-edit', date) }),
      report: makeReport()
    });
    const third = await h.run.execute('b1');
    expect(third.kind).toBe('completed');
    expect(h.port.calls).toBe(2);
  });

  it('throws BuildingNotFoundError (404) for an unknown building', async () => {
    const h = makeHarness();
    await expect(h.run.execute('nope')).rejects.toBeInstanceOf(BuildingNotFoundError);
  });

  it('queues a long-running simulation and the runner drives it to done', async () => {
    const h = makeHarness();
    await h.buildings.save({ building: makeBuilding('b1'), report: makeReport() });
    h.port.delayMs = 20;

    const queued = await h.run.execute('b1', { forceAsync: true });
    expect(queued.kind).toBe('queued');
    if (queued.kind !== 'queued') return;
    expect(queued.job.status).toBe('queued');

    await expect(h.run.execute('b1', { forceAsync: true })).rejects.toBeInstanceOf(SimulationAlreadyInFlightError);

    await h.runner.process(queued.job.id);
    const job = await h.simulations.findJobById(queued.job.id);
    expect(job?.status).toBe('done');
    expect(job?.resultId).not.toBeNull();
    expect(h.port.calls).toBe(1);

    const again = await h.run.execute('b1');
    expect(again.kind).toBe('cached');
    expect(h.port.calls).toBe(1);
  });

  it('enqueue (fire-and-forget) eventually completes the job', async () => {
    const h = makeHarness({ autoRun: true });
    await h.buildings.save({ building: makeBuilding('b1'), report: makeReport() });
    h.port.delayMs = 5;
    const queued = await h.run.execute('b1', { forceAsync: true });
    if (queued.kind !== 'queued') throw new Error('expected queued');
    for (let i = 0; i < 100; i += 1) {
      const job = await h.simulations.findJobById(queued.job.id);
      if (job?.isTerminal()) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const job = await h.simulations.findJobById(queued.job.id);
    expect(job?.status).toBe('done');
  });

  it('marks the job failed with the typed engine error and emits SimulationFailed', async () => {
    const h = makeHarness();
    await h.buildings.save({ building: makeBuilding('b1'), report: makeReport() });
    h.port.error = new EngineExecutionError('engine exploded');
    const queued = await h.run.execute('b1', { forceAsync: true });
    if (queued.kind !== 'queued') throw new Error('expected queued');
    await h.runner.process(queued.job.id);
    const job = await h.simulations.findJobById(queued.job.id);
    expect(job?.status).toBe('failed');
    expect(job?.error?.code).toBe('ENGINE_EXECUTION');
    expect(h.events.map((e) => e.type)).toContain('SimulationFailed');
  });

  it('propagates typed simulation errors on the sync path (422/500 mapping)', async () => {
    const h = makeHarness();
    await h.buildings.save({ building: makeBuilding('b1'), report: makeReport() });
    h.port.error = new SimulationMappingError('cannot map');
    await expect(h.run.execute('b1')).rejects.toBeInstanceOf(SimulationMappingError);
    expect(h.port.calls).toBe(1);
    expect(h.events.map((e) => e.type)).toContain('SimulationFailed');
  });

  it('estimateSimulationMs keeps corpus-sized inputs on the sync path', () => {
    const small = makeBuilding('b1', { sourceDpeXml: '<dpe/>'.repeat(100) });
    const corpusMax = makeBuilding('b2', { sourceDpeXml: 'x'.repeat(537771) });
    const huge = makeBuilding('b3', { sourceDpeXml: 'x'.repeat(5 * 1024 * 1024) });
    expect(estimateSimulationMs(small)).toBeLessThan(3000);
    expect(estimateSimulationMs(corpusMax)).toBeLessThan(3000);
    expect(estimateSimulationMs(huge)).toBeGreaterThan(3000);
  });
});

describe('read use cases', () => {
  it('history returns the building results most recent first and 404s on unknown building', async () => {
    const h = makeHarness();
    const building = makeBuilding('b1');
    await h.buildings.save({ building, report: makeReport() });
    const history = new GetSimulationHistoryUseCase({
      buildingRepository: h.buildings,
      simulationRepository: h.simulations
    });
    await expect(history.execute('nope')).rejects.toBeInstanceOf(BuildingNotFoundError);
    await h.run.execute('b1');
    const result = await history.execute('b1');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.buildingId).toBe('b1');
  });

  it('get simulation / job return the record or 404', async () => {
    const h = makeHarness();
    await h.buildings.save({ building: makeBuilding('b1'), report: makeReport() });
    const get = new GetSimulationUseCase({ simulationRepository: h.simulations });
    const getJob = new GetSimulationJobUseCase({ simulationRepository: h.simulations });
    await expect(get.execute('nope')).rejects.toBeInstanceOf(SimulationNotFoundError);
    await expect(getJob.execute('nope')).rejects.toBeInstanceOf(SimulationJobNotFoundError);

    const outcome = await h.run.execute('b1');
    if (outcome.kind !== 'completed') throw new Error('expected completed');
    const record = await get.execute(outcome.record.id);
    expect(record.id).toBe(outcome.record.id);
    expect(simulationResultRecordToJson(record).createdAt).toBe(record.createdAt.toISOString());
    const revived = simulationResultRecordFromJson(
      JSON.parse(JSON.stringify(simulationResultRecordToJson(record))) as SimulationResultRecordJson
    );
    expect(revived.inputHash).toBe(record.inputHash);
  });
});
