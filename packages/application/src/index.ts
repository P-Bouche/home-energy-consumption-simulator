export type { SimulationPort } from './ports/simulation-port.ts';
export {
  BUILDING_REPOSITORY,
  type BuildingRepository,
  type SaveBuildingInput,
  type StoredBuilding
} from './ports/building-repository.ts';
export { DPE_IMPORTER_PORT, type DpeImporterPort, type DpeImportResult } from './ports/dpe-importer-port.ts';
export { BuildingNotFoundError } from './errors.ts';
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
