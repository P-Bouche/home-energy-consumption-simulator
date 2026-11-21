import { describe, expect, it } from 'vitest';
import {
  auditEntryFromJson,
  Building,
  createAuditEntry,
  createImportReport,
  inferred,
  measured,
  type AuditEntryJson,
  type BuildingInput,
  type ImportReport
} from '@hes/domain';
import { BuildingNotFoundError, StaleVersionError } from '@hes/application';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { PostgresAuditLog } from '../src/postgres-audit-log.ts';
import { PostgresBuildingRepository } from '../src/postgres-building-repository.ts';

const date = new Date('2026-11-20T10:00:00.000Z');
const BUILDING_ID = '11111111-1111-4111-8111-111111111111';

function makeBuilding(id: string): Building {
  const input: BuildingInput = {
    id,
    dpeNumber: measured('2364E0984413P', 'dpe-xml:dpe/numero_dpe', date),
    status: null,
    address: null,
    banId: null,
    banCoordinates: null,
    constructionYear: null,
    constructionPeriod: null,
    livingAreaM2: measured(167.29, 'dpe-xml:x', date),
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
        areaM2: measured(10, 'dpe-xml:x', date),
        uValueWm2K: measured(1.5, 'dpe-xml:x', date),
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
    importedAt: date
  };
  return Building.createForImport(input);
}

function makeReport(): ImportReport {
  return createImportReport({
    dpeNumber: '2364E0984413P',
    schemaVariant: 'modele=1/version=2.2',
    generatedAt: date,
    parsedFields: [],
    inferredFields: [],
    unrecognizedFields: [],
    missingFields: []
  });
}

function makeEntry(overrides: Partial<AuditEntryJson> = {}): AuditEntryJson {
  const command = {
    type: 'building.wall.update.v1',
    buildingId: BUILDING_ID,
    wallId: 'wall-1',
    uValueWm2K: 0.25
  } as AuditEntryJson['command'];
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    buildingId: BUILDING_ID,
    userId: 'user-42',
    timestamp: '2026-11-21T09:30:00.000Z',
    commandType: 'building.wall.update.v1',
    command,
    changes: [
      {
        field: 'uValueWm2K',
        oldValue: { value: 1.5, source: 'dpe-xml:x', confidence: 1, importDate: '2026-11-20T10:00:00.000Z' },
        newValue: { value: 0.25, source: 'user', confidence: 1, importDate: '2026-11-21T09:30:00.000Z' }
      }
    ],
    version: 1,
    ...overrides
  };
}


function makeAuditEntry(): ReturnType<typeof auditEntryFromJson> {
  return auditEntryFromJson(makeEntry());
}

interface CapturedQuery {
  text: string;
  values?: unknown[];
}

/**
 * Fake pool whose client answers per-query rows via a handler, so update()
 * flows (BEGIN / SELECT FOR UPDATE / UPDATE / COMMIT) can be scripted.
 */
function scriptedPool(handler: (text: string, values?: unknown[]) => QueryResult): {
  pool: Pool;
  queries: CapturedQuery[];
} {
  const queries: CapturedQuery[] = [];
  const run = (text: string, values?: unknown[]): Promise<QueryResult> => {
    queries.push({ text, values });
    return Promise.resolve(handler(text, values));
  };
  const client = { query: run, release: () => undefined } as unknown as PoolClient;
  const pool = {
    connect: () => Promise.resolve(client),
    query: run
  } as unknown as Pool;
  return { pool, queries };
}

const emptyResult: QueryResult = { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
const okResult: QueryResult = { rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };

describe('PostgresBuildingRepository.update (optimistic locking, schema v3)', () => {
  it('happy path: BEGIN → SELECT FOR UPDATE → conditional UPDATE → COMMIT with the new version', async () => {
    const { pool, queries } = scriptedPool((text) => {
      if (text.includes('SELECT version FROM buildings')) return { ...emptyResult, rows: [{ version: 0 }] } as QueryResult;
      if (text.startsWith('UPDATE buildings')) return okResult;
      return emptyResult;
    });
    const repo = new PostgresBuildingRepository(pool);
    const building = makeBuilding(BUILDING_ID);
    const edited = building.apply(
      { type: 'building.wall.update.v1', buildingId: BUILDING_ID, wallId: 'wall-1', uValueWm2K: 0.25 },
      { now: date, userId: 'user-42' }
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const stored = await repo.update({ building: edited.value, report: makeReport(), expectedVersion: 0, auditEntries: [makeAuditEntry()] });
    expect(stored.building.version).toBe(1);
    const texts = queries.map((q) => q.text);
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toContain('FOR UPDATE');
    expect(texts[2]).toContain('UPDATE buildings SET data = $2, version = $3 WHERE id = $1 AND version = $4');
    expect(texts[3]).toContain('INSERT INTO audit_entries'); // audit row in the SAME transaction
    expect(texts[4]).toBe('COMMIT');
    const updateValues = queries[2]?.values as unknown[];
    expect(updateValues[0]).toBe(BUILDING_ID); // $1 = id (uuid)
    expect(updateValues[2]).toBe(1); // $3 = new version
    expect(updateValues[3]).toBe(0); // $4 = expectedVersion in WHERE
    const data = JSON.parse(updateValues[1] as string) as { walls: { uValueWm2K: { source: string } }[] };
    expect(data.walls[0]?.uValueWm2K.source).toBe('user');
    expect('version' in data).toBe(false); // version lives in the column, not in the JSONB document
    const auditValues = queries[3]?.values as unknown[];
    expect(auditValues[0]).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(auditValues[1]).toBe(BUILDING_ID);
    expect(JSON.parse(auditValues[5] as string)[0].newValue.source).toBe('user');
  });

  it('throws StaleVersionError and rolls back when the persisted version moved', async () => {
    const { pool, queries } = scriptedPool((text) => {
      if (text.includes('SELECT version FROM buildings')) return { ...emptyResult, rows: [{ version: 3 }] } as QueryResult;
      return emptyResult;
    });
    const repo = new PostgresBuildingRepository(pool);
    const building = makeBuilding(BUILDING_ID);
    const error = await repo
      .update({ building, report: makeReport(), expectedVersion: 0, auditEntries: [makeAuditEntry()] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StaleVersionError);
    expect((error as StaleVersionError).currentVersion).toBe(3);
    expect(queries.map((q) => q.text)).toContain('ROLLBACK');
    expect(queries.map((q) => q.text)).not.toContain('COMMIT');
  });

  it('throws BuildingNotFoundError when the building row is missing', async () => {
    const { pool } = scriptedPool(() => emptyResult);
    const repo = new PostgresBuildingRepository(pool);
    await expect(repo.update({ building: makeBuilding(BUILDING_ID), report: makeReport(), expectedVersion: 0, auditEntries: [makeAuditEntry()] })).rejects.toBeInstanceOf(
      BuildingNotFoundError
    );
  });

  it('throws StaleVersionError when the conditional UPDATE affects 0 rows (race after FOR UPDATE)', async () => {
    const { pool } = scriptedPool((text) => {
      if (text.includes('SELECT version FROM buildings')) return { ...emptyResult, rows: [{ version: 0 }] } as QueryResult;
      if (text.startsWith('UPDATE buildings')) return { ...emptyResult, rowCount: 0 };
      return emptyResult;
    });
    const repo = new PostgresBuildingRepository(pool);
    await expect(
      repo.update({ building: makeBuilding(BUILDING_ID), report: makeReport(), expectedVersion: 0, auditEntries: [makeAuditEntry()] })
    ).rejects.toBeInstanceOf(StaleVersionError);
  });

  it('findById() revives the version column into the aggregate', async () => {
    const building = makeBuilding(BUILDING_ID);
    const report = makeReport();
    const { pool } = scriptedPool(() => ({
      ...emptyResult,
      rows: [
        {
          building: JSON.parse(JSON.stringify(building.toJson())) as unknown,
          version: 7,
          report: JSON.parse(JSON.stringify({ ...report, generatedAt: report.generatedAt.toISOString() })) as unknown
        }
      ]
    }));
    const repo = new PostgresBuildingRepository(pool);
    const found = await repo.findById(BUILDING_ID);
    expect(found?.building.version).toBe(7);
  });
});

describe('PostgresAuditLog (read side of the append-only audit, schema v3)', () => {
  it('writes are not on this port: the audit INSERT lives in the repository update transaction (see above)', () => {
    expect('append' in new PostgresAuditLog(scriptedPool(() => emptyResult).pool)).toBe(false);
  });

  it('listByBuilding() maps rows to AuditEntry and orders oldest first; latestByBuilding() takes the last', async () => {
    const rows = [
      { id: 'e1', building_id: BUILDING_ID, user_id: 'u1', command_type: 'building.wall.update.v1', command: makeEntry().command, changes: makeEntry().changes, version: 1, created_at: new Date('2026-11-21T09:30:00.000Z') },
      { id: 'e2', building_id: BUILDING_ID, user_id: 'u2', command_type: 'building.wall.update.v1', command: makeEntry().command, changes: makeEntry().changes, version: 2, created_at: new Date('2026-11-21T09:31:00.000Z') }
    ];
    const { pool, queries } = scriptedPool((text) => {
      if (text.includes('LIMIT 1')) return { ...emptyResult, rows: [rows[1]] } as QueryResult;
      return { ...emptyResult, rows } as QueryResult;
    });
    const log = new PostgresAuditLog(pool);
    const list = await log.listByBuilding(BUILDING_ID);
    expect(list.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(list[0]?.changes[0]?.newValue?.source).toBe('user');
    expect(queries[0]?.text).toContain('ORDER BY created_at ASC');
    const latest = await log.latestByBuilding(BUILDING_ID);
    expect(latest?.id).toBe('e2');
    expect(queries[1]?.text).toContain('ORDER BY created_at DESC');
  });

  it('latestByBuilding() returns null when the building was never edited', async () => {
    const { pool } = scriptedPool(() => emptyResult);
    const log = new PostgresAuditLog(pool);
    expect(await log.latestByBuilding(BUILDING_ID)).toBeNull();
  });

  it('createAuditEntry validates its input', () => {
    expect(() =>
      createAuditEntry({
        id: '',
        buildingId: BUILDING_ID,
        userId: 'u',
        timestamp: date,
        command: makeEntry().command,
        changes: [],
        version: 1
      })
    ).toThrow(TypeError);
    expect(() =>
      createAuditEntry({
        id: 'x',
        buildingId: BUILDING_ID,
        userId: 'u',
        timestamp: date,
        command: makeEntry().command,
        changes: [],
        version: -1
      })
    ).toThrow(RangeError);
  });
});
