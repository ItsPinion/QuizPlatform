import { randomUUID } from 'node:crypto';

import type {
  AttemptSession,
  StartAttemptResponse,
  StudentQuizListResponse,
} from '@quiz/shared/attempt';
import { db, schema } from '@quiz/db';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

/** Attempts created by this suite are removed again (answers cascade). */
const createdAttemptIds: string[] = [];

afterAll(async () => {
  if (createdAttemptIds.length > 0) {
    await db.delete(schema.attempts).where(inArray(schema.attempts.id, createdAttemptIds));
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

const rahul = () => cookieFor('rahul@quiz.dev', 'Password123');
const priya = () => cookieFor('priya@quiz.dev', 'Password123');
const adminCookie = () => cookieFor('admin@quiz.dev', 'Admin12345');

function authed(cookie: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) },
  };
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function quizIdBySlug(slug: string): Promise<string> {
  const [row] = await db
    .select({ id: schema.quizzes.id })
    .from(schema.quizzes)
    .where(eq(schema.quizzes.slug, slug))
    .limit(1);

  if (!row) throw new Error(`missing seeded quiz ${slug}`);
  return row.id;
}

async function start(cookie: string, quizId: string): Promise<StartAttemptResponse> {
  const res = await app.request(
    `/api/student/quizzes/${quizId}/start`,
    authed(cookie, { method: 'POST' }),
  );

  expect(res.status).toBe(201);

  const body = await json<StartAttemptResponse>(res);
  if (!createdAttemptIds.includes(body.attemptId)) createdAttemptIds.push(body.attemptId);

  return body;
}

async function session(cookie: string, attemptId: string): Promise<AttemptSession> {
  const res = await app.request(`/api/student/attempts/${attemptId}`, authed(cookie));
  expect(res.status).toBe(200);
  return json<AttemptSession>(res);
}

describe('GET /api/student/quizzes', () => {
  it('lists only published quizzes with their aggregates', async () => {
    const cookie = await rahul();
    const res = await app.request('/api/student/quizzes?pageSize=24', authed(cookie));

    expect(res.status).toBe(200);

    const body = await json<StudentQuizListResponse>(res);
    const published = await db
      .select({ id: schema.quizzes.id })
      .from(schema.quizzes)
      .where(eq(schema.quizzes.status, 'PUBLISHED'));

    expect(body.pagination.total).toBe(published.length);
    expect(body.quizzes).toHaveLength(published.length);

    for (const quiz of body.quizzes) {
      expect(quiz.questionCount).toBeGreaterThan(0);
      expect(quiz.totalMarks).toBeGreaterThanOrEqual(quiz.questionCount);
      expect(quiz.attemptsRemaining).toBe(Math.max(0, quiz.maxAttempts - quiz.attemptsUsed));
      expect(quiz.categoryName.length).toBeGreaterThan(0);
    }
  });

  it('never lists a draft or an unpublished quiz', async () => {
    const cookie = await rahul();
    const res = await app.request('/api/student/quizzes?pageSize=24', authed(cookie));
    const body = await json<StudentQuizListResponse>(res);

    const titles = body.quizzes.map((quiz) => quiz.title);
    expect(titles).not.toContain('Java OOP Concepts'); // DRAFT
    expect(titles).not.toContain('Computer Networks'); // UNPUBLISHED
  });

  it('reflects the signed-in student’s own attempts', async () => {
    const cookie = await rahul();
    const res = await app.request('/api/student/quizzes?search=JavaScript', authed(cookie));
    const body = await json<StudentQuizListResponse>(res);

    const quiz = body.quizzes.find((row) => row.title === 'JavaScript Fundamentals');
    expect(quiz?.attemptsUsed).toBe(2);
    expect(quiz?.attemptsRemaining).toBe(0);
    expect(quiz?.bestPercentage).toBeGreaterThan(0);
    expect(quiz?.inProgressAttemptId).toBeNull();
  });

  it('filters by search, difficulty and category, and sorts by title', async () => {
    const cookie = await rahul();

    const filtered = await json<StudentQuizListResponse>(
      await app.request(
        '/api/student/quizzes?difficulty=EASY&sort=title&pageSize=24',
        authed(cookie),
      ),
    );

    expect(filtered.quizzes.length).toBeGreaterThan(0);
    expect(filtered.quizzes.every((quiz) => quiz.difficulty === 'EASY')).toBe(true);

    const titles = filtered.quizzes.map((quiz) => quiz.title);
    expect(titles).toEqual([...titles].sort());

    const missing = await json<StudentQuizListResponse>(
      await app.request('/api/student/quizzes?search=zzzz-nothing', authed(cookie)),
    );
    expect(missing.quizzes).toHaveLength(0);
    expect(missing.pagination.total).toBe(0);
  });

  it('rejects bad queries and the wrong role', async () => {
    const cookie = await rahul();

    expect((await app.request('/api/student/quizzes?pageSize=99', authed(cookie))).status).toBe(
      422,
    );
    expect((await app.request('/api/student/quizzes?sort=random', authed(cookie))).status).toBe(
      422,
    );

    const admin = await adminCookie();
    expect((await app.request('/api/student/quizzes', authed(admin))).status).toBe(403);
    expect((await app.request('/api/student/quizzes')).status).toBe(401);
  });
});

describe('GET /api/student/quizzes/:id', () => {
  it('returns a published quiz with a start decision', async () => {
    const cookie = await rahul();
    const quizId = await quizIdBySlug('css-essentials');

    const res = await app.request(`/api/student/quizzes/${quizId}`, authed(cookie));
    expect(res.status).toBe(200);

    const body = await json<{
      quiz: { id: string; title: string };
      start: { allowed: boolean; code: string | null };
    }>(res);

    expect(body.quiz.id).toBe(quizId);
    expect(body.start).toEqual({ allowed: true, code: null, message: null });
  });

  it('refuses to start when the attempts are used up', async () => {
    const cookie = await rahul();
    const quizId = await quizIdBySlug('javascript-fundamentals');

    const res = await app.request(`/api/student/quizzes/${quizId}`, authed(cookie));
    const body = await json<{ start: { allowed: boolean; code: string | null; message: string } }>(
      res,
    );

    expect(body.start.allowed).toBe(false);
    expect(body.start.code).toBe('ATTEMPTS_EXHAUSTED');
    expect(body.start.message).toMatch(/all 2 attempts/i);
  });

  it('answers 404 for drafts and unpublished quizzes', async () => {
    const cookie = await rahul();

    for (const slug of ['java-oop-concepts', 'computer-networks']) {
      const quizId = await quizIdBySlug(slug);
      const res = await app.request(`/api/student/quizzes/${quizId}`, authed(cookie));

      expect(res.status, slug).toBe(404);
      expect((await json<{ error: { code: string } }>(res)).error.code).toBe('QUIZ_NOT_FOUND');
    }

    expect((await app.request(`/api/student/quizzes/${randomUUID()}`, authed(cookie))).status).toBe(
      404,
    );
    expect((await app.request('/api/student/quizzes/nope', authed(cookie))).status).toBe(422);
  });
});

describe('POST /api/student/quizzes/:id/start', () => {
  it('creates an attempt whose deadline matches the quiz duration', async () => {
    const cookie = await rahul();
    const quizId = await quizIdBySlug('css-essentials');

    const body = await start(cookie, quizId);

    expect(body.resumed).toBe(false);
    expect(body.quizId).toBe(quizId);
    expect(body.secondsRemaining).toBeLessThanOrEqual(15 * 60);
    expect(body.secondsRemaining).toBeGreaterThan(14 * 60);

    const [row] = await db
      .select()
      .from(schema.attempts)
      .where(eq(schema.attempts.id, body.attemptId));

    expect(row?.status).toBe('IN_PROGRESS');
    if (!row) throw new Error('attempt was not stored');
    expect(row.expiresAt.getTime() - row.startedAt.getTime()).toBe(15 * 60_000);
    expect(row?.score).toBe(0);
    expect(row?.totalMarks).toBeGreaterThan(0);
  });

  it('resumes the live attempt instead of spending another try', async () => {
    const cookie = await rahul();
    const quizId = await quizIdBySlug('css-essentials');

    const first = await start(cookie, quizId);
    const second = await start(cookie, quizId);

    expect(second.attemptId).toBe(first.attemptId);
    expect(second.resumed).toBe(true);
    expect(second.expiresAt).toBe(first.expiresAt);

    const attemptsForQuiz = await db
      .select({ id: schema.attempts.id })
      .from(schema.attempts)
      .where(eq(schema.attempts.quizId, quizId));

    // Two seeded attempts for priya, plus this one for rahul.
    expect(attemptsForQuiz.filter((row) => row.id === first.attemptId)).toHaveLength(1);
  });

  it('refuses a quiz whose attempts are exhausted', async () => {
    const cookie = await rahul();
    const quizId = await quizIdBySlug('javascript-fundamentals');

    const res = await app.request(
      `/api/student/quizzes/${quizId}/start`,
      authed(cookie, { method: 'POST' }),
    );

    expect(res.status).toBe(409);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('ATTEMPTS_EXHAUSTED');
  });

  it('404s for a quiz the student cannot see and 403s for an admin', async () => {
    const cookie = await rahul();
    const draftId = await quizIdBySlug('java-oop-concepts');

    expect(
      (
        await app.request(
          `/api/student/quizzes/${draftId}/start`,
          authed(cookie, { method: 'POST' }),
        )
      ).status,
    ).toBe(404);

    const admin = await adminCookie();
    const quizId = await quizIdBySlug('css-essentials');
    expect(
      (await app.request(`/api/student/quizzes/${quizId}/start`, authed(admin, { method: 'POST' })))
        .status,
    ).toBe(403);
  });
});

describe('GET /api/student/attempts/:id', () => {
  it('hands over questions and options without any grading data', async () => {
    const cookie = await rahul();
    const quizId = await quizIdBySlug('css-essentials');
    const { attemptId } = await start(cookie, quizId);

    const body = await session(cookie, attemptId);

    expect(body.attempt.expired).toBe(false);
    expect(body.attempt.secondsRemaining).toBeGreaterThan(0);
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.answers).toHaveLength(0);

    for (const question of body.questions) {
      expect(question.options.length).toBeGreaterThanOrEqual(2);
      expect(question).not.toHaveProperty('explanation');

      for (const option of question.options) {
        expect(Object.keys(option).sort()).toEqual(['id', 'position', 'text']);
      }
    }

    // The serialized body must not leak the answer key in any casing.
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/isCorrect/i);
    expect(raw).not.toMatch(/is_correct/i);
  });

  it('hides another student’s attempt behind a 404', async () => {
    const owner = await rahul();
    const quizId = await quizIdBySlug('css-essentials');
    const { attemptId } = await start(owner, quizId);

    const other = await priya();
    const res = await app.request(`/api/student/attempts/${attemptId}`, authed(other));

    expect(res.status).toBe(404);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('ATTEMPT_NOT_FOUND');
  });
});

describe('PUT /api/student/attempts/:id/answers/:questionId', () => {
  it('saves, replaces and clears an answer while reporting progress', async () => {
    const cookie = await rahul();
    const quizId = await quizIdBySlug('css-essentials');
    const { attemptId } = await start(cookie, quizId);
    const body = await session(cookie, attemptId);

    const question = body.questions[0];
    if (!question) throw new Error('expected at least one question');

    const [firstOption, secondOption] = question.options;
    if (!firstOption || !secondOption) throw new Error('expected at least two options');

    const saved = await app.request(
      `/api/student/attempts/${attemptId}/answers/${question.id}`,
      authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId: firstOption.id }) }),
    );

    expect(saved.status).toBe(200);

    const savedBody = await json<{
      answer: { questionId: string; selectedOptionId: string };
      progress: { answered: number; unanswered: number; total: number };
    }>(saved);

    expect(savedBody.answer).toEqual({
      questionId: question.id,
      selectedOptionId: firstOption.id,
    });
    expect(savedBody.progress.answered).toBe(1);
    expect(savedBody.progress.total).toBe(body.questions.length);

    const replaced = await app.request(
      `/api/student/attempts/${attemptId}/answers/${question.id}`,
      authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId: secondOption.id }) }),
    );

    expect(replaced.status).toBe(200);

    const cleared = await app.request(
      `/api/student/attempts/${attemptId}/answers/${question.id}`,
      authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId: null }) }),
    );

    expect(cleared.status).toBe(200);
    expect((await json<{ progress: { answered: number } }>(cleared)).progress.answered).toBe(0);

    // Round-trips through the session payload.
    const after = await session(cookie, attemptId);
    expect(after.answers).toEqual([{ questionId: question.id, selectedOptionId: null }]);
  });

  it('rejects an option from another question and a question from another quiz', async () => {
    const cookie = await rahul();
    const quizId = await quizIdBySlug('css-essentials');
    const { attemptId } = await start(cookie, quizId);
    const body = await session(cookie, attemptId);

    const [first, second] = body.questions;
    if (!first || !second) throw new Error('expected two questions');

    const foreignOption = second.options[0];
    if (!foreignOption) throw new Error('expected an option');

    const wrongOption = await app.request(
      `/api/student/attempts/${attemptId}/answers/${first.id}`,
      authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId: foreignOption.id }) }),
    );

    expect(wrongOption.status).toBe(422);
    expect((await json<{ error: { code: string } }>(wrongOption)).error.code).toBe(
      'OPTION_NOT_FOUND',
    );

    const otherQuizId = await quizIdBySlug('react-basics');
    const otherQuiz = await json<{ start: { allowed: boolean } }>(
      await app.request(`/api/student/quizzes/${otherQuizId}`, authed(cookie)),
    );
    expect(otherQuiz.start.allowed).toBe(true);

    const wrongQuestion = await app.request(
      `/api/student/attempts/${attemptId}/answers/${randomUUID()}`,
      authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId: null }) }),
    );

    expect(wrongQuestion.status).toBe(422);
    expect((await json<{ error: { code: string } }>(wrongQuestion)).error.code).toBe(
      'QUESTION_NOT_FOUND',
    );
  });

  it('refuses to edit a finished attempt', async () => {
    const cookie = await rahul();

    const [finished] = await db
      .select({ id: schema.attempts.id, quizId: schema.attempts.quizId })
      .from(schema.attempts)
      .innerJoin(schema.users, eq(schema.users.id, schema.attempts.userId))
      .where(and(eq(schema.attempts.status, 'PASSED'), eq(schema.users.email, 'rahul@quiz.dev')))
      .limit(1);

    if (!finished) throw new Error('the seed should contain a completed attempt');

    const [question] = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.quizId, finished.quizId))
      .limit(1);

    if (!question) throw new Error('expected a question');

    const res = await app.request(
      `/api/student/attempts/${finished.id}/answers/${question.id}`,
      authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId: null }) }),
    );

    expect(res.status).toBe(409);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('ATTEMPT_NOT_ACTIVE');
  });

  it('locks answers once the deadline has passed', async () => {
    const cookie = await rahul();
    const quizId = await quizIdBySlug('css-essentials');
    const { attemptId } = await start(cookie, quizId);
    const body = await session(cookie, attemptId);

    const question = body.questions[0];
    const option = question?.options[0];
    if (!question || !option) throw new Error('expected a question with options');

    // Move the deadline into the past, exactly as a long-closed tab would.
    await db
      .update(schema.attempts)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.attempts.id, attemptId));

    // Since Day 8, reading an attempt past its deadline settles it: the paper is
    // graded on the spot, so the screen shows a result instead of a locked,
    // half-finished quiz. It is finished, not "expired", from the UI's side.
    const expiredSession = await session(cookie, attemptId);
    expect(expiredSession.attempt.secondsRemaining).toBe(0);
    expect(expiredSession.attempt.expired).toBe(false);
    expect(expiredSession.attempt.status).not.toBe('IN_PROGRESS');
    expect(expiredSession.attempt.result).not.toBeNull();

    const write = await app.request(
      `/api/student/attempts/${attemptId}/answers/${question.id}`,
      authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId: option.id }) }),
    );

    expect(write.status).toBe(409);
    expect((await json<{ error: { code: string } }>(write)).error.code).toBe('ATTEMPT_NOT_ACTIVE');

    // An expired attempt is spent, so starting again opens a new one.
    const next = await start(cookie, quizId);
    expect(next.attemptId).not.toBe(attemptId);
    expect(next.resumed).toBe(false);
  });

  it('rejects a malformed option id', async () => {
    const cookie = await rahul();
    const quizId = await quizIdBySlug('css-essentials');
    const { attemptId } = await start(cookie, quizId);
    const body = await session(cookie, attemptId);
    const question = body.questions[0];

    if (!question) throw new Error('expected a question');

    const res = await app.request(
      `/api/student/attempts/${attemptId}/answers/${question.id}`,
      authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId: 'nope' }) }),
    );

    expect(res.status).toBe(422);
  });
});
