import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { DpeFileTooLargeError, InvalidDpeXmlError } from '@hes/domain';

/**
 * Maximum accepted DPE XML upload size: 5 MB (P1 performance budget is
 * defined for files up to 5 MB; larger uploads are rejected before parsing).
 */
export const MAX_DPE_XML_BYTES = 5 * 1024 * 1024;

/**
 * Maximum element nesting depth accepted during validation. Real DPE files
 * nest ~6 levels; the guard bounds recursion on hostile inputs.
 */
export const MAX_XML_DEPTH = 64;

/**
 * Hardened fast-xml-parser options:
 * - `processEntities: false`: entities are never expanded, so XXE and
 *   "billion laughs" entity bombs cannot be triggered (fast-xml-parser never
 *   fetches external entities in any case; this also disables internal
 *   entity expansion entirely).
 * - `ignoreAttributes: true`: attributes (xmlns:xsi, xsi:nil) are ignored;
 *   the schema variant is read from enum_version_id instead.
 * - `parseTagValue: false`: text values stay strings; numeric conversion is
 *   explicit in the mappers (no silent coercion).
 * - `removeNSPrefix: true`: tolerant of namespaced documents.
 */
const PARSER_OPTIONS = {
  ignoreAttributes: true,
  ignoreDeclaration: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false,
  removeNSPrefix: true,
  preserveOrder: false,
  arrayMode: false
} as const;

/**
 * Parses a DPE XML string into a plain object tree with hardened options.
 *
 * Parsing is bounded, not streaming: the 5 MB size cap plus in-memory parse
 * of a ≤ 5 MB document keeps memory bounded (TR-P1-03); the p95 budget is
 * measured for ≤ 5 MB files (AC-P1-01).
 *
 * @param dpeXml - raw XML content
 * @returns the parsed document (unknown; validate with validateDpeStructure)
 * @throws DpeFileTooLargeError when the content exceeds MAX_DPE_XML_BYTES
 * @throws InvalidDpeXmlError when the content is not well-formed XML
 */
export function parseDpeXml(dpeXml: string): unknown {
  const sizeBytes = Buffer.byteLength(dpeXml, 'utf8');
  if (sizeBytes > MAX_DPE_XML_BYTES) {
    throw new DpeFileTooLargeError(sizeBytes, MAX_DPE_XML_BYTES);
  }
  const validation = XMLValidator.validate(dpeXml);
  if (validation !== true) {
    const err = validation.err;
    throw new InvalidDpeXmlError(
      `not well-formed XML at line ${String(err.line)}, column ${String(err.col)}: ${err.msg}`
    );
  }
  const parser = new XMLParser(PARSER_OPTIONS);
  return parser.parse(dpeXml);
}
