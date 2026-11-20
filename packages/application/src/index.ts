export { SIMULATION_PORT, type SimulationPort } from './ports/simulation-port.ts';
export {
  SIMULATION_REPOSITORY,
  type SimulationRepository
} from './ports/simulation-repository.ts';
export {
  BUILDING_REPOSITORY,
  type BuildingRepository,
  type SaveBuildingInput,
  type StoredBuilding
} from './ports/building-repository.ts';
export { DPE_IMPORTER_PORT, type DpeImporterPort, type DpeImportResult } from './ports/dpe-importer-port.ts';
export {
  BuildingNotFoundError,
  SimulationAlreadyInFlightError,
  SimulationJobNotFoundError,
  SimulationNotFoundError
} from './errors.ts';
export { consoleLogger, type Logger } from './logger.ts';
export { canonicalJson, computeBuildingInputHash } from './building-input-hash.ts';
export {
  IMPORT_DPE_XML_USE_CASE,
  ImportDpeXmlUseCase,
  type ImportDpeXmlResult,
  type ImportDpeXmlUseCaseDeps
} from './use-cases/import-dpe-xml.use-case.ts';
export {
  GET_BUILDING_USE_CASE,
  GetBuildingUseCase,
  type GetBuildingResult,
  type GetBuildingUseCaseDeps
} from './use-cases/get-building.use-case.ts';
export {
  RUN_SIMULATION_USE_CASE,
  RunSimulationUseCase,
  DEFAULT_SYNC_BUDGET_MS,
  estimateSimulationMs,
  type RunSimulationConfig,
  type RunSimulationResult,
  type RunSimulationUseCaseDeps
} from './use-cases/run-simulation.use-case.ts';
export {
  SIMULATION_JOB_RUNNER,
  SimulationJobRunner,
  type SimulationJobRunnerDeps
} from './use-cases/simulation-job-runner.ts';
export {
  GET_SIMULATION_HISTORY_USE_CASE,
  GetSimulationHistoryUseCase,
  type GetSimulationHistoryResult,
  type GetSimulationHistoryUseCaseDeps
} from './use-cases/get-simulation-history.use-case.ts';
export {
  GET_SIMULATION_USE_CASE,
  GetSimulationUseCase,
  type GetSimulationUseCaseDeps
} from './use-cases/get-simulation.use-case.ts';
export {
  GET_SIMULATION_JOB_USE_CASE,
  GetSimulationJobUseCase,
  type GetSimulationJobUseCaseDeps
} from './use-cases/get-simulation-job.use-case.ts';
