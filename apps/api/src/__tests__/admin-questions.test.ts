import { randomUUID } from 'node:crypto';

import type { AdminQuestion } from '@quiz/shared/question';
import { db, schema } from '@quiz/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

/** Everything this suite creates is removed again, so the seed stays pristine. */
const createdQuizIds: string[] = [];

afterAll(async () => {
  // Questions and options go with the quiz (cascade).
  for (const id of createdQuizIds) {
    await db.delete(schema.quizzes).where(eq(schema.quizzes.id, id));
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

/** A throwaway quiz owned by this suite; deleted (with its questions) afterwards. */
async function makeQuiz(status: 'DRAFT' | 'PUBLISHED' = 'DRAFT'): Promise<string> {
  const [category] = await db.select({ id: schema.categories.id }).from(schema.categories).limit(1);
  if (!category) throw new Error('the seed has no categories');

  const id = randomUUID();
  await db.insert(schema.quizzes).values({
    id,
    title: `Question Fixture ${randomUUID().slice(0, 6)}`,
    slug: `question-fixture-${randomUUID().slice(0, 8)}`,
    categoryId: category.id,
    durationMinutes: 10,
    passingScore: 50,
    maxAttempts: 1,
    status,
  });

  createdQuizIds.push(id);
  return id;
}

function optionSet(texts: string[], correctIndex = 0) {
  return {
    questionText: `Which one is correct ${randomUUID().slice(0, 6)}?`,
    options: texts.map((text) => ({ text })),
    correctIndex,
  };
}

const FOUR = ['Alpha', 'Beta', 'Gamma', 'Delta'];

async function createQuestion(
  cookie: string,
  quizId: string,
  body: Record<string, unknown>,
): Promise<AdminQuestion> {
  const res = await app.request(
    `/api/admin/quizzes/${quizId}/questions`,
    authed(cookie, { method: 'POST', body: JSON.stringify(body) }),
  );

  expect(res.status).toBe(201);
  return (await json<{ question: AdminQuestion }>(res)).question;
}

describe('GET /api/admin/quizzes/:id/questions', () => {
  it('returns the seeded questions in order, one correct option each', async () => {
    const cookie = await adminCookie();

    const [quiz] = await db
      .select({ id: schema.quizzes.id })
      .from(schema.quizzes)
      .where(eq(schema.quizzes.slug, 'html-fundamentals'))
      .limit(1);

    if (!quiz) throw new Error('expected the seeded HTML quiz');

    const res = await app.request(`/api/admin/quizzes/${quiz.id}/questions`, authed(cookie));

    expect(res.status).toBe(200);

    const body = await json<{
      quiz: { id: string; title: string; status: string };
      questions: AdminQuestion[];
    }>(res);

    expect(body.quiz.id).toBe(quiz.id);
    expect(body.questions.length).toBeGreaterThan(0);

    expect(body.questions.map((question) => question.position)).toEqual(
      body.questions.map((_, index) => index),
    );

    for (const question of body.questions) {
      expect(question.options.length).toBeGreaterThanOrEqual(2);
      expect(question.options.filter((option) => option.isCorrect)).toHaveLength(1);
    }
  });

  it('404s for an unknown quiz and 422s for a malformed id', async () => {
    const cookie = await adminCookie();

    expect(
      (await app.request(`/api/admin/quizzes/${randomUUID()}/questions`, authed(cookie))).status,
    ).toBe(404);
    expect((await app.request('/api/admin/quizzes/nope/questions', authed(cookie))).status).toBe(
      422,
    );
  });
});

describe('POST /api/admin/quizzes/:id/questions', () => {
  it('appends a question at the end with exactly one correct option', async () => {
    const cookie = await adminCookie();
    const quizId = await makeQuiz();

    const first = await createQuestion(cookie, quizId, optionSet(FOUR, 2));
    const second = await createQuestion(cookie, quizId, optionSet(FOUR, 0));

    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
    expect(first.answerCount).toBe(0);
    expect(first.options.map((option) => option.position)).toEqual([0, 1, 2, 3]);
    expect(first.options.filter((option) => option.isCorrect).map((option) => option.text)).toEqual(
      ['Gamma'],
    );
    expect(first.marks).toBe(1);
    expect(first.difficulty).toBe('MEDIUM');
    expect(first.explanation).toBeNull();
  });

  it('stores marks, difficulty and an explanation', async () => {
    const cookie = await adminCookie();
    const quizId = await makeQuiz();

    const question = await createQuestion(cookie, quizId, {
      ...optionSet(FOUR, 1),
      marks: 3,
      difficulty: 'HARD',
      explanation: 'Beta is the second letter.',
    });

    expect(question.marks).toBe(3);
    expect(question.difficulty).toBe('HARD');
    expect(question.explanation).toBe('Beta is the second letter.');
  });

  it('validates the option set', async () => {
    const cookie = await adminCookie();
    const quizId = await makeQuiz();

    const cases: [string, Record<string, unknown>][] = [
      ['too few options', { questionText: 'Only one?', options: [{ text: 'A' }], correctIndex: 0 }],
      [
        'too many options',
        {
          questionText: 'Too many?',
          options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((text) => ({ text })),
          correctIndex: 0,
        },
      ],
      ['correct index out of range', optionSet(FOUR, 4)],
      ['duplicate options', optionSet(['Same', 'same', 'Other'], 0)],
      ['blank option', optionSet(['A', '   '], 0)],
      ['short question text', { ...optionSet(FOUR), questionText: 'Hi' }],
      ['zero marks', { ...optionSet(FOUR), marks: 0 }],
      ['too many marks', { ...optionSet(FOUR), marks: 11 }],
    ];

    for (const [label, body] of cases) {
      const res = await app.request(
        `/api/admin/quizzes/${quizId}/questions`,
        authed(cookie, { method: 'POST', body: JSON.stringify(body) }),
      );

      expect(res.status, label).toBe(422);
    }
  });

  it('404s when the quiz does not exist and 403s for a student', async () => {
    const cookie = await adminCookie();

    const missing = await app.request(
      `/api/admin/quizzes/${randomUUID()}/questions`,
      authed(cookie, { method: 'POST', body: JSON.stringify(optionSet(FOUR)) }),
    );
    expect(missing.status).toBe(404);

    const student = await studentCookie();
    const quizId = await makeQuiz();

    const forbidden = await app.request(
      `/api/admin/quizzes/${quizId}/questions`,
      authed(student, { method: 'POST', body: JSON.stringify(optionSet(FOUR)) }),
    );
    expect(forbidden.status).toBe(403);
  });
});

describe('PUT /api/admin/questions/:id', () => {
  it('replaces the text and options, keeping the ids of retained options', async () => {
    const cookie = await adminCookie();
    const quizId = await makeQuiz();
    const question = await createQuestion(cookie, quizId, optionSet(FOUR, 0));

    const [alpha, beta, gamma, delta] = question.options;

    const res = await app.request(
      `/api/admin/questions/${question.id}`,
      authed(cookie, {
        method: 'PUT',
        body: JSON.stringify({
          questionText: 'Pick the Greek letter that comes second.',
          explanation: 'Beta.',
          marks: 2,
          options: [
            { id: alpha?.id, text: 'Alpha' },
            { id: delta?.id, text: 'Delta' },
            { text: 'Epsilon' },
          ],
          correctIndex: 1,
        }),
      }),
    );

    expect(res.status).toBe(200);

    const updated = (await json<{ question: AdminQuestion }>(res)).question;
    expect(updated.id).toBe(question.id);
    expect(updated.questionText).toBe('Pick the Greek letter that comes second.');
    expect(updated.marks).toBe(2);
    expect(updated.options).toHaveLength(3);

    // Retained options keep their identity: past answers point at these ids.
    expect(updated.options[0]?.id).toBe(alpha?.id);
    expect(updated.options[1]?.id).toBe(delta?.id);
    expect(updated.options[1]?.isCorrect).toBe(true);
    expect(updated.options.some((option) => option.id === beta?.id)).toBe(false);
    expect(updated.options.some((option) => option.id === gamma?.id)).toBe(false);
    expect(updated.options.filter((option) => option.isCorrect)).toHaveLength(1);
  });

  it('refuses to drop an option a student already picked', async () => {
    const cookie = await adminCookie();

    const [answered] = await db
      .select({ questionId: schema.answers.questionId, optionId: schema.answers.selectedOptionId })
      .from(schema.answers)
      .limit(1);

    if (!answered?.optionId) throw new Error('the seed should contain a selected option');

    const question = await app.request(
      `/api/admin/questions/${answered.questionId}`,
      authed(cookie),
    );
    const current = (await json<{ question: AdminQuestion }>(question)).question;

    const kept = current.options.filter((option) => option.id !== answered.optionId);

    const res = await app.request(
      `/api/admin/questions/${current.id}`,
      authed(cookie, {
        method: 'PUT',
        body: JSON.stringify({
          questionText: current.questionText,
          options: kept.slice(0, Math.max(2, kept.length)).map((option) => ({
            id: option.id,
            text: option.text,
          })),
          correctIndex: 0,
        }),
      }),
    );

    expect(res.status).toBe(409);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('OPTION_HAS_ANSWERS');

    // Nothing was written.
    const after = await app.request(`/api/admin/questions/${current.id}`, authed(cookie));
    const reloaded = (await json<{ question: AdminQuestion }>(after)).question;
    expect(reloaded.options).toHaveLength(current.options.length);
    expect(reloaded.options.some((option) => option.id === answered.optionId)).toBe(true);
  });

  it('rejects an option id that belongs to another question', async () => {
    const cookie = await adminCookie();
    const quizId = await makeQuiz();

    const first = await createQuestion(cookie, quizId, optionSet(FOUR));
    const second = await createQuestion(cookie, quizId, optionSet(FOUR));

    const res = await app.request(
      `/api/admin/questions/${second.id}`,
      authed(cookie, {
        method: 'PUT',
        body: JSON.stringify({
          questionText: second.questionText,
          options: [{ id: first.options[0]?.id, text: 'Alpha' }, { text: 'Beta' }],
          correctIndex: 0,
        }),
      }),
    );

    expect(res.status).toBe(422);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('OPTION_NOT_FOUND');
  });

  it('404s for an unknown question', async () => {
    const cookie = await adminCookie();

    const res = await app.request(
      `/api/admin/questions/${randomUUID()}`,
      authed(cookie, {
        method: 'PUT',
        body: JSON.stringify(optionSet(FOUR)),
      }),
    );

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/questions/:id', () => {
  it('deletes an unanswered question and closes the position gap', async () => {
    const cookie = await adminCookie();
    const quizId = await makeQuiz();

    const first = await createQuestion(cookie, quizId, optionSet(FOUR));
    await createQuestion(cookie, quizId, optionSet(FOUR));
    await createQuestion(cookie, quizId, optionSet(FOUR));

    const res = await app.request(
      `/api/admin/questions/${first.id}`,
      authed(cookie, { method: 'DELETE' }),
    );

    expect(res.status).toBe(200);
    expect(await json<{ success: boolean; id: string }>(res)).toEqual({
      success: true,
      id: first.id,
    });

    const list = await app.request(`/api/admin/quizzes/${quizId}/questions`, authed(cookie));
    const body = await json<{ questions: AdminQuestion[] }>(list);

    expect(body.questions).toHaveLength(2);
    expect(body.questions.map((question) => question.position)).toEqual([0, 1]);
  });

  it('refuses to delete a question that has recorded answers', async () => {
    const cookie = await adminCookie();

    const [answered] = await db
      .select({ questionId: schema.answers.questionId })
      .from(schema.answers)
      .limit(1);

    if (!answered) throw new Error('the seed should contain answers');

    const res = await app.request(
      `/api/admin/questions/${answered.questionId}`,
      authed(cookie, { method: 'DELETE' }),
    );

    expect(res.status).toBe(409);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('QUESTION_HAS_ANSWERS');

    const still = await app.request(`/api/admin/questions/${answered.questionId}`, authed(cookie));
    expect(still.status).toBe(200);
  });

  it('refuses to remove the last question of a published quiz', async () => {
    const cookie = await adminCookie();
    const quizId = await makeQuiz('PUBLISHED');

    const question = await createQuestion(cookie, quizId, optionSet(FOUR));

    const blocked = await app.request(
      `/api/admin/questions/${question.id}`,
      authed(cookie, { method: 'DELETE' }),
    );

    expect(blocked.status).toBe(409);
    expect((await json<{ error: { code: string } }>(blocked)).error.code).toBe(
      'QUIZ_WOULD_HAVE_NO_QUESTIONS',
    );

    // Unpublishing is the documented way out.
    const unpublish = await app.request(
      `/api/admin/quizzes/${quizId}/unpublish`,
      authed(cookie, { method: 'POST' }),
    );
    expect(unpublish.status).toBe(200);

    const allowed = await app.request(
      `/api/admin/questions/${question.id}`,
      authed(cookie, { method: 'DELETE' }),
    );
    expect(allowed.status).toBe(200);
  });
});

describe('PATCH /api/admin/quizzes/:id/questions/order', () => {
  it('reorders the questions with the ids the client sends', async () => {
    const cookie = await adminCookie();
    const quizId = await makeQuiz();

    const first = await createQuestion(cookie, quizId, optionSet(FOUR));
    const second = await createQuestion(cookie, quizId, optionSet(FOUR));
    const third = await createQuestion(cookie, quizId, optionSet(FOUR));

    const res = await app.request(
      `/api/admin/quizzes/${quizId}/questions/order`,
      authed(cookie, {
        method: 'PATCH',
        body: JSON.stringify({ ids: [third.id, first.id, second.id] }),
      }),
    );

    expect(res.status).toBe(200);

    const body = await json<{ questions: AdminQuestion[] }>(res);
    expect(body.questions.map((question) => question.id)).toEqual([third.id, first.id, second.id]);
    expect(body.questions.map((question) => question.position)).toEqual([0, 1, 2]);

    // Persisted, not just echoed.
    const list = await app.request(`/api/admin/quizzes/${quizId}/questions`, authed(cookie));
    const reloaded = await json<{ questions: AdminQuestion[] }>(list);
    expect(reloaded.questions.map((question) => question.id)).toEqual([
      third.id,
      first.id,
      second.id,
    ]);
  });

  it('rejects a partial or foreign order', async () => {
    const cookie = await adminCookie();
    const quizId = await makeQuiz();

    const first = await createQuestion(cookie, quizId, optionSet(FOUR));
    await createQuestion(cookie, quizId, optionSet(FOUR));

    const partial = await app.request(
      `/api/admin/quizzes/${quizId}/questions/order`,
      authed(cookie, { method: 'PATCH', body: JSON.stringify({ ids: [first.id] }) }),
    );

    expect(partial.status).toBe(422);
    expect((await json<{ error: { code: string } }>(partial)).error.code).toBe(
      'QUESTION_ORDER_MISMATCH',
    );

    const foreign = await app.request(
      `/api/admin/quizzes/${quizId}/questions/order`,
      authed(cookie, {
        method: 'PATCH',
        body: JSON.stringify({ ids: [first.id, randomUUID()] }),
      }),
    );

    expect(foreign.status).toBe(422);
  });
});

describe('publishing after authoring', () => {
  it('publishes a quiz as soon as it has a question', async () => {
    const cookie = await adminCookie();
    const quizId = await makeQuiz();

    const blocked = await app.request(
      `/api/admin/quizzes/${quizId}/publish`,
      authed(cookie, { method: 'POST' }),
    );
    expect(blocked.status).toBe(409);

    await createQuestion(cookie, quizId, optionSet(FOUR, 1));

    const published = await app.request(
      `/api/admin/quizzes/${quizId}/publish`,
      authed(cookie, { method: 'POST' }),
    );

    expect(published.status).toBe(200);
    expect(
      (await json<{ quiz: { status: string; questionCount: number } }>(published)).quiz,
    ).toEqual(expect.objectContaining({ status: 'PUBLISHED', questionCount: 1 }));
  });
});
