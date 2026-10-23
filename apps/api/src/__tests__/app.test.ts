import type { DatabaseStatus, Health } from '@quiz/shared';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getJson<T>(path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  return { res, body: (await res.json()) as T };
}

afterAll(() => {
  delete process.env.TURSO_DATABASE_URL;
});

describe('service banner', () => {
  it('responds at the root with the endpoint index', async () => {
    const { res, body } = await getJson<{ name: string; endpoints: string[] }>('/');

    expect(res.status).toBe(200);
    expect(body.name).toBe('quiz-api');
    expect(body.endpoints).toContain('/api/health');
  });
});

describe('GET /api/health', () => {
  it('reports a live service without touching the database', async () => {
    const { res, body } = await getJson<Health>('/api/health');

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('quiz-api');
    expect(body.version).toBe('0.1.0');
    expect(body.runtime).toMatch(/^node v\d+/);
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('attaches a request id and the security headers', async () => {
    const res = await app.request('/api/health');

    expect(res.headers.get('x-request-id')).toMatch(UUID_RE);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
  });

  it('issues a different request id per request', async () => {
    const [first, second] = await Promise.all([
      app.request('/api/health'),
      app.request('/api/health'),
    ]);

    expect(first.headers.get('x-request-id')).not.toBe(second.headers.get('x-request-id'));
  });
});

describe('GET /api/health/db', () => {
  it('confirms connectivity and reports the seeded row counts', async () => {
    const { res, body } = await getJson<DatabaseStatus>('/api/health/db');

    expect(res.status).toBe(200);
    expect(body.connected).toBe(true);
    expect(body.target).toBe('file');
    expect(body.latencyMs).toBeTypeOf('number');
    expect(body.counts).toEqual({
      users: 4,
      categories: 10,
      quizzes: 10,
      questions: 47,
      attempts: 14,
    });
  });

  it('never leaks credentials in the reported URL', async () => {
    const { body } = await getJson<DatabaseStatus>('/api/health/db');

    expect(body.urlHint).not.toMatch(/https?:\/\//);
    expect(body.urlHint).not.toContain('token');
  });

  it('returns a 503 envelope instead of crashing when the database is unreachable', async () => {
    process.env.TURSO_DATABASE_URL = 'libsql://unreachable.invalid';
    process.env.TURSO_AUTH_TOKEN = 'test-token';

    try {
      const { res, body } = await getJson<{
        error: { code: string; message: string; details: { hint: string } };
      }>('/api/health/db');

      expect(res.status).toBe(503);
      expect(body.error.code).toBe('DATABASE_UNAVAILABLE');
      expect(body.error.message).toContain('cannot reach the database');
      expect(body.error.details.hint).toContain('TURSO_DATABASE_URL');
    } finally {
      process.env.TURSO_DATABASE_URL = '';
      delete process.env.TURSO_AUTH_TOKEN;
    }
  });
});

describe('GET /api/meta', () => {
  it('documents the shipped endpoints and the remaining roadmap', async () => {
    const { res, body } = await getJson<{
      version: string;
      docs: Record<string, string>;
      roadmap: { day: number; area: string }[];
    }>('/api/meta');

    expect(res.status).toBe(200);
    expect(body.version).toBe('0.1.0');
    expect(Object.keys(body.docs)).toEqual(
      expect.arrayContaining(['GET /api/health', 'GET /api/health/db', 'GET /api/meta']),
    );
    expect(body.roadmap.map((entry) => entry.area)).toEqual(
      expect.arrayContaining(['auth', 'quizzes', 'attempts', 'leaderboard']),
    );
  });
});

describe('error envelope', () => {
  it('returns a structured 404 for unknown routes', async () => {
    const { res, body } = await getJson<{ error: { code: string; message: string } }>(
      '/api/does-not-exist',
    );

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('/api/does-not-exist');
  });

  it('returns a structured 404 for unknown methods on known paths', async () => {
    const { res, body } = await getJson<{ error: { code: string } }>('/api/health', {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('CORS', () => {
  it('allows the configured web origin with credentials', async () => {
    const res = await app.request('/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('access-control-allow-methods')).toContain('PATCH');
  });

  it('withholds the allow-origin header from unknown origins', async () => {
    const res = await app.request('/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
