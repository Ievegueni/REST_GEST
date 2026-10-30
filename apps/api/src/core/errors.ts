import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ErrorCode, type ApiError } from '@restgest/shared';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  FEATURE_NOT_IN_PLAN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const body = (code: ErrorCode, message: string, details?: unknown): ApiError => ({
  error: { code, message, ...(details === undefined ? {} : { details }) },
});

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(STATUS[err.code]).send(body(err.code, err.message, err.details));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(body('VALIDATION_ERROR', 'Dados inválidos', err.issues));
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002')
        return reply.status(409).send(body('CONFLICT', 'Registo duplicado', err.meta));
      if (err.code === 'P2003') {
        return reply
          .status(400)
          .send(body('VALIDATION_ERROR', 'Referência inválida ou em uso', err.meta));
      }
      if (err.code === 'P2025')
        return reply.status(404).send(body('NOT_FOUND', 'Recurso não encontrado'));
    }
    if (err.statusCode === 429) {
      return reply.status(429).send(body('RATE_LIMITED', err.message));
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send(body('VALIDATION_ERROR', err.message));
    }
    req.log.error(err);
    return reply.status(500).send(body('INTERNAL_ERROR', 'Erro interno'));
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send(body('NOT_FOUND', 'Recurso não encontrado')),
  );
}
