/**
 * The API always answers errors with `{ error: { code, message, details } }`,
 * but the RPC client types successes only — so failures are narrowed here once
 * instead of casting in every component.
 */
export interface ApiFailure {
  code: string;
  message: string;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

/** Zod issues arrive as `details: [{ message, path }]`; surface the first one. */
function firstIssueMessage(details: unknown): string | undefined {
  if (!Array.isArray(details)) return undefined;

  for (const issue of details) {
    if (issue && typeof issue === 'object' && 'message' in issue) {
      const message = (issue as { message?: unknown }).message;
      if (typeof message === 'string' && message.length > 0) return message;
    }
  }

  return undefined;
}

export function parseApiFailure(
  body: unknown,
  fallback = 'Something went wrong. Please try again.',
): ApiFailure {
  const { error } = (body ?? {}) as ErrorEnvelope;

  return {
    code: error?.code ?? 'UNKNOWN_ERROR',
    message: firstIssueMessage(error?.details) ?? error?.message ?? fallback,
  };
}

/** `fetch` rejects with a TypeError when the API is down; normalise that too. */
export function toApiFailure(cause: unknown): ApiFailure {
  if (cause instanceof Error) {
    return { code: 'NETWORK_ERROR', message: cause.message };
  }

  return { code: 'UNKNOWN_ERROR', message: 'Something went wrong. Please try again.' };
}
