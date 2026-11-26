import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Building, computeMeshHash, geometryFromJson, geometryToJson, ReconstructionService } from '@hes/domain';
import { createTestApp } from './helpers.ts';

const fixturesDir = fileURLToPath(
  new URL('../../../packages/open3cl-adapter/test/fixtures', import.meta.url)
);
const fixtureXml = readFileSync(path.join(fixturesDir, '2238E0097309E.xml'), 'utf8');

describe('P3 API integration: GET /buildings/:id/geometry (in-memory repository)', () => {
  let app: INestApplication;
  let buildingId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const post = await request(app.getHttpServer())
      .post('/imports/dpe')
      .attach('file', Buffer.from(fixtureXml), '2238E0097309E.xml')
      .expect(201);
    buildingId = post.body.buildingId as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with the reconstructed geometry (elements, confidence, meshHash, rules version)', async () => {
    const res = await request(app.getHttpServer()).get(`/buildings/${buildingId}/geometry`).expect(200);
    expect(res.body.buildingId).toBe(buildingId);
    const geometry = res.body.geometry;
    expect(geometry.buildingId).toBe(buildingId);
    expect(geometry.inferenceRulesVersion).toBe('2.0.0');
    expect(geometry.coordinateSystem).toEqual({
      unit: 'm',
      upAxis: 'Z',
      axes: { x: 'east', y: 'north', z: 'up' },
      origin: 'building-footprint-corner'
    });
    expect(geometry.elements.length).toBeGreaterThan(0);
    expect(geometry.meshHash).toMatch(/^[0-9a-f]{16}$/);
    for (const el of geometry.elements as {
      id: string;
      kind: string;
      mesh: { faces: unknown[] };
      placement: { source: string; confidence: number; importDate: string };
      inferred: boolean;
    }[]) {
      expect(el.id).toMatch(/^(wall|roof|floor|window|door|room)-(synthesized-)?\d+$/);
      expect(el.mesh.faces.length).toBeGreaterThan(0);
      expect(el.placement.source.length).toBeGreaterThan(0);
      expect(el.placement.confidence).toBeGreaterThanOrEqual(0);
      expect(el.placement.confidence).toBeLessThanOrEqual(1);
      expect(Number.isNaN(Date.parse(el.placement.importDate))).toBe(false);
      expect(el.inferred).toBe(el.placement.confidence < 1 || el.id.includes('synthesized'));
    }
    // every fixture building has at least one wall and the corpus marks inferred elements
    const kinds = new Set((geometry.elements as { kind: string }[]).map((e) => e.kind));
    expect(kinds.has('wall')).toBe(true);
  });

  it('is deterministic: two calls return byte-identical geometry (same mesh hash)', async () => {
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).get(`/buildings/${buildingId}/geometry`).expect(200),
      request(app.getHttpServer()).get(`/buildings/${buildingId}/geometry`).expect(200)
    ]);
    expect(JSON.stringify(a.body)).toBe(JSON.stringify(b.body));
    expect(a.body.geometry.meshHash).toBe(b.body.geometry.meshHash);
  });

  it('matches a local domain reconstruction of the same building (server/client hash parity)', async () => {
    const buildingRes = await request(app.getHttpServer()).get(`/buildings/${buildingId}`).expect(200);
    const geometryRes = await request(app.getHttpServer()).get(`/buildings/${buildingId}/geometry`).expect(200);
    const building = Building.fromJson(buildingRes.body.building as ReturnType<Building['toJson']>);
    const local = new ReconstructionService().reconstruct(building);
    expect(geometryRes.body.geometry.meshHash).toBe(local.meshHash);
    // and the hash is stable across the JSON round-trip
    const revived = geometryFromJson(JSON.parse(JSON.stringify(geometryToJson(local))) as ReturnType<typeof geometryToJson>);
    expect(computeMeshHash(revived.inferenceRulesVersion, revived.elements)).toBe(local.meshHash);
  });

  it('returns 404 for an unknown building id', async () => {
    const res = await request(app.getHttpServer())
      .get('/buildings/99999999-9999-4999-8999-999999999999/geometry')
      .expect(404);
    expect(res.body.message).toMatch(/no building found/);
  });

  it('round-trip latency: 20 calls stay far inside the 2 s reconstruction budget (p95 measured by benchmark:geometry)', async () => {
    const runs: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const t0 = performance.now();
      await request(app.getHttpServer()).get(`/buildings/${buildingId}/geometry`).expect(200);
      runs.push(performance.now() - t0);
    }
    runs.sort((a, b) => a - b);
    const p95 = runs[Math.ceil(0.95 * runs.length) - 1] ?? 0;
    expect(p95).toBeLessThan(2000);
  });

  it('reconstructs every corpus fixture through the API within budget', async () => {
    const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.xml')).sort();
    expect(files.length).toBe(15);
    for (const file of files) {
      const xml = readFileSync(path.join(fixturesDir, file), 'utf8');
      const post = await request(app.getHttpServer())
        .post('/imports/dpe')
        .attach('file', Buffer.from(xml), file)
        .expect(201);
      const id = post.body.buildingId as string;
      const t0 = performance.now();
      const res = await request(app.getHttpServer()).get(`/buildings/${id}/geometry`).expect(200);
      const ms = performance.now() - t0;
      expect(res.body.geometry.elements.length).toBeGreaterThan(0);
      expect(res.body.geometry.meshHash).toMatch(/^[0-9a-f]{16}$/);
      expect(ms).toBeLessThan(2000);
    }
  });
});
