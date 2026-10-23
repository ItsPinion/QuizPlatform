import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { count, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../schema';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const TABLES = {
  users: schema.users,
  categories: schema.categories,
  quizzes: schema.quizzes,
  questions: schema.questions,
  options: schema.options,
  attempts: schema.attempts,
  answers: schema.answers,
} as const;

const createDb = (url: string) => drizzle({ connection: { url }, schema, casing: 'snake_case' });

let tmpDir: string;
let db: ReturnType<typeof createDb>;

/**
 * Applies the checked-in Drizzle migrations to a throwaway database, proving the
 * migration folder replays from scratch (the same files `pnpm db:migrate` uses).
 */
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-schema-'));
  db = createDb(`file:${path.join(tmpDir, 'test.db')}`);

  await db.$client.execute('PRAGMA foreign_keys = ON');
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  await seedFixture();
});

afterAll(() => {
  db?.$client.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  otherUser: '22222222-2222-4222-8222-222222222222',
  category: '33333333-3333-4333-8333-333333333333',
  emptyCategory: '44444444-4444-4444-8444-444444444444',
  quiz: '55555555-5555-4555-8555-555555555555',
  question: '66666666-6666-4666-8666-666666666666',
  optionA: '77777777-7777-4777-8777-777777777777',
  optionB: '88888888-8888-4888-8888-888888888888',
  attempt: '99999999-9999-4999-8999-999999999999',
  answer: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

async function seedFixture() {
  await db.insert(schema.users).values([
    {
      id: ids.user,
      name: 'Schema Tester',
      email: 'schema@test.dev',
      passwordHash: 'scrypt$16384$8$1$aa$bb',
      role: 'STUDENT',
    },
    {
      id: ids.otherUser,
      name: 'Second Tester',
      email: 'second@test.dev',
      passwordHash: 'scrypt$16384$8$1$aa$bb',
      role: 'ADMIN',
    },
  ]);

  await db.insert(schema.categories).values([
    { id: ids.category, name: 'Test Category', slug: 'test-category' },
    { id: ids.emptyCategory, name: 'Empty Category', slug: 'empty-category' },
  ]);

  await db.insert(schema.quizzes).values({
    id: ids.quiz,
    title: 'Schema Quiz',
    slug: 'schema-quiz',
    categoryId: ids.category,
    durationMinutes: 10,
    passingScore: 50,
    createdBy: ids.user,
  });

  await db.insert(schema.questions).values({
    id: ids.question,
    quizId: ids.quiz,
    questionText: 'Pick A',
    marks: 2,
    position: 0,
  });

  await db.insert(schema.options).values([
    { id: ids.optionA, questionId: ids.question, optionText: 'A', isCorrect: true, position: 0 },
    { id: ids.optionB, questionId: ids.question, optionText: 'B', isCorrect: false, position: 1 },
  ]);

  const startedAt = new Date();
  await db.insert(schema.attempts).values({
    id: ids.attempt,
    quizId: ids.quiz,
    userId: ids.user,
    totalMarks: 2,
    startedAt,
    expiresAt: new Date(startedAt.getTime() + 600_000),
  });

  await db.insert(schema.answers).values({
    id: ids.answer,
    attemptId: ids.attempt,
    questionId: ids.question,
    selectedOptionId: ids.optionA,
    isCorrect: true,
  });
}

/**
 * Drizzle wraps driver errors, so the SQLite message lives in `cause`.
 * Walk the chain and assert on the combined text.
 */
async function expectConstraintError(promise: Promise<unknown>, pattern: RegExp) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }

  expect(caught, 'expected the query to fail').toBeDefined();

  const messages: string[] = [];
  let current: unknown = caught;
  while (current instanceof Error) {
    messages.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }

  expect(messages.join(' | ')).toMatch(pattern);
}

/** Table + index names come from SQLite's catalog through a typed Drizzle query. */
async function catalog(type: 'table' | 'index'): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    sql`select name from sqlite_master where type = ${type} and name not like 'sqlite_%' order by name`,
  );

  return rows.map((row) => row.name);
}

describe('schema', () => {
  it('creates all seven domain tables', async () => {
    expect(await catalog('table')).toEqual(expect.arrayContaining(Object.keys(TABLES)));
  });

  it('creates the uniqueness and lookup indexes the app relies on', async () => {
    expect(await catalog('index')).toEqual(
      expect.arrayContaining([
        'users_email_unique',
        'categories_slug_unique',
        'quizzes_slug_unique',
        'answers_attempt_question_unique',
        'attempts_user_idx',
        'quizzes_status_idx',
      ]),
    );
  });

  it('applies column defaults', async () => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, ids.user));
    const [quiz] = await db.select().from(schema.quizzes).where(eq(schema.quizzes.id, ids.quiz));
    const [attempt] = await db
      .select()
      .from(schema.attempts)
      .where(eq(schema.attempts.id, ids.attempt));

    expect(user?.status).toBe('ACTIVE');
    expect(user?.role).toBe('STUDENT');
    expect(quiz?.status).toBe('DRAFT');
    expect(quiz?.difficulty).toBe('MEDIUM');
    expect(quiz?.maxAttempts).toBe(2);
    expect(attempt?.status).toBe('IN_PROGRESS');
    expect(attempt?.percentage).toBe(0);
    expect(user?.createdAt).toBeInstanceOf(Date);
    expect(Math.abs((user?.createdAt?.getTime() ?? 0) - Date.now())).toBeLessThan(60_000);
  });

  it('stores timestamps with millisecond precision', async () => {
    const exact = new Date('2026-01-02T03:04:05.678Z');
    await db
      .update(schema.attempts)
      .set({ startedAt: exact })
      .where(eq(schema.attempts.id, ids.attempt));

    const [row] = await db
      .select()
      .from(schema.attempts)
      .where(eq(schema.attempts.id, ids.attempt));
    expect(row?.startedAt.getTime()).toBe(exact.getTime());
  });

  it('enforces unique user emails', async () => {
    await expectConstraintError(
      db.insert(schema.users).values({
        id: 'deadbeef-dead-4ead-8ead-deadbeefdead',
        name: 'Duplicate',
        email: 'schema@test.dev',
        passwordHash: 'x',
      }),
      /UNIQUE constraint failed: users\.email/i,
    );
  });

  it('enforces unique quiz slugs', async () => {
    await expectConstraintError(
      db.insert(schema.quizzes).values({
        id: 'deadbeef-0000-4000-8000-000000000001',
        title: 'Duplicate Slug',
        slug: 'schema-quiz',
        categoryId: ids.category,
      }),
      /UNIQUE constraint failed: quizzes\.slug/i,
    );
  });

  it('allows only one answer per question per attempt', async () => {
    await expectConstraintError(
      db.insert(schema.answers).values({
        id: 'deadbeef-0000-4000-8000-000000000002',
        attemptId: ids.attempt,
        questionId: ids.question,
        selectedOptionId: ids.optionB,
      }),
      /UNIQUE constraint failed: answers\.attempt_id, answers\.question_id/i,
    );
  });

  it('cascades deletes from a quiz down to answers', async () => {
    const [before] = await db.select({ n: count() }).from(schema.questions);
    expect(before?.n).toBe(1);

    await db.delete(schema.quizzes).where(eq(schema.quizzes.id, ids.quiz));

    for (const table of ['questions', 'options', 'attempts', 'answers'] as const) {
      const [row] = await db.select({ n: count() }).from(TABLES[table]);
      expect(row?.n, `${table} should cascade`).toBe(0);
    }

    // Unrelated rows survive.
    const [categoryRow] = await db.select({ n: count() }).from(schema.categories);
    const [userRow] = await db.select({ n: count() }).from(schema.users);
    expect(categoryRow?.n).toBe(2);
    expect(userRow?.n).toBe(2);
  });

  it('refuses to delete a category that still has quizzes', async () => {
    await db.insert(schema.quizzes).values({
      id: 'deadbeef-0000-4000-8000-000000000003',
      title: 'Blocking Quiz',
      slug: 'blocking-quiz',
      categoryId: ids.category,
    });

    await expectConstraintError(
      db.delete(schema.categories).where(eq(schema.categories.id, ids.category)),
      /FOREIGN KEY constraint failed/i,
    );

    // An empty category can be removed.
    await db.delete(schema.categories).where(eq(schema.categories.id, ids.emptyCategory));
    const [remaining] = await db.select({ n: count() }).from(schema.categories);
    expect(remaining?.n).toBe(1);

    await db
      .delete(schema.quizzes)
      .where(eq(schema.quizzes.id, 'deadbeef-0000-4000-8000-000000000003'));
  });

  it('cascades user deletion through attempts and answers', async () => {
    const cascadeQuiz = 'deadbeef-0000-4000-8000-000000000004';
    const cascadeQuestion = 'deadbeef-0000-4000-8000-000000000005';
    const cascadeAttempt = 'deadbeef-0000-4000-8000-000000000006';

    await db.insert(schema.quizzes).values({
      id: cascadeQuiz,
      title: 'User Cascade Quiz',
      slug: 'user-cascade-quiz',
      categoryId: ids.category,
    });
    await db.insert(schema.questions).values({
      id: cascadeQuestion,
      quizId: cascadeQuiz,
      questionText: 'Q?',
    });
    await db.insert(schema.attempts).values({
      id: cascadeAttempt,
      quizId: cascadeQuiz,
      userId: ids.user,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db.insert(schema.answers).values({
      id: 'deadbeef-0000-4000-8000-000000000007',
      attemptId: cascadeAttempt,
      questionId: cascadeQuestion,
    });

    await db.delete(schema.users).where(eq(schema.users.id, ids.user));

    const [attempts] = await db.select({ n: count() }).from(schema.attempts);
    const [answers] = await db.select({ n: count() }).from(schema.answers);
    expect(attempts?.n).toBe(0);
    expect(answers?.n).toBe(0);

    // The quiz survives; its nullable author reference is nulled out.
    const [quiz] = await db.select().from(schema.quizzes).where(eq(schema.quizzes.id, cascadeQuiz));
    expect(quiz).toBeDefined();
    expect(quiz?.createdBy).toBeNull();
  });
});
