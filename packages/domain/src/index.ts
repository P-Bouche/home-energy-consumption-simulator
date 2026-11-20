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
  BuildingImported,
  SimulationCompleted,
  SimulationFailed,
  type DomainEvent
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
