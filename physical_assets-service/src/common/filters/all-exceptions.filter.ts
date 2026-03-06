import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AbstractHttpAdapter, HttpAdapterHost } from '@nestjs/core';
import { Response } from 'express';

// Formats all errors as { error, detail } — consistent with the project convention
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapter: AbstractHttpAdapter) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        response.status(status).json({ error: body });
      } else {
        const obj = body as Record<string, any>;
        // Preserve our format { error, detail }; translate NestJS default { message }
        response.status(status).json(
          obj.error ? obj : { error: obj.message ?? 'Error' },
        );
      }
    } else {
      const err = exception as Error;
      this.logger.error(err?.message, err?.stack);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Internal server error',
        detail: err?.message,
      });
    }
  }
}
