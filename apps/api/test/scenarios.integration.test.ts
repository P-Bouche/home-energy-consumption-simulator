import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { createSimulationResult, type Building, type SimulationResult } from '@hes/domain';
import {
  AUDIT_LOG,
  BUILDING_REPOSITORY,
  SIMULATION_PORT,
  SIMULATION_REPOSITORY,
  type SimulationPort
} from '@hes/application';
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

/**
 * Counting SimulationPort fake with content-derived results (lower wall U →
 * lower consumption, label D at/above 8000 kWh, C below) so scenario forks
 * get deterministic, different results. Lets tests assert the engine call
 * counter (cache reuse → counter unchanged).
 */
class CountingSimulationPort implements SimulationPort {
  calls = 0;

  async simulate(_dpeXml: string): Promise<SimulationResult> {
    this.calls += 1;
    return this.produce(null);
  }
  async simulateBuilding(building: Building): Promise<SimulationResult> {
    this.calls += 1;
    return this.produce(building);
  }
  getEngineVersion(): string {
    return '1.11.6';
  }
  private produce(building: Building | null): SimulationResult {
    const wallU = building === null ? 1.6393 : building.walls.reduce((s, w) => s + (w.uValueWm2K?.value ?? 0), 0);
    const consumptionKwh = Math.round((5000 + wallU * 10000) * 100) / 100;
    return createSimulationResult({
      consumptionKwh,
      emissionsKg: Math.round(consumptionKwh * 0.2 * 100) / 100,
      energyLabel: consumptionKwh < 8000 ? 'C' : 'D',
      climateLabel: consumptionKwh < 8000 ? 'C' : 'D',
      rawEngineOutput: { fake: true }
    });
  }
}

async function createScenarioTestApp(port: SimulationPort): Promise<INestApplication> {
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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // same as main.ts
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

interface ScenarioBody {
  id: string;
  buildingId: string;
  name: string;
  commands: { type: string; buildingId?: string; wallId?: string; windowId?: string; uValueWm2K?: number }[];
  baselineVersion: number;
}

interface ComparisonBody {
  buildingId: string;
  baseline: { id: string; consumptionKwh: number; emissionsKg: number; energyLabel: string; climateLabel: string };
  entries: {
    scenarioId: string;
    name: string;
    deltaKwh: number;
    deltaKgCo2: number;
    energyLabelChange: { from: string; to: string } | null;
    rank: number;
    result: { id: string; inputHash: string; consumptionKwh: number; emissionsKg: number; energyLabel: string };
  }[];
  simulatedNow: string[];
}

const apps: INestApplication[] = [];
afterEach(async () => {
  while (apps.length > 0) {
    await apps.pop()?.close();
  }
});

const wallInsulation = { type: 'building.wall.update.v1', wallId: 'wall-1', uValueWm2K: 0.2 };
const windowReplacement = { type: 'building.window.update.v1', windowId: 'window-1', uValueWm2K: 1.1 };

describe('P5 scenarios API (memory://)', () => {
  it('full flow: create 2 scenarios → simulate → compare (deltas recomputed independently) → cached re-compare < 1 s → apply → version bump + audit + re-sim → delete keeps building', async () => {
    const port = new CountingSimulationPort();
    const app = await createScenarioTestApp(port);
    apps.push(app);
    const server = app.getHttpServer();
    const buildingId = await importFixture(app);

    // --- create two scenarios (P4 vocabulary; buildingId stamped server-side) ---
    const s1 = await request(server)
      .post(`/buildings/${buildingId}/scenarios`)
      .send({ name: 'Isolation des murs', description: 'U=0.2', commands: [wallInsulation] })
      .expect(201);
    const scenario1 = s1.body as ScenarioBody;
    expect(scenario1.commands[0]?.type).toBe('building.wall.update.v1');
    expect(scenario1.commands[0]?.buildingId).toBe(buildingId);
    expect(scenario1.baselineVersion).toBe(0); // building version at import (schema v3)

    const s2 = await request(server)
      .post(`/buildings/${buildingId}/scenarios`)
      .send({ name: 'Remplacement fenêtres', commands: [windowReplacement] })
      .expect(201);
    const scenario2 = s2.body as ScenarioBody;

    // list + get
    const list = await request(server).get(`/buildings/${buildingId}/scenarios`).expect(200);
    expect((list.body as { scenarios: ScenarioBody[] }).scenarios).toHaveLength(2);
    await request(server).get(`/scenarios/${scenario1.id}`).expect(200);

    // --- simulate both ---
    const sim1 = await request(server).post(`/scenarios/${scenario1.id}/simulate`).expect(201);
    expect(sim1.body.mode).toBe('sync');
    const sim1Again = await request(server).post(`/scenarios/${scenario1.id}/simulate`).expect(201);
    expect(sim1Again.body.mode).toBe('cached');
    expect(sim1Again.body.result.id).toBe(sim1.body.result.id);
    expect(port.calls).toBe(1); // engine called once for the scenario

    await request(server).post(`/scenarios/${scenario2.id}/simulate`).expect(201);
    expect(port.calls).toBe(2);

    // --- compare (AC-P5-01): deltas verified against independent recomputation ---
    const compare1 = await request(server).post(`/buildings/${buildingId}/compare`).send({}).expect(200);
    const cmp = compare1.body as ComparisonBody;
    expect(cmp.buildingId).toBe(buildingId);
    expect(cmp.entries).toHaveLength(2);
    expect(cmp.baseline.consumptionKwh).toBe(21393); // 5000 + 1.6393*10000
    for (const entry of cmp.entries) {
      expect(entry.deltaKwh).toBeCloseTo(entry.result.consumptionKwh - cmp.baseline.consumptionKwh, 6);
      expect(entry.deltaKgCo2).toBeCloseTo(entry.result.emissionsKg - cmp.baseline.emissionsKg, 6);
    }
    const wallsEntry = cmp.entries.find((e) => e.scenarioId === scenario1.id)!;
    expect(wallsEntry.result.consumptionKwh).toBe(7000); // 5000 + 0.2*10000
    expect(wallsEntry.energyLabelChange).toEqual({ from: 'D', to: 'C' }); // AC-P5-02
    expect(cmp.entries[0]?.scenarioId).toBe(scenario1.id); // ranked first (most kWh saved)
    expect(cmp.entries[0]?.rank).toBe(1);
    const callsAfterFirstCompare = port.calls; // baseline was simulated during compare

    // cached re-compare: p95 budget < 1 s, engine counter unchanged (FR-P5-04)
    const samples: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const start = performance.now();
      const res = await request(server).post(`/buildings/${buildingId}/compare`).send({});
      samples.push(performance.now() - start);
      expect(res.status).toBe(200);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? samples[samples.length - 1]!;
    expect(p95).toBeLessThan(1000);
    expect(port.calls).toBe(callsAfterFirstCompare);
    expect(cmp.simulatedNow).toHaveLength(0);

    // --- apply (AC-P5-03): version bump + state replaced + audit rows + baseline re-simulated ---
    const applied = await request(server)
      .post(`/scenarios/${scenario1.id}/apply`)
      .set('x-user-id', 'user-42')
      .expect(200);
    expect(applied.body.previousVersion).toBe(0);
    expect(applied.body.newVersion).toBe(1); // +1 per applied command (one command here)
    expect(applied.body.auditEntries).toHaveLength(1);
    expect(applied.body.auditEntries[0].commandType).toBe('building.wall.update.v1');
    expect(applied.body.auditEntries[0].version).toBe(1);
    expect(applied.body.auditEntries[0].userId).toBe('user-42');
    expect(applied.body.simulation.consumptionKwh).toBe(7000);

    const building = await request(server).get(`/buildings/${buildingId}`).expect(200);
    expect(building.body.version).toBe(1);
    const wall = (building.body.building.walls as { id: string; uValueWm2K: { value: number; source: string; confidence: number } | null }[])[0];
    expect(wall?.uValueWm2K).toMatchObject({ value: 0.2, source: 'user', confidence: 1 });

    // the apply wrote the per-command audit row into the P4 append-only audit
    const audit = await request(server).get(`/buildings/${buildingId}/audit`).expect(200);
    expect(audit.body.entries).toHaveLength(1);
    expect(audit.body.entries[0].commandType).toBe('building.wall.update.v1');

    // baseline re-simulation of the applied building is served from the cache
    // (applied state == scenario state) — same result id as the scenario's
    const baselineSim = await request(server).post(`/buildings/${buildingId}/simulations`).expect(201);
    expect(baselineSim.body.mode).toBe('cached');
    expect(baselineSim.body.result.id).toBe(sim1.body.result.id);

    // --- delete (AC-P5-04): scenario gone, building + results intact ---
    await request(server).delete(`/scenarios/${scenario2.id}`).expect(204);
    await request(server).get(`/scenarios/${scenario2.id}`).expect(404);
    await request(server).get(`/buildings/${buildingId}`).expect(200);
    const history = await request(server).get(`/buildings/${buildingId}/simulations`).expect(200);
    expect(history.body.results.length).toBeGreaterThanOrEqual(1);
    const listAfter = await request(server).get(`/buildings/${buildingId}/scenarios`).expect(200);
    expect((listAfter.body as { scenarios: ScenarioBody[] }).scenarios).toHaveLength(1);
  });

  it('stale comparison is never served: PATCHed commands and a moved baseline are hash-verified and re-simulated inline', async () => {
    const port = new CountingSimulationPort();
    const app = await createScenarioTestApp(port);
    apps.push(app);
    const server = app.getHttpServer();
    const buildingId = await importFixture(app);

    const created = await request(server)
      .post(`/buildings/${buildingId}/scenarios`)
      .send({ name: 'Walls', commands: [wallInsulation] })
      .expect(201);
    const scenario = created.body as ScenarioBody;
    await request(server).post(`/scenarios/${scenario.id}/simulate`).expect(201);
    await request(server).post(`/buildings/${buildingId}/compare`).send({}).expect(200); // warm baseline
    const callsBefore = port.calls;

    // PATCH the scenario with different commands (U=0.4 → 9000 kWh)
    await request(server)
      .patch(`/scenarios/${scenario.id}`)
      .send({ commands: [{ type: 'building.wall.update.v1', wallId: 'wall-1', uValueWm2K: 0.4 }] })
      .expect(200);
    const afterPatch = await request(server).post(`/buildings/${buildingId}/compare`).send({}).expect(200);
    const cmp = afterPatch.body as ComparisonBody;
    expect(cmp.simulatedNow).toEqual([scenario.id]); // stale link detected by hash mismatch
    expect(port.calls).toBe(callsBefore + 1); // exactly one re-simulation
    const entry = cmp.entries.find((e) => e.scenarioId === scenario.id)!;
    expect(entry.result.consumptionKwh).toBe(9000); // NOT the stale 7000
    expect(entry.deltaKwh).toBeCloseTo(9000 - 21393, 6);

    // next compare is fully cached again
    const again = await request(server).post(`/buildings/${buildingId}/compare`).send({}).expect(200);
    expect((again.body as ComparisonBody).simulatedNow).toHaveLength(0);
    expect(port.calls).toBe(callsBefore + 1);

    // post-apply drift: another scenario linked against the old baseline is re-simulated after the apply
    const s2 = await request(server)
      .post(`/buildings/${buildingId}/scenarios`)
      .send({ name: 'Windows', commands: [windowReplacement] })
      .expect(201);
    const scenario2 = s2.body as ScenarioBody;
    await request(server).post(`/scenarios/${scenario2.id}/simulate`).expect(201);
    const callsBeforeApply = port.calls;
    await request(server).post(`/scenarios/${scenario.id}/apply`).expect(200); // baseline moves to U=0.4
    const afterApply = await request(server).post(`/buildings/${buildingId}/compare`).send({}).expect(200);
    const cmp2 = afterApply.body as ComparisonBody;
    expect(cmp2.simulatedNow).toEqual([scenario2.id]); // forked over the OLD baseline → stale
    expect(port.calls).toBe(callsBeforeApply + 1); // baseline of applied state is a cache hit from apply
    const entry2 = cmp2.entries.find((e) => e.scenarioId === scenario2.id)!;
    // the re-simulated result is now current: a further compare serves it from the link, unchanged
    const cmp3 = await request(server).post(`/buildings/${buildingId}/compare`).send({}).expect(200);
    const cmp3Body = cmp3.body as ComparisonBody;
    expect(cmp3Body.simulatedNow).toHaveLength(0);
    expect(port.calls).toBe(callsBeforeApply + 1);
    expect(cmp3Body.entries.find((e) => e.scenarioId === scenario2.id)?.result.inputHash).toBe(entry2.result.inputHash);
    // baseline of the comparison is the applied state
    expect(cmp2.baseline.consumptionKwh).toBe(9000);
  });

  it('typed errors: 404 unknown building/scenario/element, 400 invalid command', async () => {
    const port = new CountingSimulationPort();
    const app = await createScenarioTestApp(port);
    apps.push(app);
    const server = app.getHttpServer();
    const buildingId = await importFixture(app);

    await request(server).post('/buildings/99999999-9999-4999-8999-999999999999/scenarios')
      .send({ name: 'x', commands: [wallInsulation] })
      .expect(404);
    await request(server).get('/buildings/99999999-9999-4999-8999-999999999999/scenarios').expect(404);
    await request(server).post('/buildings/99999999-9999-4999-8999-999999999999/compare').send({}).expect(404);

    await request(server).post(`/buildings/${buildingId}/scenarios`)
      .send({ name: 'bad', commands: [{ type: 'Teleport', version: 1 }] })
      .expect(400); // unknown tag → InvalidCommandError → 400 with issues
    await request(server).post(`/buildings/${buildingId}/scenarios`)
      .send({ name: 'bad2', commands: [{ type: 'building.wall.update.v1', wallId: 'wall-99', uValueWm2K: 0.2 }] })
      .expect(404); // unknown element → ElementNotFoundError → 404
    await request(server).post(`/buildings/${buildingId}/scenarios`)
      .send({ name: 'bad3', commands: [] })
      .expect(400); // empty change-set → InvalidCommandError → 400
    await request(server).post(`/buildings/${buildingId}/scenarios`)
      .send({ name: 'bad4', commands: [{ type: 'building.wall.update.v1', wallId: 'wall-1', uValueWm2K: -1 }] })
      .expect(400); // out-of-range value → CommandValidationError → 400 with fieldErrors

    await request(server).get('/scenarios/88888888-8888-4888-8888-888888888888').expect(404);
    await request(server).post('/scenarios/88888888-8888-4888-8888-888888888888/simulate').expect(404);
    await request(server).post('/scenarios/88888888-8888-4888-8888-888888888888/apply').expect(404);
    await request(server).delete('/scenarios/88888888-8888-4888-8888-888888888888').expect(404);
    await request(server).patch('/scenarios/88888888-8888-4888-8888-888888888888').send({ name: 'x' }).expect(404);
  });

  it('PATCH updates name and commands; compare accepts a scenario-id subset', async () => {
    const port = new CountingSimulationPort();
    const app = await createScenarioTestApp(port);
    apps.push(app);
    const server = app.getHttpServer();
    const buildingId = await importFixture(app);

    const created = await request(server)
      .post(`/buildings/${buildingId}/scenarios`)
      .send({ name: 'S', commands: [{ type: 'building.wall.update.v1', wallId: 'wall-1', uValueWm2K: 0.4 }] })
      .expect(201);
    const id = (created.body as ScenarioBody).id;
    const patched = await request(server)
      .patch(`/scenarios/${id}`)
      .send({ name: 'S2', commands: [windowReplacement] })
      .expect(200);
    expect((patched.body as ScenarioBody).name).toBe('S2');
    expect((patched.body as ScenarioBody).commands[0]?.type).toBe('building.window.update.v1');
    await request(server)
      .patch(`/scenarios/${id}`)
      .send({ commands: [{ type: 'building.wall.update.v1', wallId: 'wall-42', uValueWm2K: 0.2 }] })
      .expect(404); // unknown element

    const s2 = await request(server)
      .post(`/buildings/${buildingId}/scenarios`)
      .send({ name: 'S3', commands: [wallInsulation] })
      .expect(201);
    const subset = await request(server)
      .post(`/buildings/${buildingId}/compare`)
      .send({ scenarioIds: [(s2.body as ScenarioBody).id] })
      .expect(200);
    expect((subset.body as ComparisonBody).entries).toHaveLength(1);
    await request(server)
      .post(`/buildings/${buildingId}/compare`)
      .send({ scenarioIds: ['77777777-7777-4777-8777-777777777777'] })
      .expect(404);
  });
});
