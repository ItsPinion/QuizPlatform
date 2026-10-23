import { describe, expect, it } from 'vitest';

import { classifyDatabaseError, describeError, isRejectedRequest } from '../lib/db-errors';

describe('describeError', () => {
  it('flattens Drizzle wrappers into a single arrow chain', () => {
    const error = new Error('Failed query: select 1', {
      cause: new Error('SERVER_ERROR: Server returned HTTP status 400'),
    });

    expect(describeError(error)).toBe(
      'Failed query: select 1 → SERVER_ERROR: Server returned HTTP status 400',
    );
  });

  it('includes the DNS code for a failed fetch', () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND db.turso.io'), {
      code: 'ENOTFOUND',
    });
    const error = new Error('fetch failed', { cause });

    expect(describeError(error)).toContain('ENOTFOUND');
  });

  it('falls back to a readable string for non-errors', () => {
    expect(describeError('boom')).toBe('Unknown database error');
  });
});

describe('classifyDatabaseError', () => {
  it('treats missing tables as a schema problem', () => {
    expect(classifyDatabaseError(new Error('SQLITE_ERROR: no such table: users'))).toBe(
      'schema-missing',
    );
  });

  it('treats everything else as unavailable', () => {
    expect(classifyDatabaseError(new Error('fetch failed'))).toBe('unavailable');
    expect(classifyDatabaseError(new Error('SERVER_ERROR: Server returned HTTP status 400'))).toBe(
      'unavailable',
    );
  });
});

describe('isRejectedRequest', () => {
  it('detects Turso rejecting the credentials over HTTP', () => {
    expect(isRejectedRequest(new Error('SERVER_ERROR: Server returned HTTP status 400'))).toBe(
      true,
    );
    expect(isRejectedRequest(Object.assign(new Error('denied'), { status: 401 }))).toBe(true);
    expect(isRejectedRequest(new Error('Server returned HTTP status 403'))).toBe(true);
    expect(isRejectedRequest(new Error('Unauthorized'))).toBe(true);
  });

  it('does not mistake transport failures for rejections', () => {
    expect(isRejectedRequest(new Error('fetch failed'))).toBe(false);
    expect(isRejectedRequest(new Error('no such table: users'))).toBe(false);
  });
});
