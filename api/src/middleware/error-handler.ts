import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

// ─── Typed Application Error ──────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// ─── Global Error Handler ─────────────────────────────────────────────────────

export function globalErrorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    void reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  // Fastify validation errors
  if (error.validation) {
    void reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
      },
    });
    return;
  }

  // Generic fallback
  const statusCode = error.statusCode ?? 500;
  void reply.status(statusCode).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: statusCode === 500 ? 'Internal server error' : error.message,
    },
  });
}
