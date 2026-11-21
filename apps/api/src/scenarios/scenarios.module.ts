import { Module } from '@nestjs/common';
import {
  APPLY_SCENARIO_USE_CASE,
  BUILDING_REPOSITORY,
  COMPARE_SCENARIOS_USE_CASE,
  CREATE_SCENARIO_USE_CASE,
  DELETE_SCENARIO_USE_CASE,
  GET_SCENARIO_USE_CASE,
  LIST_SCENARIOS_USE_CASE,
  SCENARIO_REPOSITORY,
  SIMULATE_SCENARIO_USE_CASE,
  SIMULATION_REPOSITORY,
  SIMULATION_PORT,
  UPDATE_SCENARIO_USE_CASE,
  ApplyScenarioUseCase,
  CompareScenariosUseCase,
  CreateScenarioUseCase,
  DeleteScenarioUseCase,
  GetScenarioUseCase,
  ListScenariosUseCase,
  SimulateScenarioUseCase,
  UpdateScenarioUseCase,
  type BuildingRepository,
  type ScenarioRepository,
  type SimulationPort,
  type SimulationRepository
} from '@hes/application';
import { InfrastructureModule } from '../infrastructure.module.ts';
import { BuildingsScenariosController } from './buildings-scenarios.controller.ts';
import { ScenariosController } from './scenarios.controller.ts';

/**
 * Scenarios module (P5, headless): CRUD + simulate + apply + compare.
 * Controllers stay thin; all logic lives in the application use cases, and
 * every scenario simulation goes through the ONE shared inline pipeline
 * (SimulationPort + input-hash cache, `runInlineSimulation`) — the same path
 * as the P2 baseline sync flow, never a parallel calculation path (ADR-0001).
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [BuildingsScenariosController, ScenariosController],
  providers: [
    {
      provide: CREATE_SCENARIO_USE_CASE,
      useFactory: (buildingRepository: BuildingRepository, scenarioRepository: ScenarioRepository) =>
        new CreateScenarioUseCase({ buildingRepository, scenarioRepository }),
      inject: [BUILDING_REPOSITORY, SCENARIO_REPOSITORY]
    },
    {
      provide: LIST_SCENARIOS_USE_CASE,
      useFactory: (buildingRepository: BuildingRepository, scenarioRepository: ScenarioRepository) =>
        new ListScenariosUseCase({ buildingRepository, scenarioRepository }),
      inject: [BUILDING_REPOSITORY, SCENARIO_REPOSITORY]
    },
    {
      provide: GET_SCENARIO_USE_CASE,
      useFactory: (scenarioRepository: ScenarioRepository) => new GetScenarioUseCase({ scenarioRepository }),
      inject: [SCENARIO_REPOSITORY]
    },
    {
      provide: UPDATE_SCENARIO_USE_CASE,
      useFactory: (buildingRepository: BuildingRepository, scenarioRepository: ScenarioRepository) =>
        new UpdateScenarioUseCase({ buildingRepository, scenarioRepository }),
      inject: [BUILDING_REPOSITORY, SCENARIO_REPOSITORY]
    },
    {
      provide: DELETE_SCENARIO_USE_CASE,
      useFactory: (scenarioRepository: ScenarioRepository) => new DeleteScenarioUseCase({ scenarioRepository }),
      inject: [SCENARIO_REPOSITORY]
    },
    {
      provide: SIMULATE_SCENARIO_USE_CASE,
      useFactory: (
        buildingRepository: BuildingRepository,
        scenarioRepository: ScenarioRepository,
        simulationRepository: SimulationRepository,
        simulation: SimulationPort
      ) => new SimulateScenarioUseCase({ buildingRepository, scenarioRepository, simulationRepository, simulation }),
      inject: [BUILDING_REPOSITORY, SCENARIO_REPOSITORY, SIMULATION_REPOSITORY, SIMULATION_PORT]
    },
    {
      provide: COMPARE_SCENARIOS_USE_CASE,
      useFactory: (
        buildingRepository: BuildingRepository,
        scenarioRepository: ScenarioRepository,
        simulationRepository: SimulationRepository,
        simulation: SimulationPort
      ) =>
        new CompareScenariosUseCase({
          buildingRepository,
          scenarioRepository,
          simulationRepository,
          simulation
        }),
      inject: [BUILDING_REPOSITORY, SCENARIO_REPOSITORY, SIMULATION_REPOSITORY, SIMULATION_PORT]
    },
    {
      provide: APPLY_SCENARIO_USE_CASE,
      useFactory: (
        buildingRepository: BuildingRepository,
        scenarioRepository: ScenarioRepository,
        simulationRepository: SimulationRepository,
        simulation: SimulationPort
      ) => new ApplyScenarioUseCase({ buildingRepository, scenarioRepository, simulationRepository, simulation }),
      inject: [BUILDING_REPOSITORY, SCENARIO_REPOSITORY, SIMULATION_REPOSITORY, SIMULATION_PORT]
    }
  ]
})
export class ScenariosModule {}
