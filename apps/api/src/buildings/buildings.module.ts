import { Module } from '@nestjs/common';
import {
  BUILDING_REPOSITORY,
  GEOMETRY_PORT,
  GET_BUILDING_USE_CASE,
  GetBuildingUseCase,
  RECONSTRUCT_BUILDING_USE_CASE,
  ReconstructBuildingUseCase,
  type BuildingRepository,
  type GeometryPort
} from '@hes/application';
import { BuildingsController } from './buildings.controller.ts';
import { InfrastructureModule } from '../infrastructure.module.ts';

/**
 * Buildings module: exposes GET /buildings/:id and GET /buildings/:id/geometry (P3).
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [BuildingsController],
  providers: [
    {
      provide: GET_BUILDING_USE_CASE,
      useFactory: (repository: BuildingRepository) => new GetBuildingUseCase({ repository }),
      inject: [BUILDING_REPOSITORY]
    },
    {
      provide: RECONSTRUCT_BUILDING_USE_CASE,
      useFactory: (repository: BuildingRepository, geometry: GeometryPort) =>
        new ReconstructBuildingUseCase({ repository, geometry }),
      inject: [BUILDING_REPOSITORY, GEOMETRY_PORT]
    }
  ]
})
export class BuildingsModule {}
