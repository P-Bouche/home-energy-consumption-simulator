import { Module } from '@nestjs/common';
import { BUILDING_REPOSITORY, DPE_IMPORTER_PORT, IMPORT_DPE_XML_USE_CASE, ImportDpeXmlUseCase, type BuildingRepository, type DpeImporterPort } from '@hes/application';
import { ImportsController } from './imports.controller.ts';
import { InfrastructureModule } from '../infrastructure.module.ts';

/**
 * Imports module: exposes POST /imports/dpe. The use case is built here from
 * the global port providers (InfrastructureModule).
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [ImportsController],
  providers: [
    {
      provide: IMPORT_DPE_XML_USE_CASE,
      useFactory: (importer: DpeImporterPort, repository: BuildingRepository) =>
        new ImportDpeXmlUseCase({ importer, repository }),
      inject: [DPE_IMPORTER_PORT, BUILDING_REPOSITORY]
    }
  ]
})
export class ImportsModule {}
