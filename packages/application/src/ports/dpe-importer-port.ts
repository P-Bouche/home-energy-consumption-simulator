import type { Building, ImportReport } from '@hes/domain';

/**
 * Result of importing a DPE XML document: the domain aggregate plus the
 * import report listing parsed / inferred / unrecognized / missing fields.
 */
export interface DpeImportResult {
  readonly building: Building;
  readonly report: ImportReport;
}

/**
 * Port (hexagonal architecture) for parsing a French DPE XML document into
 * the canonical domain Building aggregate. Implemented by
 * packages/dpe-xml-importer (pure core, no NestJS/ORM imports).
 *
 * Implementations must never import @open3cl/engine (ADR-0001: the engine
 * boundary is packages/open3cl-adapter only).
 */
export interface DpeImporterPort {
  /**
   * Parses, validates and maps a DPE XML string.
   *
   * @param dpeXml - raw DPE XML content (bounded by the importer's size limit)
   * @param importDate - date stamped on every Confidence value; defaults to now
   * @throws EmptyDpeInputError when the input is empty
   * @throws DpeFileTooLargeError when the input exceeds the size limit
   * @throws InvalidDpeXmlError when the input is not well-formed XML
   * @throws DpeSchemaValidationError when the XML fails DPE schema validation
   */
  importDpeXml(dpeXml: string, importDate?: Date): DpeImportResult;
}

/**
 * Injection token for the DpeImporterPort (NestJS wiring in apps/api).
 */
export const DPE_IMPORTER_PORT = Symbol('DpeImporterPort');
