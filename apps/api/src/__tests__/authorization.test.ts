import { randomUUID } from 'node:crypto';

import type { AccessDescriptor } from '@quiz/shared/auth';
import { hashPassword } from '@quiz/shared/crypto';
import { db, schema } from '@quiz/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';
import { errorHandler } from '../lib/errors';
import type { AppEnv } from '../lib/types';
import { requireAdmin, requireStudent } from '../middleware/auth';

const createdEmails: string[] = [];

afterAll(async () => {
  for (const email of createdEmails) {
    await db.delete(schema.users).where(eq(schema.users.email, email));
  }
});

/** Sign in with a seeded account (or a freshly registered one) and return its cookie. */
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

async function getJson<T>(path: string, cookie?: string) {
  const res = await app.request(path, cookie ? { headers: { cookie } } : undefined);
  return { res, body: (await res.json()) as T };
}

describe('GET /api/admin/access', () => {
  it('describes the admin scope for an ADMIN session', async () => {
    const { res, body } = await getJson<AccessDescriptor>('/api/admin/access', await adminCookie());

    expect(res.status).toBe(200);
    expect(body.scope).toBe('ADMIN');
    expect(body.user.role).toBe('ADMIN');
    expect(body.permissions).toContain('quizzes:manage');
    expect(body.permissions).toContain('users:manage');
    expect(body.permissions).not.toContain('quizzes:take');
  });

  it('forbids a STUDENT session with 403', async () => {
    const { res, body } = await getJson<{ error: { code: string } }>(
      '/api/admin/access',
      await studentCookie(),
    );

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('asks anonymous callers to authenticate with 401', async () => {
    const { res, body } = await getJson<{ error: { code: string } }>('/api/admin/access');

    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('accepts a Bearer token as well as the cookie', async () => {
    const cookie = await adminCookie();
    const token = cookie.split('=')[1];

    const res = await app.request('/api/admin/access', {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
  });

  it('locks out an admin whose account was deactivated', async () => {
    const email = `admin-${randomUUID()}@quiz.dev`;
    createdEmails.push(email);

    await db.insert(schema.users).values({
      id: randomUUID(),
      name: 'Temp Admin',
      email,
      passwordHash: await hashPassword('Secret12345'),
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    const cookie = await cookieFor(email, 'Secret12345');
    await db.update(schema.users).set({ status: 'INACTIVE' }).where(eq(schema.users.email, email));

    const { res, body } = await getJson<{ error: { code: string } }>('/api/admin/access', cookie);

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('GET /api/student/access', () => {
  it('describes the student scope for a STUDENT session', async () => {
    const { res, body } = await getJson<AccessDescriptor>(
      '/api/student/access',
      await studentCookie(),
    );

    expect(res.status).toBe(200);
    expect(body.scope).toBe('STUDENT');
    expect(body.user.role).toBe('STUDENT');
    expect(body.permissions).toContain('quizzes:take');
    expect(body.permissions).not.toContain('users:manage');
  });

  it('forbids an ADMIN session with 403 — the areas are exclusive', async () => {
    const { res, body } = await getJson<{ error: { code: string } }>(
      '/api/student/access',
      await adminCookie(),
    );

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('asks anonymous callers to authenticate with 401', async () => {
    const { res } = await getJson('/api/student/access');
    expect(res.status).toBe(401);
  });
});

describe('guarded namespaces', () => {
  it('runs the guard before route matching', async () => {
    // An unknown admin path still must not leak whether it exists.
    const anonymous = await app.request('/api/admin/does-not-exist');
    expect(anonymous.status).toBe(401);

    const forbidden = await app.request('/api/admin/does-not-exist', {
      headers: { cookie: await studentCookie() },
    });
    expect(forbidden.status).toBe(403);
  });

  it('answers 404 in the error envelope for an allowed caller on an unknown path', async () => {
    const { res, body } = await getJson<{ error: { code: string } }>(
      '/api/admin/does-not-exist',
      await adminCookie(),
    );

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('is listed in the service banner and /api/meta', async () => {
    const banner = (await (await app.request('/')).json()) as { endpoints: string[] };
    expect(banner.endpoints).toEqual(
      expect.arrayContaining(['/api/admin/access', '/api/student/access']),
    );

    const meta = (await (await app.request('/api/meta')).json()) as {
      docs: Record<string, string>;
      roadmap: { area: string }[];
    };
    expect(meta.docs['GET /api/admin/access']).toBeTruthy();
    expect(meta.roadmap.map((entry) => entry.area)).not.toContain('authorization');
  });
});

describe('requireAdmin / requireStudent middleware', () => {
  /**
   * The guards authenticate on their own, so they are exercised standalone here
   * with real cookies against the test database — no route mounting involved.
   */
  function standalone(guard: typeof requireAdmin) {
    const app = new Hono<AppEnv>();
    app.use('*', guard);
    app.get('/', (c) => c.json({ ok: true }));
    app.onError(errorHandler);
    return app;
  }

  it('lets the matching role through', async () => {
    const admin = await standalone(requireAdmin).request('/', {
      headers: { cookie: await adminCookie() },
    });
    const student = await standalone(requireStudent).request('/', {
      headers: { cookie: await studentCookie() },
    });

    expect(admin.status).toBe(200);
    expect(student.status).toBe(200);
  });

  it('rejects the opposite role with 403', async () => {
    const adminGuard = await standalone(requireAdmin).request('/', {
      headers: { cookie: await studentCookie() },
    });
    const studentGuard = await standalone(requireStudent).request('/', {
      headers: { cookie: await adminCookie() },
    });

    expect(adminGuard.status).toBe(403);
    expect(studentGuard.status).toBe(403);
  });

  it('rejects anonymous callers with 401 before any role check', async () => {
    expect((await standalone(requireAdmin).request('/')).status).toBe(401);
    expect((await standalone(requireStudent).request('/')).status).toBe(401);
  });

  it('rejects a forged token with 401', async () => {
    const forged = await standalone(requireAdmin).request('/', {
      headers: { cookie: 'quiz_session=not.a.jwt' },
    });

    expect(forged.status).toBe(401);
  });
});
