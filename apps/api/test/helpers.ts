import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { BUILDING_REPOSITORY } from '@hes/application';
import { AppModule } from '../src/app.module.ts';
import { HttpExceptionFilter } from '../src/http/http-exception-filter.ts';
import { InMemoryBuildingRepository } from '../src/in-memory-building-repository.ts';

/**
 * Builds a Nest application wired exactly like production, but with the
 * BuildingRepository port overridden by an in-memory adapter (no Postgres
 * needed for these tests).
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BUILDING_REPOSITORY)
    .useValue(new InMemoryBuildingRepository())
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  return app;
}
