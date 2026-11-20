export { DpeXmlImporter } from './dpe-xml-importer.ts';
export { mapToBuilding } from './map-to-building.ts';
export { assertValidDpeStructure, detectVariant, KNOWN_VERSION_IDS, SUPPORTED_MODELE_DPE_ID, validateDpeStructure, type SchemaIssue, type SchemaValidationResult } from './validate-schema.ts';
export { MAX_DPE_XML_BYTES, MAX_XML_DEPTH, parseDpeXml } from './parse-dpe-xml.ts';
export { ImportContext } from './import-context.ts';
export { INFERENCE_RULES, mapAdministratif, mapEnveloppe, mapGeneral, mapSystems, type AdminMapping, type GeneralMapping, type SystemsMapping } from './mappers.ts';
export { asArray, child, childRecord, decodePredefinedEntities, isRecord, num, str } from './xml-utils.ts';
