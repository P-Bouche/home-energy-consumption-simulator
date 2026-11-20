/**
 * One field-level validation failure of a building command (P4). Surfaced to
 * the API as HTTP 400 with a per-field message so the editor form can display
 * it next to the offending input.
 */
export interface FieldError {
  readonly field: string;
  readonly message: string;
}

/**
 * Machine-readable codes for P4 command failures.
 */
export type CommandErrorCode = 'INVALID_COMMAND' | 'COMMAND_VALIDATION' | 'ELEMENT_NOT_FOUND';

/**
 * Base class for all P4 command errors. Carries a stable machine-readable code
 * so the API layer can map it to an HTTP status.
 */
export class CommandError extends Error {
  readonly code: CommandErrorCode;

  constructor(code: CommandErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CommandError';
    this.code = code;
  }
}

/**
 * The command JSON could not be parsed into a known command type (unknown
 * type tag, wrong field types, unknown fields). Carries the list of issues.
 * Mapped to HTTP 400.
 */
export class InvalidCommandError extends CommandError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[], options?: { cause?: unknown }) {
    super('INVALID_COMMAND', `invalid building command: ${issues.join('; ')}`, options);
    this.name = 'InvalidCommandError';
    this.issues = Object.freeze([...issues]);
  }
}

/**
 * The command is well-formed but violates a domain invariant or a field range
 * (e.g. negative U-value, window larger than wall). Carries field-level
 * errors. Mapped to HTTP 400; the aggregate is never modified.
 */
export class CommandValidationError extends CommandError {
  readonly fieldErrors: readonly FieldError[];

  constructor(fieldErrors: readonly FieldError[], options?: { cause?: unknown }) {
    super(
      'COMMAND_VALIDATION',
      `command rejected by domain invariants: ${fieldErrors.map((f) => `${f.field}: ${f.message}`).join('; ')}`,
      options
    );
    this.name = 'CommandValidationError';
    this.fieldErrors = Object.freeze([...fieldErrors]);
  }
}

/**
 * The command targets an element (wall, window, …) that does not exist in the
 * building. Mapped to HTTP 404.
 */
export class ElementNotFoundError extends CommandError {
  readonly elementType: string;
  readonly elementId: string;

  constructor(elementType: string, elementId: string) {
    super('ELEMENT_NOT_FOUND', `${elementType} ${elementId} does not exist in this building`);
    this.name = 'ElementNotFoundError';
    this.elementType = elementType;
    this.elementId = elementId;
  }
}
