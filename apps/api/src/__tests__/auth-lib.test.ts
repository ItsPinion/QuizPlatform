import type { AuthUser } from '@quiz/shared/auth';
import { SESSION_COOKIE } from '@quiz/shared/auth';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { describe, expect, it } from 'vitest';

import {
  clearSessionCookie,
  createSession,
  readSessionToken,
  resolveJwtSecret,
  setSessionCookie,
  toAuthSession,
  toAuthUser,
  verifySession,
} from '../lib/auth';
import { errorHandler } from '../lib/errors';
import type { AppEnv } from '../lib/types';
import { requireRole } from '../middleware/auth';

const student: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test Student',
  email: 'student@quiz.dev',
  role: 'STUDENT',
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
};

describe('createSession / verifySession', () => {
  it('round-trips the user claims', async () => {
    const { token, expiresAt } = await createSession(student);
    const claims = await verifySession(token);

    expect(claims?.sub).toBe(student.id);
    expect(claims?.email).toBe(student.email);
    expect(claims?.role).toBe('STUDENT');
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('issues a token that expires in seven days', async () => {
    const { expiresAt } = await createSession(student);
    const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;

    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('rejects garbage, an empty string and a foreign signature', async () => {
    expect(await verifySession('not-a-jwt')).toBeUndefined();
    expect(await verifySession('')).toBeUndefined();

    const { token } = await createSession(student);
    const [, payload] = token.split('.');
    const forged = await sign(
      { sub: student.id, email: student.email, role: 'ADMIN' },
      'x'.repeat(40),
    );

    expect(await verifySession(forged)).toBeUndefined();
    expect(payload).toBeDefined();
  });

  it('rejects a token whose payload lacks the required claims', async () => {
    const secret = resolveJwtSecret();
    const now = Math.floor(Date.now() / 1000);
    const noRole = await sign(
      { sub: student.id, email: student.email, iat: now, exp: now + 60 },
      secret,
    );
    const badRole = await sign(
      { sub: student.id, email: student.email, role: 'SUPERUSER', iat: now, exp: now + 60 },
      secret,
    );

    expect(await verifySession(noRole)).toBeUndefined();
    expect(await verifySession(badRole)).toBeUndefined();
  });

  it('uses the configured secret when one is present and long enough', () => {
    expect(resolveJwtSecret().length).toBeGreaterThanOrEqual(32);
  });
});

describe('session cookies', () => {
  /** Runs a handler in a Hono context and returns the Set-Cookie headers. */
  async function run(handler: (c: Parameters<typeof readSessionToken>[0]) => void) {
    const app = new Hono().get('/', (c) => {
      c.header('cache-control', 'no-store');
      handler(c);
      return c.json({ ok: true });
    });

    const res = await app.request('/', { headers: { cookie: `${SESSION_COOKIE}=abc.def.ghi` } });
    return { res, cookies: res.headers.getSetCookie() };
  }

  it('writes an httpOnly Lax cookie with a seven-day lifetime', async () => {
    const { cookies } = await run((c) => setSessionCookie(c, 'header.payload.signature'));
    const cookie = cookies.find((value) => value.startsWith(SESSION_COOKIE));

    expect(cookie).toContain('header.payload.signature');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=604800');
    // Tests run with NODE_ENV=test, so the cookie must not demand HTTPS.
    expect(cookie).not.toContain('Secure');
  });

  it('clears the cookie on the same path', async () => {
    const { cookies } = await run((c) => clearSessionCookie(c));
    const cookie = cookies.find((value) => value.startsWith(SESSION_COOKIE));

    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Path=/');
  });

  it('reads the cookie, and falls back to a Bearer header', async () => {
    const withCookie = await run((c) => {
      expect(readSessionToken(c)).toBe('abc.def.ghi');
    });
    expect(withCookie.res.status).toBe(200);

    const bearer = new Hono().get('/', (c) => c.json({ token: readSessionToken(c) ?? null }));
    const res = await bearer.request('/', { headers: { authorization: 'Bearer x.y.z' } });

    expect(await res.json()).toEqual({ token: 'x.y.z' });
  });

  it('ignores an Authorization header that is not a Bearer scheme', async () => {
    const app = new Hono().get('/', (c) => c.json({ token: readSessionToken(c) ?? null }));
    const res = await app.request('/', { headers: { authorization: 'Basic abc' } });

    expect(await res.json()).toEqual({ token: null });
  });
});

describe('toAuthUser / toAuthSession', () => {
  it('drops the password hash and serialises the timestamp', () => {
    const row = {
      id: student.id,
      name: student.name,
      email: student.email,
      role: 'ADMIN' as const,
      status: 'ACTIVE' as const,
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      passwordHash: 'scrypt$16384$8$1$deadbeef$cafebabe',
    };

    const user = toAuthUser(row);

    expect(user).toEqual({
      id: student.id,
      name: student.name,
      email: student.email,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: '2026-01-02T03:04:05.000Z',
    });
    expect(JSON.stringify(user)).not.toContain('scrypt');
  });

  it('wraps a user and an expiry into the API envelope', () => {
    expect(toAuthSession(student, '2026-02-01T00:00:00.000Z')).toEqual({
      user: student,
      expiresAt: '2026-02-01T00:00:00.000Z',
    });
  });
});

describe('requireRole', () => {
  /** A tiny app that injects a session user, mirroring `requireAuth`. */
  function appWith(role: AuthUser['role'] | null) {
    const app = new Hono<AppEnv>();

    app.use('*', async (c, next) => {
      if (role) c.set('user', { ...student, role });
      await next();
    });
    app.use('*', requireRole('ADMIN'));
    app.get('/', (c) => c.json({ ok: true }));
    // The real app installs this globally; the guard's errors need it to render.
    app.onError(errorHandler);

    return app;
  }

  it('allows a matching role', async () => {
    const res = await appWith('ADMIN').request('/');
    expect(res.status).toBe(200);
  });

  it('forbids a different role with 403', async () => {
    const res = await appWith('STUDENT').request('/');
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('asks for authentication when no user is set', async () => {
    const res = await appWith(null).request('/');
    expect(res.status).toBe(401);
  });
});
