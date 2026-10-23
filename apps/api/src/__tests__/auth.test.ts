import { randomUUID } from 'node:crypto';

import type { AuthSession } from '@quiz/shared/auth';
import { SESSION_COOKIE } from '@quiz/shared/auth';
import { db, schema } from '@quiz/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { sign } from 'hono/jwt';

import { app } from '../app';
import { resolveJwtSecret } from '../lib/auth';

const STUDENT_PASSWORD = 'Password123';
const ADMIN_PASSWORD = 'Admin12345';

/** Unique address per run so repeated runs never collide. */
function freshEmail(prefix = 'student'): string {
  return `${prefix}-${randomUUID()}@quiz.dev`;
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Collect the httpOnly session cookie a response sets, if any. */
function sessionCookieFrom(res: Response): string | undefined {
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .find((value) => value?.startsWith(`${SESSION_COOKIE}=`));
}

async function register(name = 'Test Student') {
  const email = freshEmail();
  createdEmails.push(email);
  const res = await post('/api/auth/register', { name, email, password: 'Secret12345' });
  return { res, email, cookie: sessionCookieFrom(res) };
}

/** Responses are single-use streams, so helpers return them unparsed. */
async function login(email: string, password: string) {
  const res = await post('/api/auth/login', { email, password });
  return { res, cookie: sessionCookieFrom(res) };
}

const createdEmails: string[] = [];

afterAll(async () => {
  for (const email of createdEmails) {
    await db.delete(schema.users).where(eq(schema.users.email, email));
  }
});

describe('POST /api/auth/register', () => {
  it('creates a STUDENT account and signs the caller in', async () => {
    const email = freshEmail();
    createdEmails.push(email);

    const res = await post('/api/auth/register', {
      name: 'New Student',
      email,
      password: 'Secret12345',
    });
    const body = (await res.json()) as AuthSession;

    expect(res.status).toBe(201);
    expect(body.user.email).toBe(email);
    expect(body.user.name).toBe('New Student');
    expect(body.user.role).toBe('STUDENT');
    expect(body.user.status).toBe('ACTIVE');
    expect(Number.isNaN(Date.parse(body.user.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
    // The hash must never leave the server.
    expect(JSON.stringify(body)).not.toContain('scrypt');
    expect(sessionCookieFrom(res)).toBeDefined();
  });

  it('stores a scrypt hash, never the password itself', async () => {
    const email = freshEmail();
    createdEmails.push(email);

    await post('/api/auth/register', { name: 'Hash Check', email, password: 'Secret12345' });

    const [row] = await db
      .select({ hash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    expect(row?.hash).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(row?.hash).not.toContain('Secret12345');
  });

  it('issues an httpOnly, Lax, first-party cookie', async () => {
    const { res } = await register();
    const cookie = res.headers.getSetCookie().find((value) => value.startsWith(SESSION_COOKIE));

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toMatch(/Max-Age=\d+/);
  });

  it('normalises the email to lowercase', async () => {
    const email = `Mixed-${randomUUID()}@Quiz.DEV`;
    createdEmails.push(email.toLowerCase());

    const res = await post('/api/auth/register', {
      name: 'Mixed Case',
      email,
      password: 'Secret12345',
    });
    const body = (await res.json()) as AuthSession;

    expect(res.status).toBe(201);
    expect(body.user.email).toBe(email.toLowerCase());
  });

  it('ignores a client-supplied role — no privilege escalation', async () => {
    const email = freshEmail('escalate');
    createdEmails.push(email);

    const res = await post('/api/auth/register', {
      name: 'Sneaky User',
      email,
      password: 'Secret12345',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    const body = (await res.json()) as AuthSession;

    expect(res.status).toBe(201);
    expect(body.user.role).toBe('STUDENT');
  });

  it('rejects a duplicate email with 409', async () => {
    const { email } = await register();

    const res = await post('/api/auth/register', {
      name: 'Copy Cat',
      email,
      password: 'Secret12345',
    });
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a weak password with 422 and field detail', async () => {
    const res = await post('/api/auth/register', {
      name: 'Weak Password',
      email: freshEmail('weak'),
      password: 'short',
    });
    const body = (await res.json()) as { error: { code: string; details: unknown } };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(body.error.details)).toContain('8 characters');
  });

  it('rejects a malformed payload with 400', async () => {
    const res = await post('/api/auth/register', '{ not json');
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
  });
});

describe('POST /api/auth/login', () => {
  it('signs in a seeded student', async () => {
    const { res } = await login('rahul@quiz.dev', STUDENT_PASSWORD);
    const body = (await res.json()) as AuthSession;

    expect(res.status).toBe(200);
    expect(body.user.email).toBe('rahul@quiz.dev');
    expect(body.user.role).toBe('STUDENT');
    expect(sessionCookieFrom(res)).toBeDefined();
  });

  it('signs in the seeded admin with the ADMIN role', async () => {
    const { res } = await login('admin@quiz.dev', ADMIN_PASSWORD);
    const body = (await res.json()) as AuthSession;

    expect(res.status).toBe(200);
    expect(body.user.role).toBe('ADMIN');
  });

  it('rejects a wrong password with 401', async () => {
    const { res } = await login('rahul@quiz.dev', 'WrongPassword1');
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(401);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('answers an unknown email exactly like a wrong password', async () => {
    const unknown = await login(freshEmail('ghost'), 'WrongPassword1');
    const wrongPassword = await login('rahul@quiz.dev', 'WrongPassword1');

    const unknownBody = (await unknown.res.json()) as { error: { code: string; message: string } };
    const wrongBody = (await wrongPassword.res.json()) as {
      error: { code: string; message: string };
    };

    expect(unknown.res.status).toBe(401);
    expect(unknownBody).toEqual(wrongBody);
  });

  it('refuses an INACTIVE account even with the right password', async () => {
    const email = freshEmail('inactive');
    createdEmails.push(email);
    await post('/api/auth/register', { name: 'Inactive', email, password: 'Secret12345' });

    await db.update(schema.users).set({ status: 'INACTIVE' }).where(eq(schema.users.email, email));

    const { res, cookie } = await login(email, 'Secret12345');
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('ACCOUNT_INACTIVE');
    expect(cookie).toBeUndefined();
  });

  it('rejects a malformed payload with 422', async () => {
    const res = await post('/api/auth/login', { email: 'not-an-email', password: '' });
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the signed-in user', async () => {
    const { cookie, email } = await register('Me Myself');

    const res = await app.request('/api/auth/me', { headers: { cookie: cookie! } });
    const body = (await res.json()) as AuthSession;

    expect(res.status).toBe(200);
    expect(body.user.email).toBe(email);
    expect(body.user.role).toBe('STUDENT');
    expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
  });

  it('accepts a Bearer token as well as the cookie', async () => {
    const { cookie } = await register();
    const token = cookie!.split('=')[1];

    const res = await app.request('/api/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as AuthSession;

    expect(res.status).toBe(200);
    expect(body.user.role).toBe('STUDENT');
  });

  it('rejects a request with no session', async () => {
    const res = await app.request('/api/auth/me');
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered token', async () => {
    const { cookie } = await register();
    const [name, token] = cookie!.split('=');
    const parts = token!.split('.');
    const signature = parts[2]!;
    parts[2] = `${signature.slice(0, -2)}${signature.endsWith('a') ? 'bb' : 'aa'}`;

    const res = await app.request('/api/auth/me', {
      headers: { cookie: `${name}=${parts.join('.')}` },
    });

    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const { res: created } = await register();
    const body = (await created.json()) as AuthSession;
    const now = Math.floor(Date.now() / 1000);
    const expired = await sign(
      {
        sub: body.user.id,
        email: body.user.email,
        role: body.user.role,
        iat: now - 120,
        exp: now - 60,
      },
      resolveJwtSecret(),
      'HS256',
    );

    const res = await app.request('/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE}=${expired}` },
    });
    const error = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(401);
    expect(error.error.code).toBe('INVALID_SESSION');
  });

  it('rejects a token signed with a different secret', async () => {
    const { res: created } = await register();
    const body = (await created.json()) as AuthSession;
    const now = Math.floor(Date.now() / 1000);
    const forged = await sign(
      {
        sub: body.user.id,
        email: body.user.email,
        role: 'ADMIN',
        iat: now,
        exp: now + 600,
      },
      'a'.repeat(48),
      'HS256',
    );

    const res = await app.request('/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE}=${forged}` },
    });

    expect(res.status).toBe(401);
  });

  it('rejects a session whose user was deleted', async () => {
    const { cookie, email } = await register('Deleted Soon');
    await db.delete(schema.users).where(eq(schema.users.email, email));

    const res = await app.request('/api/auth/me', { headers: { cookie: cookie! } });
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(401);
    expect(body.error.code).toBe('INVALID_SESSION');
  });

  it('locks out a user deactivated after signing in', async () => {
    const { cookie, email } = await register('Deactivated');
    await db.update(schema.users).set({ status: 'INACTIVE' }).where(eq(schema.users.email, email));

    const res = await app.request('/api/auth/me', { headers: { cookie: cookie! } });
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const { cookie } = await register();

    const res = await post('/api/auth/logout', {}, { cookie: cookie! });
    const body = (await res.json()) as { success: boolean };
    const cleared = res.headers.getSetCookie().find((value) => value.startsWith(SESSION_COOKIE));

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(cleared).toBeDefined();
    expect(cleared).toContain('Max-Age=0');
  });

  it('is idempotent without a session', async () => {
    const res = await post('/api/auth/logout', {});
    expect(res.status).toBe(200);
  });
});
