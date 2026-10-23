import { describe, expect, it } from 'vitest';

import {
  diagnoseDatabaseError,
  describeErrorChain,
  findHttpStatus,
  formatDiagnosis,
  rawProbeCommand,
} from '../diagnostics';
import { normalizeAuthToken, normalizeDatabaseUrl, resolveDatabaseConfig } from '../env';

describe('normalizeDatabaseUrl', () => {
  it('leaves a clean Turso URL untouched', () => {
    const { url, repaired } = normalizeDatabaseUrl('libsql://quiz-org.turso.io');
    expect(url).toBe('libsql://quiz-org.turso.io');
    expect(repaired).toBe(false);
  });

  it('unwraps markdown links pasted from chat', () => {
    const { url, repaired } = normalizeDatabaseUrl('[quiz-org.turso.io](http://quiz-org.turso.io)');
    expect(url).toBe('http://quiz-org.turso.io');
    expect(repaired).toBe(true);
  });

  it('prefers the URL inside a markdown label', () => {
    const { url } = normalizeDatabaseUrl('[libsql://quiz-org.turso.io](https://quiz-org.turso.io)');
    expect(url).toBe('libsql://quiz-org.turso.io');
  });

  it('strips quotes, angle brackets and trailing slashes', () => {
    for (const raw of [
      '"libsql://quiz-org.turso.io"',
      "'libsql://quiz-org.turso.io/'",
      '<libsql://quiz-org.turso.io>',
      '`libsql://quiz-org.turso.io`',
    ]) {
      expect(normalizeDatabaseUrl(raw).url).toBe('libsql://quiz-org.turso.io');
    }
  });

  it('removes invisible characters', () => {
    const { url, repaired } = normalizeDatabaseUrl('libsql://quiz\u200b-org.turso.io\ufeff');
    expect(url).toBe('libsql://quiz-org.turso.io');
    expect(repaired).toBe(true);
  });

  it('rejects whitespace and unknown schemes', () => {
    expect(() => normalizeDatabaseUrl('libsql://quiz org.turso.io')).toThrow(/whitespace/);
    expect(() => normalizeDatabaseUrl('quiz-org.turso.io')).toThrow(/must start with/);
    expect(() => normalizeDatabaseUrl('postgres://user@host/db')).toThrow(/must start with/);
  });
});

describe('normalizeAuthToken', () => {
  it('trims quotes and line breaks', () => {
    expect(normalizeAuthToken('  "abc.def.ghi"\n')).toBe('abc.def.ghi');
    expect(normalizeAuthToken("'abc.def.ghi'")).toBe('abc.def.ghi');
  });

  it('strips a pasted Bearer prefix and surrounding quotes', () => {
    expect(normalizeAuthToken('  "Bearer eyJhbGciOi.test.token"  ')).toBe('eyJhbGciOi.test.token');
  });

  it('leaves a clean token untouched', () => {
    expect(normalizeAuthToken('eyJhbGciOi.test.token')).toBe('eyJhbGciOi.test.token');
  });
});

describe('resolveDatabaseConfig', () => {
  it('requires a URL', () => {
    expect(() => resolveDatabaseConfig({})).toThrow(/TURSO_DATABASE_URL is not set/);
  });

  it('requires a token for remote URLs', () => {
    expect(() =>
      resolveDatabaseConfig({ TURSO_DATABASE_URL: 'libsql://quiz-org.turso.io' }),
    ).toThrow(/TURSO_AUTH_TOKEN is not set/);
  });

  it('accepts DATABASE_URL as an alias', () => {
    const config = resolveDatabaseConfig({
      DATABASE_URL: 'libsql://quiz-org.turso.io',
      TURSO_AUTH_TOKEN: 'token',
    });
    expect(config.target).toBe('turso');
    expect(config.urlHint).toContain('libsql://quiz-org.turso.io');
  });

  it('never leaks the token in the hint', () => {
    const config = resolveDatabaseConfig({
      TURSO_DATABASE_URL: 'libsql://quiz-org.turso.io?authToken=secret',
      TURSO_AUTH_TOKEN: 'super-secret',
    });
    expect(config.urlHint).not.toContain('secret');
  });

  it('supports an explicit file: URL (used by the tests)', () => {
    const config = resolveDatabaseConfig({ TURSO_DATABASE_URL: 'file:/tmp/test.db' });
    expect(config.target).toBe('file');
    expect(config.authToken).toBeUndefined();
  });
});

describe('diagnostics', () => {
  const http400 = Object.assign(new Error('SERVER_ERROR: Server returned HTTP status 400'), {
    status: 400,
  });

  it('extracts the HTTP status from nested causes', () => {
    const wrapped = new Error('Failed query', { cause: http400 });
    expect(findHttpStatus(wrapped)).toBe(400);
  });

  it('classifies an HTTP 400 as a rejected request, not a schema problem', () => {
    const diagnosis = diagnoseDatabaseError(new Error('Failed query', { cause: http400 }));

    expect(diagnosis.kind).toBe('rejected');
    expect(diagnosis.httpStatus).toBe(400);
    expect(diagnosis.title).toContain('HTTP 400');
    expect(diagnosis.hints.join(' ')).toMatch(/token does not belong/i);
  });

  it('classifies missing tables as a schema problem', () => {
    const diagnosis = diagnoseDatabaseError(
      new Error('Failed query: select 1', {
        cause: new Error('SQLITE_ERROR: no such table: users'),
      }),
    );

    expect(diagnosis.kind).toBe('schema-missing');
    expect(diagnosis.hints.join(' ')).toContain('bun run db:migrate');
  });

  it('classifies network failures', () => {
    const diagnosis = diagnoseDatabaseError(
      new Error('fetch failed', { cause: { code: 'ECONNRESET' } }),
    );
    expect(diagnosis.kind).toBe('network');
  });

  it('classifies auth failures', () => {
    const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 });
    expect(diagnoseDatabaseError(unauthorized).kind).toBe('auth');
  });

  it('flattens the cause chain into one line', () => {
    const error = new Error('Failed query: select 1', {
      cause: Object.assign(new Error('SERVER_ERROR: Server returned HTTP status 400'), {
        status: 400,
      }),
    });

    expect(describeErrorChain(error)).toBe(
      'Failed query: select 1 → SERVER_ERROR: Server returned HTTP status 400',
    );
  });

  it('formats a diagnosis with hints and a reproducible curl command', () => {
    const config = resolveDatabaseConfig({
      TURSO_DATABASE_URL: 'libsql://quiz-org.turso.io',
      TURSO_AUTH_TOKEN: 'secret',
    });
    const text = formatDiagnosis(diagnoseDatabaseError(http400), config);

    expect(text).toContain('✖');
    expect(text).toContain('curl');
    expect(text).toContain('https://quiz-org.turso.io/v2/pipeline');
    expect(text).not.toContain('secret');
    expect(rawProbeCommand(config)).toContain('select 1');
  });
});
