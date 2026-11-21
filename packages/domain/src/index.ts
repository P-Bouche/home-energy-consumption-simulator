export { ENERGY_LABELS, isEnergyLabel, type EnergyLabel } from './energy-label.ts';
export {
  createSimulationResult,
  type SimulationResult,
  type SimulationResultInput
} from './simulation-result.ts';
export {
  createSimulationResultRecord,
  simulationResultRecordFromJson,
  simulationResultRecordToJson,
  type SimulationInputHash,
  type SimulationJobId,
  type SimulationResultId,
  type SimulationResultRecord,
  type SimulationResultRecordInput,
  type SimulationResultRecordJson
} from './simulation-record.ts';
export {
  createSimulationJob,
  SimulationJob,
  simulationJobFromJson,
  simulationJobToJson,
  type SimulationJobError,
  type SimulationJobInput,
  type SimulationJobJson,
  type SimulationJobStatus
} from './simulation-job.ts';
export { toSimulationView, type BuildingSimulationView } from './building-simulation-view.ts';
export {
  EngineExecutionError,
  InvalidDpeError,
  SimulationError,
  SimulationMappingError,
  UnsupportedDpeModelError,
  type SimulationErrorCode
} from './errors.ts';
export {
  confidenceFromJson,
  confidenceToJson,
  createConfidence,
  inferred,
  isMeasured,
  MEASURED_SOURCE_PREFIX,
  measured,
  reviveConfidenceDates,
  USER_SOURCE,
  userSupplied,
  type Confidence,
  type ConfidenceJson
} from './confidence.ts';
export {
  DpeFileTooLargeError,
  DpeImportError,
  DpeSchemaValidationError,
  DomainInvariantError,
  EmptyDpeInputError,
  InvalidDpeXmlError,
  type ImportErrorCode
} from './import-errors.ts';
export type {
  BuildingId,
  Door,
  DoorId,
  Floor,
  FloorId,
  HeatingSystem,
  PhotovoltaicSystem,
  Room,
  RoomId,
  Roof,
  RoofId,
  SystemId,
  ThermalZone,
  ThermalZoneId,
  VentilationSystem,
  Wall,
  WallId,
  Window,
  WindowId,
  Zone,
  ZoneId
} from './entities.ts';
export { Building, type BanCoordinates, type BuildingInput, type BuildingJson } from './building.ts';
export {
  Scenario,
  type ScenarioId,
  type ScenarioInput,
  type ScenarioJson
} from './scenario.ts';
export {
  ComparisonService,
  energyLabelRank,
  labelChange,
  type ComparisonEntryInput,
  type ScenarioComparison,
  type ScenarioComparisonEntry
} from './scenario-comparison.ts';
export {
  COORDINATE_SYSTEM,
  computeMeshHash,
  faceArea,
  geometryFromJson,
  geometryToJson,
  hashString,
  makeFace,
  meshArea,
  ORIENTATIONS,
  parseOrientation,
  round6,
  v3,
  type CoordinateSystem,
  type Dimensions,
  type Face,
  type FaceJson,
  type Geometry,
  type GeometryElement,
  type GeometryElementJson,
  type GeometryElementKind,
  type GeometryJson,
  type Mesh,
  type MeshJson,
  type Orientation,
  type Placement,
  type Vector3
} from './geometry.ts';
export {
  projectHeatLoss,
  HeatLossProjectionError,
  type HeatLossOverlay,
  type HeatLossShare
} from './heat-loss.ts';
export {
  auditEntryFromEvent,
  auditEntryFromJson,
  auditEntryToJson,
  createAuditEntry,
  inverseOfAuditEntry,
  type AuditEntry,
  type AuditEntryInput,
  type AuditEntryJson
} from './audit.ts';
export {
  COMMAND_EDITABLE_FIELDS,
  COMMAND_ELEMENT,
  COMMAND_VOCABULARY_VERSION,
  assertCommandFieldsValid,
  inverseOfCommand,
  parseBuildingCommand,
  validateCommandFields,
  type BuildingCommand,
  type CommandTypeTag,
  type UpdateFloorCommand,
  type UpdateHeatingSystemCommand,
  type UpdateRoofCommand,
  type UpdateVentilationSystemCommand,
  type UpdateWallCommand,
  type UpdateWindowCommand
} from './commands.ts';
export {
  CommandError,
  CommandValidationError,
  ElementNotFoundError,
  InvalidCommandError,
  type CommandErrorCode,
  type FieldError
} from './command-errors.ts';
export { type Either, isLeft, isRight, left, right } from './either.ts';
export {
  BuildingImported,
  BuildingUpdated,
  ScenarioApplied,
  ScenarioCreated,
  ScenarioSimulated,
  SimulationCompleted,
  SimulationFailed,
  type DomainEvent,
  type FieldChange
} from './events.ts';
export {
  createImportReport,
  importReportFromJson,
  importReportToJson,
  REPORT_VERSION,
  type ImportReport,
  type ImportReportInput,
  type ImportReportJson,
  type InferredField,
  type MissingField,
  type ParsedField,
  type UnrecognizedField
} from './import-report.ts';
export {
  DEFAULT_CEILING_HEIGHT_M,
  DEFAULT_LEVEL_COUNT,
  DEFAULT_LIVING_AREA_M2,
  DOOR_HEIGHT_M,
  FOOTPRINT_ASPECT_RATIO,
  INFERENCE_RULES_VERSION,
  OPENING_OFFSET_M,
  ReconstructionService,
  WALL_THICKNESS_M,
  WINDOW_HEIGHT_M,
  WINDOW_SILL_M
} from './reconstruction.ts';
