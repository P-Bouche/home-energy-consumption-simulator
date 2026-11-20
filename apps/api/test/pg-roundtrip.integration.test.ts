import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { AppModule } from '../src/app.module.ts';
import { HttpExceptionFilter } from '../src/http/http-exception-filter.ts';

const fixturesDir = fileURLToPath(
  new URL('../../../packages/open3cl-adapter/test/fixtures', import.meta.url)
);
const fixtureFile = path.join(fixturesDir, '2364E0984413P.xml');

/**
 * AC-P1-03 / round-trip against a real PostgreSQL/PostGIS instance. Runs in
 * CI (the CI test job provisions postgis/postgis:16-3.4 and sets
 * DATABASE_URL); skipped locally when DATABASE_URL is not set.
 */
const databaseUrl = process.env['DATABASE_URL'];
const describePg = databaseUrl === undefined || databaseUrl === '' ? describe.skip : describe;

describePg('P1 API integration against PostgreSQL/PostGIS (DATABASE_URL)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('round-trip POST /imports/dpe → DB → GET /buildings/:id returns identical data', async () => {
    const xml = readFileSync(fixtureFile, 'utf8');
    const post = await request(app.getHttpServer())
      .post('/imports/dpe')
      .attach('file', Buffer.from(xml), '2364E0984413P.xml')
      .expect(201);
    const id = post.body.buildingId as string;
    const get = await request(app.getHttpServer()).get(`/buildings/${id}`).expect(200);
    expect(get.body.building.id).toBe(id);
    expect(get.body.report).toEqual(post.body.report);

    const row = await pool.query('SELECT dpe_number, schema_variant, location, data FROM buildings WHERE id = $1', [id]);
    expect(row.rows.length).toBe(1);
    const stored = row.rows[0] as { dpe_number: string; schema_variant: string; location: unknown; data: Record<string, unknown> };
    expect(stored.dpe_number).toBe('2364E0984413P');
    expect(stored.schema_variant).toContain('version=');
    expect(stored.location).not.toBeNull();
  });

  it('AC-P1-03: 100% of inferred values in the DB carry full confidence metadata', async () => {
    const xml = readFileSync(fixtureFile, 'utf8');
    const post = await request(app.getHttpServer())
      .post('/imports/dpe')
      .attach('file', Buffer.from(xml), '2364E0984413P.xml')
      .expect(201);
    const id = post.body.buildingId as string;
    const row = await pool.query('SELECT data FROM buildings WHERE id = $1', [id]);
    const data = row.rows[0]?.['data'] as Record<string, unknown>;

    let inferredCount = 0;
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (typeof value === 'object' && value !== null) {
        const rec = value as Record<string, unknown>;
        if (typeof rec['confidence'] === 'number' && rec['confidence'] < 1) {
          inferredCount += 1;
          expect(typeof rec['source']).toBe('string');
          expect((rec['source'] as string).length).toBeGreaterThan(0);
          expect(rec['confidence']).toBeGreaterThanOrEqual(0);
          expect(typeof rec['importDate']).toBe('string');
          expect(Number.isNaN(Date.parse(rec['importDate'] as string))).toBe(false);
        }
        for (const v of Object.values(rec)) visit(v);
      }
    };
    visit(data);
    expect(inferredCount).toBeGreaterThan(0);
  });
});
