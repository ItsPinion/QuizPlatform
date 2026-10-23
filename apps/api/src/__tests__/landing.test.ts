import { landingPayloadSchema, type LandingPayload } from '@quiz/shared/landing';
import { db, schema } from '@quiz/db';
import { describe, expect, it } from 'vitest';

import { app } from '../app';
import { emptyLandingPayload, explainFailure } from '../lib/landing';

/**
 * `GET /api/landing` is the only unauthenticated route that reads content, so
 * these tests are mostly about the boundary: what it reports, and what it may
 * never report.
 */

async function landing(): Promise<{ status: number; body: LandingPayload; raw: string }> {
  const res = await app.request('/api/landing');
  const raw = await res.text();

  return { status: res.status, body: JSON.parse(raw) as LandingPayload, raw };
}

describe('GET /api/landing', () => {
  it('answers publicly with the documented shape', async () => {
    const { status, body } = await landing();

    expect(status).toBe(200);
    expect(() => landingPayloadSchema.parse(body)).not.toThrow();
    expect(Date.parse(body.generatedAt)).not.toBeNaN();
    expect(body.service.version).toBe('0.1.0');
    expect(body.database.connected).toBe(true);
  });

  it('reports counts that match the tables', async () => {
    const { body } = await landing();

    const [users, categories, quizzes, questions, attempts] = await Promise.all([
      db.$count(schema.users),
      db.$count(schema.categories),
      db.$count(schema.quizzes),
      db.$count(schema.questions),
      db.$count(schema.attempts),
    ]);

    expect(body.counts).toMatchObject({ users, categories, quizzes, questions, attempts });
    expect(body.counts.publishedQuizzes).toBeLessThanOrEqual(quizzes);
    expect(body.counts.gradedAttempts).toBeLessThanOrEqual(attempts);
    expect(body.counts.passedAttempts).toBeLessThanOrEqual(body.counts.gradedAttempts);
    expect(body.counts.passRate).toBeGreaterThanOrEqual(0);
    expect(body.counts.passRate).toBeLessThanOrEqual(100);
  });

  it('derives the catalogue ranges from the published quizzes it lists', async () => {
    const { body } = await landing();

    expect(body.quizzes.length).toBe(body.counts.publishedQuizzes);

    if (body.quizzes.length === 0) return;

    const durations = body.quizzes.map((quiz) => quiz.durationMinutes);

    expect(body.shape.minDurationMinutes).toBe(Math.min(...durations));
    expect(body.shape.maxDurationMinutes).toBe(Math.max(...durations));
    expect(body.shape.totalQuestions).toBe(
      body.quizzes.reduce((sum, quiz) => sum + quiz.questions, 0),
    );
  });

  it('lists categories with their quiz counts, read from the table', async () => {
    const { body } = await landing();

    expect(body.categories.length).toBe(await db.$count(schema.categories));

    const names = body.categories.map((category) => category.name);

    expect([...names].sort()).toEqual(names);
    expect(body.categories.every((category) => category.published <= category.quizzes)).toBe(true);
  });

  it('serves one real question without its answer key', async () => {
    const { body, raw } = await landing();

    expect(body.sampleQuestion).not.toBeNull();

    const question = body.sampleQuestion!;

    expect(question.options.length).toBeGreaterThanOrEqual(2);
    expect(question.index).toBeGreaterThanOrEqual(1);
    expect(question.total).toBeGreaterThanOrEqual(question.index);

    // The two ways a key could leak: a field, or the text of the explanation.
    expect(raw).not.toContain('"isCorrect"');
    expect(raw).not.toContain('"selectedOptionId"');
    expect(raw).not.toContain('explanation');
  });

  it('serves one graded result with no student attached', async () => {
    const { body, raw } = await landing();

    expect(body.sampleResult).not.toBeNull();

    const result = body.sampleResult!;

    expect(result.marks).toBeLessThanOrEqual(result.totalMarks);
    expect(result.passed).toBe(result.percentage >= result.passingScore);
    expect(result.correct + result.incorrect + result.unanswered).toBeGreaterThan(0);

    // No id, name or address anywhere outside the demo credentials block.
    const withoutDemo = raw.replace(/"demo":\{[\s\S]*?\}\}/, '"demo":{}');

    for (const forbidden of ['"userId"', '"attemptId"', '"studentName"', '"passwordHash"']) {
      expect(withoutDemo).not.toContain(forbidden);
    }

    expect(withoutDemo).not.toMatch(/[a-z0-9._-]+@(?!quiz\.dev)/i);
  });

  it('advertises the seeded logins only when the account exists', async () => {
    const { body } = await landing();

    expect(body.demo.enabled).toBe(true);
    expect(body.demo.accounts.length).toBeGreaterThan(0);

    for (const account of body.demo.accounts) {
      expect(account.exists).toBe(true);
      expect(account.email).toContain('@quiz.dev');
    }

    const emails = body.demo.accounts.map((account) => account.email);
    const rows = await db.select({ email: schema.users.email }).from(schema.users);

    expect(emails.every((email) => rows.some((row) => row.email === email))).toBe(true);
  });

  it('is never cached', async () => {
    const res = await app.request('/api/landing');

    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('vary')).toContain('Cookie');
  });
});

describe('when the database cannot be read', () => {
  it('names a missing migration instead of quoting the driver', () => {
    const error = Object.assign(new Error('Failed query: select count(*) from "users"'), {
      cause: new Error('no such table: users'),
    });

    expect(explainFailure(error)).toBe('the database has not been migrated yet');
  });

  it('falls back to a plain sentence for anything else', () => {
    expect(explainFailure(new Error('fetch failed'))).toBe('the database did not answer');
    expect(explainFailure('not an error')).toBe('the database did not answer');
  });

  it('never puts a table name, a query or a stack in the public payload', () => {
    const reason = explainFailure(
      Object.assign(new Error('Failed query: select * from "users"'), {
        cause: new Error('no such table: users'),
      }),
    );

    expect(reason).not.toContain('users');
    expect(reason).not.toContain('select');
  });

  it('still answers with a valid, empty payload', () => {
    const body = emptyLandingPayload(new Error('no such table: users'));

    expect(() => landingPayloadSchema.parse(body)).not.toThrow();
    expect(body.counts.publishedQuizzes).toBe(0);
    expect(body.quizzes).toEqual([]);
    expect(body.sampleQuestion).toBeNull();
    expect(body.sampleResult).toBeNull();
    expect(body.demo.accounts).toEqual([]);
    expect(body.database.connected).toBe(false);
    expect(body.unavailableReason).toBe('the database has not been migrated yet');
  });
});
