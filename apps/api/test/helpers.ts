import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AUDIT_LOG, BUILDING_REPOSITORY } from '@hes/application';
import { AppModule } from '../src/app.module.ts';
import { HttpExceptionFilter } from '../src/http/http-exception-filter.ts';
import { InMemoryAuditLog } from '../src/in-memory-audit-log.ts';
import { InMemoryBuildingRepository } from '../src/in-memory-building-repository.ts';
import { PG_CONTEXT } from '../src/infrastructure.module.ts';

/**
 * Builds a Nest application wired exactly like production, but with the
 * BuildingRepository port overridden by an in-memory adapter and no Postgres
 * context (no database needed for these tests).
 */
export async function createTestApp(): Promise<INestApplication> {
  const auditLog = new InMemoryAuditLog();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_CONTEXT)
    .useValue(null)
    .overrideProvider(BUILDING_REPOSITORY)
    .useValue(new InMemoryBuildingRepository(auditLog))
    .overrideProvider(AUDIT_LOG)
    .useValue(auditLog)
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  return app;
}
