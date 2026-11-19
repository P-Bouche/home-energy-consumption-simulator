/**
 * Machine-readable codes for simulation failures.
 */
export type SimulationErrorCode =
  | 'INVALID_DPE'
  | 'UNSUPPORTED_DPE_MODEL'
  | 'ENGINE_EXECUTION'
  | 'MAPPING';

/**
 * Base class for all simulation domain errors. Carries a stable machine-readable code.
 */
export class SimulationError extends Error {
  readonly code: SimulationErrorCode;

  constructor(code: SimulationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SimulationError';
    this.code = code;
  }
}

/**
 * The provided DPE XML is empty or unreadable as input.
 */
export class InvalidDpeError extends SimulationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('INVALID_DPE', message, options);
    this.name = 'InvalidDpeError';
  }
}

/**
 * The engine rejected the DPE model (calcul_3cl_xml returned null for a non-logement model).
 */
export class UnsupportedDpeModelError extends SimulationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('UNSUPPORTED_DPE_MODEL', message, options);
    this.name = 'UnsupportedDpeModelError';
  }
}

/**
 * The engine threw while processing the DPE (malformed XML, engine bug, ...).
 */
export class EngineExecutionError extends SimulationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('ENGINE_EXECUTION', message, options);
    this.name = 'EngineExecutionError';
  }
}

/**
 * The engine produced a result that could not be mapped to SimulationResult.
 */
export class SimulationMappingError extends SimulationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('MAPPING', message, options);
    this.name = 'SimulationMappingError';
  }
}
