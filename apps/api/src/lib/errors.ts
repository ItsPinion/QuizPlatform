import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { validator } from 'hono/validator';
import { ZodError, type ZodType } from 'zod';

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

/**
 * Validate a JSON body with a Zod schema.
 *
 * Using Hono's validator (rather than parsing inside the handler) is what lets
 * the type system follow the payload: the route's `input` gains `json: T`, and
 * the web app's `hc<AppType>` client therefore requires the correct body type
 * at the call site.
 *
 * A malformed body still answers `INVALID_JSON` 400 — Hono raises an
 * HTTPException for it, which `errorHandler` translates.
 */
export function jsonBody<T>(schema: ZodType<T>) {
  return validator('json', (value, c) => {
    // Hono leaves `value` as `{}` when the request has no JSON content type —
    // an absent body is a malformed request, not a validation failure.
    if (!/json/i.test(c.req.header('content-type') ?? '')) {
      throw new ApiError(400, 'INVALID_JSON', 'The request body must be valid JSON.');
    }

    const parsed = schema.safeParse(value);

    if (!parsed.success) {
      throw new ApiError(
        422,
        'VALIDATION_ERROR',
        'The request payload is invalid',
        parsed.error.issues,
      );
    }

    return parsed.data;
  });
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
    // Hono's JSON validator raises this when the body is not parseable; keep the
    // public contract (`INVALID_JSON` 400) instead of leaking its wording.
    if (error.status === 400 && /malformed json/i.test(error.message)) {
      return c.json(errorBody('INVALID_JSON', 'The request body must be valid JSON.'), 400);
    }

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
