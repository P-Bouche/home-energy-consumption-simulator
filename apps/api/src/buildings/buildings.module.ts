import { Module } from '@nestjs/common';
import {
  AUDIT_LOG,
  BUILDING_REPOSITORY,
  EDIT_BUILDING_USE_CASE,
  GEOMETRY_PORT,
  GET_AUDIT_LOG_USE_CASE,
  GET_BUILDING_USE_CASE,
  RECONSTRUCT_BUILDING_USE_CASE,
  UNDO_LAST_CHANGE_USE_CASE,
  EditBuildingUseCase,
  GetAuditLogUseCase,
  GetBuildingUseCase,
  ReconstructBuildingUseCase,
  UndoLastChangeUseCase,
  type AuditLog,
  type BuildingRepository,
  type GeometryPort
} from '@hes/application';
import { BuildingsController } from './buildings.controller.ts';
import { InfrastructureModule } from '../infrastructure.module.ts';

/**
 * Buildings module: GET /buildings/:id (P1), GET /buildings/:id/geometry (P3)
 * and the P4 editing endpoints (PATCH /buildings/:id, GET /buildings/:id/audit,
 * POST /buildings/:id/undo). Controllers stay thin; use cases are built here
 * from the global port providers (InfrastructureModule).
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
    },
    {
      provide: EDIT_BUILDING_USE_CASE,
      useFactory: (repository: BuildingRepository) => new EditBuildingUseCase({ buildingRepository: repository }),
      inject: [BUILDING_REPOSITORY]
    },
    {
      provide: UNDO_LAST_CHANGE_USE_CASE,
      useFactory: (repository: BuildingRepository, auditLog: AuditLog) =>
        new UndoLastChangeUseCase({ buildingRepository: repository, auditLog }),
      inject: [BUILDING_REPOSITORY, AUDIT_LOG]
    },
    {
      provide: GET_AUDIT_LOG_USE_CASE,
      useFactory: (repository: BuildingRepository, auditLog: AuditLog) =>
        new GetAuditLogUseCase({ buildingRepository: repository, auditLog }),
      inject: [BUILDING_REPOSITORY, AUDIT_LOG]
    }
  ]
})
export class BuildingsModule {}
