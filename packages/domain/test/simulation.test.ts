import { describe, expect, it } from 'vitest';
import {
  Building,
  canonicalJson,
  computeBuildingInputHash,
  createSimulationJob,
  createSimulationResultRecord,
  DomainInvariantError,
  inferred,
  measured,
  SimulationCompleted,
  SimulationFailed,
  SimulationJob,
  simulationJobFromJson,
  simulationResultRecordFromJson,
  simulationResultRecordToJson,
  toSimulationView,
  type BuildingInput
} from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');
const hash = 'a'.repeat(64);

function baseInput(overrides: Partial<BuildingInput> = {}): BuildingInput {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    dpeNumber: measured('2238E0097309E', 'dpe-xml:dpe/numero_dpe', date),
    status: null,
    address: null,
    banId: null,
    banCoordinates: null,
    constructionYear: null,
    constructionPeriod: null,
    livingAreaM2: measured(80.84, 'dpe-xml:x/surface_habitable_logement', date),
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
    ...overrides
  };
}

function makeRecord(overrides: Record<string, unknown> = {}) {
  return createSimulationResultRecord({
    id: '22222222-2222-4222-8222-222222222222',
    buildingId: '11111111-1111-4111-8111-111111111111',
    inputHash: hash,
    engineVersion: '1.11.6',
    createdAt: date,
    consumptionKwh: 48522.767,
    emissionsKg: 7770.9,
    energyLabel: 'D',
    climateLabel: 'D',
    rawEngineOutput: { logement: { sortie: {} } },
    ...overrides
  });
}

describe('SimulationResultRecord', () => {
  it('keeps the P0 value-object fields and adds persistence identity', () => {
    const record = makeRecord();
    expect(record.consumptionKwh).toBe(48522.767);
    expect(record.emissionsKg).toBe(7770.9);
    expect(record.energyLabel).toBe('D');
    expect(record.climateLabel).toBe('D');
    expect(record.rawEngineOutput).toEqual({ logement: { sortie: {} } });
    expect(record.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(record.buildingId).toBe('11111111-1111-4111-8111-111111111111');
    expect(record.inputHash).toBe(hash);
    expect(record.engineVersion).toBe('1.11.6');
    expect(record.createdAt).toEqual(date);
  });

  it('JSON round-trip is identical', () => {
    const record = makeRecord();
    const json = simulationResultRecordToJson(record);
    expect(json.createdAt).toBe('2026-11-20T10:00:00.000Z');
    const revived = simulationResultRecordFromJson(JSON.parse(JSON.stringify(json)) as typeof json);
    expect(simulationResultRecordToJson(revived)).toEqual(json);
  });

  it('rejects an invalid inputHash, label or date', () => {
    expect(() => makeRecord({ inputHash: 'xyz' })).toThrow(TypeError);
    expect(() => makeRecord({ energyLabel: 'Z' })).toThrow(TypeError);
    expect(() => makeRecord({ createdAt: new Date('nope') })).toThrow(RangeError);
    expect(() => makeRecord({ consumptionKwh: -1 })).toThrow(RangeError);
  });
});

describe('SimulationJob state machine', () => {
  it('follows queued -> running -> done and serializes', () => {
    const job = createSimulationJob({
      id: '33333333-3333-4333-8333-333333333333',
      buildingId: '11111111-1111-4111-8111-111111111111',
      inputHash: hash,
      createdAt: date
    });
    expect(job.status).toBe('queued');
    job.markRunning(date);
    expect(job.status).toBe('running');
    expect(job.startedAt).toEqual(date);
    job.markDone('22222222-2222-4222-8222-222222222222', date);
    expect(job.status).toBe('done');
    expect(job.resultId).toBe('22222222-2222-4222-8222-222222222222');
    expect(job.finishedAt).toEqual(date);
    expect(job.isTerminal()).toBe(true);
    const revived = simulationJobFromJson(JSON.parse(JSON.stringify(job.toJson())) as ReturnType<SimulationJob['toJson']>);
    expect(revived.status).toBe('done');
    expect(revived.resultId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('follows queued -> running -> failed with a typed error', () => {
    const job = createSimulationJob({
      id: '33333333-3333-4333-8333-333333333333',
      buildingId: '11111111-1111-4111-8111-111111111111',
      inputHash: hash,
      createdAt: date
    });
    job.markRunning(date);
    job.markFailed({ code: 'ENGINE_EXECUTION', message: 'boom' }, date);
    expect(job.status).toBe('failed');
    expect(job.error).toEqual({ code: 'ENGINE_EXECUTION', message: 'boom' });
    expect(job.isTerminal()).toBe(true);
  });

  it('rejects illegal transitions', () => {
    const job = createSimulationJob({
      id: '33333333-3333-4333-8333-333333333333',
      buildingId: '11111111-1111-4111-8111-111111111111',
      inputHash: hash,
      createdAt: date
    });
    expect(() => job.markDone('r', date)).toThrow(DomainInvariantError);
    expect(() => job.markFailed({ code: 'MAPPING', message: 'x' }, date)).toThrow(DomainInvariantError);
    job.markRunning(date);
    expect(() => job.markRunning(date)).toThrow(DomainInvariantError);
    job.markDone('r', date);
    expect(() => job.markRunning(date)).toThrow(DomainInvariantError);
    expect(() => job.markFailed({ code: 'MAPPING', message: 'x' }, date)).toThrow(DomainInvariantError);
  });

  it('validates its input', () => {
    expect(() =>
      createSimulationJob({ id: '', buildingId: 'b', inputHash: hash, createdAt: date })
    ).toThrow(TypeError);
    expect(() =>
      createSimulationJob({ id: 'j', buildingId: 'b', inputHash: 'nope', createdAt: date })
    ).toThrow(TypeError);
  });
});

describe('BuildingSimulationView + input hash', () => {
  it('projects the aggregate read-only, confidence metadata flowing through', () => {
    const building = Building.createForImport(baseInput({ sourceDpeXml: '<dpe/>' }));
    const view = toSimulationView(building);
    expect(view.id).toBe(building.id);
    expect(view.sourceDpeXml).toBe('<dpe/>');
    expect(view.ceilingHeightM?.confidence).toBe(0.4);
    expect(view.ceilingHeightM?.source).toBe('inference:default-ceiling-height-2.5m');
    expect(view.livingAreaM2?.confidence).toBe(1);
    expect(Object.isFrozen(view)).toBe(true);
  });

  it('hash is stable for an unchanged building and changes when the building changes', () => {
    const building = Building.createForImport(baseInput());
    const h1 = computeBuildingInputHash(building);
    const h2 = computeBuildingInputHash(Building.fromJson(JSON.parse(JSON.stringify(building.toJson())) as ReturnType<Building['toJson']>));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    const edited = Building.createForImport(baseInput({ livingAreaM2: measured(81, 'dpe-xml:x', date) }));
    expect(computeBuildingInputHash(edited)).not.toBe(h1);
  });

  it('canonicalJson sorts keys recursively regardless of insertion order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('sourceDpeXml survives the JSON round-trip and defaults to null', () => {
    const withSource = Building.createForImport(baseInput({ sourceDpeXml: '<dpe>x</dpe>' }));
    const revived = Building.fromJson(JSON.parse(JSON.stringify(withSource.toJson())) as ReturnType<Building['toJson']>);
    expect(revived.sourceDpeXml).toBe('<dpe>x</dpe>');
    const without = Building.createForImport(baseInput());
    expect(without.sourceDpeXml).toBeNull();
    expect(without.toJson().sourceDpeXml).toBeNull();
  });
});

describe('simulation domain events', () => {
  it('SimulationCompleted / SimulationFailed carry their payload', () => {
    const completed = new SimulationCompleted('b1', 'r1', hash, date);
    expect(completed.type).toBe('SimulationCompleted');
    expect(completed.buildingId).toBe('b1');
    const failed = new SimulationFailed({
      buildingId: 'b1',
      inputHash: hash,
      errorCode: 'ENGINE_EXECUTION',
      message: 'boom',
      jobId: 'j1',
      occurredAt: date
    });
    expect(failed.type).toBe('SimulationFailed');
    expect(failed.errorCode).toBe('ENGINE_EXECUTION');
    expect(failed.jobId).toBe('j1');
  });
});
