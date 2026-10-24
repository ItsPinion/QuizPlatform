import { randomUUID } from 'node:crypto';

import { hashPassword, verifyPassword } from '@quiz/shared/crypto';
import { db, schema } from '@quiz/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

/**
 * The account's own password, at the HTTP layer.
 *
 * The reset-by-link flow is covered by `lib/password-reset`'s behaviour in the
 * smoke run; what matters here is the pair of rules that make *changing* one
 * from inside a session safe:
 *
 *   - a session is not enough — the current password must be proved;
 *   - the change kills every outstanding reset link, so a link minted while the
 *     owner was locked out cannot be replayed after they got back in.
 */

const PASSWORD = 'Password123';
const created: string[] = [];

afterAll(async () => {
  for (const email of created) {
    await db.delete(schema.users).where(eq(schema.users.email, email));
  }
});

async function createStudent(): Promise<{ email: string; cookie: string }> {
  const id = randomUUID();
  const email = `account-${id}@quiz.dev`;
  created.push(email);

  await db.insert(schema.users).values({
    id,
    name: 'Account Owner',
    email,
    passwordHash: await hashPassword(PASSWORD),
    role: 'STUDENT',
    status: 'ACTIVE',
  });

  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });

  expect(res.status).toBe(200);

  const cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .find((value) => value?.startsWith('quiz_session='));

  if (!cookie) throw new Error('login did not issue a session cookie');

  return { email, cookie };
}

function change(cookie: string | null, body: unknown) {
  return app.request('/api/auth/change-password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function login(email: string, password: string) {
  return app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

describe('POST /api/auth/change-password', () => {
  it('requires a session', async () => {
    const res = await change(null, { currentPassword: PASSWORD, newPassword: 'Str0nger456' });
    expect(res.status).toBe(401);
  });

  it('refuses a wrong current password and leaves the account alone', async () => {
    const { email, cookie } = await createStudent();

    const res = await change(cookie, {
      currentPassword: 'NotMyPassword1',
      newPassword: 'Str0nger456',
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_PASSWORD');

    // The old password still works — a failed change must be a no-op.
    expect((await login(email, PASSWORD)).status).toBe(200);
  });

  it('changes the password, and the new one is what signs in', async () => {
    const { email, cookie } = await createStudent();

    const res = await change(cookie, { currentPassword: PASSWORD, newPassword: 'Str0nger456' });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { changed: boolean; revokedLinks: number };
    expect(body.changed).toBe(true);
    expect(body.revokedLinks).toBe(0);

    expect((await login(email, PASSWORD)).status).toBe(401);
    expect((await login(email, 'Str0nger456')).status).toBe(200);
  });

  it('stores a hash, never the password', async () => {
    const { email, cookie } = await createStudent();
    await change(cookie, { currentPassword: PASSWORD, newPassword: 'Str0nger456' });

    const [row] = await db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    expect(row?.passwordHash).not.toContain('Str0nger456');
    expect(await verifyPassword('Str0nger456', row!.passwordHash)).toBe(true);
  });

  it('refuses the password it is replacing', async () => {
    const { cookie } = await createStudent();

    const res = await change(cookie, { currentPassword: PASSWORD, newPassword: PASSWORD });
    // The body never reaches the handler: the schema refuses it first.
    expect(res.status).toBe(422);
  });

  it('cancels outstanding reset links', async () => {
    const { email, cookie } = await createStudent();

    // Ask for a link, the way the forgot-password form does.
    const asked = await app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    expect(asked.status).toBe(202);

    const [mail] = await db
      .select({ body: schema.emailOutbox.body })
      .from(schema.emailOutbox)
      .where(eq(schema.emailOutbox.toEmail, email))
      .limit(1);

    const token = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(mail?.body ?? '')?.[1];
    expect(token).toBeTruthy();

    const changed = await change(cookie, {
      currentPassword: PASSWORD,
      newPassword: 'Str0nger456',
    });
    expect(changed.status).toBe(200);

    const body = (await changed.json()) as { revokedLinks: number };
    expect(body.revokedLinks).toBe(1);

    // The link is dead now.
    const spent = await app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: 'BrandNew789' }),
    });

    expect(spent.status).toBe(400);
    expect((await login(email, 'BrandNew789')).status).toBe(401);
    expect((await login(email, 'Str0nger456')).status).toBe(200);
  });
});
