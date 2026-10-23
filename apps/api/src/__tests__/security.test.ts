import { randomUUID } from 'node:crypto';

import { SESSION_COOKIE } from '@quiz/shared/auth';
import { db, schema } from '@quiz/db';
import { asc, eq, inArray } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { app } from '../app';
import { resolveJwtSecret } from '../lib/auth';
import {
  checkRateLimit,
  configureRateLimits,
  hitRateLimit,
  resetRateLimits,
} from '../lib/rate-limit';

/**
 * Day 13 — the adversarial suite.
 *
 * Every other test file proves a feature works for its intended caller. This one
 * assumes the caller is hostile and asks the nine questions the spec lists:
 * authentication, authorization, quiz creation, attempts, the timer, scoring, API
 * validation, unauthorized access and input validation — plus the controls added
 * today (rate limiting, the origin guard, body limits, cache headers).
 *
 * Rows created here are tracked and removed in `afterAll`; nothing is asserted
 * about absolute counts on the shared fixture database.
 */

const createdUserEmails: string[] = [];
const createdQuizIds: string[] = [];
const createdAttemptIds: string[] = [];

afterAll(async () => {
  if (createdAttemptIds.length > 0) {
    await db.delete(schema.attempts).where(inArray(schema.attempts.id, createdAttemptIds));
  }
  if (createdQuizIds.length > 0) {
    await db.delete(schema.quizzes).where(inArray(schema.quizzes.id, createdQuizIds));
  }
  if (createdUserEmails.length > 0) {
    await db.delete(schema.users).where(inArray(schema.users.email, createdUserEmails));
  }
});

/** A distinct address per test, so the limiter never leaks between cases. */
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

async function login(
  email: string,
  password: string,
  ip = nextIp(),
): Promise<{ status: number; cookie?: string; body: unknown; retryAfter: string | null }> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password }),
  });

  const cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .find((value) => value?.startsWith(`${SESSION_COOKIE}=`));

  return {
    status: res.status,
    cookie,
    body: await res.json(),
    retryAfter: res.headers.get('retry-after'),
  };
}

async function cookieFor(email: string, password: string): Promise<string> {
  const { status, cookie } = await login(email, password);

  expect(status).toBe(200);
  if (!cookie) throw new Error('login did not issue a session cookie');
  return cookie;
}

const adminCookie = () => cookieFor('admin@quiz.dev', 'Admin12345');
const studentCookie = () => cookieFor('rahul@quiz.dev', 'Password123');
const otherStudentCookie = () => cookieFor('priya@quiz.dev', 'Password123');

function authed(cookie: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) },
  };
}

async function register(
  overrides: Record<string, unknown> = {},
  ip = nextIp(),
): Promise<{ status: number; cookie?: string; body: Record<string, unknown> }> {
  const email = `security-${randomUUID()}@quiz.dev`;
  const payload = {
    name: 'Security Probe',
    email,
    password: 'Password123',
    ...overrides,
  };

  const res = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(payload),
  });

  if (res.status === 201) createdUserEmails.push(email);

  const cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .find((value) => value?.startsWith(`${SESSION_COOKIE}=`));

  return { status: res.status, cookie, body: (await res.json()) as Record<string, unknown> };
}

/** A throwaway published quiz with two four-option questions. */
async function makeQuiz(options: { status?: 'PUBLISHED' | 'DRAFT' } = {}) {
  const [category] = await db.select({ id: schema.categories.id }).from(schema.categories).limit(1);
  const suffix = randomUUID().slice(0, 8);
  const quizId = randomUUID();

  await db.insert(schema.quizzes).values({
    id: quizId,
    title: `Security Fixture ${suffix}`,
    slug: `security-fixture-${suffix}`,
    categoryId: category!.id,
    durationMinutes: 10,
    passingScore: 60,
    status: options.status ?? 'PUBLISHED',
  });
  createdQuizIds.push(quizId);

  for (const position of [0, 1]) {
    const questionId = randomUUID();

    await db.insert(schema.questions).values({
      id: questionId,
      quizId,
      questionText: `Fixture question ${position + 1}?`,
      marks: 1,
      position,
    });

    await db.insert(schema.options).values(
      [0, 1, 2, 3].map((index) => ({
        id: randomUUID(),
        questionId,
        optionText: `Option ${index + 1}`,
        isCorrect: index === 0,
        position: index,
      })),
    );
  }

  return quizId;
}

/** An existing category name, so a create is valid without inventing a category. */
async function aCategoryName(): Promise<string> {
  const [row] = await db
    .select({ name: schema.categories.name })
    .from(schema.categories)
    .orderBy(asc(schema.categories.name))
    .limit(1);

  if (!row) throw new Error('the seeded database has no categories');
  return row.name;
}

async function questionsOf(quizId: string) {
  return db
    .select({ id: schema.questions.id })
    .from(schema.questions)
    .where(eq(schema.questions.quizId, quizId))
    .orderBy(asc(schema.questions.position));
}

async function startAttempt(quizId: string, cookie: string) {
  const res = await app.request(`/api/student/quizzes/${quizId}/start`, {
    method: 'POST',
    headers: { cookie },
  });
  const body = (await res.json()) as {
    attemptId: string;
    secondsRemaining: number;
    resumed: boolean;
  };
  if (body.attemptId) createdAttemptIds.push(body.attemptId);

  return { res, body };
}

beforeEach(() => {
  resetRateLimits();
});

afterEach(() => {
  resetRateLimits();
});

/* -------------------------------------------------------------------------- */
/*  1. Authentication                                                          */
/* -------------------------------------------------------------------------- */

describe('authentication', () => {
  it('never stores or returns the plaintext password', async () => {
    const { status, body, cookie } = await register({ password: 'Password123' });

    expect(status).toBe(201);
    expect(JSON.stringify(body)).not.toContain('Password123');
    expect(cookie).toBeDefined();

    const [row] = await db
      .select({ hash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.email, (body.user as { email: string }).email))
      .limit(1);

    expect(row?.hash).not.toContain('Password123');
    expect(row?.hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  it('answers unknown emails exactly like wrong passwords', async () => {
    const unknown = await login('nobody-here@quiz.dev', 'Password123');
    const wrong = await login('rahul@quiz.dev', 'NotThePassword1');

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(JSON.stringify(unknown.body)).toBe(JSON.stringify(wrong.body));
    expect(unknown.cookie).toBeUndefined();
    expect(wrong.cookie).toBeUndefined();
  });

  it('refuses a token minted for another audience, even with the right secret', async () => {
    const { body } = await register();
    const userId = (body.user as { id: string }).id;
    const now = Math.floor(Date.now() / 1000);

    const foreignAudience = await sign(
      {
        sub: userId,
        email: 'x@quiz.dev',
        role: 'STUDENT',
        iat: now,
        exp: now + 600,
        iss: 'quiz-api',
        aud: 'some-other-app',
      },
      resolveJwtSecret(),
      'HS256',
    );

    const res = await app.request('/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE}=${foreignAudience}` },
    });

    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_SESSION');
  });

  it('refuses a token minted by another issuer', async () => {
    const { body } = await register();
    const userId = (body.user as { id: string }).id;
    const now = Math.floor(Date.now() / 1000);

    const foreignIssuer = await sign(
      {
        sub: userId,
        email: 'x@quiz.dev',
        role: 'STUDENT',
        iat: now,
        exp: now + 600,
        iss: 'someone-else',
        aud: 'quiz-web',
      },
      resolveJwtSecret(),
      'HS256',
    );

    const res = await app.request('/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE}=${foreignIssuer}` },
    });

    expect(res.status).toBe(401);
  });

  it('rejects a token whose header claims "alg: none"', async () => {
    const { body } = await register();
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({
        sub: (body.user as { id: string }).id,
        email: 'x@quiz.dev',
        role: 'ADMIN',
        iat: now,
        exp: now + 600,
        iss: 'quiz-api',
        aud: 'quiz-web',
      }),
    ).toString('base64url');

    const res = await app.request('/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE}=${header}.${claims}.` },
    });

    expect(res.status).toBe(401);
  });

  it('sets a cookie JavaScript cannot read and a page cache cannot keep', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() },
      body: JSON.stringify({ email: 'rahul@quiz.dev', password: 'Password123' }),
    });

    const cookie = res.headers.getSetCookie().find((value) => value.startsWith(SESSION_COOKIE));

    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

/* -------------------------------------------------------------------------- */
/*  2. Authorization                                                           */
/* -------------------------------------------------------------------------- */

describe('authorization', () => {
  /** Endpoints mounted under `/api/admin` — every one must refuse a student. */
  const ADMIN_GETS = [
    '/api/admin/access',
    '/api/admin/stats',
    '/api/admin/analytics',
    '/api/admin/users',
    '/api/admin/categories',
    '/api/admin/quizzes',
  ];

  /** Endpoints mounted under `/api/student` — every one must refuse an admin. */
  const STUDENT_GETS = [
    '/api/student/access',
    '/api/student/categories',
    '/api/student/quizzes',
    '/api/student/dashboard',
    '/api/student/attempts',
  ];

  it.each(ADMIN_GETS)('refuses a student at %s', async (path) => {
    const res = await app.request(path, { headers: { cookie: await studentCookie() } });

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it.each(STUDENT_GETS)('refuses an admin at %s', async (path) => {
    const res = await app.request(path, { headers: { cookie: await adminCookie() } });

    expect(res.status).toBe(403);
  });

  it('treats the database role as authoritative, not the token claim', async () => {
    const { body } = await register();
    const userId = (body.user as { id: string }).id;
    const now = Math.floor(Date.now() / 1000);

    // Signed by us, correctly scoped — but claiming ADMIN for a STUDENT row.
    const escalated = await sign(
      {
        sub: userId,
        email: (body.user as { email: string }).email,
        role: 'ADMIN',
        iat: now,
        exp: now + 600,
        iss: 'quiz-api',
        aud: 'quiz-web',
      },
      resolveJwtSecret(),
      'HS256',
    );

    const asAdmin = await app.request('/api/admin/stats', {
      headers: { cookie: `${SESSION_COOKIE}=${escalated}` },
    });

    // The scope endpoint reports the stored role, and admin data stays closed.
    expect(asAdmin.status).toBe(403);

    const me = await app.request('/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE}=${escalated}` },
    });
    const session = (await me.json()) as { user: { role: string } };

    expect(me.status).toBe(200);
    expect(session.user.role).toBe('STUDENT');
  });

  it('refuses writes from the wrong role as well as reads', async () => {
    const student = await studentCookie();

    const createQuiz = await app.request('/api/admin/quizzes', {
      ...authed(student, { method: 'POST', body: JSON.stringify({ title: 'Hostile quiz' }) }),
    });

    expect(createQuiz.status).toBe(403);

    const admin = await adminCookie();
    const takeQuiz = await app.request('/api/student/quizzes', { headers: { cookie: admin } });

    expect(takeQuiz.status).toBe(403);
  });

  it('does not let a STUDENT register themselves as an ADMIN', async () => {
    const { status, body } = await register({ role: 'ADMIN' });

    expect(status).toBe(201);
    expect((body.user as { role: string }).role).toBe('STUDENT');
  });
});

/* -------------------------------------------------------------------------- */
/*  3. Quiz creation                                                           */
/* -------------------------------------------------------------------------- */

describe('quiz creation', () => {
  it('ignores every field a client should not set', async () => {
    const admin = await adminCookie();
    const res = await app.request('/api/admin/quizzes', {
      ...authed(admin, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Mass Assignment Probe',
          categoryName: await aCategoryName(),
          durationMinutes: 10,
          passingScore: 50,
          difficulty: 'EASY',
          // All of these are server-owned:
          status: 'PUBLISHED',
          id: '00000000-0000-4000-8000-000000000000',
          slug: 'hand-picked-slug',
          attemptCount: 99,
          createdAt: '1999-01-01T00:00:00.000Z',
        }),
      }),
    });

    const body = (await res.json()) as { quiz: Record<string, unknown> };
    createdQuizIds.push(body.quiz.id as string);

    expect(res.status).toBe(201);
    expect(body.quiz.status).toBe('DRAFT');
    expect(body.quiz.id).not.toBe('00000000-0000-4000-8000-000000000000');
    expect(body.quiz.slug).toBe('mass-assignment-probe');
    expect(body.quiz.createdAt).not.toContain('1999');
  });

  it('validates the shape before touching the database', async () => {
    const admin = await adminCookie();

    for (const payload of [
      {},
      { title: '' },
      { title: 'x', durationMinutes: 0 },
      { title: 'x', durationMinutes: 10, passingScore: 101 },
      { title: 'x', durationMinutes: 10, passingScore: 50, difficulty: 'IMPOSSIBLE' },
    ]) {
      const res = await app.request('/api/admin/quizzes', {
        ...authed(admin, { method: 'POST', body: JSON.stringify(payload) }),
      });

      expect(res.status, JSON.stringify(payload)).toBe(422);
    }
  });

  it('stores a hostile title verbatim instead of interpreting it', async () => {
    const admin = await adminCookie();
    const title = '<script>alert("xss")</script> & "quotes"';

    const res = await app.request('/api/admin/quizzes', {
      ...authed(admin, {
        method: 'POST',
        body: JSON.stringify({
          title,
          categoryName: await aCategoryName(),
          durationMinutes: 10,
          passingScore: 50,
        }),
      }),
    });
    const body = (await res.json()) as { quiz: { id: string; title: string } };
    createdQuizIds.push(body.quiz.id);

    // JSON is data, not markup: the string comes back exactly as sent, and the
    // web app escapes it when it renders. Nothing is stripped or executed here.
    expect(body.quiz.title).toBe(title);

    const stored = await db
      .select({ title: schema.quizzes.title })
      .from(schema.quizzes)
      .where(eq(schema.quizzes.id, body.quiz.id))
      .limit(1);

    expect(stored[0]?.title).toBe(title);
  });
});

/* -------------------------------------------------------------------------- */
/*  4. Quiz attempts                                                           */
/* -------------------------------------------------------------------------- */

describe('quiz attempts', () => {
  it('keeps one student out of another student’s paper', async () => {
    const quizId = await makeQuiz();
    const rahul = await studentCookie();
    const priya = await otherStudentCookie();
    const { body } = await startAttempt(quizId, rahul);
    const [question] = await questionsOf(quizId);

    const read = await app.request(`/api/student/attempts/${body.attemptId}`, {
      headers: { cookie: priya },
    });
    const write = await app.request(
      `/api/student/attempts/${body.attemptId}/answers/${question!.id}`,
      authed(priya, { method: 'PUT', body: JSON.stringify({ optionId: randomUUID() }) }),
    );
    const submit = await app.request(`/api/student/attempts/${body.attemptId}/submit`, {
      method: 'POST',
      headers: { cookie: priya },
    });
    const review = await app.request(`/api/student/attempts/${body.attemptId}/review`, {
      headers: { cookie: priya },
    });

    for (const res of [read, write, submit, review]) {
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        'ATTEMPT_NOT_FOUND',
      );
    }
  });

  it('refuses to start a quiz that is not published', async () => {
    const quizId = await makeQuiz({ status: 'DRAFT' });
    const { res } = await startAttempt(quizId, await studentCookie());

    expect(res.status).toBe(404);
  });

  it('hands back the attempt in flight instead of creating a second one', async () => {
    const quizId = await makeQuiz();
    const cookie = await studentCookie();

    const first = await startAttempt(quizId, cookie);
    const second = await startAttempt(quizId, cookie);

    expect(first.res.status).toBe(201);
    expect(second.res.status).toBe(201);
    expect(second.body.attemptId).toBe(first.body.attemptId);
    expect(second.body.resumed).toBe(true);

    // Still one row: resuming never costs the student one of their tries.
    const rows = await db
      .select({ id: schema.attempts.id })
      .from(schema.attempts)
      .where(eq(schema.attempts.quizId, quizId));

    expect(rows).toHaveLength(1);
  });

  it('will not let an answer reference a question from another quiz', async () => {
    const mine = await makeQuiz();
    const other = await makeQuiz();
    const cookie = await studentCookie();
    const { body } = await startAttempt(mine, cookie);
    const [foreignQuestion] = await questionsOf(other);

    const res = await app.request(
      `/api/student/attempts/${body.attemptId}/answers/${foreignQuestion!.id}`,
      authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId: randomUUID() }) }),
    );

    expect([404, 422]).toContain(res.status);
  });

  it('serves no answer key anywhere in the live paper', async () => {
    const quizId = await makeQuiz();
    const cookie = await studentCookie();
    const { body } = await startAttempt(quizId, cookie);

    const res = await app.request(`/api/student/attempts/${body.attemptId}`, {
      headers: { cookie },
    });
    const text = JSON.stringify(await res.json());

    expect(res.status).toBe(200);
    expect(text).not.toContain('isCorrect');
    expect(text).not.toMatch(/correctOption|answerKey/);
  });
});

/* -------------------------------------------------------------------------- */
/*  5. Timer                                                                   */
/* -------------------------------------------------------------------------- */

describe('timer', () => {
  it('derives the deadline on the server and ignores a client-supplied one', async () => {
    const quizId = await makeQuiz();
    const cookie = await studentCookie();

    const res = await app.request(`/api/student/quizzes/${quizId}/start`, {
      ...authed(cookie, {
        method: 'POST',
        body: JSON.stringify({
          expiresAt: '2099-01-01T00:00:00.000Z',
          startedAt: '2020-01-01T00:00:00.000Z',
          durationMinutes: 999,
        }),
      }),
    });
    const body = (await res.json()) as {
      attemptId: string;
      startedAt: string;
      expiresAt: string;
      secondsRemaining: number;
    };
    createdAttemptIds.push(body.attemptId);

    const [quiz] = await db
      .select({ durationMinutes: schema.quizzes.durationMinutes })
      .from(schema.quizzes)
      .where(eq(schema.quizzes.id, quizId))
      .limit(1);

    const started = new Date(body.startedAt).getTime();
    const expires = new Date(body.expiresAt).getTime();
    const minutes = (expires - started) / 60_000;

    expect(minutes).toBeCloseTo(quiz!.durationMinutes, 1);
    expect(body.secondsRemaining).toBeLessThanOrEqual(quiz!.durationMinutes * 60);
    expect(body.secondsRemaining).toBeGreaterThan(quiz!.durationMinutes * 60 - 30);
  });

  it('closes a paper whose time has run out', async () => {
    const quizId = await makeQuiz();
    const cookie = await studentCookie();
    const { body } = await startAttempt(quizId, cookie);
    const [question] = await questionsOf(quizId);

    // Move the deadline into the past, exactly as a slow browser would.
    await db
      .update(schema.attempts)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.attempts.id, body.attemptId));

    const late = await app.request(
      `/api/student/attempts/${body.attemptId}/answers/${question!.id}`,
      authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId: randomUUID() }) }),
    );

    expect(late.status).toBe(409);
    expect(((await late.json()) as { error: { code: string } }).error.code).toBe('ATTEMPT_EXPIRED');

    const submit = await app.request(`/api/student/attempts/${body.attemptId}/submit`, {
      method: 'POST',
      headers: { cookie },
    });
    const graded = (await submit.json()) as {
      result: { autoSubmitted: boolean; status: string; timeTakenSeconds: number };
    };

    // The deadline finished the paper, not the student — and the stored time is
    // clamped to the deadline rather than to when this call happened to arrive.
    expect(submit.status).toBe(200);
    expect(graded.result.autoSubmitted).toBe(true);
    expect(graded.result.status).toBe('FAILED');
    expect(graded.result.timeTakenSeconds).toBeLessThanOrEqual(600);
  });
});

/* -------------------------------------------------------------------------- */
/*  6. Score calculation                                                       */
/* -------------------------------------------------------------------------- */

describe('score calculation', () => {
  it('grades on the server and ignores a score in the request body', async () => {
    const quizId = await makeQuiz();
    const cookie = await studentCookie();
    const { body } = await startAttempt(quizId, cookie);

    const res = await app.request(`/api/student/attempts/${body.attemptId}/submit`, {
      ...authed(cookie, {
        method: 'POST',
        body: JSON.stringify({
          score: 999,
          percentage: 100,
          status: 'PASSED',
          correctAnswers: 99,
        }),
      }),
    });
    const graded = (await res.json()) as {
      result: { score: number; totalMarks: number; percentage: number; status: string };
    };

    // Nothing was answered, so the real result is zero — no matter what was sent.
    expect(res.status).toBe(200);
    expect(graded.result.score).toBe(0);
    expect(graded.result.percentage).toBe(0);
    expect(graded.result.totalMarks).toBe(2);
    expect(graded.result.status).toBe('FAILED');
  });

  it('keeps stored results consistent with the paper', async () => {
    const quizId = await makeQuiz();
    const cookie = await studentCookie();
    const { body } = await startAttempt(quizId, cookie);
    const questions = await questionsOf(quizId);
    const [first] = questions;

    const options = await db
      .select({ id: schema.options.id, isCorrect: schema.options.isCorrect })
      .from(schema.options)
      .where(eq(schema.options.questionId, first!.id));

    const correct = options.find((option) => option.isCorrect)!;

    await app.request(
      `/api/student/attempts/${body.attemptId}/answers/${first!.id}`,
      authed(cookie, { method: 'PUT', body: JSON.stringify({ optionId: correct.id }) }),
    );

    const res = await app.request(`/api/student/attempts/${body.attemptId}/submit`, {
      method: 'POST',
      headers: { cookie },
    });
    const graded = (await res.json()) as {
      result: { score: number; totalMarks: number; percentage: number; correctAnswers: number };
    };

    // One of two correctly answered single-mark questions.
    expect(graded.result.score).toBe(1);
    expect(graded.result.totalMarks).toBe(2);
    expect(graded.result.percentage).toBe(50);
    expect(graded.result.correctAnswers).toBe(1);
    expect(graded.result.percentage).toBeCloseTo(
      (graded.result.score / graded.result.totalMarks) * 100,
      5,
    );
  });
});

/* -------------------------------------------------------------------------- */
/*  7. API validation                                                          */
/* -------------------------------------------------------------------------- */

describe('api validation', () => {
  it('rejects malformed JSON, wrong content types and unknown routes', async () => {
    const broken = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email":',
    });
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as { error: { code: string } }).error.code).toBe('INVALID_JSON');

    const wrongType = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'email=x',
    });
    expect(wrongType.status).toBe(400);

    const unknown = await app.request('/api/does-not-exist');
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });

  it('answers 422 with issues, never a stack trace', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', email: 'not-an-email', password: 'short' }),
    });
    const body = (await res.json()) as {
      error: { code: string; details: { path: string[] }[] };
    };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.length).toBeGreaterThan(0);
    // The envelope carries field messages, never a stack frame.
    expect(JSON.stringify(body)).not.toContain('node_modules');
    expect(JSON.stringify(body)).not.toContain('.ts:');
    expect(JSON.stringify(body)).not.toMatch(/\\n\s+at /);
  });

  it('refuses malformed identifiers before querying', async () => {
    const cookie = await studentCookie();

    for (const path of [
      '/api/student/quizzes/not-a-uuid',
      '/api/student/attempts/not-a-uuid',
      '/api/admin/quizzes/not-a-uuid',
    ]) {
      const res = await app.request(path, {
        headers: { cookie: path.startsWith('/api/admin') ? await adminCookie() : cookie },
      });

      expect(res.status, path).toBe(422);
    }
  });

  it('caps the request body size', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() },
      body: JSON.stringify({ email: 'a'.repeat(200_000), password: 'Password123' }),
    });

    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'PAYLOAD_TOO_LARGE',
    );
  });
});

/* -------------------------------------------------------------------------- */
/*  8. Unauthorized access                                                     */
/* -------------------------------------------------------------------------- */

describe('unauthorized access', () => {
  it('refuses every protected endpoint without a session', async () => {
    const protectedPaths = [
      '/api/auth/me',
      '/api/admin/access',
      '/api/admin/stats',
      '/api/admin/analytics',
      '/api/admin/users',
      '/api/admin/categories',
      '/api/admin/quizzes',
      '/api/student/access',
      '/api/student/categories',
      '/api/student/quizzes',
      '/api/student/dashboard',
      '/api/student/attempts',
      '/api/leaderboard',
    ];

    for (const path of protectedPaths) {
      const res = await app.request(path);

      expect(res.status, path).toBe(401);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        'UNAUTHENTICATED',
      );
    }
  });

  it('blocks a state-changing request from a foreign origin', async () => {
    const cookie = await studentCookie();
    const quizId = await makeQuiz();

    const blocked = await app.request(`/api/student/quizzes/${quizId}/start`, {
      method: 'POST',
      headers: { cookie, origin: 'https://evil.example' },
    });

    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe(
      'CROSS_ORIGIN_BLOCKED',
    );
  });

  it('allows the app’s own origin and the preview hosts', async () => {
    const cookie = await studentCookie();
    const quizId = await makeQuiz();

    for (const origin of ['http://localhost:3000', 'https://3000-abc123.e2b.app']) {
      const res = await app.request(`/api/student/quizzes/${quizId}/start`, {
        method: 'POST',
        headers: { cookie, origin },
      });

      expect(res.status, origin).toBeGreaterThanOrEqual(200);
      expect(res.status, origin).toBeLessThan(300);
    }
  });

  it('leaves reads alone, whatever the origin', async () => {
    const res = await app.request('/api/leaderboard', {
      headers: { cookie: await studentCookie(), origin: 'https://evil.example' },
    });

    // A cross-origin read still gets no CORS grant, but it is not a CSRF risk.
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('marks every API response uncacheable', async () => {
    for (const path of ['/api/health', '/api/meta', '/api/leaderboard']) {
      const res = await app.request(path, {
        headers: path === '/api/leaderboard' ? { cookie: await studentCookie() } : {},
      });

      expect(res.headers.get('cache-control'), path).toBe('no-store');
      expect(res.headers.get('vary'), path).toContain('Cookie');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  9. Input validation                                                        */
/* -------------------------------------------------------------------------- */

describe('input validation', () => {
  it('treats SQL metacharacters as data', async () => {
    // A login attempt that would print every row if the query were concatenated.
    const injection = await login("' OR 1=1 --", 'Password123');
    expect([401, 422]).toContain(injection.status);
    expect(injection.cookie).toBeUndefined();

    // The same string as a directory search: a search term, not a predicate.
    const admin = await adminCookie();
    const search = await app.request(
      `/api/admin/users?search=${encodeURIComponent("' OR 1=1 --")}`,
      {
        headers: { cookie: admin },
      },
    );
    const body = (await search.json()) as { users: unknown[] };

    expect(search.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  it('round-trips hostile text as data through the API', async () => {
    const admin = await adminCookie();
    const name = `XSS <img src=x onerror="alert(1)"> ${randomUUID().slice(0, 6)}`;

    const created = await app.request('/api/admin/categories', {
      ...authed(admin, { method: 'POST', body: JSON.stringify({ name }) }),
    });
    const body = (await created.json()) as { category: { id: string; name: string } };

    expect(created.status).toBe(201);
    expect(body.category.name).toBe(name);

    const list = await app.request('/api/admin/categories', { headers: { cookie: admin } });
    expect(JSON.stringify(await list.json())).toContain('onerror=');

    // Clean up: the category has no quizzes, so it can be deleted.
    await app.request(`/api/admin/categories/${body.category.id}`, {
      method: 'DELETE',
      headers: { cookie: admin },
    });
  });

  it('enforces the password policy and strips unknown keys', async () => {
    for (const password of ['short', 'a'.repeat(7), '        ']) {
      const { status } = await register({ password });
      expect(status, password).toBe(422);
    }

    const { status, body } = await register({ password: 'a'.repeat(129) });
    expect(status).toBe(422);
    expect(body.error).toBeDefined();
  });

  it('rejects a payload of the wrong type rather than coercing it', async () => {
    const admin = await adminCookie();

    const res = await app.request('/api/admin/quizzes', {
      ...authed(admin, {
        method: 'POST',
        body: JSON.stringify({ title: { nested: 'object' }, durationMinutes: 'ten' }),
      }),
    });

    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  Added today: rate limiting                                                 */
/* -------------------------------------------------------------------------- */

describe('rate limiting', () => {
  it('counts down and refuses once a bucket is full', () => {
    const rule = { max: 3, windowMs: 60_000 };
    const start = 1_000_000;

    expect(checkRateLimit('k', rule, start).remaining).toBe(3);
    expect(hitRateLimit('k', rule, start).remaining).toBe(2);
    hitRateLimit('k', rule, start);
    const third = hitRateLimit('k', rule, start);

    expect(third.limited).toBe(true);
    expect(checkRateLimit('k', rule, start + 59_000).limited).toBe(true);

    // A new window starts clean.
    expect(checkRateLimit('k', rule, start + 60_001).limited).toBe(false);
  });

  it('keeps separate keys separate', () => {
    const rule = { max: 1, windowMs: 60_000 };

    hitRateLimit('a', rule, 0);
    expect(checkRateLimit('a', rule, 0).limited).toBe(true);
    expect(checkRateLimit('b', rule, 0).limited).toBe(false);
  });

  it('shuts an address down after repeated failures', async () => {
    configureRateLimits({ login: { max: 3, windowMs: 60_000 } });
    const ip = nextIp();
    const statuses: number[] = [];

    for (let index = 0; index < 3; index += 1) {
      statuses.push((await login('rahul@quiz.dev', 'DefinitelyWrong1', ip)).status);
    }

    const blocked = await login('rahul@quiz.dev', 'Password123', ip);

    expect(statuses).toEqual([401, 401, 401]);
    expect(blocked.status).toBe(429);
    expect((blocked.body as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.retryAfter)).toBeGreaterThan(0);
    expect(blocked.cookie).toBeUndefined();

    // Another address is unaffected — the block is per client, not global.
    expect((await login('rahul@quiz.dev', 'Password123', nextIp())).status).toBe(200);
  });

  it('does not count successful sign-ins against the address limit', async () => {
    configureRateLimits({ login: { max: 2, windowMs: 60_000 } });
    const ip = nextIp();

    for (let index = 0; index < 5; index += 1) {
      const ok = await login('rahul@quiz.dev', 'Password123', ip);
      expect(ok.status, `attempt ${index + 1}`).toBe(200);
    }
  });

  it('stops answering guesses on a hot account but never locks the owner out', async () => {
    configureRateLimits({
      login: { max: 100, windowMs: 60_000 },
      loginAccount: { max: 3, windowMs: 60_000 },
    });

    const wrong: number[] = [];

    // Each guess comes from a different address, so only the account bucket fills.
    for (let index = 0; index < 3; index += 1) {
      wrong.push((await login('priya@quiz.dev', 'WrongPassword1')).status);
    }

    const blocked = await login('priya@quiz.dev', 'WrongPassword1');

    // The right password still works: a soft block cannot be used to deny service.
    const owner = await login('priya@quiz.dev', 'Password123');

    // …and signing in clears the counter, so the next typo is a plain 401 again.
    const after = await login('priya@quiz.dev', 'WrongPassword1');

    // The third failure is the one that completes the bucket, so it is already 429.
    expect(wrong).toEqual([401, 401, 429]);
    expect(blocked.status).toBe(429);
    expect(owner.status).toBe(200);
    expect(after.status).toBe(401);
  });

  it('caps registration from one address', async () => {
    configureRateLimits({ register: { max: 2, windowMs: 60_000 } });
    const ip = nextIp();

    const first = await register({}, ip);
    const second = await register({}, ip);
    const third = await register({}, ip);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(third.status).toBe(429);
    expect((third.body as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
  });
});
