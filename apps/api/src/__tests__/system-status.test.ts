import { SESSION_TTL_SECONDS } from '@quiz/shared/auth';
import type { SystemStatus } from '@quiz/shared/deployment';
import { db, schema } from '@quiz/db';
import { describe, expect, it } from 'vitest';

import { app } from '../app';
import { environmentSnapshot } from '../lib/system-status';

async function cookieFor(email: string, password: string): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  expect(res.status).toBe(200);

  const cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .find((value) => value?.startsWith('quiz_session='));

  if (!cookie) throw new Error('login did not issue a session cookie');
  return cookie;
}

const adminCookie = () => cookieFor('admin@quiz.dev', 'Admin12345');
const studentCookie = () => cookieFor('rahul@quiz.dev', 'Password123');

async function system(cookie?: string) {
  const res = await app.request('/api/admin/system', cookie ? { headers: { cookie } } : undefined);
  return { res, body: (await res.json()) as SystemStatus };
}

describe('GET /api/admin/system', () => {
  it('answers with the documented shape for an administrator', async () => {
    const { res, body } = await system(await adminCookie());

    expect(res.status).toBe(200);
    expect(body.service.name).toBe('quiz-api');
    expect(body.service.version).toBe('0.1.0');
    expect(body.service.nodeEnv).toBe('test');
    expect(body.service.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Date.parse(body.generatedAt)).not.toBeNaN();
    expect(body.settings.sessionTtlSeconds).toBe(SESSION_TTL_SECONDS);
  });

  it('reports the database it is actually connected to', async () => {
    const { body } = await system(await adminCookie());

    expect(body.database.connected).toBe(true);
    expect(body.database.target).toBe('file');
    expect(body.database.latencyMs).toBeGreaterThanOrEqual(0);

    // The counts agree with the tables themselves.
    const [users, quizzes, attempts] = await Promise.all([
      db.$count(schema.users),
      db.$count(schema.quizzes),
      db.$count(schema.attempts),
    ]);

    expect(body.database.counts).toEqual({
      users,
      categories: await db.$count(schema.categories),
      quizzes,
      questions: await db.$count(schema.questions),
      attempts,
    });
  });

  it('runs the deployment rules against its own environment', async () => {
    const { body } = await system(await adminCookie());
    const ids = body.summary.checks.map((entry) => entry.id);

    expect(ids).toEqual(
      expect.arrayContaining(['database-url', 'database-token', 'jwt-secret', 'web-origin']),
    );
    expect(body.summary.pass + body.summary.warn + body.summary.fail + body.summary.skip).toBe(
      body.summary.checks.length,
    );

    // The test environment is honest about itself: a local file database and a
    // non-production mode are both reported, not hidden.
    const urlCheck = body.summary.checks.find((entry) => entry.id === 'database-url');
    expect(urlCheck?.status).toBe('warn');
    expect(urlCheck?.detail).toMatch(/file:/);
    expect(body.summary.verdict).toBe('attention');
  });

  it('never echoes a secret or an auth token', async () => {
    const { res, body } = await system(await adminCookie());
    const raw = JSON.stringify(body);
    const snapshot = environmentSnapshot();

    expect(res.status).toBe(200);

    // A URL hint is a host name, not a credential — but a token or a signing
    // secret must never appear, and neither must anything query-string shaped.
    if (snapshot.databaseToken) expect(raw).not.toContain(snapshot.databaseToken);
    if (snapshot.jwtSecret) expect(raw).not.toContain(snapshot.jwtSecret);

    expect(raw).not.toMatch(/authToken|jwtSecret|passwordHash/);
    expect(body.database.urlHint).not.toContain('?');
  });

  it('reports the limits that are actually enforced', async () => {
    const { body } = await system(await adminCookie());

    expect(body.settings.authRateLimitMax).toBeGreaterThan(0);
    expect(body.settings.authRateLimitWindowSeconds).toBeGreaterThan(0);
    expect(body.settings.maxBodyBytes).toBe(64 * 1024);
    expect(body.settings.trustedOrigins).toContain('http://localhost:3000');
  });

  it('refuses a student and an anonymous caller', async () => {
    const asStudent = await system(await studentCookie());
    const anonymous = await system();

    expect(asStudent.res.status).toBe(403);
    expect(anonymous.res.status).toBe(401);
  });

  it('leaves the response uncacheable, like every other API answer', async () => {
    const { res } = await system(await adminCookie());

    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
