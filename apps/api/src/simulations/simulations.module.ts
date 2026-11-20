import { Module } from '@nestjs/common';
import {
  BUILDING_REPOSITORY,
  GET_SIMULATION_HISTORY_USE_CASE,
  GET_SIMULATION_JOB_USE_CASE,
  GET_SIMULATION_USE_CASE,
  RUN_SIMULATION_USE_CASE,
  SIMULATION_JOB_RUNNER,
  SIMULATION_REPOSITORY,
  SIMULATION_PORT,
  GetSimulationHistoryUseCase,
  GetSimulationJobUseCase,
  GetSimulationUseCase,
  RunSimulationUseCase,
  SimulationJobRunner,
  type BuildingRepository,
  type SimulationRepository,
  type SimulationPort
} from '@hes/application';
import { InfrastructureModule } from '../infrastructure.module.ts';
import { CONFIG, type ApiConfig } from '../config.ts';
import { BuildingsSimulationsController } from './buildings-simulations.controller.ts';
import { SimulationsController } from './simulations.controller.ts';

/**
 * Simulations module (P2): POST/GET /buildings/:id/simulations,
 * GET /simulations/:id, GET /simulations/jobs/:id. Controllers stay thin;
 * all logic lives in the application use cases.
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [BuildingsSimulationsController, SimulationsController],
  providers: [
    {
      provide: RUN_SIMULATION_USE_CASE,
      useFactory: (
        buildingRepository: BuildingRepository,
        simulationRepository: SimulationRepository,
        simulation: SimulationPort,
        runner: SimulationJobRunner,
        config: ApiConfig
      ) =>
        new RunSimulationUseCase({
          buildingRepository,
          simulationRepository,
          simulation,
          runner,
          config: { syncBudgetMs: config.simulationSyncBudgetMs, forceAsync: config.simulationForceAsync }
        }),
      inject: [BUILDING_REPOSITORY, SIMULATION_REPOSITORY, SIMULATION_PORT, SIMULATION_JOB_RUNNER, CONFIG]
    },
    {
      provide: GET_SIMULATION_HISTORY_USE_CASE,
      useFactory: (buildingRepository: BuildingRepository, simulationRepository: SimulationRepository) =>
        new GetSimulationHistoryUseCase({ buildingRepository, simulationRepository }),
      inject: [BUILDING_REPOSITORY, SIMULATION_REPOSITORY]
    },
    {
      provide: GET_SIMULATION_USE_CASE,
      useFactory: (simulationRepository: SimulationRepository) =>
        new GetSimulationUseCase({ simulationRepository }),
      inject: [SIMULATION_REPOSITORY]
    },
    {
      provide: GET_SIMULATION_JOB_USE_CASE,
      useFactory: (simulationRepository: SimulationRepository) =>
        new GetSimulationJobUseCase({ simulationRepository }),
      inject: [SIMULATION_REPOSITORY]
    }
  ]
})
export class SimulationsModule {}
