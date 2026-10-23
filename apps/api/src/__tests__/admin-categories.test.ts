import { randomUUID } from 'node:crypto';

import type { AdminCategory, CategoryOption } from '@quiz/shared/quiz';
import { db, schema } from '@quiz/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

/** Everything this suite creates is removed again, so the seed stays pristine. */
const createdCategoryIds: string[] = [];
const createdQuizIds: string[] = [];

afterAll(async () => {
  for (const id of createdQuizIds) {
    await db.delete(schema.quizzes).where(eq(schema.quizzes.id, id));
  }
  for (const id of createdCategoryIds) {
    await db.delete(schema.categories).where(eq(schema.categories.id, id));
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

function authed(cookie: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) },
  };
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function createCategory(
  cookie: string,
  name: string,
): Promise<CategoryOption & { id: string }> {
  const res = await app.request(
    '/api/admin/categories',
    authed(cookie, { method: 'POST', body: JSON.stringify({ name }) }),
  );

  expect(res.status).toBe(201);

  const body = await json<{ category: CategoryOption }>(res);
  createdCategoryIds.push(body.category.id);

  return body.category as CategoryOption & { id: string };
}

/** The seeded quiz that is published and has attempts — used for the delete rule. */
async function quizWithAttempts(): Promise<{ id: string; categoryId: string }> {
  const [row] = await db
    .select({ id: schema.quizzes.id, categoryId: schema.quizzes.categoryId })
    .from(schema.quizzes)
    .innerJoin(schema.attempts, eq(schema.attempts.quizId, schema.quizzes.id))
    .limit(1);

  if (!row) throw new Error('the seed should contain an attempted quiz');
  return row;
}

describe('GET /api/admin/categories', () => {
  it('lists the seeded categories with their quiz counts', async () => {
    const cookie = await adminCookie();
    const res = await app.request('/api/admin/categories', authed(cookie));

    expect(res.status).toBe(200);

    const body = await json<{ categories: CategoryOption[] }>(res);
    expect(body.categories.length).toBeGreaterThanOrEqual(10);

    // At least one category must be in use, or the counts prove nothing.
    expect(body.categories.some((category) => category.quizCount > 0)).toBe(true);
    expect(body.categories.every((category) => category.slug.length > 0)).toBe(true);
  });

  it('rejects anonymous and student callers', async () => {
    expect((await app.request('/api/admin/categories')).status).toBe(401);

    const student = await studentCookie();
    expect((await app.request('/api/admin/categories', authed(student))).status).toBe(403);
  });
});

describe('POST /api/admin/categories', () => {
  it('creates a category with a slug derived from the name', async () => {
    const cookie = await adminCookie();
    const name = `Rust ${randomUUID().slice(0, 6)}`;
    const category = await createCategory(cookie, name);

    expect(category.name).toBe(name);
    expect(category.slug.startsWith('rust-')).toBe(true);
    expect(category.quizCount).toBe(0);
  });

  it('is idempotent by name, ignoring case and padding', async () => {
    const cookie = await adminCookie();
    const category = await createCategory(cookie, `Go ${randomUUID().slice(0, 6)}`);

    const res = await app.request(
      '/api/admin/categories',
      authed(cookie, {
        method: 'POST',
        body: JSON.stringify({ name: `  ${category.name.toUpperCase()}  ` }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await json<{ category: CategoryOption; created: boolean }>(res);
    expect(body.created).toBe(false);
    expect(body.category.id).toBe(category.id);
  });

  it('rejects a one-character name', async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      '/api/admin/categories',
      authed(cookie, { method: 'POST', body: JSON.stringify({ name: 'x' }) }),
    );

    expect(res.status).toBe(422);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/admin/categories/:id', () => {
  it('returns the category with the quizzes filed under it', async () => {
    const cookie = await adminCookie();
    const quizzes = await quizWithAttempts();

    const res = await app.request(`/api/admin/categories/${quizzes.categoryId}`, authed(cookie));

    expect(res.status).toBe(200);

    const body = await json<{
      category: AdminCategory;
      quizzes: { id: string; title: string; status: string; questionCount: number }[];
    }>(res);

    expect(body.category.id).toBe(quizzes.categoryId);
    expect(body.category.quizCount).toBe(body.quizzes.length);
    expect(body.quizzes.some((quiz) => quiz.id === quizzes.id)).toBe(true);
    expect(body.quizzes.every((quiz) => quiz.questionCount > 0)).toBe(true);
  });

  it('404s for an unknown id and 422s for a malformed one', async () => {
    const cookie = await adminCookie();

    const missing = await app.request(`/api/admin/categories/${randomUUID()}`, authed(cookie));
    expect(missing.status).toBe(404);
    expect((await json<{ error: { code: string } }>(missing)).error.code).toBe(
      'CATEGORY_NOT_FOUND',
    );

    expect((await app.request('/api/admin/categories/not-a-uuid', authed(cookie))).status).toBe(
      422,
    );
  });
});

describe('PATCH /api/admin/categories/:id', () => {
  it('renames a category and keeps its slug', async () => {
    const cookie = await adminCookie();
    const category = await createCategory(cookie, `Kotlin ${randomUUID().slice(0, 6)}`);

    const res = await app.request(
      `/api/admin/categories/${category.id}`,
      authed(cookie, {
        method: 'PATCH',
        body: JSON.stringify({ name: `Kotlin Coroutines ${randomUUID().slice(0, 4)}` }),
      }),
    );

    expect(res.status).toBe(200);

    const body = await json<{ category: AdminCategory }>(res);
    expect(body.category.name).toContain('Kotlin Coroutines');
    expect(body.category.slug).toBe(category.slug);
  });

  it('allows re-casing its own name', async () => {
    const cookie = await adminCookie();
    const category = await createCategory(cookie, `Elixir ${randomUUID().slice(0, 6)}`);

    const res = await app.request(
      `/api/admin/categories/${category.id}`,
      authed(cookie, {
        method: 'PATCH',
        body: JSON.stringify({ name: category.name.toUpperCase() }),
      }),
    );

    expect(res.status).toBe(200);
    expect((await json<{ category: AdminCategory }>(res)).category.name).toBe(
      category.name.toUpperCase(),
    );
  });

  it('refuses a name another category already answers to, in any casing', async () => {
    const cookie = await adminCookie();
    const first = await createCategory(cookie, `Scala ${randomUUID().slice(0, 6)}`);
    const second = await createCategory(cookie, `Haskell ${randomUUID().slice(0, 6)}`);

    const res = await app.request(
      `/api/admin/categories/${second.id}`,
      authed(cookie, {
        method: 'PATCH',
        body: JSON.stringify({ name: first.name.toLowerCase() }),
      }),
    );

    expect(res.status).toBe(409);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('CATEGORY_EXISTS');
  });

  it('sets and clears the description, and rejects an empty body', async () => {
    const cookie = await adminCookie();
    const category = await createCategory(cookie, `Zig ${randomUUID().slice(0, 6)}`);

    const setRes = await app.request(
      `/api/admin/categories/${category.id}`,
      authed(cookie, {
        method: 'PATCH',
        body: JSON.stringify({ description: 'Systems language.' }),
      }),
    );

    expect(setRes.status).toBe(200);
    expect((await json<{ category: AdminCategory }>(setRes)).category.description).toBe(
      'Systems language.',
    );

    const clearRes = await app.request(
      `/api/admin/categories/${category.id}`,
      authed(cookie, { method: 'PATCH', body: JSON.stringify({ description: '' }) }),
    );

    expect(clearRes.status).toBe(200);
    expect((await json<{ category: AdminCategory }>(clearRes)).category.description).toBeNull();

    const emptyRes = await app.request(
      `/api/admin/categories/${category.id}`,
      authed(cookie, { method: 'PATCH', body: JSON.stringify({}) }),
    );

    expect(emptyRes.status).toBe(422);
  });

  it('404s for an unknown category and 403s for a student', async () => {
    const cookie = await adminCookie();

    const missing = await app.request(
      `/api/admin/categories/${randomUUID()}`,
      authed(cookie, { method: 'PATCH', body: JSON.stringify({ name: 'Nope' }) }),
    );
    expect(missing.status).toBe(404);

    const student = await studentCookie();
    const category = await createCategory(cookie, `Dart ${randomUUID().slice(0, 6)}`);

    const forbidden = await app.request(
      `/api/admin/categories/${category.id}`,
      authed(student, { method: 'PATCH', body: JSON.stringify({ name: 'Dart 2' }) }),
    );

    expect(forbidden.status).toBe(403);
  });
});

describe('DELETE /api/admin/categories/:id', () => {
  it('deletes a category nothing is filed under, then 404s', async () => {
    const cookie = await adminCookie();
    const category = await createCategory(cookie, `COBOL ${randomUUID().slice(0, 6)}`);

    const res = await app.request(
      `/api/admin/categories/${category.id}`,
      authed(cookie, { method: 'DELETE' }),
    );

    expect(res.status).toBe(200);
    expect(await json<{ success: boolean; id: string }>(res)).toEqual({
      success: true,
      id: category.id,
    });

    const after = await app.request(
      `/api/admin/categories/${category.id}`,
      authed(cookie, { method: 'DELETE' }),
    );

    expect(after.status).toBe(404);
  });

  it('refuses to delete a category that still has quizzes', async () => {
    const cookie = await adminCookie();
    const { categoryId } = await quizWithAttempts();

    const before = await db.select({ id: schema.categories.id }).from(schema.categories);
    const res = await app.request(
      `/api/admin/categories/${categoryId}`,
      authed(cookie, { method: 'DELETE' }),
    );

    expect(res.status).toBe(409);

    const body = await json<{ error: { code: string; message: string } }>(res);
    expect(body.error.code).toBe('CATEGORY_HAS_QUIZZES');
    expect(body.error.message).toMatch(/move or delete/i);

    const after = await db.select({ id: schema.categories.id }).from(schema.categories);
    expect(after).toHaveLength(before.length);
  });

  it('deletes a category once its quizzes are gone', async () => {
    const cookie = await adminCookie();
    const category = await createCategory(cookie, `Tmp ${randomUUID().slice(0, 6)}`);

    const quizId = randomUUID();
    await db.insert(schema.quizzes).values({
      id: quizId,
      title: `Temp Quiz ${randomUUID().slice(0, 6)}`,
      slug: `temp-quiz-${randomUUID().slice(0, 8)}`,
      categoryId: category.id,
      durationMinutes: 10,
      passingScore: 50,
      maxAttempts: 1,
      status: 'DRAFT',
    });
    createdQuizIds.push(quizId);

    const blocked = await app.request(
      `/api/admin/categories/${category.id}`,
      authed(cookie, { method: 'DELETE' }),
    );

    expect(blocked.status).toBe(409);

    await db.delete(schema.quizzes).where(eq(schema.quizzes.id, quizId));

    const allowed = await app.request(
      `/api/admin/categories/${category.id}`,
      authed(cookie, { method: 'DELETE' }),
    );

    expect(allowed.status).toBe(200);
  });
});
