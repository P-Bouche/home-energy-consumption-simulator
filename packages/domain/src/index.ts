export { ENERGY_LABELS, isEnergyLabel, type EnergyLabel } from './energy-label.ts';
export {
  createSimulationResult,
  type SimulationResult,
  type SimulationResultInput
} from './simulation-result.ts';
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
export { BuildingImported, type DomainEvent } from './events.ts';
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
