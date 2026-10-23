import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  diagnoseDatabaseError,
  findHttpStatus,
  formatDiagnosis,
  runConnectionProbe,
  toHttpEndpoint,
} from '../diagnostics';
import type { ResolvedDatabaseConfig } from '../env';

const config: ResolvedDatabaseConfig = {
  url: 'libsql://quiz-itspinion.aws-ap-south-1.turso.io',
  authToken: 'secret-token',
  target: 'turso',
  urlHint: 'libsql://quiz-itspinion.aws-ap-south-1.turso.io',
};

describe('toHttpEndpoint', () => {
  it('rewrites libsql:// to https://', () => {
    expect(toHttpEndpoint('libsql://db.turso.io')).toBe('https://db.turso.io');
  });

  it('keeps https:// URLs as-is', () => {
    expect(toHttpEndpoint('https://db.turso.io')).toBe('https://db.turso.io');
  });

  it('strips trailing slashes', () => {
    expect(toHttpEndpoint('libsql://db.turso.io///')).toBe('https://db.turso.io');
  });

  it('returns undefined for non-HTTP targets such as local files', () => {
    expect(toHttpEndpoint('file:./local.db')).toBeUndefined();
  });
});

describe('findHttpStatus', () => {
  it('reads the status from a numeric property', () => {
    expect(findHttpStatus(Object.assign(new Error('nope'), { status: 401 }))).toBe(401);
  });

  it('reads the status out of a wrapped driver message', () => {
    const error = new Error(
      'Failed query: select 1 → SERVER_ERROR: Server returned HTTP status 400',
    );
    expect(findHttpStatus(error)).toBe(400);
  });

  it('walks the cause chain', () => {
    const error = new Error('outer', { cause: Object.assign(new Error('inner'), { status: 403 }) });
    expect(findHttpStatus(error)).toBe(403);
  });

  it('returns undefined when nothing carries a status', () => {
    expect(findHttpStatus(new Error('boom'))).toBeUndefined();
  });
});

describe('diagnoseDatabaseError', () => {
  it('classifies HTTP 400 as a rejected request with token guidance', () => {
    const diagnosis = diagnoseDatabaseError(
      new Error('SERVER_ERROR: Server returned HTTP status 400'),
    );
    expect(diagnosis.kind).toBe('rejected');
    expect(diagnosis.httpStatus).toBe(400);
    expect(diagnosis.hints.join('\n')).toContain('turso db tokens create');
  });

  it('classifies 401/403 as auth failures', () => {
    expect(diagnoseDatabaseError(new Error('HTTP status 401')).kind).toBe('auth');
    expect(diagnoseDatabaseError(Object.assign(new Error('denied'), { status: 403 })).kind).toBe(
      'auth',
    );
  });

  it('classifies DNS failures as network problems', () => {
    expect(
      diagnoseDatabaseError(new Error('fetch failed: getaddrinfo ENOTFOUND db.turso.io')).kind,
    ).toBe('network');
  });

  it('classifies missing tables as a schema problem', () => {
    const diagnosis = diagnoseDatabaseError(new Error('SQLITE_ERROR: no such table: users'));
    expect(diagnosis.kind).toBe('schema-missing');
    expect(diagnosis.hints.join('\n')).toContain('bun run db:migrate');
  });
});

describe('formatDiagnosis', () => {
  it('prints the target, the hints and the raw Turso body', () => {
    const text = formatDiagnosis(
      {
        kind: 'rejected',
        title: 'Turso rejected the query',
        reason: 'HTTP status 400',
        hints: ['check the token'],
        rawBody: 'HTTP 400 {"error":"invalid token"}',
      },
      config,
    );

    expect(text).toContain('Turso rejected the query');
    expect(text).toContain('libsql://quiz-itspinion.aws-ap-south-1.turso.io [turso]');
    expect(text).toContain('• check the token');
    expect(text).toContain('HTTP 400 {"error":"invalid token"}');
    expect(text).toContain('/v2/pipeline');
  });

  it('never prints the auth token', () => {
    const text = formatDiagnosis(diagnoseDatabaseError(new Error('HTTP status 400')), config);
    expect(text).not.toContain('secret-token');
  });
});

describe('runConnectionProbe', () => {
  // The probe blocks its caller with spawnSync, so the fake Turso endpoint must
  // live in a separate process — an in-process server could never answer.
  let server: ChildProcess;
  let baseUrl: string;

  beforeAll(async () => {
    const port = await new Promise<number>((resolve) => {
      const socket = createServer();
      socket.listen(0, '127.0.0.1', () => {
        const { port: free } = socket.address() as AddressInfo;
        socket.close(() => resolve(free));
      });
    });

    server = spawn(
      process.execPath,
      [
        '-e',
        `require('node:http').createServer((_q, r) => {
           r.writeHead(400, { 'content-type': 'application/json' });
           r.end(JSON.stringify({ error: 'invalid database token', code: 'AUTH_INVALID' }));
         }).listen(${port}, '127.0.0.1', () => console.log('ready'));`,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );

    await new Promise<void>((resolve) => server.stdout?.once('data', () => resolve()));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server?.kill();
  });

  it('reports the rejection and fetches the raw body from Turso', () => {
    const result = runConnectionProbe({ ...config, url: baseUrl, urlHint: baseUrl }, 30_000);

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(400);
    expect(result.body).toContain('invalid database token');
    expect(result.error).toContain('400');
  });
});
