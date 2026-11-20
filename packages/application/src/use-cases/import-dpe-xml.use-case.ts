import type { BuildingId, ImportReport } from '@hes/domain';
import { EmptyDpeInputError } from '@hes/domain';
import type { BuildingRepository, DpeImporterPort } from '../ports/index.ts';

/**
 * Result of {@link ImportDpeXmlUseCase.execute}: the persisted building id
 * and the import report (FR-P1-01).
 */
export interface ImportDpeXmlResult {
  readonly buildingId: BuildingId;
  readonly report: ImportReport;
}

/**
 * Dependencies of {@link ImportDpeXmlUseCase} (dependency injection).
 */
export interface ImportDpeXmlUseCaseDeps {
  readonly importer: DpeImporterPort;
  readonly repository: BuildingRepository;
}

/**
 * Injection token for the use case (NestJS wiring in apps/api).
 */
export const IMPORT_DPE_XML_USE_CASE = Symbol('ImportDpeXmlUseCase');

/**
 * Use case: import a French DPE XML upload into the canonical Building
 * aggregate and persist it with its import report.
 *
 * Flow (docs/phases/P1-dpe-import.md): controller → this use case →
 * DpeImporterPort (packages/dpe-xml-importer) → BuildingRepository port
 * (Postgres adapter). The use case itself stays framework-free.
 */
export class ImportDpeXmlUseCase {
  private readonly importer: DpeImporterPort;
  private readonly repository: BuildingRepository;

  constructor(deps: ImportDpeXmlUseCaseDeps) {
    this.importer = deps.importer;
    this.repository = deps.repository;
  }

  /**
   * @param dpeXml - raw DPE XML content
   * @returns the persisted building id and the import report
   * @throws EmptyDpeInputError when the upload is empty
   * @throws DpeFileTooLargeError / InvalidDpeXmlError / DpeSchemaValidationError
   * from the importer port (mapped to HTTP 413/422 by the API layer)
   */
  async execute(dpeXml: string): Promise<ImportDpeXmlResult> {
    if (typeof dpeXml !== 'string' || dpeXml.trim().length === 0) {
      throw new EmptyDpeInputError();
    }
    const { building, report } = this.importer.importDpeXml(dpeXml);
    const buildingId = await this.repository.save({ building, report });
    return { buildingId, report };
  }
}
