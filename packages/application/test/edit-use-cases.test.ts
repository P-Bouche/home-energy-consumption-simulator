import { describe, expect, it } from 'vitest';
import {
  Building,
  CommandValidationError,
  createImportReport,
  createSimulationResult,
  ElementNotFoundError,
  inferred,
  measured,
  type AuditEntry,
  type BuildingId,
  type BuildingInput,
  type ImportReport,
  type SimulationInputHash,
  type SimulationJob,
  type SimulationJobId,
  type SimulationResult,
  type SimulationResultId,
  type SimulationResultRecord,
  type UpdateWallCommand
} from '@hes/domain';
import {
  BuildingNotFoundError,
  computeBuildingInputHash,
  EditBuildingUseCase,
  GetAuditLogUseCase,
  NothingToUndoError,
  RunSimulationUseCase,
  type SimulationJobRunner,
  StaleVersionError,
  UndoLastChangeUseCase,
  type AuditLog,
  type BuildingRepository,
  type SaveBuildingInput,
  type SimulationPort,
  type SimulationRepository,
  type StoredBuilding,
  type UpdateBuildingInput
} from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');
const BUILDING_ID = '11111111-1111-4111-8111-111111111111';

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
    walls: [
      {
        kind: 'wall',
        id: 'wall-1',
        buildingId: id,
        description: measured('Mur', 'dpe-xml:x', date),
        areaM2: measured(30, 'dpe-xml:x', date),
        uValueWm2K: measured(1.64, 'dpe-xml:x', date),
        orientation: null,
        wallType: null,
        adjacencyType: null
      }
    ],
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
  const b = Building.createForImport(input);
  b.pullDomainEvents();
  return b;
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
    for (const e of input.auditEntries) this.auditLog?.record(e);
    const stored: StoredBuilding = { building: input.building, report: input.report };
    this.store.set(input.building.id, stored);
    return stored;
  }
}

class FakeAuditLog implements AuditLog {
  readonly entries = new Map<BuildingId, AuditEntry[]>();
  record(entry: AuditEntry): void {
    const list = this.entries.get(entry.buildingId) ?? [];
    list.push(entry);
    this.entries.set(entry.buildingId, list);
  }
  async listByBuilding(buildingId: BuildingId): Promise<readonly AuditEntry[]> {
    return this.entries.get(buildingId) ?? [];
  }
  async latestByBuilding(buildingId: BuildingId): Promise<AuditEntry | null> {
    const list = this.entries.get(buildingId) ?? [];
    return list[list.length - 1] ?? null;
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
  async findResultsByBuildingId(buildingId: BuildingId): Promise<readonly SimulationResultRecord[]> {
    return [...this.results.values()].filter((r) => r.buildingId === buildingId);
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
  async findActiveJobByInputHash(): Promise<SimulationJob | null> {
    return null;
  }
}

class CountingSimulationPort implements SimulationPort {
  calls = 0;
  readonly servedBuildings: Building[] = [];
  async simulate(_dpeXml: string): Promise<SimulationResult> {
    this.calls += 1;
    return this.produce();
  }
  async simulateBuilding(building: Building): Promise<SimulationResult> {
    this.calls += 1;
    this.servedBuildings.push(building);
    return this.produce();
  }
  getEngineVersion(): string {
    return '1.11.6';
  }
  private produce(): SimulationResult {
    return createSimulationResult({
      consumptionKwh: 10_000,
      emissionsKg: 2_000,
      energyLabel: 'D',
      climateLabel: 'D',
      rawEngineOutput: {}
    });
  }
}

const fakeRunner = { enqueue: () => undefined } as unknown as SimulationJobRunner;

function setup() {
  const buildingRepository = new FakeBuildingRepository();
  const auditLog = new FakeAuditLog();
  buildingRepository.auditLog = auditLog;
  const now = () => new Date('2026-11-21T09:30:00.000Z');
  const edit = new EditBuildingUseCase({ buildingRepository, now, logger: silentLogger });
  const undo = new UndoLastChangeUseCase({ buildingRepository, auditLog, now, logger: silentLogger });
  const getAudit = new GetAuditLogUseCase({ buildingRepository, auditLog });
  const building = makeBuilding(BUILDING_ID);
  void buildingRepository.save({ building, report: makeReport() });
  return { buildingRepository, auditLog, edit, undo, getAudit, building };
}

const silentLogger = { log: () => undefined, warn: () => undefined, error: () => undefined };

const wallCommand: UpdateWallCommand = {
  type: 'building.wall.update.v1',
  buildingId: BUILDING_ID,
  wallId: 'wall-1',
  uValueWm2K: 0.25
};

describe('EditBuildingUseCase (P4)', () => {
  it('applies a valid command: version+1, persisted, audit-logged, event emitted', async () => {
    const { buildingRepository, auditLog, edit, building } = setup();
    const result = await edit.execute(BUILDING_ID, wallCommand, { expectedVersion: 0, userId: 'user-42' });
    expect(result.building.version).toBe(1);
    expect(result.building.walls[0]?.uValueWm2K?.value).toBe(0.25);
    expect(result.building.walls[0]?.uValueWm2K?.source).toBe('user');
    expect(result.building.walls[0]?.uValueWm2K?.confidence).toBe(1);
    expect(result.events.map((e) => e.type)).toEqual(['BuildingUpdated']);
    expect(result.entry.userId).toBe('user-42');
    expect(result.entry.commandType).toBe('building.wall.update.v1');
    expect(result.entry.version).toBe(1);
    expect(result.entry.changes[0]?.oldValue?.value).toBe(1.64);
    expect(result.entry.changes[0]?.newValue?.value).toBe(0.25);
    // persisted + audited
    expect(buildingRepository.store.get(BUILDING_ID)?.building.version).toBe(1);
    expect(auditLog.entries.get(BUILDING_ID)).toHaveLength(1);
    expect(building.version).toBe(0); // original aggregate untouched
  });

  it('throws BuildingNotFoundError (404) for an unknown building', async () => {
    const { edit } = setup();
    await expect(
      edit.execute('99999999-9999-4999-8999-999999999999', wallCommand, { expectedVersion: 0, userId: 'u' })
    ).rejects.toBeInstanceOf(BuildingNotFoundError);
  });

  it('throws StaleVersionError (409) on the pre-check and persists nothing', async () => {
    const { buildingRepository, auditLog, edit } = setup();
    await expect(edit.execute(BUILDING_ID, wallCommand, { expectedVersion: 5, userId: 'u' })).rejects.toBeInstanceOf(
      StaleVersionError
    );
    expect(buildingRepository.updates).toBe(0);
    expect(auditLog.entries.get(BUILDING_ID) ?? []).toHaveLength(0);
    expect(buildingRepository.store.get(BUILDING_ID)?.building.version).toBe(0);
  });

  it('propagates a repository-level 409 race and does not write an audit row', async () => {
    const { buildingRepository, auditLog, edit } = setup();
    buildingRepository.failNextUpdateWithStale = true;
    await expect(edit.execute(BUILDING_ID, wallCommand, { expectedVersion: 0, userId: 'u' })).rejects.toBeInstanceOf(
      StaleVersionError
    );
    expect(auditLog.entries.get(BUILDING_ID) ?? []).toHaveLength(0);
    expect(buildingRepository.store.get(BUILDING_ID)?.building.version).toBe(0);
  });

  it('rejects an invalid command (negative U-value): typed error, nothing persisted, no audit row', async () => {
    const { buildingRepository, auditLog, edit } = setup();
    await expect(
      edit.execute(BUILDING_ID, { ...wallCommand, uValueWm2K: -1 }, { expectedVersion: 0, userId: 'u' })
    ).rejects.toBeInstanceOf(CommandValidationError);
    expect(buildingRepository.updates).toBe(0);
    expect(auditLog.entries.get(BUILDING_ID) ?? []).toHaveLength(0);
    expect(buildingRepository.store.get(BUILDING_ID)?.building.walls[0]?.uValueWm2K?.value).toBe(1.64);
  });

  it('rejects an unknown element with ElementNotFoundError', async () => {
    const { edit } = setup();
    await expect(
      edit.execute(BUILDING_ID, { ...wallCommand, wallId: 'nope' }, { expectedVersion: 0, userId: 'u' })
    ).rejects.toBeInstanceOf(ElementNotFoundError);
  });
});

describe('UndoLastChangeUseCase (P4 FR-P4-05)', () => {
  it('throws NothingToUndoError (400) when no edit was recorded', async () => {
    const { undo } = setup();
    await expect(undo.execute(BUILDING_ID, { expectedVersion: 0, userId: 'u' })).rejects.toBeInstanceOf(NothingToUndoError);
  });

  it('undoes the last edit: previous value restored, version+1, undo itself audited', async () => {
    const { buildingRepository, auditLog, edit, undo } = setup();
    await edit.execute(BUILDING_ID, wallCommand, { expectedVersion: 0, userId: 'user-42' });
    const result = await undo.execute(BUILDING_ID, { expectedVersion: 1, userId: 'user-42' });
    expect(result.building.version).toBe(2);
    expect(result.building.walls[0]?.uValueWm2K?.value).toBe(1.64);
    expect(result.building.walls[0]?.uValueWm2K?.source).toBe('dpe-xml:x'); // full original Confidence restored
    expect(buildingRepository.store.get(BUILDING_ID)?.building.version).toBe(2);
    const entries = auditLog.entries.get(BUILDING_ID) ?? [];
    expect(entries).toHaveLength(2);
    expect(entries[1]?.commandType).toBe('building.wall.update.v1');
    expect(entries[1]?.changes[0]?.newValue?.value).toBe(1.64);
  });

  it('throws StaleVersionError (409) when the If-Match version is stale', async () => {
    const { edit, undo } = setup();
    await edit.execute(BUILDING_ID, wallCommand, { expectedVersion: 0, userId: 'u' });
    await expect(undo.execute(BUILDING_ID, { expectedVersion: 0, userId: 'u' })).rejects.toBeInstanceOf(StaleVersionError);
  });
});

describe('GetAuditLogUseCase (P4)', () => {
  it('returns the entries oldest first and 404s on unknown building', async () => {
    const { edit, getAudit } = setup();
    await expect(getAudit.execute('99999999-9999-4999-8999-999999999999')).rejects.toBeInstanceOf(BuildingNotFoundError);
    await edit.execute(BUILDING_ID, wallCommand, { expectedVersion: 0, userId: 'u1' });
    await edit.execute(BUILDING_ID, { ...wallCommand, uValueWm2K: 0.4 }, { expectedVersion: 1, userId: 'u2' });
    const result = await getAudit.execute(BUILDING_ID);
    expect(result.entries.map((e) => e.userId)).toEqual(['u1', 'u2']);
    expect(result.entries.map((e) => e.version)).toEqual([1, 2]);
  });
});

describe('edit → re-simulation via P2 (cache-miss check)', () => {
  it('changes the input hash after an edit → cache miss → new engine run → new SimulationResult', async () => {
    const { buildingRepository, auditLog, edit } = setup();
    const simulationRepository = new FakeSimulationRepository();
    const port = new CountingSimulationPort();
    const run = new RunSimulationUseCase({
      buildingRepository,
      simulationRepository,
      simulation: port,
      runner: fakeRunner,
      logger: silentLogger,
      now: () => new Date('2026-11-21T10:00:00.000Z')
    });

    const hashBefore = computeBuildingInputHash(buildingRepository.store.get(BUILDING_ID)!.building);
    const first = await run.execute(BUILDING_ID);
    expect(first.kind).toBe('completed');
    expect(port.calls).toBe(1);
    if (first.kind !== 'completed') return;
    expect(first.record.inputHash).toBe(hashBefore);

    // identical re-run: cache hit, engine NOT called (AC-P2-04 unchanged)
    const again = await run.execute(BUILDING_ID);
    expect(again.kind).toBe('cached');
    expect(port.calls).toBe(1);

    // edit the wall → input hash changes → cache miss → engine called again
    await edit.execute(BUILDING_ID, wallCommand, { expectedVersion: 0, userId: 'user-42' });
    const hashAfter = computeBuildingInputHash(buildingRepository.store.get(BUILDING_ID)!.building);
    expect(hashAfter).not.toBe(hashBefore);
    const second = await run.execute(BUILDING_ID);
    expect(second.kind).toBe('completed');
    expect(port.calls).toBe(2);
    // the engine input served on the second run carries the edited value with user provenance
    const served = port.servedBuildings[1];
    expect(served?.walls[0]?.uValueWm2K?.value).toBe(0.25);
    expect(served?.walls[0]?.uValueWm2K?.source).toBe('user');
    expect(port.servedBuildings[0]?.walls[0]?.uValueWm2K?.source).toMatch(/^dpe-xml:/);
    if (second.kind === 'completed') {
      expect(second.record.inputHash).toBe(hashAfter);
      expect(second.record.id).not.toBe(first.kind === 'completed' ? first.record.id : '');
    }
    expect(simulationRepository.results.size).toBe(2);
    expect(auditLog.entries.get(BUILDING_ID)).toHaveLength(1);
  });
});
