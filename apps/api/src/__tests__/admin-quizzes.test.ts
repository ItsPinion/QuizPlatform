import { randomUUID } from 'node:crypto';

import type { AdminQuiz, QuizListResponse } from '@quiz/shared/quiz';
import { db, schema } from '@quiz/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

/** Everything this suite creates is removed again, so the seed stays pristine. */
const createdQuizIds: string[] = [];
const createdCategoryIds: string[] = [];

afterAll(async () => {
  // Quizzes first: `categories` is protected by `onDelete: restrict`.
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

/** A category that already exists in the seed. */
async function firstCategoryId(): Promise<string> {
  const [row] = await db.select({ id: schema.categories.id }).from(schema.categories).limit(1);
  if (!row) throw new Error('seed has no categories');
  return row.id;
}

interface CreateBody {
  title: string;
  categoryId: string;
  description?: string | null;
  difficulty?: string;
  durationMinutes?: number;
  passingScore?: number;
  maxAttempts?: number;
  thumbnailUrl?: string | null;
}

async function createQuiz(
  cookie: string,
  body: Partial<Omit<CreateBody, 'categoryId'>> = {},
  /** Defaults to an existing seeded category; pass `{ categoryName }` to exercise creation. */
  category?: { categoryId: string } | { categoryName: string },
): Promise<AdminQuiz> {
  const choice = category ?? { categoryId: await firstCategoryId() };

  const res = await app.request('/api/admin/quizzes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      title: `Test Quiz ${randomUUID().slice(0, 8)}`,
      ...choice,
      ...body,
    }),
  });

  expect(res.status).toBe(201);
  const payload = (await res.json()) as { quiz: AdminQuiz };
  createdQuizIds.push(payload.quiz.id);

  return payload.quiz;
}

/** One question with two options, enough to make a quiz publishable. */
async function addQuestion(quizId: string): Promise<void> {
  const questionId = randomUUID();

  await db.insert(schema.questions).values({
    id: questionId,
    quizId,
    questionText: 'Which HTML element holds page metadata?',
    marks: 1,
    position: 1,
  });

  await db.insert(schema.options).values([
    {
      id: randomUUID(),
      questionId,
      optionText: '<head>',
      isCorrect: true,
      position: 1,
    },
    { id: randomUUID(), questionId, optionText: '<body>', isCorrect: false, position: 2 },
  ]);
}

async function getJson<T>(path: string, cookie?: string) {
  const res = await app.request(path, cookie ? { headers: { cookie } } : undefined);
  return { res, body: (await res.json()) as T };
}

describe('GET /api/admin/categories', () => {
  it('lists categories alphabetically with quiz counts', async () => {
    const { res, body } = await getJson<{ categories: { name: string; quizCount: number }[] }>(
      '/api/admin/categories',
      await adminCookie(),
    );

    expect(res.status).toBe(200);
    expect(body.categories.length).toBeGreaterThanOrEqual(10);

    // SQLite orders with its BINARY collation, which is what JS `.sort()` on the
    // raw strings does too — `localeCompare` would disagree on mixed case.
    const names = body.categories.map((category) => category.name);
    expect([...names].sort()).toEqual(names);
    expect(body.categories.every((category) => typeof category.quizCount === 'number')).toBe(true);
    expect(
      body.categories.reduce((total, category) => total + category.quizCount, 0),
    ).toBeGreaterThan(0);
  });

  it('is admin-only', async () => {
    const forbidden = await getJson('/api/admin/categories', await studentCookie());
    expect(forbidden.res.status).toBe(403);

    const anonymous = await getJson('/api/admin/categories');
    expect(anonymous.res.status).toBe(401);
  });
});

describe('GET /api/admin/quizzes', () => {
  it('lists quizzes with pagination and real aggregates', async () => {
    const { res, body } = await getJson<QuizListResponse>(
      '/api/admin/quizzes',
      await adminCookie(),
    );

    expect(res.status).toBe(200);
    expect(body.quizzes.length).toBeGreaterThan(0);
    expect(body.pagination.total).toBeGreaterThanOrEqual(10);
    expect(body.filters.sort).toBe('newest');

    const quiz = body.quizzes[0]!;
    expect(quiz.categoryName).toBeTruthy();
    expect(quiz.questionCount).toBeGreaterThan(0);

    // The two joined counts must not fan out into each other.
    const [row] = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.quizId, quiz.id));
    expect(row).toBeTruthy();

    const questionsInDb = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.quizId, quiz.id));
    expect(quiz.questionCount).toBe(questionsInDb.length);
  });

  it('filters by status and never mixes statuses', async () => {
    for (const status of ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'] as const) {
      const { body } = await getJson<QuizListResponse>(
        `/api/admin/quizzes?status=${status}&pageSize=50`,
        await adminCookie(),
      );

      expect(body.quizzes.every((quiz) => quiz.status === status)).toBe(true);
    }
  });

  it('filters by category and difficulty', async () => {
    const categoryId = await firstCategoryId();

    const byCategory = await getJson<QuizListResponse>(
      `/api/admin/quizzes?categoryId=${categoryId}`,
      await adminCookie(),
    );
    expect(byCategory.body.quizzes.length).toBeGreaterThan(0);
    expect(byCategory.body.quizzes.every((quiz) => quiz.categoryId === categoryId)).toBe(true);

    const byDifficulty = await getJson<QuizListResponse>(
      '/api/admin/quizzes?difficulty=EASY&pageSize=50',
      await adminCookie(),
    );
    expect(byDifficulty.body.quizzes.every((quiz) => quiz.difficulty === 'EASY')).toBe(true);
  });

  it('searches titles case-insensitively', async () => {
    const { body } = await getJson<QuizListResponse>(
      '/api/admin/quizzes?search=javascript',
      await adminCookie(),
    );

    expect(body.quizzes.length).toBeGreaterThan(0);
    expect(body.quizzes.every((quiz) => quiz.title.toLowerCase().includes('javascript'))).toBe(
      true,
    );
  });

  it('sorts by title and by question count', async () => {
    const byTitle = await getJson<QuizListResponse>(
      '/api/admin/quizzes?sort=title&pageSize=50',
      await adminCookie(),
    );
    const titles = byTitle.body.quizzes.map((quiz) => quiz.title);
    expect([...titles].sort()).toEqual(titles);

    const byQuestions = await getJson<QuizListResponse>(
      '/api/admin/quizzes?sort=questions&pageSize=50',
      await adminCookie(),
    );
    const counts = byQuestions.body.quizzes.map((quiz) => quiz.questionCount);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('paginates', async () => {
    const first = await getJson<QuizListResponse>(
      '/api/admin/quizzes?pageSize=2&page=1',
      await adminCookie(),
    );
    const second = await getJson<QuizListResponse>(
      '/api/admin/quizzes?pageSize=2&page=2',
      await adminCookie(),
    );

    expect(first.body.quizzes.length).toBe(2);
    expect(first.body.pagination.hasNext).toBe(true);
    expect(second.body.pagination.hasPrev).toBe(true);
  });

  it('treats cleared filters as absent', async () => {
    const { body } = await getJson<QuizListResponse>(
      '/api/admin/quizzes?search=&status=&difficulty=&categoryId=',
      await adminCookie(),
    );

    expect(body.filters.search).toBeNull();
    expect(body.filters.status).toBeNull();
    expect(body.pagination.total).toBeGreaterThanOrEqual(10);
  });

  it('rejects an unknown status, difficulty or page size with 422', async () => {
    for (const query of ['status=LIVE', 'difficulty=EXTREME', 'pageSize=999', 'categoryId=nope']) {
      const { res } = await getJson(`/api/admin/quizzes?${query}`, await adminCookie());
      expect(res.status).toBe(422);
    }
  });

  it('is admin-only', async () => {
    expect((await getJson('/api/admin/quizzes', await studentCookie())).res.status).toBe(403);
    expect((await getJson('/api/admin/quizzes')).res.status).toBe(401);
  });
});

describe('GET /api/admin/quizzes/:id', () => {
  it('returns one quiz with its aggregates', async () => {
    const created = await createQuiz(await adminCookie());
    const { res, body } = await getJson<{ quiz: AdminQuiz }>(
      `/api/admin/quizzes/${created.id}`,
      await adminCookie(),
    );

    expect(res.status).toBe(200);
    expect(body.quiz).toMatchObject({ id: created.id, status: 'DRAFT', questionCount: 0 });
  });

  it('answers 404 for an unknown id and 422 for a malformed one', async () => {
    const missing = await getJson<{ error: { code: string } }>(
      `/api/admin/quizzes/${randomUUID()}`,
      await adminCookie(),
    );
    expect(missing.res.status).toBe(404);
    expect(missing.body.error.code).toBe('QUIZ_NOT_FOUND');

    const malformed = await getJson(`/api/admin/quizzes/not-a-uuid`, await adminCookie());
    expect(malformed.res.status).toBe(422);
  });
});

describe('POST /api/admin/quizzes', () => {
  it('creates a draft and derives the slug from the title', async () => {
    const cookie = await adminCookie();
    const quiz = await createQuiz(cookie, {
      title: '  Kubernetes Basics — Part 1!  ',
      description: 'Pods, services and deployments.',
      difficulty: 'HARD',
      durationMinutes: 30,
      passingScore: 75,
      maxAttempts: 3,
    });

    expect(quiz.title).toBe('Kubernetes Basics — Part 1!');
    expect(quiz.slug).toBe('kubernetes-basics-part-1');
    expect(quiz.status).toBe('DRAFT');
    expect(quiz.difficulty).toBe('HARD');
    expect(quiz.durationMinutes).toBe(30);
    expect(quiz.passingScore).toBe(75);
    expect(quiz.maxAttempts).toBe(3);
    expect(quiz.questionCount).toBe(0);
    expect(quiz.attemptCount).toBe(0);
  });

  it('applies defaults for omitted numeric fields', async () => {
    const quiz = await createQuiz(await adminCookie(), { title: `Defaults ${randomUUID()}` });

    expect(quiz.difficulty).toBe('MEDIUM');
    expect(quiz.durationMinutes).toBe(20);
    expect(quiz.passingScore).toBe(60);
    expect(quiz.maxAttempts).toBe(2);
    expect(quiz.description).toBeNull();
    expect(quiz.thumbnailUrl).toBeNull();
  });

  it('suffixes the slug when the title is already taken', async () => {
    const cookie = await adminCookie();
    const title = `Duplicate Title ${randomUUID().slice(0, 6)}`;

    const first = await createQuiz(cookie, { title });
    const second = await createQuiz(cookie, { title });

    expect(second.slug).toBe(`${first.slug}-2`);
    expect(second.slug).not.toBe(first.slug);
  });

  it('rejects an unknown category with 422', async () => {
    const res = await app.request('/api/admin/quizzes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await adminCookie() },
      body: JSON.stringify({ title: 'Ghost category', categoryId: randomUUID() }),
    });

    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'CATEGORY_NOT_FOUND',
    );
  });

  it('validates the payload', async () => {
    const cookie = await adminCookie();
    const categoryId = await firstCategoryId();

    const cases = [
      { title: 'ab', categoryId },
      { title: 'Valid title', categoryId, durationMinutes: 0 },
      { title: 'Valid title', categoryId, passingScore: 101 },
      { title: 'Valid title', categoryId, maxAttempts: 0 },
      { title: 'Valid title', categoryId, thumbnailUrl: 'not-a-url' },
      { title: 'Valid title' },
    ];

    for (const payload of cases) {
      const res = await app.request('/api/admin/quizzes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(422);
    }
  });

  it('rejects a malformed or missing body with 400', async () => {
    const cookie = await adminCookie();

    const malformed = await app.request('/api/admin/quizzes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as { error: { code: string } }).error.code).toBe(
      'INVALID_JSON',
    );

    const empty = await app.request('/api/admin/quizzes', { method: 'POST', headers: { cookie } });
    expect(empty.status).toBe(400);
  });

  it('is admin-only', async () => {
    const res = await app.request('/api/admin/quizzes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await studentCookie() },
      body: JSON.stringify({ title: 'Student quiz', categoryId: await firstCategoryId() }),
    });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/quizzes/:id', () => {
  it('updates only the supplied fields and keeps the slug stable', async () => {
    const cookie = await adminCookie();
    const quiz = await createQuiz(cookie, { title: 'Renamable Quiz' });

    const res = await app.request(`/api/admin/quizzes/${quiz.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Renamed Quiz', durationMinutes: 45 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { quiz: AdminQuiz };

    expect(body.quiz.title).toBe('Renamed Quiz');
    expect(body.quiz.durationMinutes).toBe(45);
    // Unrelated fields are untouched …
    expect(body.quiz.passingScore).toBe(quiz.passingScore);
    // … and the slug does not change under existing links.
    expect(body.quiz.slug).toBe(quiz.slug);
  });

  it('moves a quiz to another category', async () => {
    const cookie = await adminCookie();
    const quiz = await createQuiz(cookie);

    const [other] = await db
      .select({ id: schema.categories.id, name: schema.categories.name })
      .from(schema.categories)
      .where(eq(schema.categories.id, quiz.categoryId));
    const categories = await db.select({ id: schema.categories.id }).from(schema.categories);
    const target = categories.find((category) => category.id !== other?.id);
    if (!target) throw new Error('need two categories');

    const res = await app.request(`/api/admin/quizzes/${quiz.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ categoryId: target.id }),
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { quiz: AdminQuiz }).quiz.categoryId).toBe(target.id);
  });

  it('rejects an empty body, an unknown category and an unknown quiz', async () => {
    const cookie = await adminCookie();
    const quiz = await createQuiz(cookie);

    const empty = await app.request(`/api/admin/quizzes/${quiz.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: '{}',
    });
    expect(empty.status).toBe(422);

    const badCategory = await app.request(`/api/admin/quizzes/${quiz.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ categoryId: randomUUID() }),
    });
    expect(badCategory.status).toBe(422);

    const missing = await app.request(`/api/admin/quizzes/${randomUUID()}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Anything' }),
    });
    expect(missing.status).toBe(404);
  });

  it('is admin-only', async () => {
    const quiz = await createQuiz(await adminCookie());

    const res = await app.request(`/api/admin/quizzes/${quiz.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: await studentCookie() },
      body: JSON.stringify({ title: 'Hijacked' }),
    });

    expect(res.status).toBe(403);
  });
});

describe('publish / unpublish', () => {
  const lifecycle = (id: string, action: 'publish' | 'unpublish', cookie: string) =>
    app.request(`/api/admin/quizzes/${id}/${action}`, {
      method: 'POST',
      headers: { cookie },
    });

  it('publishes a draft once it has a question', async () => {
    const cookie = await adminCookie();
    const quiz = await createQuiz(cookie);
    await addQuestion(quiz.id);

    const res = await lifecycle(quiz.id, 'publish', cookie);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { quiz: AdminQuiz };
    expect(body.quiz.status).toBe('PUBLISHED');
    expect(body.quiz.questionCount).toBe(1);
  });

  it('refuses to publish a quiz with no questions', async () => {
    const cookie = await adminCookie();
    const quiz = await createQuiz(cookie);

    const res = await lifecycle(quiz.id, 'publish', cookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'QUIZ_HAS_NO_QUESTIONS',
    );
  });

  it('is idempotent when publishing twice', async () => {
    const cookie = await adminCookie();
    const quiz = await createQuiz(cookie);
    await addQuestion(quiz.id);

    expect((await lifecycle(quiz.id, 'publish', cookie)).status).toBe(200);
    expect((await lifecycle(quiz.id, 'publish', cookie)).status).toBe(200);
  });

  it('unpublishes a published quiz and refuses to unpublish a draft', async () => {
    const cookie = await adminCookie();
    const quiz = await createQuiz(cookie);
    await addQuestion(quiz.id);
    await lifecycle(quiz.id, 'publish', cookie);

    const res = await lifecycle(quiz.id, 'unpublish', cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { quiz: AdminQuiz }).quiz.status).toBe('UNPUBLISHED');

    const again = await lifecycle(quiz.id, 'unpublish', cookie);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe(
      'QUIZ_NOT_PUBLISHED',
    );

    const draft = await createQuiz(cookie);
    const draftAttempt = await lifecycle(draft.id, 'unpublish', cookie);
    expect(draftAttempt.status).toBe(409);
  });

  it('republishes an unpublished quiz', async () => {
    const cookie = await adminCookie();
    const quiz = await createQuiz(cookie);
    await addQuestion(quiz.id);
    await lifecycle(quiz.id, 'publish', cookie);
    await lifecycle(quiz.id, 'unpublish', cookie);

    const res = await lifecycle(quiz.id, 'publish', cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { quiz: AdminQuiz }).quiz.status).toBe('PUBLISHED');
  });

  it('is admin-only', async () => {
    const quiz = await createQuiz(await adminCookie());
    await addQuestion(quiz.id);

    const res = await lifecycle(quiz.id, 'publish', await studentCookie());
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admin/quizzes/:id', () => {
  it('deletes a quiz that has no attempts, cascading its questions', async () => {
    const cookie = await adminCookie();
    const quiz = await createQuiz(cookie);
    await addQuestion(quiz.id);

    const res = await app.request(`/api/admin/quizzes/${quiz.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { success: boolean; id: string }).id).toBe(quiz.id);

    const after = await getJson(`/api/admin/quizzes/${quiz.id}`, cookie);
    expect(after.res.status).toBe(404);

    const orphanQuestions = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.quizId, quiz.id));
    expect(orphanQuestions).toEqual([]);
  });

  it('refuses to delete a quiz that students have attempted', async () => {
    const cookie = await adminCookie();
    const list = await getJson<QuizListResponse>('/api/admin/quizzes?pageSize=50', cookie);
    const attempted = list.body.quizzes.find((quiz) => quiz.attemptCount > 0);
    if (!attempted) throw new Error('seed should contain an attempted quiz');

    const res = await app.request(`/api/admin/quizzes/${attempted.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('QUIZ_HAS_ATTEMPTS');
    expect(body.error.message).toContain('Unpublish');

    // Still there.
    expect((await getJson(`/api/admin/quizzes/${attempted.id}`, cookie)).res.status).toBe(200);
  });

  it('answers 404 for an unknown quiz', async () => {
    const res = await app.request(`/api/admin/quizzes/${randomUUID()}`, {
      method: 'DELETE',
      headers: { cookie: await adminCookie() },
    });

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('QUIZ_NOT_FOUND');
  });

  it('is admin-only', async () => {
    const quiz = await createQuiz(await adminCookie());
    const res = await app.request(`/api/admin/quizzes/${quiz.id}`, {
      method: 'DELETE',
      headers: { cookie: await studentCookie() },
    });

    expect(res.status).toBe(403);
  });
});

describe('quiz namespace hygiene', () => {
  it('answers 404 in the error envelope for an unknown quiz sub-path', async () => {
    const { res, body } = await getJson<{ error: { code: string } }>(
      '/api/admin/quizzes/unknown/path',
      await adminCookie(),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body.error).toBeTruthy();
  });

  it('lists the new endpoints in the banner and /api/meta', async () => {
    const banner = (await (await app.request('/')).json()) as { endpoints: string[] };
    expect(banner.endpoints).toEqual(
      expect.arrayContaining(['/api/admin/quizzes', '/api/admin/categories']),
    );

    const meta = (await (await app.request('/api/meta')).json()) as {
      docs: Record<string, string>;
      roadmap: { day: number }[];
    };
    expect(meta.docs['GET /api/admin/quizzes']).toBeTruthy();
    expect(meta.roadmap.map((entry) => entry.day)).not.toContain(5);
  });
});

describe('category resolution', () => {
  async function categoryNames(): Promise<{ id: string; name: string; slug: string }[]> {
    const rows = await db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        slug: schema.categories.slug,
      })
      .from(schema.categories);
    return rows;
  }

  it('creates a genuinely new category and binds the quiz to it', async () => {
    const cookie = await adminCookie();
    const name = `Machine Learning ${randomUUID().slice(0, 6)}`;

    const quiz = await createQuiz(
      cookie,
      { title: `ML Quiz ${randomUUID().slice(0, 6)}` },
      {
        categoryName: name,
      },
    );

    const rows = await categoryNames();
    const created = rows.find((row) => row.name === name);

    expect(created).toBeTruthy();
    createdCategoryIds.push(created!.id);
    expect(created!.slug).toBe(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    expect(quiz.categoryId).toBe(created!.id);
    expect(quiz.categoryName).toBe(name);
  });

  it('reuses an existing category whatever the casing', async () => {
    const cookie = await adminCookie();
    const rows = await categoryNames();
    const javascript = rows.find((row) => row.name === 'JavaScript');
    expect(javascript).toBeTruthy();

    const quiz = await createQuiz(cookie, {}, { categoryName: '  javascript ' });

    expect(quiz.categoryId).toBe(javascript!.id);
    expect(quiz.categoryName).toBe('JavaScript');

    // And no second "javascript" appeared.
    const after = await categoryNames();
    expect(after.filter((row) => row.name.toLowerCase() === 'javascript')).toHaveLength(1);
  });

  it('collapses internal whitespace when creating', async () => {
    const cookie = await adminCookie();
    const suffix = randomUUID().slice(0, 5);
    const quiz = await createQuiz(
      cookie,
      {},
      {
        categoryName: `Data   Engineering   ${suffix}`,
      },
    );

    expect(quiz.categoryName).toBe(`Data Engineering ${suffix}`);
    createdCategoryIds.push(quiz.categoryId);
  });

  it('rejects a quiz with neither categoryId nor categoryName', async () => {
    const res = await app.request('/api/admin/quizzes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await adminCookie() },
      body: JSON.stringify({ title: 'No category at all' }),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { details: { message: string }[] } };
    expect(JSON.stringify(body.error.details)).toContain('Choose a category');
  });

  it('rejects a quiz that sends both forms', async () => {
    const res = await app.request('/api/admin/quizzes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await adminCookie() },
      body: JSON.stringify({
        title: 'Both categories',
        categoryId: await firstCategoryId(),
        categoryName: 'React',
      }),
    });

    expect(res.status).toBe(422);
  });

  it('can move an existing quiz to a new category by name', async () => {
    const cookie = await adminCookie();
    const quiz = await createQuiz(cookie);
    const name = `Systems ${randomUUID().slice(0, 6)}`;

    const res = await app.request(`/api/admin/quizzes/${quiz.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ categoryName: name }),
    });

    expect(res.status).toBe(200);
    const updated = ((await res.json()) as { quiz: AdminQuiz }).quiz;

    expect(updated.categoryName).toBe(name);
    expect(updated.categoryId).not.toBe(quiz.categoryId);
    createdCategoryIds.push(updated.categoryId);
  });

  it('POST /api/admin/categories creates once, then returns the existing row', async () => {
    const cookie = await adminCookie();
    const name = `Networking ${randomUUID().slice(0, 6)}`;

    const first = await app.request('/api/admin/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name }),
    });

    expect(first.status).toBe(201);
    const created = (await first.json()) as { category: { id: string }; created: boolean };
    createdCategoryIds.push(created.category.id);
    expect(created.created).toBe(true);

    const second = await app.request('/api/admin/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: `  ${name.toUpperCase()}  ` }),
    });

    expect(second.status).toBe(200);
    const existing = (await second.json()) as { category: { id: string }; created: boolean };
    expect(existing.created).toBe(false);
    expect(existing.category.id).toBe(created.category.id);
  });

  it('POST /api/admin/categories validates the name and the caller', async () => {
    const cookie = await adminCookie();

    for (const name of ['', 'x', 'y'.repeat(81)]) {
      const res = await app.request('/api/admin/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name }),
      });
      expect(res.status).toBe(422);
    }

    const forbidden = await app.request('/api/admin/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await studentCookie() },
      body: JSON.stringify({ name: 'Student category' }),
    });
    expect(forbidden.status).toBe(403);
  });
});
