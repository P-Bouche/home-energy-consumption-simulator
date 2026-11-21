export { GEOMETRY_PORT, type GeometryPort } from './ports/geometry-port.ts';
export { SIMULATION_PORT, type SimulationPort } from './ports/simulation-port.ts';
export { SIMULATION_REPOSITORY, type SimulationRepository } from './ports/simulation-repository.ts';
export {
  AUDIT_LOG,
  type AuditLog
} from './ports/audit-log.ts';
export {
  BUILDING_REPOSITORY,
  type BuildingRepository,
  type SaveBuildingInput,
  type StoredBuilding,
  type UpdateBuildingInput
} from './ports/building-repository.ts';
export { DPE_IMPORTER_PORT, type DpeImporterPort, type DpeImportResult } from './ports/dpe-importer-port.ts';
export {
  SCENARIO_REPOSITORY,
  type ScenarioRepository,
  type ScenarioResultLink
} from './ports/scenario-repository.ts';
export {
  BuildingNotFoundError,
  NothingToUndoError,
  ScenarioNotFoundError,
  SimulationAlreadyInFlightError,
  SimulationJobNotFoundError,
  SimulationNotFoundError,
  StaleVersionError
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
  RECONSTRUCT_BUILDING_USE_CASE,
  ReconstructBuildingUseCase,
  type ReconstructBuildingResult,
  type ReconstructBuildingUseCaseDeps
} from './use-cases/reconstruct-building.use-case.ts';
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
export {
  EDIT_BUILDING_USE_CASE,
  EditBuildingUseCase,
  type EditBuildingOptions,
  type EditBuildingResult,
  type EditBuildingUseCaseDeps
} from './use-cases/edit-building.use-case.ts';
export {
  UNDO_LAST_CHANGE_USE_CASE,
  UndoLastChangeUseCase,
  type UndoLastChangeUseCaseDeps
} from './use-cases/undo-last-change.use-case.ts';
export {
  GET_AUDIT_LOG_USE_CASE,
  GetAuditLogUseCase,
  type GetAuditLogResult,
  type GetAuditLogUseCaseDeps
} from './use-cases/get-audit-log.use-case.ts';
export {
  type InlineSimulationDeps,
  type InlineSimulationOutcome,
  runInlineSimulation
} from './use-cases/inline-simulation.ts';
export {
  forkOrThrow,
  parseScenarioCommands,
  SCENARIO_USER_ID
} from './use-cases/scenario-commands.ts';
export {
  CREATE_SCENARIO_USE_CASE,
  CreateScenarioUseCase,
  type CreateScenarioInput,
  type CreateScenarioResult,
  type CreateScenarioUseCaseDeps
} from './use-cases/create-scenario.use-case.ts';
export {
  DELETE_SCENARIO_USE_CASE,
  DeleteScenarioUseCase,
  GET_SCENARIO_USE_CASE,
  GetScenarioUseCase,
  LIST_SCENARIOS_USE_CASE,
  ListScenariosUseCase,
  UPDATE_SCENARIO_USE_CASE,
  UpdateScenarioUseCase,
  type ScenarioReadUseCaseDeps,
  type UpdateScenarioInput
} from './use-cases/scenario-read.use-cases.ts';
export {
  SIMULATE_SCENARIO_USE_CASE,
  SimulateScenarioUseCase,
  expectedScenarioHash,
  scenarioFork,
  simulateScenarioAndGetRecord,
  type SimulateScenarioResult,
  type SimulateScenarioUseCaseDeps
} from './use-cases/simulate-scenario.use-case.ts';
export {
  COMPARE_SCENARIOS_USE_CASE,
  CompareScenariosUseCase,
  type CompareScenariosOptions,
  type CompareScenariosResult,
  type CompareScenariosUseCaseDeps
} from './use-cases/compare-scenarios.use-case.ts';
export {
  APPLY_SCENARIO_USE_CASE,
  ApplyScenarioUseCase,
  type ApplyScenarioOptions,
  type ApplyScenarioResult,
  type ApplyScenarioUseCaseDeps
} from './use-cases/apply-scenario.use-case.ts';
