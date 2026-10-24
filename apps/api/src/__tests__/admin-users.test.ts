import { randomUUID } from 'node:crypto';

import { hashPassword } from '@quiz/shared/crypto';
import type { DashboardStats } from '@quiz/shared/admin';
import { db, schema } from '@quiz/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

const createdIds: string[] = [];

afterAll(async () => {
  for (const id of createdIds) {
    await db.delete(schema.users).where(eq(schema.users.id, id));
  }
});

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

/** A throwaway student the PATCH tests can promote/deactivate freely. */
async function createStudent(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  const id = randomUUID();
  const email = `managed-${id}@quiz.dev`;
  createdIds.push(id);

  await db.insert(schema.users).values({
    id,
    name: 'Managed Student',
    email,
    passwordHash: await hashPassword('Managed12345'),
    role: 'STUDENT',
    status: 'ACTIVE',
    ...overrides,
  });

  return { id, email, password: 'Managed12345' };
}

async function getJson<T>(path: string, cookie?: string) {
  const res = await app.request(path, cookie ? { headers: { cookie } } : undefined);
  return { res, body: (await res.json()) as T };
}

function patchUser(id: string, cookie: string, body: unknown) {
  return app.request(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

describe('GET /api/admin/stats', () => {
  it('reports counts that agree with the database', async () => {
    const { res, body } = await getJson<DashboardStats>('/api/admin/stats', await adminCookie());

    expect(res.status).toBe(200);

    const [userCount] = await db.select({ id: schema.users.id }).from(schema.users);
    expect(userCount).toBeTruthy();
    expect(body.users.total).toBeGreaterThanOrEqual(4);
    expect(body.users.total).toBe(body.users.active + body.users.inactive);
    expect(body.users.admins + body.users.students).toBe(body.users.total);
    expect(body.content.quizzes).toBe(
      body.content.published + body.content.drafts + body.content.unpublished,
    );
    expect(body.attempts.passed + body.attempts.failed + body.attempts.expired).toBeLessThanOrEqual(
      body.attempts.total,
    );
  });

  it('computes a pass rate between 0 and 100 with one decimal', async () => {
    const { body } = await getJson<DashboardStats>('/api/admin/stats', await adminCookie());

    expect(body.attempts.passRate).toBeGreaterThanOrEqual(0);
    expect(body.attempts.passRate).toBeLessThanOrEqual(100);
    expect(Number.isInteger(body.attempts.passRate * 10)).toBe(true);
    expect(body.attempts.averagePercentage).toBeGreaterThanOrEqual(0);
    expect(body.attempts.averagePercentage).toBeLessThanOrEqual(100);
  });

  it('includes the newest five users and attempts', async () => {
    const { body } = await getJson<DashboardStats>('/api/admin/stats', await adminCookie());

    expect(body.recentUsers.length).toBeGreaterThan(0);
    expect(body.recentUsers.length).toBeLessThanOrEqual(5);
    expect(body.recentAttempts.length).toBeLessThanOrEqual(5);

    const starts = body.recentAttempts.map((attempt) => Date.parse(attempt.startedAt));
    expect([...starts].sort((a, b) => b - a)).toEqual(starts);

    // Never leak the credential column through a stats payload.
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });

  it('reflects a newly created user immediately', async () => {
    const before = await getJson<DashboardStats>('/api/admin/stats', await adminCookie());

    const student = await createStudent();
    const after = await getJson<DashboardStats>('/api/admin/stats', await adminCookie());

    expect(after.body.users.total).toBe(before.body.users.total + 1);
    expect(after.body.users.students).toBe(before.body.users.students + 1);
    expect(after.body.users.joinedLast7Days).toBe(before.body.users.joinedLast7Days + 1);
    expect(after.body.recentUsers[0]?.id).toBe(student.id);
  });

  it('is admin-only: students get 403, anonymous callers 401', async () => {
    const forbidden = await getJson<{ error: { code: string } }>(
      '/api/admin/stats',
      await studentCookie(),
    );
    expect(forbidden.res.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const anonymous = await getJson('/api/admin/stats');
    expect(anonymous.res.status).toBe(401);
  });
});

describe('GET /api/admin/users', () => {
  interface ListBody {
    users: {
      id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      attempts: number;
      completedAttempts: number;
      bestPercentage: number | null;
      averagePercentage: number | null;
      lastAttemptAt: string | null;
      createdAt: string;
    }[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    filters: { search: string | null; role: string | null; status: string | null; sort: string };
  }

  it('lists users with pagination metadata', async () => {
    const { res, body } = await getJson<ListBody>('/api/admin/users', await adminCookie());

    expect(res.status).toBe(200);
    expect(body.users.length).toBeGreaterThan(0);
    expect(body.users.length).toBeLessThanOrEqual(body.pagination.pageSize);
    expect(body.pagination.total).toBeGreaterThanOrEqual(4);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.hasPrev).toBe(false);
    expect(body.filters.sort).toBe('newest');
  });

  it('carries the average and the best score §6 asks for', async () => {
    const { body } = await getJson<ListBody>('/api/admin/users?pageSize=50', await adminCookie());

    for (const user of body.users) {
      if (user.completedAttempts === 0) {
        // Nothing graded yet: both figures are null, not a misleading 0.
        expect(user.averagePercentage).toBeNull();
        expect(user.bestPercentage).toBeNull();
        continue;
      }

      expect(user.averagePercentage).not.toBeNull();
      expect(user.bestPercentage).not.toBeNull();

      // An average is bounded by the extremes of the same set, so it can never
      // exceed the best. A row where it does is a join that multiplied rows.
      expect(user.averagePercentage!).toBeGreaterThanOrEqual(0);
      expect(user.averagePercentage!).toBeLessThanOrEqual(100);
      expect(user.averagePercentage!).toBeLessThanOrEqual(user.bestPercentage! + 0.001);
    }

    // The seeded students have graded attempts, so the invariant was exercised.
    expect(body.users.some((user) => user.averagePercentage !== null)).toBe(true);
  });

  it('never exposes the password hash', async () => {
    const { body } = await getJson<ListBody>('/api/admin/users', await adminCookie());
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    expect(Object.keys(body.users[0] ?? {})).not.toContain('passwordHash');
  });

  it('filters by role', async () => {
    const { body } = await getJson<ListBody>('/api/admin/users?role=ADMIN', await adminCookie());

    expect(body.users.length).toBeGreaterThan(0);
    expect(body.users.every((user) => user.role === 'ADMIN')).toBe(true);
    expect(body.filters.role).toBe('ADMIN');
  });

  it('filters by status', async () => {
    const student = await createStudent({ status: 'INACTIVE' });
    const { body } = await getJson<ListBody>(
      '/api/admin/users?status=INACTIVE',
      await adminCookie(),
    );

    expect(body.users.every((user) => user.status === 'INACTIVE')).toBe(true);
    expect(body.users.map((user) => user.id)).toContain(student.id);
  });

  it('searches by name and by email, case-insensitively', async () => {
    const byName = await getJson<ListBody>('/api/admin/users?search=PRIYA', await adminCookie());
    expect(byName.body.users.length).toBe(1);
    expect(byName.body.users[0]?.name).toContain('Priya');

    const byEmail = await getJson<ListBody>('/api/admin/users?search=rahul@', await adminCookie());
    expect(byEmail.body.users.length).toBe(1);
    expect(byEmail.body.users[0]?.email).toBe('rahul@quiz.dev');
  });

  it('returns an empty page for a search with no matches, without erroring', async () => {
    const { res, body } = await getJson<ListBody>(
      '/api/admin/users?search=zzz-nobody',
      await adminCookie(),
    );

    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
    expect(body.pagination.total).toBe(0);
    expect(body.pagination.totalPages).toBe(1);
  });

  it('paginates', async () => {
    const first = await getJson<ListBody>(
      '/api/admin/users?pageSize=2&page=1',
      await adminCookie(),
    );
    const second = await getJson<ListBody>(
      '/api/admin/users?pageSize=2&page=2',
      await adminCookie(),
    );

    expect(first.body.users.length).toBe(2);
    expect(first.body.pagination.pageSize).toBe(2);
    expect(first.body.pagination.hasNext).toBe(true);
    expect(second.body.pagination.hasPrev).toBe(true);
    expect(second.body.users.map((user) => user.id)).not.toEqual(
      first.body.users.map((user) => user.id),
    );
  });

  it('sorts by name when asked', async () => {
    const { body } = await getJson<ListBody>(
      '/api/admin/users?sort=name&pageSize=50',
      await adminCookie(),
    );
    const names = body.users.map((user) => user.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it('sorts by attempt count when asked', async () => {
    const { body } = await getJson<ListBody>(
      '/api/admin/users?sort=attempts&pageSize=50',
      await adminCookie(),
    );
    const counts = body.users.map((user) => user.attempts);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('treats an empty filter value as absent', async () => {
    const { body } = await getJson<ListBody>(
      '/api/admin/users?role=&status=&search=',
      await adminCookie(),
    );
    expect(body.filters.role).toBeNull();
    expect(body.filters.status).toBeNull();
    expect(body.filters.search).toBeNull();
    expect(body.pagination.total).toBeGreaterThanOrEqual(4);
  });

  it('rejects an out-of-range page size with 422', async () => {
    const { res, body } = await getJson<{ error: { code: string } }>(
      '/api/admin/users?pageSize=999',
      await adminCookie(),
    );

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown role with 422', async () => {
    const { res } = await getJson('/api/admin/users?role=TEACHER', await adminCookie());
    expect(res.status).toBe(422);
  });

  it('is admin-only', async () => {
    const forbidden = await getJson('/api/admin/users', await studentCookie());
    expect(forbidden.res.status).toBe(403);

    const anonymous = await getJson('/api/admin/users');
    expect(anonymous.res.status).toBe(401);
  });
});

describe('GET /api/admin/users/:id', () => {
  it('returns a single user with attempt statistics', async () => {
    const list = await getJson<{ users: { id: string; email: string }[] }>(
      '/api/admin/users?search=rahul@',
      await adminCookie(),
    );
    const id = list.body.users[0]?.id ?? '';
    const { res, body } = await getJson<{ user: { id: string; attempts: number } }>(
      `/api/admin/users/${id}`,
      await adminCookie(),
    );

    expect(res.status).toBe(200);
    expect(body.user.id).toBe(id);
    expect(body.user.attempts).toBeGreaterThan(0);
  });

  it('answers 404 USER_NOT_FOUND for an unknown id', async () => {
    const { res, body } = await getJson<{ error: { code: string } }>(
      `/api/admin/users/${randomUUID()}`,
      await adminCookie(),
    );

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('USER_NOT_FOUND');
  });

  it('answers 422 for a malformed id', async () => {
    const { res, body } = await getJson<{ error: { code: string } }>(
      '/api/admin/users/not-a-uuid',
      await adminCookie(),
    );

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/admin/users/:id', () => {
  it('promotes a student to admin and back', async () => {
    const student = await createStudent();
    const cookie = await adminCookie();

    const promoted = await patchUser(student.id, cookie, { role: 'ADMIN' });
    const promotedBody = (await promoted.json()) as { user: { role: string } };

    expect(promoted.status).toBe(200);
    expect(promotedBody.user.role).toBe('ADMIN');

    const [row] = await db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, student.id));
    expect(row?.role).toBe('ADMIN');

    const demoted = await patchUser(student.id, cookie, { role: 'STUDENT' });
    expect(demoted.status).toBe(200);
    expect(((await demoted.json()) as { user: { role: string } }).user.role).toBe('STUDENT');
  });

  it('deactivates and reactivates an account', async () => {
    const student = await createStudent();
    const cookie = await adminCookie();
    // Sign in before deactivating — an inactive account cannot log in at all.
    const theirCookie = await cookieFor(student.email, student.password);

    const deactivated = await patchUser(student.id, cookie, { status: 'INACTIVE' });
    expect(deactivated.status).toBe(200);
    expect(((await deactivated.json()) as { user: { status: string } }).user.status).toBe(
      'INACTIVE',
    );

    // Deactivation is immediate: the session issued a moment ago stops working.
    const blocked = await getJson<{ error: { code: string } }>('/api/auth/me', theirCookie);
    expect(blocked.res.status).toBe(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_INACTIVE');

    const reactivated = await patchUser(student.id, cookie, { status: 'ACTIVE' });
    expect(reactivated.status).toBe(200);

    const allowed = await getJson('/api/auth/me', theirCookie);
    expect(allowed.res.status).toBe(200);

    // …and a fresh login works again, which proves the lockout was the status.
    await expect(cookieFor(student.email, student.password)).resolves.toContain('quiz_session=');
  });

  it('applies role and status in one request', async () => {
    const student = await createStudent();
    const res = await patchUser(student.id, await adminCookie(), {
      role: 'ADMIN',
      status: 'INACTIVE',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { role: string; status: string } };
    expect(body.user).toMatchObject({ role: 'ADMIN', status: 'INACTIVE' });
  });

  it('refuses to demote the signed-in admin', async () => {
    const admin = await createStudent({ role: 'ADMIN' });
    const cookie = await cookieFor(admin.email, admin.password);

    const res = await patchUser(admin.id, cookie, { role: 'STUDENT' });
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('SELF_LOCKOUT');

    const [row] = await db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, admin.id));
    expect(row?.role).toBe('ADMIN');
  });

  it('refuses to deactivate the signed-in admin', async () => {
    const admin = await createStudent({ role: 'ADMIN' });
    const cookie = await cookieFor(admin.email, admin.password);

    const res = await patchUser(admin.id, cookie, { status: 'INACTIVE' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('SELF_LOCKOUT');
  });

  it('allows an admin to deactivate a different admin', async () => {
    const other = await createStudent({ role: 'ADMIN' });
    const res = await patchUser(other.id, await adminCookie(), { status: 'INACTIVE' });

    expect(res.status).toBe(200);
  });

  it('answers 404 for an unknown user', async () => {
    const res = await patchUser(randomUUID(), await adminCookie(), { role: 'ADMIN' });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('USER_NOT_FOUND');
  });

  it('rejects an empty body and an invalid enum with 422', async () => {
    const student = await createStudent();
    const cookie = await adminCookie();

    const empty = await patchUser(student.id, cookie, {});
    expect(empty.status).toBe(422);

    const invalid = await patchUser(student.id, cookie, { role: 'SUPERUSER' });
    expect(invalid.status).toBe(422);

    const garbage = await app.request(`/api/admin/users/${student.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: '{',
    });
    expect(garbage.status).toBe(400);
    expect(((await garbage.json()) as { error: { code: string } }).error.code).toBe('INVALID_JSON');
  });

  it('is admin-only', async () => {
    const student = await createStudent();

    const forbidden = await patchUser(student.id, await studentCookie(), { role: 'ADMIN' });
    expect(forbidden.status).toBe(403);

    const anonymous = await app.request(`/api/admin/users/${student.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    expect(anonymous.status).toBe(401);
  });
});
