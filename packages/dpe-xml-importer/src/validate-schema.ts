import { DpeSchemaValidationError } from '@hes/domain';
import { MAX_XML_DEPTH } from './parse-dpe-xml.ts';
import { asArray, childRecord, isRecord, str } from './xml-utils.ts';

/**
 * One structural schema issue: element path + human-readable message.
 */
export interface SchemaIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Result of structural validation.
 */
export interface SchemaValidationResult {
  readonly variant: string;
  readonly issues: readonly SchemaIssue[];
}

/**
 * DPE schema variants present in the fixture corpus (modele_dpe_id /
 * enum_version_id). v1 supports the `logement` model (modele 1) across the
 * diagnostic versions 2, 2.1, 2.2, 2.3 and 2.4 found in the corpus.
 */
export const SUPPORTED_MODELE_DPE_ID = '1';
export const KNOWN_VERSION_IDS = ['2', '2.1', '2.2', '2.3', '2.4'] as const;

/**
 * Validates the parsed document against the structural DPE schema shared by
 * the corpus variants: root `dpe`, administrative block with model/version
 * enums, and a `logement` section with `caracteristique_generale`.
 *
 * Unknown optional elements are NOT errors here — they are collected as
 * unrecognized fields by the report builder. Only structural breakage
 * (missing root/sections, unsupported model, excessive nesting) is fatal.
 *
 * @param doc - parsed XML tree (output of parseDpeXml)
 * @returns the detected schema variant and the list of issues
 */
export function validateDpeStructure(doc: unknown): SchemaValidationResult {
  const issues: SchemaIssue[] = [];
  const dpe = childRecord(doc, 'dpe');
  if (dpe === undefined) {
    issues.push({ path: 'dpe', message: 'root element <dpe> is missing or not an element' });
    return { variant: 'unknown', issues };
  }
  const numeroDpe = str(dpe['numero_dpe']);
  if (numeroDpe === null) {
    issues.push({ path: 'dpe/numero_dpe', message: 'missing or empty <numero_dpe>' });
  }
  const administratif = childRecord(dpe, 'administratif');
  const modeleId = administratif === undefined ? null : str(administratif['enum_modele_dpe_id']);
  const versionId = administratif === undefined ? null : str(administratif['enum_version_id']);
  if (administratif === undefined) {
    issues.push({ path: 'dpe/administratif', message: 'missing <administratif> section' });
  } else {
    if (modeleId === null) {
      issues.push({ path: 'dpe/administratif/enum_modele_dpe_id', message: 'missing model enum' });
    } else if (modeleId !== SUPPORTED_MODELE_DPE_ID) {
      issues.push({
        path: 'dpe/administratif/enum_modele_dpe_id',
        message: `unsupported modele_dpe_id ${modeleId} (v1 supports only ${SUPPORTED_MODELE_DPE_ID}, logement)`
      });
    }
    if (versionId === null) {
      issues.push({ path: 'dpe/administratif/enum_version_id', message: 'missing diagnostic version enum' });
    }
  }
  const logement = childRecord(dpe, 'logement');
  if (logement === undefined) {
    issues.push({ path: 'dpe/logement', message: 'missing <logement> section' });
  } else if (childRecord(logement, 'caracteristique_generale') === undefined) {
    issues.push({
      path: 'dpe/logement/caracteristique_generale',
      message: 'missing <caracteristique_generale> section'
    });
  }
  const depthIssue = findDepthIssue(doc, '', 0);
  if (depthIssue !== null) {
    issues.push(depthIssue);
  }
  const variant =
    modeleId !== null && versionId !== null ? `modele=${modeleId}/version=${versionId}` : 'unknown';
  return { variant, issues };
}

/**
 * Throws when the structure has issues.
 *
 * @throws DpeSchemaValidationError listing every issue (path: message)
 */
export function assertValidDpeStructure(doc: unknown): SchemaValidationResult {
  const result = validateDpeStructure(doc);
  if (result.issues.length > 0) {
    throw new DpeSchemaValidationError(result.issues.map((i) => `${i.path}: ${i.message}`));
  }
  return result;
}

function findDepthIssue(node: unknown, path: string, depth: number): SchemaIssue | null {
  if (depth > MAX_XML_DEPTH) {
    return { path: path === '' ? '(root)' : path, message: `nesting deeper than ${MAX_XML_DEPTH} levels` };
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const issue = findDepthIssue(item, path, depth);
      if (issue !== null) return issue;
    }
    return null;
  }
  if (isRecord(node)) {
    for (const [key, value] of Object.entries(node)) {
      const issue = findDepthIssue(value, path === '' ? key : `${path}/${key}`, depth + 1);
      if (issue !== null) return issue;
    }
  }
  return null;
}

/**
 * Lists the schema variants actually present in a parsed corpus (used by the
 * benchmark and tests to report coverage).
 */
export function detectVariant(doc: unknown): string {
  const dpe = childRecord(doc, 'dpe');
  const admin = dpe === undefined ? undefined : childRecord(dpe, 'administratif');
  const modele = admin === undefined ? null : str(admin['enum_modele_dpe_id']);
  const version = admin === undefined ? null : str(admin['enum_version_id']);
  const logement = dpe === undefined ? undefined : childRecord(dpe, 'logement');
  void asArray(logement);
  return modele !== null && version !== null ? `modele=${modele}/version=${version}` : 'unknown';
}
