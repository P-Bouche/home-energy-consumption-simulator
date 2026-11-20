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

const fixtureFile = path.join(
  fileURLToPath(new URL('../../../packages/open3cl-adapter/test/fixtures', import.meta.url)),
  '2364E0984413P.xml'
);

/**
 * P4 editing against a real PostgreSQL/PostGIS instance: schema v3 migration
 * (version column + append-only audit_entries), optimistic locking, audit
 * rows. Runs in CI (postgis service container + DATABASE_URL); skipped
 * locally when DATABASE_URL is not set.
 */
const databaseUrl = process.env['DATABASE_URL'];
const describePg = databaseUrl === undefined || databaseUrl === '' ? describe.skip : describe;

describePg('P4 editing API against PostgreSQL/PostGIS (DATABASE_URL)', () => {
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

  it('migration 0003 applied: buildings.version column and audit_entries table with append-only triggers', async () => {
    const applied = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    const versions = applied.rows.map((r) => (r as { version: string }).version);
    expect(versions).toContain('0003_audit.sql');
    const col = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'version'`
    );
    expect(col.rows.length).toBe(1);
    const triggers = await pool.query(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_entries'::regclass AND NOT tgisinternal`
    );
    const names = triggers.rows.map((r) => (r as { tgname: string }).tgname);
    expect(names).toContain('audit_entries_no_row_mutation');
    expect(names).toContain('audit_entries_no_truncate');
  });

  it('edit → version column increments, audit row appended, stale edit → 409, audit table rejects UPDATE', async () => {
    const xml = readFileSync(fixtureFile, 'utf8');
    const post = await request(app.getHttpServer())
      .post('/imports/dpe')
      .attach('file', Buffer.from(xml), '2364E0984413P.xml')
      .expect(201);
    const id = post.body.buildingId as string;
    const server = app.getHttpServer();

    const before = await request(server).get(`/buildings/${id}`).expect(200);
    expect(before.body.version).toBe(0);
    const wallId = (before.body.building.walls as { id: string }[])[0]?.id as string;

    const patched = await request(server)
      .patch(`/buildings/${id}`)
      .set('If-Match', '0')
      .set('x-user-id', 'ci-user')
      .send({ type: 'building.wall.update.v1', buildingId: id, wallId, uValueWm2K: 0.3 })
      .expect(200);
    expect(patched.body.version).toBe(1);

    // version column in the DB
    const row = await pool.query('SELECT version FROM buildings WHERE id = $1', [id]);
    expect((row.rows[0] as { version: number }).version).toBe(1);

    // stale If-Match → 409
    const conflict = await request(server)
      .patch(`/buildings/${id}`)
      .set('If-Match', '0')
      .send({ type: 'building.wall.update.v1', buildingId: id, wallId, uValueWm2K: 0.5 })
      .expect(409);
    expect(conflict.body.code).toBe('STALE_VERSION');

    // audit row present with user-sourced new value
    const audit = await request(server).get(`/buildings/${id}/audit`).expect(200);
    expect(audit.body.entries).toHaveLength(1);
    expect(audit.body.entries[0].changes[0].newValue.source).toBe('user');

    // append-only enforced at DB level
    const auditRow = await pool.query('SELECT id FROM audit_entries WHERE building_id = $1', [id]);
    const auditId = (auditRow.rows[0] as { id: string }).id;
    await expect(pool.query('UPDATE audit_entries SET user_id = $1 WHERE id = $2', ['hacker', auditId])).rejects.toThrow(
      /append-only/
    );
    await expect(pool.query('DELETE FROM audit_entries WHERE id = $1', [auditId])).rejects.toThrow(/append-only/);
    await expect(pool.query('TRUNCATE audit_entries')).rejects.toThrow(/append-only/);

    // undo → version 2, two audit rows
    const undone = await request(server).post(`/buildings/${id}/undo`).set('If-Match', '1').expect(200);
    expect(undone.body.version).toBe(2);
    const auditAfter = await request(server).get(`/buildings/${id}/audit`).expect(200);
    expect(auditAfter.body.entries).toHaveLength(2);
  });
});
