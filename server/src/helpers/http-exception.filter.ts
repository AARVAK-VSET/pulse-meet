import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ErrorResponse } from '@quickmeet/shared';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse: ErrorResponse = {
      statusCode: status,
      status: 'error',
      message: isHttpException ? exception.message : 'Internal server error',
    };

    if (isHttpException) {
      const validationResponse = exception.getResponse();
      if (typeof validationResponse === 'object' && 'message' in validationResponse) {
        errorResponse.error = (validationResponse as any).message;
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        errorResponse.redirect = true;
        break;
    }

    response.status(status).json(errorResponse);
  }
}