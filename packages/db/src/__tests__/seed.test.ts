import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { asc, count, countDistinct, eq, ne, sql, sum } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../schema';
import { runBin } from '@quiz/test-utils/run-bin';

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
      questions: 47,
      attempts: 14,
    });
    expect(rows.options).toBe(188); // 47 questions × 4 options
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

  it('gives every quiz at least three questions with exactly one correct option each', async () => {
    const rows = await db
      .select({
        quizId: schema.quizzes.id,
        questions: countDistinct(schema.questions.id),
        options: count(schema.options.id),
        correctOptions: sum(
          sql<number>`case when ${schema.options.isCorrect} = 1 then 1 else 0 end`,
        ),
      })
      .from(schema.quizzes)
      .innerJoin(schema.questions, eq(schema.questions.quizId, schema.quizzes.id))
      .innerJoin(schema.options, eq(schema.options.questionId, schema.questions.id))
      .groupBy(schema.quizzes.id);

    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(row.questions).toBeGreaterThanOrEqual(3);
      expect(Number(row.correctOptions)).toBe(row.questions);
      expect(row.options).toBe(row.questions * 4);
    }
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
});
