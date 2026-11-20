/**
 * Machine-readable codes for DPE import failures.
 */
export type ImportErrorCode = 'INVALID_XML' | 'SCHEMA_VALIDATION' | 'FILE_TOO_LARGE' | 'EMPTY_INPUT';

/**
 * Base class for all DPE import domain errors. Carries a stable
 * machine-readable code so the API layer can map it to an HTTP status.
 */
export class DpeImportError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DpeImportError';
    this.code = code;
  }
}

/**
 * The input is empty or not well-formed XML.
 */
export class InvalidDpeXmlError extends DpeImportError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('INVALID_XML', message, options);
    this.name = 'InvalidDpeXmlError';
  }
}

/**
 * The XML is well-formed but does not satisfy the DPE schema structure.
 * Carries the list of schema issues (path + message) for the HTTP 422 body.
 */
export class DpeSchemaValidationError extends DpeImportError {
  readonly schemaErrors: readonly string[];

  constructor(schemaErrors: readonly string[], options?: { cause?: unknown }) {
    super('SCHEMA_VALIDATION', `DPE XML failed schema validation: ${schemaErrors.join('; ')}`, options);
    this.name = 'DpeSchemaValidationError';
    this.schemaErrors = Object.freeze([...schemaErrors]);
  }
}

/**
 * The upload exceeds the maximum accepted size.
 */
export class DpeFileTooLargeError extends DpeImportError {
  readonly sizeBytes: number;
  readonly maxBytes: number;

  constructor(sizeBytes: number, maxBytes: number) {
    super('FILE_TOO_LARGE', `DPE XML is ${sizeBytes} bytes, maximum accepted is ${maxBytes} bytes`);
    this.name = 'DpeFileTooLargeError';
    this.sizeBytes = sizeBytes;
    this.maxBytes = maxBytes;
  }
}

/**
 * The upload body is empty.
 */
export class EmptyDpeInputError extends DpeImportError {
  constructor() {
    super('EMPTY_INPUT', 'The uploaded DPE XML content is empty');
    this.name = 'EmptyDpeInputError';
  }
}

/**
 * A domain invariant was violated (e.g. a Room attached to two Zones).
 */
export class DomainInvariantError extends Error {
  readonly code = 'DOMAIN_INVARIANT';

  constructor(message: string) {
    super(message);
    this.name = 'DomainInvariantError';
  }
}
