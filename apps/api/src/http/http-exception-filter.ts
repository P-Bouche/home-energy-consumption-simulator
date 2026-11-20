import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { MulterError } from 'multer';
import type { Request, Response } from 'express';
import {
  DpeFileTooLargeError,
  DpeSchemaValidationError,
  EmptyDpeInputError,
  InvalidDpeXmlError
} from '@hes/domain';
import { BuildingNotFoundError } from '@hes/application';

interface ErrorBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly schemaErrors?: readonly string[];
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
    if (exception instanceof BuildingNotFoundError) {
      this.send(response, 404, 'Not Found', exception.message);
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
    schemaErrors?: readonly string[]
  ): void {
    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      ...(schemaErrors !== undefined ? { schemaErrors } : {})
    };
    response.status(status).json(body);
  }
}
