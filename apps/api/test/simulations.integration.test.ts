import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import type { Building, SimulationResult } from '@hes/domain';
import { createSimulationResult, EngineExecutionError, SimulationMappingError } from '@hes/domain';
import { BUILDING_REPOSITORY, SIMULATION_PORT, SIMULATION_REPOSITORY, type SimulationPort } from '@hes/application';
import { AppModule } from '../src/app.module.ts';
import { HttpExceptionFilter } from '../src/http/http-exception-filter.ts';
import { InMemoryBuildingRepository } from '../src/in-memory-building-repository.ts';
import { InMemorySimulationRepository } from '../src/in-memory-simulation-repository.ts';
import { PG_CONTEXT } from '../src/infrastructure.module.ts';

const fixturesDir = fileURLToPath(
  new URL('../../../packages/open3cl-adapter/test/fixtures', import.meta.url)
);
const fixtureFile = path.join(fixturesDir, '2238E0097309E.xml');

/**
 * Counting SimulationPort fake: lets tests assert the engine call counter
 * (AC-P2-04: a cached re-run must not call the engine again).
 */
class CountingSimulationPort implements SimulationPort {
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
      consumptionKwh: 48522.767,
      emissionsKg: 7770.9,
      energyLabel: 'D',
      climateLabel: 'D',
      rawEngineOutput: {
        logement: {
          sortie: {
            ep_conso: { ep_conso_5_usages: 48522.767, ep_conso_5_usages_m2: 219 },
            emission_ges: { emission_ges_5_usages: 7770.9, emission_ges_5_usages_m2: 35 }
          }
        }
      }
    });
  }
}

/**
 * Builds the app in memory:// mode (in-memory repositories, no Postgres) with
 * an optional SimulationPort override. `forceAsync` sets SIMULATION_FORCE_ASYNC
 * before the module compiles so the config picks it up.
 */
async function createSimulationTestApp(port?: SimulationPort, forceAsync = false): Promise<INestApplication> {
  const previous = process.env['SIMULATION_FORCE_ASYNC'];
  if (forceAsync) {
    process.env['SIMULATION_FORCE_ASYNC'] = 'true';
  }
  try {
    let builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_CONTEXT)
      .useValue(null)
      .overrideProvider(BUILDING_REPOSITORY)
      .useValue(new InMemoryBuildingRepository())
      .overrideProvider(SIMULATION_REPOSITORY)
      .useValue(new InMemorySimulationRepository());
    if (port !== undefined) {
      builder = builder.overrideProvider(SIMULATION_PORT).useValue(port);
    }
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    return app;
  } finally {
    if (forceAsync) {
      if (previous === undefined) {
        delete process.env['SIMULATION_FORCE_ASYNC'];
      } else {
        process.env['SIMULATION_FORCE_ASYNC'] = previous;
      }
    }
  }
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

describe('P2 simulations API (memory://)', () => {
  it('POST /buildings/:id/simulations runs + persists; GET history/by-id return it; repeat POST is cached with zero extra engine calls (AC-P2-04)', async () => {
    const port = new CountingSimulationPort();
    const app = await createSimulationTestApp(port);
    apps.push(app);
    const buildingId = await importFixture(app);

    const first = await request(app.getHttpServer()).post(`/buildings/${buildingId}/simulations`).expect(201);
    expect(first.body.mode).toBe('sync');
    expect(first.body.cached).toBe(false);
    const result = first.body.result as Record<string, unknown>;
    expect(result['buildingId']).toBe(buildingId);
    expect(result['engineVersion']).toBe('1.11.6');
    expect(result['inputHash']).toMatch(/^[0-9a-f]{64}$/);
    expect(['A', 'B', 'C', 'D', 'E', 'F', 'G']).toContain(result['energyLabel']);
    expect(['A', 'B', 'C', 'D', 'E', 'F', 'G']).toContain(result['climateLabel']);
    expect(result['consumptionKwh']).toBe(48522.767);
    expect(result['consumptionKwhM2An']).toBe(219);
    expect(result['emissionsKgCo2M2An']).toBe(35);
    expect(port.calls).toBe(1);

    const history = await request(app.getHttpServer()).get(`/buildings/${buildingId}/simulations`).expect(200);
    expect(history.body.results).toHaveLength(1);
    expect(history.body.results[0].id).toBe(result['id']);

    const byId = await request(app.getHttpServer()).get(`/simulations/${String(result['id'])}`).expect(200);
    expect(byId.body.inputHash).toBe(result['inputHash']);

    const second = await request(app.getHttpServer()).post(`/buildings/${buildingId}/simulations`).expect(201);
    expect(second.body.mode).toBe('cached');
    expect(second.body.cached).toBe(true);
    expect(second.body.result.id).toBe(result['id']);
    expect(port.calls).toBe(1);
  });

  it('404 on unknown building / simulation / job ids', async () => {
    const app = await createSimulationTestApp();
    apps.push(app);
    const unknown = '99999999-9999-4999-8999-999999999999';
    await request(app.getHttpServer()).post(`/buildings/${unknown}/simulations`).expect(404);
    await request(app.getHttpServer()).get(`/buildings/${unknown}/simulations`).expect(404);
    await request(app.getHttpServer()).get(`/simulations/${unknown}`).expect(404);
    await request(app.getHttpServer()).get(`/simulations/jobs/${unknown}`).expect(404);
  });

  it('forced queued path: 202 job → duplicate POST 409 with jobId → poll to done → result persisted → re-POST cached (engine calls = 1)', async () => {
    const port = new CountingSimulationPort();
    port.delayMs = 200;
    const app = await createSimulationTestApp(port, true);
    apps.push(app);
    const buildingId = await importFixture(app);

    const queued = await request(app.getHttpServer()).post(`/buildings/${buildingId}/simulations`).expect(202);
    expect(queued.body.mode).toBe('async');
    expect(queued.body.cached).toBe(false);
    const job = queued.body.job as { id: string; status: string };
    expect(['queued', 'running']).toContain(job.status);

    const dup = await request(app.getHttpServer()).post(`/buildings/${buildingId}/simulations`).expect(409);
    expect(dup.body.jobId).toBe(job.id);

    let finalJob: { status: string; resultId: string | null } | null = null;
    for (let i = 0; i < 100; i += 1) {
      const status = await request(app.getHttpServer()).get(`/simulations/jobs/${job.id}`).expect(200);
      if (status.body.status === 'done' || status.body.status === 'failed') {
        finalJob = status.body as { status: string; resultId: string | null };
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(finalJob?.status).toBe('done');
    expect(finalJob?.resultId).not.toBeNull();

    const result = await request(app.getHttpServer())
      .get(`/simulations/${String(finalJob?.resultId)}`)
      .expect(200);
    expect(result.body.buildingId).toBe(buildingId);

    const again = await request(app.getHttpServer()).post(`/buildings/${buildingId}/simulations`).expect(201);
    expect(again.body.mode).toBe('cached');
    expect(port.calls).toBe(1);
  });

  it('422 on mapping error, 500 on engine error (FR-P2-05)', async () => {
    const mappingPort = new CountingSimulationPort();
    mappingPort.error = new SimulationMappingError('cannot map building');
    const app1 = await createSimulationTestApp(mappingPort);
    apps.push(app1);
    const buildingId1 = await importFixture(app1);
    const res1 = await request(app1.getHttpServer()).post(`/buildings/${buildingId1}/simulations`).expect(422);
    expect(res1.body.code).toBe('MAPPING');

    const enginePort = new CountingSimulationPort();
    enginePort.error = new EngineExecutionError('engine exploded');
    const app2 = await createSimulationTestApp(enginePort);
    apps.push(app2);
    const buildingId2 = await importFixture(app2);
    const res2 = await request(app2.getHttpServer()).post(`/buildings/${buildingId2}/simulations`).expect(500);
    expect(res2.body.code).toBe('ENGINE_EXECUTION');
  });
});
