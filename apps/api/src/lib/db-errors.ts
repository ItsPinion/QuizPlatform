/**
 * Turns Drizzle/libSQL driver errors into one readable line and classifies the
 * common failure modes, so the API can answer with an actionable code instead
 * of a generic 503.
 */
export type DatabaseFailure = 'schema-missing' | 'unavailable' | 'not-configured';

/** Flatten Drizzle's wrapped driver error into `a → b → c`. */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  while (current instanceof Error) {
    const candidate = current.message.split('\n')[0]?.trim();
    if (candidate && !parts.includes(candidate)) parts.push(candidate);

    const cause = (current as { cause?: unknown }).cause;
    if (cause && typeof cause === 'object' && 'code' in cause && candidate === 'fetch failed') {
      parts.push(String((cause as { code?: unknown }).code));
    }

    current = cause;
  }

  return parts.join(' → ') || 'Unknown database error';
}

/**
 * `no such table` means the connection and credentials are fine but the Drizzle
 * migrations have not been applied to this database yet.
 */
export function classifyDatabaseError(error: unknown): DatabaseFailure {
  const message = describeError(error).toLowerCase();

  if (message.includes('no such table') || message.includes('no such column')) {
    return 'schema-missing';
  }

  return 'unavailable';
}
