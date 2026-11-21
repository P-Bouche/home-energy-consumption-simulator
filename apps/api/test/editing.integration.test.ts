import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { createSimulationResult, type Building, type SimulationResult } from '@hes/domain';
import { AUDIT_LOG, BUILDING_REPOSITORY, SIMULATION_PORT, SIMULATION_REPOSITORY, type SimulationPort } from '@hes/application';
import { AppModule } from '../src/app.module.ts';
import { HttpExceptionFilter } from '../src/http/http-exception-filter.ts';
import { InMemoryAuditLog } from '../src/in-memory-audit-log.ts';
import { InMemoryBuildingRepository } from '../src/in-memory-building-repository.ts';
import { InMemorySimulationRepository } from '../src/in-memory-simulation-repository.ts';
import { PG_CONTEXT } from '../src/infrastructure.module.ts';

const fixtureFile = path.join(
  fileURLToPath(new URL('../../../packages/open3cl-adapter/test/fixtures', import.meta.url)),
  '2238E0097309E.xml'
);

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
      consumptionKwh: 16_399.97,
      emissionsKg: 3_412.93,
      energyLabel: 'D',
      climateLabel: 'D',
      rawEngineOutput: {}
    });
  }
}

/**
 * Builds the app in memory:// mode (in-memory repositories, no Postgres) with
 * a counting SimulationPort so tests can assert engine call counts.
 */
async function createEditingTestApp(port: SimulationPort): Promise<INestApplication> {
  const auditLog = new InMemoryAuditLog();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_CONTEXT)
    .useValue(null)
    .overrideProvider(BUILDING_REPOSITORY)
    .useValue(new InMemoryBuildingRepository(auditLog))
    .overrideProvider(AUDIT_LOG)
    .useValue(auditLog)
    .overrideProvider(SIMULATION_REPOSITORY)
    .useValue(new InMemorySimulationRepository())
    .overrideProvider(SIMULATION_PORT)
    .useValue(port)
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  return app;
}

async function importFixture(app: INestApplication): Promise<string> {
  const xml = readFileSync(fixtureFile, 'utf8');
  const res = await request(app.getHttpServer())
    .post('/imports/dpe')
    .attach('file', Buffer.from(xml), '2238E0097309E.xml')
    .expect(201);
  return res.body.buildingId as string;
}

const apps: INestApplication[] = [];
afterEach(async () => {
  while (apps.length > 0) {
    await apps.pop()?.close();
  }
});

const wallUpdate = {
  type: 'building.wall.update.v1',
  wallId: 'wall-1',
  uValueWm2K: 0.25
};

interface AuditEntryBody {
  readonly id: string;
  readonly userId: string;
  readonly commandType: string;
  readonly changes: { field: string; oldValue: { value: unknown; source: string; confidence: number } | null; newValue: { value: unknown; source: string; confidence: number } | null }[];
  readonly version: number;
}

describe('P4 editing API (memory://)', () => {
  it('full edit flow: PATCH → version+1 + audit + user confidence; re-simulation is a cache miss with a new result', async () => {
    const port = new CountingSimulationPort();
    const app = await createEditingTestApp(port);
    apps.push(app);
    const server = app.getHttpServer();
    const buildingId = await importFixture(app);

    // GET returns version 0 (P1 round-trip + P4 version)
    const got = await request(server).get(`/buildings/${buildingId}`).expect(200);
    expect(got.body.version).toBe(0);
    const wallBefore = (got.body.building.walls as { id: string; uValueWm2K: { value: number; source: string } }[])[0];
    expect(wallBefore?.uValueWm2K.source).toMatch(/^dpe-xml:/);

    // initial simulation (P2 path)
    const sim1 = await request(server).post(`/buildings/${buildingId}/simulations`).expect(201);
    const hash1 = sim1.body.result.inputHash as string;
    expect(port.calls).toBe(1);

    // PATCH without If-Match → 400
    await request(server).patch(`/buildings/${buildingId}`).send({ ...wallUpdate, buildingId }).expect(400);

    // PATCH with a valid command → 200, version 1, audit entry
    const patched = await request(server)
      .patch(`/buildings/${buildingId}`)
      .set('If-Match', '0')
      .set('x-user-id', 'user-42')
      .send({ ...wallUpdate, buildingId })
      .expect(200);
    expect(patched.body.version).toBe(1);
    const wallAfter = (patched.body.building.walls as { uValueWm2K: { value: number; source: string; confidence: number } }[])[0];
    expect(wallAfter?.uValueWm2K.value).toBe(0.25);
    expect(wallAfter?.uValueWm2K.source).toBe('user');
    expect(wallAfter?.uValueWm2K.confidence).toBe(1);
    const entry = patched.body.auditEntry as AuditEntryBody;
    expect(entry.userId).toBe('user-42');
    expect(entry.commandType).toBe('building.wall.update.v1');
    expect(entry.version).toBe(1);
    expect(entry.changes[0]?.field).toBe('uValueWm2K');
    expect(entry.changes[0]?.oldValue?.value).toBe(wallBefore?.uValueWm2K.value);
    expect(entry.changes[0]?.newValue?.source).toBe('user');

    // re-simulation after the edit: input hash changed → cache miss → engine called again
    const sim2 = await request(server).post(`/buildings/${buildingId}/simulations`).expect(201);
    const hash2 = sim2.body.result.inputHash as string;
    expect(hash2).not.toBe(hash1);
    expect(port.calls).toBe(2);
    expect(sim2.body.result.id).not.toBe(sim1.body.result.id);
    // the engine input served on the post-edit run carries the edited value (not just a new hash)
    const servedAfterEdit = port.servedBuildings[1];
    const servedWall = (servedAfterEdit?.walls as unknown as { uValueWm2K: { value: number; source: string } }[])[0];
    expect(servedWall?.uValueWm2K.value).toBe(0.25);
    expect(servedWall?.uValueWm2K.source).toBe('user');
    const servedBefore = port.servedBuildings[0];
    expect((servedBefore?.walls as unknown as { uValueWm2K: { source: string } }[])[0]?.uValueWm2K.source).toMatch(/^dpe-xml:/);

    // audit endpoint
    const audit = await request(server).get(`/buildings/${buildingId}/audit`).expect(200);
    expect(audit.body.entries).toHaveLength(1);
    expect((audit.body.entries as AuditEntryBody[])[0]?.commandType).toBe('building.wall.update.v1');
  });

  it('rejects invalid edits with 400 + fieldErrors and persists nothing (AC-P4-02)', async () => {
    const app = await createEditingTestApp(new CountingSimulationPort());
    apps.push(app);
    const server = app.getHttpServer();
    const buildingId = await importFixture(app);

    const res = await request(server)
      .patch(`/buildings/${buildingId}`)
      .set('If-Match', '0')
      .send({ ...wallUpdate, buildingId, uValueWm2K: -1 })
      .expect(400);
    expect(res.body.code).toBe('COMMAND_VALIDATION');
    expect(res.body.fieldErrors[0].field).toBe('uValueWm2K');

    // unknown command tag → 400 with issues
    const bad = await request(server)
      .patch(`/buildings/${buildingId}`)
      .set('If-Match', '0')
      .send({ type: 'building.wall.update.v9', buildingId, wallId: 'wall-1' })
      .expect(400);
    expect(bad.body.code).toBe('INVALID_COMMAND');
    expect(Array.isArray(bad.body.issues)).toBe(true);

    // unknown element → 404
    const missing = await request(server)
      .patch(`/buildings/${buildingId}`)
      .set('If-Match', '0')
      .send({ ...wallUpdate, buildingId, wallId: 'wall-99' })
      .expect(404);
    expect(missing.body.code).toBe('ELEMENT_NOT_FOUND');

    // nothing was persisted
    const got = await request(server).get(`/buildings/${buildingId}`).expect(200);
    expect(got.body.version).toBe(0);
    const audit = await request(server).get(`/buildings/${buildingId}/audit`).expect(200);
    expect(audit.body.entries).toHaveLength(0);
  });

  it('stale If-Match → 409 with versions, and the building is unchanged', async () => {
    const app = await createEditingTestApp(new CountingSimulationPort());
    apps.push(app);
    const server = app.getHttpServer();
    const buildingId = await importFixture(app);

    await request(server)
      .patch(`/buildings/${buildingId}`)
      .set('If-Match', '0')
      .send({ ...wallUpdate, buildingId })
      .expect(200);

    const conflict = await request(server)
      .patch(`/buildings/${buildingId}`)
      .set('If-Match', '0')
      .send({ ...wallUpdate, buildingId, uValueWm2K: 0.4 })
      .expect(409);
    expect(conflict.body.code).toBe('STALE_VERSION');
    expect(conflict.body.expectedVersion).toBe(0);
    expect(conflict.body.currentVersion).toBe(1);

    const got = await request(server).get(`/buildings/${buildingId}`).expect(200);
    expect(got.body.version).toBe(1);
    expect((got.body.building.walls as { uValueWm2K: { value: number } }[])[0]?.uValueWm2K.value).toBe(0.25);
    const audit = await request(server).get(`/buildings/${buildingId}/audit`).expect(200);
    expect(audit.body.entries).toHaveLength(1);
  });

  it('undo restores the previous value, is audit-logged, and 400s when there is nothing to undo (AC-P4-04)', async () => {
    const port = new CountingSimulationPort();
    const app = await createEditingTestApp(port);
    apps.push(app);
    const server = app.getHttpServer();
    const buildingId = await importFixture(app);

    // nothing to undo yet → 400
    const empty = await request(server).post(`/buildings/${buildingId}/undo`).set('If-Match', '0').expect(400);
    expect(empty.body.code).toBe('NOTHING_TO_UNDO');

    const before = await request(server).get(`/buildings/${buildingId}`).expect(200);
    const originalU = (before.body.building.walls as { uValueWm2K: { value: number } }[])[0]?.uValueWm2K.value;
    const sim0 = await request(server).post(`/buildings/${buildingId}/simulations`).expect(201);
    const hash0 = sim0.body.result.inputHash as string;
    expect(port.calls).toBe(1);

    await request(server)
      .patch(`/buildings/${buildingId}`)
      .set('If-Match', '0')
      .set('x-user-id', 'user-42')
      .send({ ...wallUpdate, buildingId })
      .expect(200);

    // stale undo → 409
    await request(server).post(`/buildings/${buildingId}/undo`).set('If-Match', '0').expect(409);

    const undone = await request(server)
      .post(`/buildings/${buildingId}/undo`)
      .set('If-Match', '1')
      .set('x-user-id', 'user-42')
      .expect(200);
    expect(undone.body.version).toBe(2);
    const wallUndone = (undone.body.building.walls as { uValueWm2K: { value: number; source: string; confidence: number } }[])[0];
    expect(wallUndone?.uValueWm2K.value).toBe(originalU);
    expect(wallUndone?.uValueWm2K.source).toMatch(/^dpe-xml:/); // full original Confidence restored from the audit entry
    expect(wallUndone?.uValueWm2K.confidence).toBe(1);

    const audit = await request(server).get(`/buildings/${buildingId}/audit`).expect(200);
    const entries = audit.body.entries as AuditEntryBody[];
    expect(entries).toHaveLength(2);
    expect(entries[1]?.changes[0]?.newValue?.value).toBe(originalU);

    // re-simulation after undo: the restored aggregate is identical to the
    // original (full Confidence provenance restored from the audit entry), so
    // the input hash is back to the baseline → cache HIT, engine NOT re-run
    const simAfterUndo = await request(server).post(`/buildings/${buildingId}/simulations`).expect(201);
    expect(simAfterUndo.body.cached).toBe(true);
    expect(simAfterUndo.body.result.inputHash).toBe(hash0);
    expect(port.calls).toBe(1);
  });

  it('404 on unknown building for all P4 endpoints', async () => {
    const app = await createEditingTestApp(new CountingSimulationPort());
    apps.push(app);
    const server = app.getHttpServer();
    const unknown = '99999999-9999-4999-8999-999999999999';
    await request(server).get(`/buildings/${unknown}/audit`).expect(404);
    await request(server)
      .patch(`/buildings/${unknown}`)
      .set('If-Match', '0')
      .send({ ...wallUpdate, buildingId: unknown })
      .expect(404);
    await request(server).post(`/buildings/${unknown}/undo`).set('If-Match', '0').expect(404);
  });
});
