import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Consistent error envelope: `{ error: { code, message, details? } }`. */
export function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export function notFoundHandler(c: Context) {
  return c.json(errorBody('NOT_FOUND', `No route matches ${c.req.method} ${c.req.path}`), 404);
}

export function errorHandler(error: Error, c: Context) {
  if (error instanceof ApiError) {
    return c.json(errorBody(error.code, error.message, error.details), error.status);
  }

  if (error instanceof ZodError) {
    return c.json(
      errorBody('VALIDATION_ERROR', 'The request payload is invalid', error.issues),
      422,
    );
  }

  if (error instanceof HTTPException) {
    return c.json(errorBody('HTTP_ERROR', error.message), error.status);
  }

  console.error('[api] unhandled error:', error);

  return c.json(
    errorBody(
      'INTERNAL_SERVER_ERROR',
      process.env.NODE_ENV === 'production' ? 'Something went wrong' : error.message,
    ),
    500,
  );
}
