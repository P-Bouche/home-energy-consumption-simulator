import { describe, expect, it } from 'vitest';
import {
  Building,
  CommandValidationError,
  createImportReport,
  createSimulationJob,
  createSimulationResult,
  ElementNotFoundError,
  inferred,
  InvalidCommandError,
  measured,
  Scenario,
  USER_SOURCE,
  type AuditEntry,
  type BuildingId,
  type BuildingInput,
  type DomainEvent,
  type ImportReport,
  type ScenarioId,
  type SimulationInputHash,
  type SimulationJob,
  type SimulationJobId,
  type SimulationResult,
  type SimulationResultId,
  type SimulationResultRecord
} from '@hes/domain';
import {
  ApplyScenarioUseCase,
  BuildingNotFoundError,
  CompareScenariosUseCase,
  CreateScenarioUseCase,
  DeleteScenarioUseCase,
  expectedScenarioHash,
  GetScenarioUseCase,
  ListScenariosUseCase,
  ScenarioNotFoundError,
  scenarioFork,
  SimulationAlreadyInFlightError,
  SimulateScenarioUseCase,
  StaleVersionError,
  UpdateScenarioUseCase,
  computeBuildingInputHash,
  type AuditLog,
  type BuildingRepository,
  type SaveBuildingInput,
  type ScenarioRepository,
  type ScenarioResultLink,
  type SimulationPort,
  type SimulationRepository,
  type StoredBuilding,
  type UpdateBuildingInput
} from '../src/index.ts';

const date = new Date('2026-11-21T10:00:00.000Z');
const buildingId: BuildingId = '11111111-1111-4111-8111-111111111111';

function makeBuilding(id: BuildingId): Building {
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
    walls: [
      {
        kind: 'wall',
        id: 'wall-1',
        buildingId: id,
        description: measured('Mur', 'dpe-xml:x', date),
        areaM2: measured(30, 'dpe-xml:x', date),
        uValueWm2K: measured(1.6393, 'dpe-xml:x', date),
        orientation: null,
        wallType: null,
        adjacencyType: null
      }
    ],
    roofs: [],
    floors: [],
    windows: [
      {
        kind: 'window',
        id: 'window-1',
        buildingId: id,
        description: measured('Fenêtre', 'dpe-xml:x', date),
        areaM2: measured(2, 'dpe-xml:x', date),
        uValueWm2K: measured(5.4, 'dpe-xml:x', date),
        orientation: null,
        count: measured(1, 'dpe-xml:x', date),
        solarFactorSw: null,
        glazingType: null,
        frameMaterial: null
      }
    ],
    doors: [],
    thermalZones: [],
    heatingSystems: [],
    ventilationSystems: [],
    photovoltaicSystems: [],
    importedAt: date,
    sourceDpeXml: '<dpe/>'
  };
  const b = Building.createForImport(input);
  b.pullDomainEvents();
  return b;
}

function makeReport(): ImportReport {
  return createImportReport({
    dpeNumber: 'X',
    schemaVariant: 'modele=1/version=2',
    generatedAt: date,
    parsedFields: [],
    inferredFields: [],
    unrecognizedFields: [],
    missingFields: []
  });
}

// ---------------------------------------------------------------------------
// Fakes

class FakeBuildingRepository implements BuildingRepository {
  readonly store = new Map<BuildingId, StoredBuilding>();
  updates = 0;
  failNextUpdateWithStale = false;
  auditLog: FakeAuditLog | null = null;

  async save(input: SaveBuildingInput): Promise<BuildingId> {
    this.store.set(input.building.id, { building: input.building, report: input.report });
    return input.building.id;
  }
  async findById(id: BuildingId): Promise<StoredBuilding | null> {
    return this.store.get(id) ?? null;
  }
  async update(input: UpdateBuildingInput): Promise<StoredBuilding> {
    const current = this.store.get(input.building.id);
    if (current === undefined) {
      throw new BuildingNotFoundError(input.building.id);
    }
    if (this.failNextUpdateWithStale) {
      this.failNextUpdateWithStale = false;
      throw new StaleVersionError(input.building.id, input.expectedVersion, current.building.version);
    }
    if (current.building.version !== input.expectedVersion) {
      throw new StaleVersionError(input.building.id, input.expectedVersion, current.building.version);
    }
    this.updates += 1;
    for (const entry of input.auditEntries) this.auditLog?.record(entry);
    const stored: StoredBuilding = { building: input.building, report: input.report };
    this.store.set(input.building.id, stored);
    return stored;
  }
}

class FakeSimulationRepository implements SimulationRepository {
  readonly results = new Map<SimulationResultId, SimulationResultRecord>();
  readonly jobs = new Map<SimulationJobId, SimulationJob>();

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
  async findResultsByBuildingId(id: BuildingId): Promise<readonly SimulationResultRecord[]> {
    return [...this.results.values()].filter((r) => r.buildingId === id);
  }
  async findResultByInputHash(id: BuildingId, inputHash: SimulationInputHash): Promise<SimulationResultRecord | null> {
    return [...this.results.values()].find((r) => r.buildingId === id && r.inputHash === inputHash) ?? null;
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
  async findActiveJobByInputHash(id: BuildingId, inputHash: SimulationInputHash): Promise<SimulationJob | null> {
    return (
      [...this.jobs.values()].find((j) => j.buildingId === id && j.inputHash === inputHash && !j.isTerminal()) ?? null
    );
  }
}

class FakeScenarioRepository implements ScenarioRepository {
  readonly scenarios = new Map<ScenarioId, Scenario>();
  readonly links: ScenarioResultLink[] = [];

  async save(scenario: Scenario): Promise<void> {
    this.scenarios.set(scenario.id, scenario);
  }
  async findById(id: ScenarioId): Promise<Scenario | null> {
    return this.scenarios.get(id) ?? null;
  }
  async findByBuildingId(id: BuildingId): Promise<readonly Scenario[]> {
    return [...this.scenarios.values()].filter((s) => s.buildingId === id);
  }
  async update(scenario: Scenario): Promise<void> {
    this.scenarios.set(scenario.id, scenario);
  }
  async delete(id: ScenarioId): Promise<void> {
    this.scenarios.delete(id);
    for (let i = this.links.length - 1; i >= 0; i -= 1) {
      if (this.links[i]?.scenarioId === id) this.links.splice(i, 1);
    }
  }
  async linkResult(link: ScenarioResultLink): Promise<void> {
    if (!this.links.some((l) => l.scenarioId === link.scenarioId && l.simulationId === link.simulationId)) {
      this.links.push(link);
    }
  }
  async findLatestResultId(scenarioId: ScenarioId): Promise<SimulationResultId | null> {
    const links = this.links.filter((l) => l.scenarioId === scenarioId);
    return links.length === 0 ? null : (links[links.length - 1]?.simulationId ?? null);
  }
  async findResultLinks(scenarioId: ScenarioId): Promise<readonly ScenarioResultLink[]> {
    return this.links.filter((l) => l.scenarioId === scenarioId);
  }
}

class FakeAuditLog implements AuditLog {
  readonly entries = new Map<BuildingId, AuditEntry[]>();
  record(entry: AuditEntry): void {
    const list = this.entries.get(entry.buildingId) ?? [];
    list.push(entry);
    this.entries.set(entry.buildingId, list);
  }
  async listByBuilding(id: BuildingId): Promise<readonly AuditEntry[]> {
    return this.entries.get(id) ?? [];
  }
  async latestByBuilding(id: BuildingId): Promise<AuditEntry | null> {
    const list = this.entries.get(id) ?? [];
    return list[list.length - 1] ?? null;
  }
}

/**
 * Deterministic fake engine: consumption derives from the wall U-value sum
 * (lower U → lower consumption), so forked scenarios get different,
 * predictable results. Labels: < 8000 kWh → C, else D.
 */
class FakeSimulationPort implements SimulationPort {
  calls = 0;

  async simulate(_dpeXml: string): Promise<SimulationResult> {
    this.calls += 1;
    return this.produce(makeBuilding(buildingId));
  }
  async simulateBuilding(building: Building): Promise<SimulationResult> {
    this.calls += 1;
    return this.produce(building);
  }
  getEngineVersion(): string {
    return '1.11.6';
  }
  private produce(building: Building): SimulationResult {
    const wallU = building.walls.reduce((sum, w) => sum + (w.uValueWm2K?.value ?? 0), 0);
    const consumptionKwh = Math.round((5000 + wallU * 10000) * 100) / 100;
    return createSimulationResult({
      consumptionKwh,
      emissionsKg: Math.round(consumptionKwh * 0.2 * 100) / 100,
      energyLabel: consumptionKwh < 8000 ? 'C' : 'D',
      climateLabel: consumptionKwh < 8000 ? 'C' : 'D',
      rawEngineOutput: { fake: true, wallU }
    });
  }
}

const silentLogger = { log: () => undefined, warn: () => undefined, error: () => undefined };

interface Harness {
  buildings: FakeBuildingRepository;
  simulations: FakeSimulationRepository;
  scenarios: FakeScenarioRepository;
  audit: FakeAuditLog;
  port: FakeSimulationPort;
  events: DomainEvent[];
  create: CreateScenarioUseCase;
  list: ListScenariosUseCase;
  get: GetScenarioUseCase;
  update: UpdateScenarioUseCase;
  remove: DeleteScenarioUseCase;
  simulate: SimulateScenarioUseCase;
  compare: CompareScenariosUseCase;
  apply: ApplyScenarioUseCase;
}

function makeHarness(): Harness {
  const buildings = new FakeBuildingRepository();
  const simulations = new FakeSimulationRepository();
  const scenarios = new FakeScenarioRepository();
  const audit = new FakeAuditLog();
  buildings.auditLog = audit;
  const port = new FakeSimulationPort();
  const events: DomainEvent[] = [];
  const eventSink = (e: DomainEvent) => events.push(e);
  const now = () => date;
  const deps = {
    buildingRepository: buildings,
    scenarioRepository: scenarios,
    simulationRepository: simulations,
    simulation: port,
    now,
    eventSink,
    logger: silentLogger
  };
  return {
    buildings,
    simulations,
    scenarios,
    audit,
    port,
    events,
    create: new CreateScenarioUseCase(deps),
    list: new ListScenariosUseCase(deps),
    get: new GetScenarioUseCase(deps),
    update: new UpdateScenarioUseCase(deps),
    remove: new DeleteScenarioUseCase(deps),
    simulate: new SimulateScenarioUseCase(deps),
    compare: new CompareScenariosUseCase(deps),
    apply: new ApplyScenarioUseCase(deps)
  };
}

async function seedBuilding(h: Harness): Promise<void> {
  await h.buildings.save({ building: makeBuilding(buildingId), report: makeReport() });
}

// Raw command JSON as sent by clients (buildingId is stamped server-side).
const wallInsulation = [{ type: 'building.wall.update.v1', wallId: 'wall-1', uValueWm2K: 0.2 }];
const windowReplacement = [{ type: 'building.window.update.v1', windowId: 'window-1', uValueWm2K: 1.1 }];

// ---------------------------------------------------------------------------

describe('P5 scenario use cases (P4 command vocabulary)', () => {
  it('create: 404 on unknown building; creates with baselineVersion + ScenarioCreated; validates the change-set via fork', async () => {
    const h = makeHarness();
    await expect(
      h.create.execute('99999999-9999-4999-8999-999999999999', { name: 'x', commands: wallInsulation })
    ).rejects.toBeInstanceOf(BuildingNotFoundError);

    await seedBuilding(h);
    const { scenario, events } = await h.create.execute(buildingId, {
      name: 'Isolation murs',
      description: 'U=0.2',
      commands: wallInsulation
    });
    expect(scenario.buildingId).toBe(buildingId);
    expect(scenario.baselineVersion).toBe(0); // building version at import is 0
    expect(scenario.commands[0]?.type).toBe('building.wall.update.v1');
    expect(scenario.commands[0]).toMatchObject({ buildingId, wallId: 'wall-1', uValueWm2K: 0.2 });
    expect(events.map((e) => e.type)).toContain('ScenarioCreated');

    await expect(
      h.create.execute(buildingId, { name: 'bad', commands: [{ type: 'Nope', version: 1 }] })
    ).rejects.toBeInstanceOf(InvalidCommandError);
    await expect(h.create.execute(buildingId, { name: 'empty', commands: [] })).rejects.toBeInstanceOf(
      InvalidCommandError
    );
    await expect(
      h.create.execute(buildingId, { name: 'bad2', commands: [{ type: 'building.wall.update.v1', wallId: 'wall-99', uValueWm2K: 0.2 }] })
    ).rejects.toBeInstanceOf(ElementNotFoundError);
    await expect(
      h.create.execute(buildingId, { name: 'bad3', commands: [{ type: 'building.wall.update.v1', wallId: 'wall-1', uValueWm2K: -1 }] })
    ).rejects.toBeInstanceOf(CommandValidationError);
    await expect(
      h.create.execute(buildingId, {
        name: 'bad4',
        commands: [{ type: 'building.wall.update.v1', buildingId: '00000000-0000-4000-8000-000000000000', wallId: 'wall-1', uValueWm2K: 0.2 }]
      })
    ).rejects.toBeInstanceOf(CommandValidationError); // fork rejects a command for another building
  });

  it('list/get/update/delete: CRUD semantics, 404s, delete keeps building and results', async () => {
    const h = makeHarness();
    await seedBuilding(h);
    const { scenario } = await h.create.execute(buildingId, { name: 'S1', commands: wallInsulation });
    const { scenario: s2 } = await h.create.execute(buildingId, { name: 'S2', commands: windowReplacement });

    expect((await h.list.execute(buildingId)).map((s) => s.name)).toEqual(['S1', 'S2']);
    expect((await h.get.execute(scenario.id)).name).toBe('S1');
    await expect(h.get.execute('88888888-8888-4888-8888-888888888888')).rejects.toBeInstanceOf(ScenarioNotFoundError);
    await expect(h.list.execute('77777777-7777-4777-8777-777777777777')).rejects.toBeInstanceOf(BuildingNotFoundError);

    const updated = await h.update.execute(scenario.id, { name: 'S1-renamed', commands: windowReplacement });
    expect(updated.name).toBe('S1-renamed');
    expect(updated.commands[0]?.type).toBe('building.window.update.v1');
    // PATCH re-validates the change-set against the building
    await expect(
      h.update.execute(scenario.id, { commands: [{ type: 'building.wall.update.v1', wallId: 'wall-404', uValueWm2K: 0.2 }] })
    ).rejects.toBeInstanceOf(ElementNotFoundError);
    await expect(h.update.execute('66666666-6666-4666-8666-666666666666', { name: 'x' })).rejects.toBeInstanceOf(
      ScenarioNotFoundError
    );

    // simulate S2 so a linked result exists, then delete S2
    await h.simulate.execute(s2.id);
    expect(h.simulations.results.size).toBe(1);
    await h.remove.execute(s2.id);
    await expect(h.get.execute(s2.id)).rejects.toBeInstanceOf(ScenarioNotFoundError);
    expect(h.scenarios.links).toHaveLength(0); // links removed
    expect(h.simulations.results.size).toBe(1); // result itself kept (shared cache)
    expect(await h.buildings.findById(buildingId)).not.toBeNull(); // building intact (AC-P5-04)
    await expect(h.remove.execute(s2.id)).rejects.toBeInstanceOf(ScenarioNotFoundError);
  });

  it('simulate: persists + links the result, emits ScenarioSimulated; second run is a cache hit (engine counter unchanged)', async () => {
    const h = makeHarness();
    await seedBuilding(h);
    const { scenario } = await h.create.execute(buildingId, { name: 'S1', commands: wallInsulation });

    const first = await h.simulate.execute(scenario.id);
    expect(first.outcome.kind).toBe('completed');
    expect(h.port.calls).toBe(1);
    const link = h.scenarios.links.find((l) => l.scenarioId === scenario.id);
    expect(link?.simulationId).toBe(first.outcome.record.id);
    expect(first.outcome.record.inputHash).toBe(
      expectedScenarioHash((await h.buildings.findById(buildingId))!.building, scenario, date)
    );
    expect(h.events.map((e) => e.type)).toContain('ScenarioSimulated');

    const second = await h.simulate.execute(scenario.id);
    expect(second.outcome.kind).toBe('cached');
    expect(second.outcome.record.id).toBe(first.outcome.record.id);
    expect(h.port.calls).toBe(1); // engine not re-run

    await expect(h.simulate.execute('55555555-5555-4555-8555-555555555555')).rejects.toBeInstanceOf(ScenarioNotFoundError);
  });

  it('simulate: 409 when the identical input hash is already in flight', async () => {
    const h = makeHarness();
    await seedBuilding(h);
    const { scenario } = await h.create.execute(buildingId, { name: 'S1', commands: wallInsulation });
    const stored = (await h.buildings.findById(buildingId))!;
    const hash = computeBuildingInputHash(scenarioFork(stored.building, scenario, date));
    await h.simulations.saveJob(
      createSimulationJob({ id: '66666666-6666-4666-8666-666666666666', buildingId, inputHash: hash, createdAt: date })
    );
    await expect(h.simulate.execute(scenario.id)).rejects.toBeInstanceOf(SimulationAlreadyInFlightError);
    expect(h.port.calls).toBe(0);
  });

  it('compare: deltas match independent recomputation, ranking + label change correct; cached re-compare < 1 s with engine counter unchanged', async () => {
    const h = makeHarness();
    await seedBuilding(h);
    const s1 = (await h.create.execute(buildingId, { name: 'Walls', commands: wallInsulation })).scenario;
    const s2 = (await h.create.execute(buildingId, { name: 'Windows', commands: windowReplacement })).scenario;

    const first = await h.compare.execute(buildingId);
    expect([...first.simulatedNow].sort()).toEqual([s1.id, s2.id].sort());
    expect(h.port.calls).toBe(3); // baseline + 2 forks

    const baseline = first.comparison.baseline;
    expect(baseline.consumptionKwh).toBe(21393); // 5000 + 1.6393*10000
    const entryWalls = first.comparison.entries.find((e) => e.scenarioId === s1.id)!;
    const entryWindows = first.comparison.entries.find((e) => e.scenarioId === s2.id)!;
    // independent recomputation of the deltas
    expect(entryWalls.deltaKwh).toBeCloseTo(entryWalls.result.consumptionKwh - baseline.consumptionKwh, 6);
    expect(entryWalls.deltaKgCo2).toBeCloseTo(entryWalls.result.emissionsKg - baseline.emissionsKg, 6);
    expect(entryWalls.result.consumptionKwh).toBe(7000); // 5000 + 0.2*10000
    expect(entryWindows.result.consumptionKwh).toBe(21393); // window U does not enter the fake's wall sum
    expect(entryWalls.baselineVersion).toBe(0); // surfaced, informational
    // wall insulation improves the label D → C (AC-P5-02 at domain level)
    expect(entryWalls.energyLabelChange).toEqual({ from: 'D', to: 'C' });
    expect(entryWindows.energyLabelChange).toBeNull();
    // ranking: most kWh saved first
    expect(first.comparison.entries[0]?.scenarioId).toBe(s1.id);
    expect(first.comparison.entries[0]?.rank).toBe(1);

    // second compare: fully cached, fast, engine not called again (AC-P5-01 / FR-P5-04)
    const callsBefore = h.port.calls;
    const start = performance.now();
    const second = await h.compare.execute(buildingId);
    const elapsedMs = performance.now() - start;
    expect(second.simulatedNow).toHaveLength(0);
    expect(h.port.calls).toBe(callsBefore);
    expect(elapsedMs).toBeLessThan(1000);
    expect(second.comparison.entries.map((e) => e.deltaKwh)).toEqual(first.comparison.entries.map((e) => e.deltaKwh));

    // subset selection + 404 on unknown requested id / unknown building
    const subset = await h.compare.execute(buildingId, { scenarioIds: [s2.id] });
    expect(subset.comparison.entries).toHaveLength(1);
    await expect(
      h.compare.execute(buildingId, { scenarioIds: ['44444444-4444-4444-8444-444444444444'] })
    ).rejects.toBeInstanceOf(ScenarioNotFoundError);
    await expect(h.compare.execute('33333333-3333-4333-8333-333333333333')).rejects.toBeInstanceOf(BuildingNotFoundError);
  });

  it('compare: STALE after PATCH — a scenario whose commands changed is re-simulated inline by hash verification, not served stale', async () => {
    const h = makeHarness();
    await seedBuilding(h);
    const { scenario } = await h.create.execute(buildingId, { name: 'Walls', commands: wallInsulation });
    await h.simulate.execute(scenario.id); // linked result for U=0.2
    await h.compare.execute(buildingId); // warm the baseline cache (s1's link is current at this point)
    const callsBefore = h.port.calls;
    const staleLink = h.scenarios.links.find((l) => l.scenarioId === scenario.id)!;
    const staleEntryHash = h.simulations.results.get(staleLink.simulationId)!.inputHash;

    // PATCH the scenario with different commands (U=0.4 → 9000 kWh)
    const patched = await h.update.execute(scenario.id, {
      commands: [{ type: 'building.wall.update.v1', wallId: 'wall-1', uValueWm2K: 0.4 }]
    });
    expect(patched.commands[0]).toMatchObject({ uValueWm2K: 0.4 });

    const comparison = await h.compare.execute(buildingId);
    expect(comparison.simulatedNow).toEqual([scenario.id]); // hash mismatch detected → re-simulated
    expect(h.port.calls).toBe(callsBefore + 1); // one extra engine run for the new fork
    const entry = comparison.comparison.entries.find((e) => e.scenarioId === scenario.id)!;
    expect(entry.result.consumptionKwh).toBe(9000); // 5000 + 0.4*10000, NOT the stale 7000
    expect(entry.result.inputHash).not.toBe(staleEntryHash);
    const stored = (await h.buildings.findById(buildingId))!;
    expect(entry.result.inputHash).toBe(expectedScenarioHash(stored.building, patched, date));
    expect(entry.deltaKwh).toBeCloseTo(9000 - 21393, 6);

    // the fresh result is now linked and the next compare is fully cached again
    const again = await h.compare.execute(buildingId);
    expect(again.simulatedNow).toHaveLength(0);
    expect(h.port.calls).toBe(callsBefore + 1);
  });

  it('compare: STALE after apply — scenarios forked over the old baseline are hash-verified and re-simulated against the new one', async () => {
    const h = makeHarness();
    await seedBuilding(h);
    const s1 = (await h.create.execute(buildingId, { name: 'Walls', commands: wallInsulation })).scenario;
    const s2 = (await h.create.execute(buildingId, { name: 'Windows', commands: windowReplacement })).scenario;
    await h.simulate.execute(s1.id);
    await h.simulate.execute(s2.id); // s2 linked against baseline v0 (wall U 1.6393)
    const callsBefore = h.port.calls;

    await h.apply.execute(s1.id); // building becomes v1, wall U = 0.2 (user)

    const comparison = await h.compare.execute(buildingId);
    // baseline is the applied state (cache hit from the apply re-simulation)
    expect(comparison.comparison.baseline.consumptionKwh).toBe(7000);
    // s2's linked result was computed over the OLD building → hash mismatch → re-simulated
    expect(comparison.simulatedNow).toEqual([s2.id]);
    expect(h.port.calls).toBe(callsBefore + 1);
    const stored = (await h.buildings.findById(buildingId))!;
    const entryS2 = comparison.comparison.entries.find((e) => e.scenarioId === s2.id)!;
    expect(entryS2.result.inputHash).toBe(expectedScenarioHash(stored.building, s2, date));
    // s1 forks to the same content as the applied state → its linked result is still current
    const entryS1 = comparison.comparison.entries.find((e) => e.scenarioId === s1.id)!;
    expect(entryS1.result.consumptionKwh).toBe(7000);
    expect(comparison.simulatedNow).not.toContain(s1.id);
  });

  it('apply: commands applied one by one in ONE transaction — version +1 per command, one audit row per command, baseline re-simulated, ScenarioApplied emitted', async () => {
    const h = makeHarness();
    await seedBuilding(h);
    const twoCommands = [
      { type: 'building.wall.update.v1', wallId: 'wall-1', uValueWm2K: 0.2 },
      { type: 'building.window.update.v1', windowId: 'window-1', uValueWm2K: 1.1 }
    ];
    const { scenario } = await h.create.execute(buildingId, { name: 'Walls+Windows', commands: twoCommands });
    await h.simulate.execute(scenario.id); // scenario result cached (hash = applied content)
    const callsBefore = h.port.calls;

    const applied = await h.apply.execute(scenario.id, { userId: 'user-42' });
    expect(applied.previousVersion).toBe(0);
    expect(applied.newVersion).toBe(2); // +1 per command
    expect(h.buildings.updates).toBe(1); // single transaction
    expect(applied.auditEntries).toHaveLength(2); // one per command
    expect(applied.auditEntries.map((e) => e.commandType)).toEqual([
      'building.wall.update.v1',
      'building.window.update.v1'
    ]);
    expect(applied.auditEntries.map((e) => e.version)).toEqual([1, 2]);
    expect(applied.auditEntries.every((e) => e.userId === 'user-42')).toBe(true);
    expect(h.events.map((e) => e.type)).toContain('ScenarioApplied');

    // building state replaced by the forked state, with user confidence metadata
    const stored = await h.buildings.findById(buildingId);
    expect(stored?.building.version).toBe(2);
    expect(stored?.building.walls[0]?.uValueWm2K).toMatchObject({ value: 0.2, source: USER_SOURCE, confidence: 1 });
    expect(stored?.building.windows[0]?.uValueWm2K).toMatchObject({ value: 1.1, source: USER_SOURCE, confidence: 1 });

    // audit rows landed with the update (same unit of work)
    const auditEntries = await h.audit.listByBuilding(buildingId);
    expect(auditEntries).toHaveLength(2);
    expect(auditEntries[0]?.commandType).toBe('building.wall.update.v1');

    // baseline re-simulated on the new state: same content as the scenario
    // fork → shared cache serves it (engine counter unchanged)
    expect(h.port.calls).toBe(callsBefore);
    expect(applied.simulation.record.consumptionKwh).toBe(7000);

    await expect(h.apply.execute('22222222-2222-4222-8222-222222222222')).rejects.toBeInstanceOf(ScenarioNotFoundError);
  });

  it('apply: stale version → 409 StaleVersionError, nothing written (no state change, no audit rows)', async () => {
    const h = makeHarness();
    await seedBuilding(h);
    const { scenario } = await h.create.execute(buildingId, { name: 'Walls', commands: wallInsulation });
    h.buildings.failNextUpdateWithStale = true;
    await expect(h.apply.execute(scenario.id)).rejects.toBeInstanceOf(StaleVersionError);
    const stored = await h.buildings.findById(buildingId);
    expect(stored?.building.version).toBe(0); // unchanged
    expect(stored?.building.walls[0]?.uValueWm2K?.value).toBe(1.6393);
    expect(await h.audit.listByBuilding(buildingId)).toHaveLength(0); // no audit rows for a rejected edit
  });
});
