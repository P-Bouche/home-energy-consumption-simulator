import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import {
  BUILDING_REPOSITORY,
  DPE_IMPORTER_PORT,
  SIMULATION_JOB_RUNNER,
  SIMULATION_PORT,
  SIMULATION_REPOSITORY,
  SimulationJobRunner,
  type BuildingRepository,
  type SimulationRepository,
  type SimulationPort
} from '@hes/application';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import { createOpen3clAdapter } from '@hes/open3cl-adapter';
import { PostgresBuildingRepository, PostgresSimulationRepository, runMigrations } from '@hes/postgres-repository';
import { CONFIG, loadConfig, type ApiConfig } from './config.ts';
import { InMemoryBuildingRepository } from './in-memory-building-repository.ts';
import { InMemorySimulationRepository } from './in-memory-simulation-repository.ts';

/**
 * Shared Postgres context (pool + applied migrations), created once in PG
 * mode and shared by the building and simulation repositories.
 */
export interface PgContext {
  readonly pool: Pool;
}

/**
 * Injection token for the shared PG context (null in memory:// mode).
 */
export const PG_CONTEXT = Symbol('PgContext');

/**
 * Module wiring the infrastructure adapters to the application ports (imported
 * by AppModule and by each feature module that needs the ports):
 * - DPE_IMPORTER_PORT → DpeXmlImporter (packages/dpe-xml-importer)
 * - SIMULATION_PORT → Open3clAdapter (packages/open3cl-adapter, the only
 *   engine importer, ADR-0001)
 * - BUILDING_REPOSITORY / SIMULATION_REPOSITORY → Postgres adapters
 *   (packages/postgres-repository), or in-memory adapters when
 *   DATABASE_URL=memory:// (local demos / e2e)
 * - SIMULATION_JOB_RUNNER → in-process executor of queued simulation jobs
 */
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    { provide: DPE_IMPORTER_PORT, useClass: DpeXmlImporter },
    { provide: SIMULATION_PORT, useFactory: (): SimulationPort => createOpen3clAdapter() },
    {
      provide: PG_CONTEXT,
      useFactory: async (config: ApiConfig): Promise<PgContext | null> => {
        if (config.databaseUrl === 'memory://') {
          return null;
        }
        const pool = new Pool({ connectionString: config.databaseUrl });
        await runMigrations(pool, config.migrationsDir);
        return { pool };
      },
      inject: [CONFIG]
    },
    {
      provide: BUILDING_REPOSITORY,
      useFactory: (pg: PgContext | null): BuildingRepository =>
        pg === null ? new InMemoryBuildingRepository() : new PostgresBuildingRepository(pg.pool),
      inject: [PG_CONTEXT]
    },
    {
      provide: SIMULATION_REPOSITORY,
      useFactory: (pg: PgContext | null): SimulationRepository =>
        pg === null ? new InMemorySimulationRepository() : new PostgresSimulationRepository(pg.pool),
      inject: [PG_CONTEXT]
    },
    {
      provide: SIMULATION_JOB_RUNNER,
      useFactory: (
        buildingRepository: BuildingRepository,
        simulationRepository: SimulationRepository,
        simulation: SimulationPort
      ): SimulationJobRunner =>
        new SimulationJobRunner({ buildingRepository, simulationRepository, simulation }),
      inject: [BUILDING_REPOSITORY, SIMULATION_REPOSITORY, SIMULATION_PORT]
    }
  ],
  exports: [CONFIG, DPE_IMPORTER_PORT, SIMULATION_PORT, BUILDING_REPOSITORY, SIMULATION_REPOSITORY, SIMULATION_JOB_RUNNER]
})
export class InfrastructureModule {}
