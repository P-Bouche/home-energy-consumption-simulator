import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import {
  BUILDING_REPOSITORY,
  DPE_IMPORTER_PORT,
  type BuildingRepository
} from '@hes/application';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import { PostgresBuildingRepository, runMigrations } from '@hes/postgres-repository';
import { CONFIG, loadConfig, type ApiConfig } from './config.ts';
import { InMemoryBuildingRepository } from './in-memory-building-repository.ts';

/**
 * Module wiring the infrastructure adapters to the application ports (imported
 * by AppModule and by each feature module that needs the ports):
 * - DPE_IMPORTER_PORT → DpeXmlImporter (packages/dpe-xml-importer)
 * - BUILDING_REPOSITORY → PostgresBuildingRepository (packages/postgres-repository),
 *   or InMemoryBuildingRepository when DATABASE_URL=memory:// (local demos / e2e)
 */
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    { provide: DPE_IMPORTER_PORT, useClass: DpeXmlImporter },
    {
      provide: BUILDING_REPOSITORY,
      useFactory: async (config: ApiConfig): Promise<BuildingRepository> => {
        if (config.databaseUrl === 'memory://') {
          return new InMemoryBuildingRepository();
        }
        const pool = new Pool({ connectionString: config.databaseUrl });
        await runMigrations(pool, config.migrationsDir);
        return new PostgresBuildingRepository(pool);
      },
      inject: [CONFIG]
    },
  ],
  exports: [CONFIG, DPE_IMPORTER_PORT, BUILDING_REPOSITORY]
})
export class InfrastructureModule {}
