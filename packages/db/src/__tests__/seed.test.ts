import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { asc, count, countDistinct, eq, ne, sql, sum } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../schema';
import { REPO_ROOT, detectPackageManager, runBin } from '@quiz/test-utils/run-bin';

const DB_PACKAGE_DIR = path.resolve(__dirname, '../..');

const createDb = (url: string) => drizzle({ connection: { url }, schema, casing: 'snake_case' });

let tmpDir: string;
let databaseUrl: string;
let db: ReturnType<typeof createDb>;

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

const testEnv = () => ({
  TURSO_DATABASE_URL: databaseUrl,
  DATABASE_URL: '',
  TURSO_AUTH_TOKEN: '',
  NODE_ENV: 'test',
});

/** Runs a workspace CLI script exactly the way `bun run db:*` does. */
function runScript(script: string, args: string[] = []): CliResult {
  const result = runBin('tsx', [script, ...args], { cwd: DB_PACKAGE_DIR, env: testEnv() });

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Applies migrations with Drizzle Kit itself, exactly like `bun run db:migrate`. */
function runDrizzleKit(command: string): CliResult {
  const result = runBin('drizzle-kit', [command], { cwd: DB_PACKAGE_DIR, env: testEnv() });

  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

async function counts() {
  const tables = {
    users: schema.users,
    categories: schema.categories,
    quizzes: schema.quizzes,
    questions: schema.questions,
    options: schema.options,
    attempts: schema.attempts,
    answers: schema.answers,
  } as const;

  const entries = await Promise.all(
    (Object.keys(tables) as (keyof typeof tables)[]).map(async (key) => {
      const [row] = await db.select({ n: count() }).from(tables[key]);
      return [key, row?.n ?? 0] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<keyof typeof tables, number>;
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-cli-'));
  databaseUrl = `file:${path.join(tmpDir, 'cli.db')}`;
  db = createDb(databaseUrl);
});

afterAll(() => {
  db?.$client.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('database CLI scripts', () => {
  it('applies migrations with drizzle-kit migrate', () => {
    const result = runDrizzleKit('migrate');

    expect(result.stderr).not.toContain('Error');
    expect(result.status).toBe(0);
  });

  it('seeds the demo dataset', async () => {
    const seed = runScript('src/seed.ts');

    expect(seed.status).toBe(0);
    expect(seed.stdout).toContain('Seed complete');

    const rows = await counts();
    expect(rows).toMatchObject({
      users: 4,
      categories: 10,
      quizzes: 10,
      questions: 49,
      attempts: 14,
    });
    // Four per multiple-choice question, two per true/false, one per accepted
    // fill-in-the-blank answer, five on the one multiple-answer question.
    expect(rows.options).toBe(192);
    expect(rows.answers).toBeGreaterThan(50);
  });

  it('skips seeding when data already exists', async () => {
    const before = await counts();
    const seed = runScript('src/seed.ts');
    const after = await counts();

    expect(seed.status).toBe(0);
    expect(seed.stdout).toContain('skipping seed');
    expect(after).toEqual(before);
  });

  it('resets and re-seeds with --force', async () => {
    const seed = runScript('src/seed.ts', ['--force']);
    const rows = await counts();

    expect(seed.status).toBe(0);
    expect(seed.stdout).toContain('Resetting existing data');
    expect(rows).toMatchObject({ users: 4, quizzes: 10, attempts: 14 });
  });
});

describe('root scripts (package-manager wiring)', () => {
  const pm = detectPackageManager();

  /** Runs a root `db:*` script the way a user would, from the repo root. */
  function runRootScript(script: string, args: string[] = []) {
    const result = spawnSync(pm, ['run', script, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...testEnv() },
      encoding: 'utf8',
    });

    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  }

  it('forwards `--force` to the seed script', () => {
    // Regression: routing db:* through `turbo run` made Turbo consume
    // `--force` as its own cache flag, so the seed never reset the database.
    const result = runRootScript('db:seed', ['--force']);

    expect(result.stdout).toContain('Resetting existing data');
    expect(result.stdout).toContain('Seed complete');
  });

  it('generates migrations without any database credentials', () => {
    // `drizzle-kit generate` only diffs the schema; it must not require a URL.
    const result = spawnSync(pm, ['run', 'db:generate'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        TURSO_DATABASE_URL: '',
        DATABASE_URL: '',
        TURSO_AUTH_TOKEN: '',
      },
      encoding: 'utf8',
    });

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(output).toMatch(/No schema changes|migration file/);
    expect(output).not.toContain('TURSO_DATABASE_URL is not set');
  });
});

describe('seeded data integrity', () => {
  it('publishes exactly the quizzes meant to be visible to students', async () => {
    const rows = await db
      .select({ status: schema.quizzes.status, n: count() })
      .from(schema.quizzes)
      .groupBy(schema.quizzes.status)
      .orderBy(asc(schema.quizzes.status));

    expect(Object.fromEntries(rows.map((row) => [row.status, row.n]))).toEqual({
      DRAFT: 1,
      PUBLISHED: 8,
      UNPUBLISHED: 1,
    });
  });

  it('gives every quiz at least three questions, each with a key in its own format', async () => {
    const rows = await db
      .select({
        quizId: schema.quizzes.id,
        type: schema.questions.type,
        questionId: schema.questions.id,
        options: count(schema.options.id),
        correctOptions: sum(
          sql<number>`case when ${schema.options.isCorrect} = 1 then 1 else 0 end`,
        ),
      })
      .from(schema.quizzes)
      .innerJoin(schema.questions, eq(schema.questions.quizId, schema.quizzes.id))
      .innerJoin(schema.options, eq(schema.options.questionId, schema.questions.id))
      .groupBy(schema.quizzes.id, schema.questions.id)
      .orderBy(asc(schema.quizzes.id));

    expect(new Set(rows.map((row) => row.quizId)).size).toBe(10);

    for (const row of rows) {
      const options = Number(row.options ?? 0);
      const correct = Number(row.correctOptions ?? 0);

      // §10's formats are graded differently, so "how many options are right"
      // is not one rule: a fill-in-the-blank accepts all of them, a
      // multiple-answer question accepts two or more, and the singles take one.
      if (row.type === 'FILL_BLANK') {
        expect(correct).toBe(options);
        expect(options).toBeGreaterThanOrEqual(1);
      } else if (row.type === 'MULTI') {
        expect(correct).toBeGreaterThanOrEqual(2);
        expect(correct).toBeLessThan(options);
      } else if (row.type === 'TRUE_FALSE') {
        expect(options).toBe(2);
        expect(correct).toBe(1);
      } else {
        expect(options).toBe(4);
        expect(correct).toBe(1);
      }
    }
  });

  it('demonstrates every question format the product supports', async () => {
    const rows = await db
      .select({ type: schema.questions.type, n: count() })
      .from(schema.questions)
      .groupBy(schema.questions.type);

    expect(new Set(rows.map((row) => row.type))).toEqual(
      new Set(['MCQ', 'MULTI', 'TRUE_FALSE', 'FILL_BLANK']),
    );
  });

  it('keeps attempt percentages consistent with scores and pass marks', async () => {
    const rows = await db
      .select({
        percentage: schema.attempts.percentage,
        score: schema.attempts.score,
        totalMarks: schema.attempts.totalMarks,
        status: schema.attempts.status,
        correct: schema.attempts.correctAnswers,
        incorrect: schema.attempts.incorrectAnswers,
        unanswered: schema.attempts.unanswered,
        passingScore: schema.quizzes.passingScore,
        quizQuestions: sql<number>`(select count(*) from ${schema.questions} where ${schema.questions.quizId} = ${schema.attempts.quizId})`,
      })
      .from(schema.attempts)
      .innerJoin(schema.quizzes, eq(schema.quizzes.id, schema.attempts.quizId));

    expect(rows).toHaveLength(14);

    for (const row of rows) {
      expect(row.totalMarks).toBeGreaterThan(0);
      expect(row.percentage).toBeCloseTo((row.score / row.totalMarks) * 100, 1);
      expect(row.percentage).toBeGreaterThanOrEqual(0);
      expect(row.percentage).toBeLessThanOrEqual(100);
      expect(row.status).toBe(row.percentage >= row.passingScore ? 'PASSED' : 'FAILED');
      expect(row.correct + row.incorrect + row.unanswered).toBe(Number(row.quizQuestions));
    }
  });

  it('marks answers correct only when the selected option is the correct one', async () => {
    const [row] = await db
      .select({ mismatches: count() })
      .from(schema.answers)
      .innerJoin(schema.options, eq(schema.options.id, schema.answers.selectedOptionId))
      .where(ne(schema.answers.isCorrect, schema.options.isCorrect));

    expect(row?.mismatches).toBe(0);
  });

  it('stores only hashed passwords with unique salts', async () => {
    const rows = await db
      .select({ email: schema.users.email, hash: schema.users.passwordHash })
      .from(schema.users);

    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.hash.startsWith('scrypt$')).toBe(true);
      expect(row.hash).not.toContain('Password123');
      expect(row.hash).not.toContain('Admin12345');
    }

    expect(new Set(rows.map((row) => row.hash)).size).toBe(rows.length);
  });

  it('exposes enough history for the day-10 dashboards and leaderboard', async () => {
    const rows = await db
      .select({
        email: schema.users.email,
        attempts: count(schema.attempts.id),
        average: sql<number>`round(avg(${schema.attempts.percentage}), 2)`,
      })
      .from(schema.users)
      .innerJoin(schema.attempts, eq(schema.attempts.userId, schema.users.id))
      .where(eq(schema.users.role, 'STUDENT'))
      .groupBy(schema.users.id)
      .orderBy(sql`avg(${schema.attempts.percentage}) desc`);

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.attempts).toBeGreaterThanOrEqual(3);
    }
    expect(Number(rows[0]?.average)).toBeGreaterThan(0);
  });

  it('dates registrations so the day-11 analytics chart is not empty', async () => {
    const rows = await db
      .select({ createdAt: schema.users.createdAt })
      .from(schema.users)
      .where(eq(schema.users.role, 'STUDENT'));

    const now = Date.now();
    const month = 30 * 24 * 60 * 60 * 1000;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => now - row.createdAt.getTime() < month)).toBe(true);
  });

  it('dates the attempts so the day-10 activity chart is not empty', async () => {
    const rows = await db
      .select({
        email: schema.users.email,
        completedAt: schema.attempts.completedAt,
      })
      .from(schema.attempts)
      .innerJoin(schema.users, eq(schema.users.id, schema.attempts.userId));

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // Every seeded attempt must be in the past (no clock skew in the fixture)…
    for (const row of rows) {
      expect(row.completedAt).not.toBeNull();
      expect(row.completedAt!.getTime()).toBeLessThanOrEqual(now + 60 * 60 * 1000);
    }

    // …and each student must have at least one graded attempt inside the
    // dashboard's fourteen-day window, otherwise the activity chart draws flat.
    const students = new Set(rows.map((row) => row.email));
    expect(students.size).toBeGreaterThan(0);

    for (const email of students) {
      const mine = rows.filter((row) => row.email === email);
      const recent = mine.filter((row) => now - (row.completedAt?.getTime() ?? 0) < 14 * dayMs);
      expect(recent.length, `${email} has no attempt in the last 14 days`).toBeGreaterThan(0);
    }
  });
});
