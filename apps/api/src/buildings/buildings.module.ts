import { Module } from '@nestjs/common';
import { BUILDING_REPOSITORY, GET_BUILDING_USE_CASE, GetBuildingUseCase, type BuildingRepository } from '@hes/application';
import { BuildingsController } from './buildings.controller.ts';
import { InfrastructureModule } from '../infrastructure.module.ts';

/**
 * Buildings module: exposes GET /buildings/:id.
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [BuildingsController],
  providers: [
    {
      provide: GET_BUILDING_USE_CASE,
      useFactory: (repository: BuildingRepository) => new GetBuildingUseCase({ repository }),
      inject: [BUILDING_REPOSITORY]
    }
  ]
})
export class BuildingsModule {}
