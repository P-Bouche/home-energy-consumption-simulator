import { describe, expect, it } from 'vitest';
import { Building, createImportReport, inferred, measured, type BuildingInput, type ImportReport } from '@hes/domain';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { PostgresBuildingRepository } from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');

function makeBuilding(id: string): Building {
  const input: BuildingInput = {
    id,
    dpeNumber: measured('2364E0984413P', 'dpe-xml:dpe/numero_dpe', date),
    status: measured('ACTIF', 'dpe-xml:dpe/statut', date),
    address: measured('3 Rue Gabriel Didier', 'dpe-xml:x', date),
    banId: measured('38151_0166_00003', 'dpe-xml:x/ban_id', date),
    banCoordinates: { x: measured(913751.1, 'dpe-xml:x/ban_x', date), y: measured(6453032.07, 'dpe-xml:x/ban_y', date) },
    constructionYear: measured(2010, 'dpe-xml:x/annee_construction', date),
    constructionPeriod: null,
    livingAreaM2: measured(167.29, 'dpe-xml:x/surface_habitable_logement', date),
    buildingLivingAreaM2: null,
    ceilingHeightM: inferred(2.5, 'inference:default-ceiling-height-2.5m', 0.4, date),
    levelCount: measured(1, 'dpe-xml:x', date),
    apartmentCount: null,
    climateZone: measured('3', 'dpe-xml:x', date),
    altitudeClass: null,
    altitudeM: null,
    thermalInertiaClass: null,
    zones: [{ id: 'zone-1', name: inferred('logement', 'inference:single-zone-from-logement', 0.9, date), areaM2: measured(167.29, 'dpe-xml:x', date) }],
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
    parsedFields: [{ path: 'dpe/numero_dpe', value: '2364E0984413P' }],
    inferredFields: [
      {
        path: 'hsp',
        value: 2.5,
        source: 'inference:default-ceiling-height-2.5m',
        confidence: 0.4,
        importDate: date.toISOString()
      }
    ],
    unrecognizedFields: [],
    missingFields: []
  });
}

interface CapturedQuery {
  text: string;
  values?: unknown[];
}

function fakePool(rows: Record<string, unknown>[] = []): { pool: Pool; queries: CapturedQuery[] } {
  const queries: CapturedQuery[] = [];
  const client: PoolClient = {
    query: (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      return Promise.resolve({ rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as QueryResult);
    },
    release: () => undefined
  } as unknown as PoolClient;
  const pool = {
    connect: () => Promise.resolve(client),
    query: (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      return Promise.resolve({ rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as QueryResult);
    }
  } as unknown as Pool;
  return { pool, queries };
}

describe('PostgresBuildingRepository', () => {
  it('save() writes the aggregate and report in one transaction with the BAN point in SRID 2154', async () => {
    const { pool, queries } = fakePool();
    const repo = new PostgresBuildingRepository(pool);
    const building = makeBuilding('11111111-1111-4111-8111-111111111111');
    const id = await repo.save({ building, report: makeReport() });
    expect(id).toBe(building.id);
    const texts = queries.map((q) => q.text);
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toContain('INSERT INTO buildings');
    expect(texts[1]).toContain('ST_SetSRID(ST_MakePoint($4, $5), 2154)');
    expect(texts[2]).toContain('INSERT INTO import_reports');
    expect(texts[3]).toBe('COMMIT');
    const insertValues = queries[1]?.values as unknown[];
    expect(insertValues[0]).toBe(building.id);
    expect(insertValues[1]).toBe('2364E0984413P');
    expect(insertValues[2]).toBe('modele=1/version=2.2');
    expect(insertValues[3]).toBeCloseTo(913751.1);
    const storedData = JSON.parse(insertValues[5] as string) as { ceilingHeightM: { confidence: number; source: string; importDate: string } };
    expect(storedData.ceilingHeightM.confidence).toBe(0.4);
    expect(storedData.ceilingHeightM.source).toBe('inference:default-ceiling-height-2.5m');
    expect(storedData.ceilingHeightM.importDate).toBe('2026-11-20T10:00:00.000Z');
  });

  it('save() propagates the original error even when ROLLBACK itself throws (dead connection)', async () => {
    const client = {
      query: (text: string) => {
        if (text.includes('INSERT INTO buildings') || text === 'ROLLBACK') {
          return Promise.reject(new Error(text === 'ROLLBACK' ? 'connection dead' : 'db down'));
        }
        return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as QueryResult);
      },
      release: () => undefined
    } as unknown as PoolClient;
    const pool = { connect: () => Promise.resolve(client) } as unknown as Pool;
    const repo = new PostgresBuildingRepository(pool);
    const error = await repo
      .save({ building: makeBuilding('11111111-1111-4111-8111-111111111111'), report: makeReport() })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('db down');
    expect((error as Error & { rollbackError?: Error }).rollbackError?.message).toBe('connection dead');
  });

  it('save() rolls back and rethrows on failure (no silent catch)', async () => {
    const queries: CapturedQuery[] = [];
    const client = {
      query: (text: string) => {
        queries.push({ text });
        if (text.includes('INSERT INTO buildings')) return Promise.reject(new Error('db down'));
        return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as QueryResult);
      },
      release: () => undefined
    } as unknown as PoolClient;
    const pool = { connect: () => Promise.resolve(client) } as unknown as Pool;
    const repo = new PostgresBuildingRepository(pool);
    await expect(repo.save({ building: makeBuilding('11111111-1111-4111-8111-111111111111'), report: makeReport() })).rejects.toThrow('db down');
    expect(queries.map((q) => q.text)).toContain('ROLLBACK');
  });

  it('findById() returns null when unknown and revives dates when found', async () => {
    const building = makeBuilding('11111111-1111-4111-8111-111111111111');
    const report = makeReport();
    const { pool } = fakePool([
      { building: JSON.parse(JSON.stringify(building.toJson())) as unknown, report: JSON.parse(JSON.stringify({ ...report, generatedAt: report.generatedAt.toISOString() })) as unknown }
    ]);
    const repo = new PostgresBuildingRepository(pool);
    const found = await repo.findById('11111111-1111-4111-8111-111111111111');
    expect(found).not.toBeNull();
    expect(found?.building.id).toBe(building.id);
    expect(found?.building.ceilingHeightM?.importDate).toEqual(date);
    expect(found?.building.zones[0]?.areaM2?.importDate).toEqual(date);
    expect(found?.report.reportVersion).toBe(1);

    const empty = new PostgresBuildingRepository(fakePool().pool);
    expect(await empty.findById('99999999-9999-4999-8999-999999999999')).toBeNull();
  });
});
