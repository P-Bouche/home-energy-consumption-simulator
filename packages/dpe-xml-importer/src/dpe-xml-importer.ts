import type { DpeImportResult, DpeImporterPort } from '@hes/application';
import { EmptyDpeInputError } from '@hes/domain';
import { mapToBuilding } from './map-to-building.ts';
import { parseDpeXml } from './parse-dpe-xml.ts';
import { assertValidDpeStructure } from './validate-schema.ts';

/**
 * DpeImporterPort adapter: French DPE XML string → domain Building aggregate
 * + ImportReport v1. Pure core: no NestJS, no ORM, and never imports
 * @open3cl/engine (ADR-0001; enforced by ESLint no-restricted-imports).
 */
export class DpeXmlImporter implements DpeImporterPort {
  /**
   * Parses, validates (well-formedness → DPE schema structure) and maps a
   * DPE XML string.
   *
   * @param dpeXml - raw DPE XML content (≤ 5 MB)
   * @param importDate - stamped on every Confidence value; defaults to now
   * @throws EmptyDpeInputError / DpeFileTooLargeError / InvalidDpeXmlError /
   * DpeSchemaValidationError (all typed domain errors)
   */
  importDpeXml(dpeXml: string, importDate: Date = new Date()): DpeImportResult {
    if (typeof dpeXml !== 'string' || dpeXml.trim().length === 0) {
      throw new EmptyDpeInputError();
    }
    const doc = parseDpeXml(dpeXml);
    const { variant } = assertValidDpeStructure(doc);
    return mapToBuilding(doc, variant, importDate);
  }
}
