import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.ts';

const fixturesDir = fileURLToPath(
  new URL('../../../packages/open3cl-adapter/test/fixtures', import.meta.url)
);
const fixtureFile = path.join(fixturesDir, '2238E0097309E.xml');
const fixtureXml = readFileSync(fixtureFile, 'utf8');

describe('P1 API integration (in-memory repository)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /imports/dpe imports a fixture and returns { buildingId, report }', async () => {
    const res = await request(app.getHttpServer())
      .post('/imports/dpe')
      .attach('file', Buffer.from(fixtureXml), '2238E0097309E.xml')
      .expect(201);
    expect(res.body.buildingId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(res.body.report.reportVersion).toBe(1);
    expect(res.body.report.dpeNumber).toBe('2238E0097309E');
    expect(res.body.report.parsedFields.length).toBeGreaterThan(0);
    expect(res.body.report.unrecognizedFields.length).toBeGreaterThan(0);
    for (const field of res.body.report.inferredFields as { source: string; confidence: number; importDate: string }[]) {
      expect(field.source.length).toBeGreaterThan(0);
      expect(field.confidence).toBeGreaterThanOrEqual(0);
      expect(field.confidence).toBeLessThan(1);
      expect(Number.isNaN(Date.parse(field.importDate))).toBe(false);
    }
  });

  it('round-trip: POST /imports/dpe then GET /buildings/:id returns identical data', async () => {
    const post = await request(app.getHttpServer())
      .post('/imports/dpe')
      .attach('file', Buffer.from(fixtureXml), '2238E0097309E.xml')
      .expect(201);
    const get = await request(app.getHttpServer())
      .get(`/buildings/${post.body.buildingId}`)
      .expect(200);
    expect(get.body.building.id).toBe(post.body.buildingId);
    expect(get.body.report).toEqual(post.body.report);
    expect(get.body.building.dpeNumber.value).toBe('2238E0097309E');
    expect(get.body.building.dpeNumber.confidence).toBe(1);
    expect(get.body.building.walls.length).toBeGreaterThan(0);
  });

  it('returns 422 with schema errors on structurally invalid XML', async () => {
    const res = await request(app.getHttpServer())
      .post('/imports/dpe')
      .attach('file', Buffer.from('<dpe><numero_dpe>X</numero_dpe></dpe>'), 'bad.xml')
      .expect(422);
    expect(res.body.schemaErrors.length).toBeGreaterThan(0);
    expect(res.body.schemaErrors.join(' ')).toContain('logement');
  });

  it('returns 422 on malformed XML', async () => {
    const res = await request(app.getHttpServer())
      .post('/imports/dpe')
      .attach('file', Buffer.from('<dpe><numero_dpe>unclosed'), 'broken.xml')
      .expect(422);
    expect(res.body.message).toMatch(/well-formed/i);
  });

  it('returns 422 when the file field is missing', async () => {
    await request(app.getHttpServer()).post('/imports/dpe').expect(422);
  });

  it('returns 413 on an upload larger than 5 MB', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0x20);
    await request(app.getHttpServer())
      .post('/imports/dpe')
      .attach('file', big, 'big.xml')
      .expect(413);
  });

  it('returns 404 on an unknown building id', async () => {
    await request(app.getHttpServer())
      .get('/buildings/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });

  it('concurrent imports of different fixtures do not interfere', async () => {
    const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.xml')).slice(0, 5);
    const results = await Promise.all(
      files.map((f) =>
        request(app.getHttpServer())
          .post('/imports/dpe')
          .attach('file', readFileSync(path.join(fixturesDir, f)), f)
          .expect(201)
      )
    );
    const ids = results.map((r) => r.body.buildingId as string);
    expect(new Set(ids).size).toBe(files.length);
    for (const res of results) {
      const get = await request(app.getHttpServer()).get(`/buildings/${res.body.buildingId}`).expect(200);
      expect(get.body.report).toEqual(res.body.report);
    }
  });
});
