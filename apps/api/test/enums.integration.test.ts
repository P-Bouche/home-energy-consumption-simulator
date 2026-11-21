import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENUM_LABEL_KINDS, ENUM_LABELS } from '@hes/open3cl-adapter';
import { createTestApp } from './helpers.ts';

describe('GET /enums/:kind (read-only enum label tables)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the id -> French label table for every known kind', async () => {
    for (const kind of ENUM_LABEL_KINDS) {
      const res = await request(app.getHttpServer()).get(`/enums/${kind}`).expect(200);
      expect(res.body.kind).toBe(kind);
      expect(res.body.labels).toEqual(ENUM_LABELS[kind]);
    }
  });

  it('serves the audit fixture values: orientation 2 = nord, wallType 13 = murs en béton banché', async () => {
    const orientation = await request(app.getHttpServer()).get('/enums/orientation').expect(200);
    expect(orientation.body.labels['2']).toBe('nord');
    const wallType = await request(app.getHttpServer()).get('/enums/wallType').expect(200);
    expect(wallType.body.labels['13']).toBe('murs en béton banché');
  });

  it('404 on an unknown kind (the web shows the raw id instead of guessing)', async () => {
    const res = await request(app.getHttpServer()).get('/enums/nope').expect(404);
    expect(res.body.message).toContain('unknown enum kind');
  });
});
