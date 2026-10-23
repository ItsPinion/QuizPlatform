import { describe, expect, it } from 'vitest';

import { parseApiFailure, toApiFailure } from './api-error';

describe('parseApiFailure', () => {
  it('reads the error envelope the API always returns', () => {
    const failure = parseApiFailure({
      error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
    });

    expect(failure).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
    });
  });

  it('prefers the first Zod issue over the generic message', () => {
    const failure = parseApiFailure({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request payload is invalid',
        details: [
          { path: ['password'], message: 'Password must be at least 8 characters' },
          { path: ['email'], message: 'Enter a valid email address' },
        ],
      },
    });

    expect(failure.code).toBe('VALIDATION_ERROR');
    expect(failure.message).toBe('Password must be at least 8 characters');
  });

  it('falls back to the supplied copy when details are unusable', () => {
    expect(parseApiFailure({ error: { code: 'FORBIDDEN', details: ['nope'] } }).message).toBe(
      'Something went wrong. Please try again.',
    );
    expect(parseApiFailure({ error: {} }, 'Try again later.').message).toBe('Try again later.');
  });

  it('survives a body that is not an error envelope at all', () => {
    expect(parseApiFailure(null)).toEqual({
      code: 'UNKNOWN_ERROR',
      message: 'Something went wrong. Please try again.',
    });
    expect(parseApiFailure('gateway timeout', 'Retry.').code).toBe('UNKNOWN_ERROR');
  });
});

describe('toApiFailure', () => {
  it('maps a thrown network error', () => {
    expect(toApiFailure(new TypeError('Failed to fetch'))).toEqual({
      code: 'NETWORK_ERROR',
      message: 'Failed to fetch',
    });
  });

  it('maps an unexpected non-error value', () => {
    expect(toApiFailure(undefined)).toEqual({
      code: 'UNKNOWN_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  });
});
