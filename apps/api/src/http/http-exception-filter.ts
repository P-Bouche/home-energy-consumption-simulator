import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { MulterError } from 'multer';
import type { Request, Response } from 'express';
import {
  CommandValidationError,
  DpeFileTooLargeError,
  DpeSchemaValidationError,
  ElementNotFoundError,
  EmptyDpeInputError,
  EngineExecutionError,
  InvalidCommandError,
  InvalidDpeError,
  InvalidDpeXmlError,
  SimulationMappingError,
  UnsupportedDpeModelError,
  type FieldError
} from '@hes/domain';
import {
  BuildingNotFoundError,
  NothingToUndoError,
  ScenarioNotFoundError,
  SimulationAlreadyInFlightError,
  SimulationJobNotFoundError,
  SimulationNotFoundError,
  StaleVersionError
} from '@hes/application';

interface ErrorBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly schemaErrors?: readonly string[];
  readonly jobId?: string;
  readonly code?: string;
  readonly fieldErrors?: readonly FieldError[];
  readonly issues?: readonly string[];
  readonly expectedVersion?: number;
  readonly currentVersion?: number;
  readonly elementType?: string;
  readonly elementId?: string;
}

/**
 * Global exception filter: maps typed domain/application errors to HTTP
 * statuses. Invalid XML and schema violations → 422 with the schema errors;
 * oversized uploads → 413; unknown building → 404; everything else → 500
 * (logged, never swallowed).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof DpeSchemaValidationError) {
      this.send(response, 422, 'Unprocessable Entity', exception.message, exception.schemaErrors);
      return;
    }
    if (exception instanceof InvalidDpeXmlError || exception instanceof EmptyDpeInputError) {
      this.send(response, 422, 'Unprocessable Entity', exception.message, []);
      return;
    }
    if (exception instanceof DpeFileTooLargeError) {
      this.send(
        response,
        413,
        'Payload Too Large',
        `DPE XML is ${exception.sizeBytes} bytes, maximum accepted is ${exception.maxBytes} bytes`
      );
      return;
    }
    if (
      exception instanceof BuildingNotFoundError ||
      exception instanceof SimulationNotFoundError ||
      exception instanceof SimulationJobNotFoundError ||
      exception instanceof ScenarioNotFoundError
    ) {
      this.send(response, 404, 'Not Found', exception.message);
      return;
    }
    if (exception instanceof SimulationAlreadyInFlightError) {
      this.send(response, 409, 'Conflict', exception.message, undefined, exception.jobId);
      return;
    }
    // P4 editing errors: 409 stale version, 400 invalid/validation/nothing-to-undo, 404 unknown element
    if (exception instanceof StaleVersionError) {
      this.send(response, 409, 'Conflict', exception.message, undefined, undefined, exception.code, {
        expectedVersion: exception.expectedVersion,
        currentVersion: exception.currentVersion
      });
      return;
    }
    if (exception instanceof InvalidCommandError) {
      this.send(response, 400, 'Bad Request', exception.message, undefined, undefined, exception.code, {
        issues: exception.issues
      });
      return;
    }
    if (exception instanceof CommandValidationError) {
      this.send(response, 400, 'Bad Request', exception.message, undefined, undefined, exception.code, {
        fieldErrors: exception.fieldErrors
      });
      return;
    }
    if (exception instanceof NothingToUndoError) {
      this.send(response, 400, 'Bad Request', exception.message, undefined, undefined, exception.code);
      return;
    }
    if (exception instanceof ElementNotFoundError) {
      this.send(response, 404, 'Not Found', exception.message, undefined, undefined, exception.code, {
        elementType: exception.elementType,
        elementId: exception.elementId
      });
      return;
    }
    // P2 simulation failures (FR-P2-05): mapping errors → 422, engine errors → 500
    // (InvalidDpeXmlError is already handled above and never reaches this point)
    if (exception instanceof SimulationMappingError || exception instanceof InvalidDpeError) {
      this.send(response, 422, 'Unprocessable Entity', exception.message, [], undefined, exception.code);
      return;
    }
    if (exception instanceof EngineExecutionError || exception instanceof UnsupportedDpeModelError) {
      this.logger.error(`engine error on ${request.method} ${request.url}`, exception.stack);
      this.send(response, 500, 'Internal Server Error', exception.message, undefined, undefined, exception.code);
      return;
    }
    if (exception instanceof MulterError) {
      const status = exception.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      this.send(response, status, status === 413 ? 'Payload Too Large' : 'Bad Request', exception.message);
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }
    this.logger.error(
      `unhandled exception on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception)
    );
    this.send(response, 500, 'Internal Server Error', 'an unexpected error occurred');
  }

  private send(
    response: Response,
    status: number,
    error: string,
    message: string,
    schemaErrors?: readonly string[],
    jobId?: string,
    code?: string,
    extra?: {
      readonly fieldErrors?: readonly FieldError[];
      readonly issues?: readonly string[];
      readonly expectedVersion?: number;
      readonly currentVersion?: number;
      readonly elementType?: string;
      readonly elementId?: string;
    }
  ): void {
    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      ...(schemaErrors !== undefined ? { schemaErrors } : {}),
      ...(jobId !== undefined ? { jobId } : {}),
      ...(code !== undefined ? { code } : {}),
      ...(extra?.fieldErrors !== undefined ? { fieldErrors: extra.fieldErrors } : {}),
      ...(extra?.issues !== undefined ? { issues: extra.issues } : {}),
      ...(extra?.expectedVersion !== undefined ? { expectedVersion: extra.expectedVersion } : {}),
      ...(extra?.currentVersion !== undefined ? { currentVersion: extra.currentVersion } : {}),
      ...(extra?.elementType !== undefined ? { elementType: extra.elementType } : {}),
      ...(extra?.elementId !== undefined ? { elementId: extra.elementId } : {})
    };
    response.status(status).json(body);
  }
}
