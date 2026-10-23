import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';

import {
  SEED_DEMO_ACCOUNTS,
  type LandingCategory,
  type LandingCounts,
  type LandingPayload,
  type LandingQuiz,
  type LandingResult,
  type LandingShape,
  type LandingQuestion,
} from '@quiz/shared/landing';
import { db, getDatabaseConfig, schema } from '@quiz/db';

import { APP_VERSION, env } from './env';

const { attempts, categories, options, questions, quizzes, users } = schema;

/** Rows whose status means "graded": a live paper has no score, an expired one never got one. */
const GRADED = ['PASSED', 'FAILED'] as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : round2((part / whole) * 100);
}

/**
 * Everything the landing page shows, in one request.
 *
 * The page is a public surface, so this function is written defensively in two
 * directions:
 *
 *   1. **Nothing personal.** The sample result selects columns from `attempts`
 *      and the quiz it belongs to — never a join onto `users`. No ids leave this
 *      function, so there is nothing to correlate.
 *   2. **Nothing answerable.** The sample question selects `optionText` and
 *      `position` only; `isCorrect` is not in the projection, so it cannot leak
 *      by accident if this payload is ever widened.
 *
 * Counts come from `$count` (a `SELECT count(*)`) rather than loading rows: the
 * page only ever needs the number.
 */
export async function buildLandingPayload(): Promise<LandingPayload> {
  const started = performance.now();

  const [
    userCount,
    categoryCount,
    quizCount,
    questionCount,
    attemptCount,
    publishedQuizCount,
    gradedRows,
  ] = await Promise.all([
    db.$count(users),
    db.$count(categories),
    db.$count(quizzes),
    db.$count(questions),
    db.$count(attempts),
    db.$count(quizzes, eq(quizzes.status, 'PUBLISHED')),
    db
      .select({
        status: attempts.status,
        percentage: attempts.percentage,
      })
      .from(attempts)
      .where(inArray(attempts.status, GRADED)),
  ]);

  const gradedAttempts = gradedRows.length;
  const passedAttempts = gradedRows.filter((row) => row.status === 'PASSED').length;
  const averagePercentage =
    gradedAttempts === 0
      ? 0
      : round2(gradedRows.reduce((sum, row) => sum + row.percentage, 0) / gradedAttempts);

  const counts: LandingCounts = {
    users: userCount,
    categories: categoryCount,
    quizzes: quizCount,
    publishedQuizzes: publishedQuizCount,
    questions: questionCount,
    attempts: attemptCount,
    gradedAttempts,
    passedAttempts,
    passRate: ratio(passedAttempts, gradedAttempts),
    averagePercentage,
  };

  const [quizRows, categoryRows] = await Promise.all([
    db
      .select({
        title: quizzes.title,
        category: categories.name,
        difficulty: quizzes.difficulty,
        durationMinutes: quizzes.durationMinutes,
        passingScore: quizzes.passingScore,
        maxAttempts: quizzes.maxAttempts,
        questions: sql<number>`count(${questions.id})`.mapWith(Number),
      })
      .from(quizzes)
      .innerJoin(categories, eq(quizzes.categoryId, categories.id))
      .leftJoin(questions, eq(questions.quizId, quizzes.id))
      .where(eq(quizzes.status, 'PUBLISHED'))
      .groupBy(quizzes.id)
      .orderBy(asc(quizzes.title)),
    db
      .select({
        name: categories.name,
        quizzes: sql<number>`count(${quizzes.id})`.mapWith(Number),
        published:
          sql<number>`coalesce(sum(case when ${quizzes.status} = 'PUBLISHED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(categories)
      .leftJoin(quizzes, eq(quizzes.categoryId, categories.id))
      .groupBy(categories.id)
      .orderBy(asc(categories.name)),
  ]);

  const published: LandingQuiz[] = quizRows.map((row) => ({
    title: row.title,
    category: row.category,
    difficulty: row.difficulty,
    durationMinutes: row.durationMinutes,
    passingScore: row.passingScore,
    maxAttempts: row.maxAttempts,
    questions: Number(row.questions),
  }));

  const shape = buildShape(published);

  const [sampleQuestion, sampleResult, demoAccounts] = await Promise.all([
    pickQuestion(published),
    pickResult(),
    resolveDemoAccounts(),
  ]);

  const latencyMs = round2(performance.now() - started);
  const config = safeConfig();

  return {
    generatedAt: new Date().toISOString(),
    service: {
      name: 'quiz-api',
      version: APP_VERSION,
      runtime: `node ${process.version}`,
      nodeEnv: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
    },
    database: { ...config, connected: true, latencyMs },
    counts,
    shape,
    categories: categoryRows.map((row): LandingCategory => ({
      name: row.name,
      quizzes: Number(row.quizzes),
      published: Number(row.published),
    })),
    quizzes: published,
    sampleQuestion,
    sampleResult,
    demo: { enabled: demoEnabled(), accounts: demoAccounts },
    unavailableReason: null,
  };
}

/** Ranges over the published catalogue. An empty catalogue yields zeroes, not `Infinity`. */
function buildShape(published: LandingQuiz[]): LandingShape {
  if (published.length === 0) {
    return {
      minDurationMinutes: 0,
      maxDurationMinutes: 0,
      averageDurationMinutes: 0,
      minPassingScore: 0,
      maxPassingScore: 0,
      minQuestions: 0,
      maxQuestions: 0,
      totalQuestions: 0,
    };
  }

  const durations = published.map((quiz) => quiz.durationMinutes);
  const passing = published.map((quiz) => quiz.passingScore);
  const questionCounts = published.map((quiz) => quiz.questions);

  return {
    minDurationMinutes: Math.min(...durations),
    maxDurationMinutes: Math.max(...durations),
    averageDurationMinutes: round2(
      durations.reduce((sum, value) => sum + value, 0) / durations.length,
    ),
    minPassingScore: Math.min(...passing),
    maxPassingScore: Math.max(...passing),
    minQuestions: Math.min(...questionCounts),
    maxQuestions: Math.max(...questionCounts),
    totalQuestions: questionCounts.reduce((sum, value) => sum + value, 0),
  };
}

/**
 * One real question from the fullest published quiz, without its key.
 *
 * `optionText` and `position` only: `isCorrect` is not selected, so it is not in
 * the object that leaves this file.
 */
async function pickQuestion(published: LandingQuiz[]): Promise<LandingQuestion | null> {
  const fullest = [...published].sort((a, b) => b.questions - a.questions)[0];

  if (!fullest) return null;

  const [quizRow] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      category: categories.name,
      difficulty: quizzes.difficulty,
      durationMinutes: quizzes.durationMinutes,
    })
    .from(quizzes)
    .innerJoin(categories, eq(quizzes.categoryId, categories.id))
    .where(and(eq(quizzes.status, 'PUBLISHED'), eq(quizzes.title, fullest.title)))
    .limit(1);

  if (!quizRow) return null;

  const [questionRow] = await db
    .select({
      id: questions.id,
      text: questions.questionText,
      marks: questions.marks,
      position: questions.position,
    })
    .from(questions)
    .where(eq(questions.quizId, quizRow.id))
    .orderBy(asc(questions.position))
    .limit(1);

  if (!questionRow) return null;

  const [optionRows, totalRows] = await Promise.all([
    db
      .select({ text: options.optionText })
      .from(options)
      .where(eq(options.questionId, questionRow.id))
      .orderBy(asc(options.position)),
    db.select({ value: count() }).from(questions).where(eq(questions.quizId, quizRow.id)),
  ]);

  if (optionRows.length < 2) return null;

  const total = Number(totalRows[0]?.value ?? 0);

  return {
    quizTitle: quizRow.title,
    category: quizRow.category,
    difficulty: quizRow.difficulty,
    durationMinutes: quizRow.durationMinutes,
    index: questionRow.position + 1,
    total,
    text: questionRow.text,
    marks: questionRow.marks,
    options: optionRows.map((option) => option.text),
  };
}

/**
 * The most recently graded paper, with the student removed.
 *
 * Deliberately not joined to `users`: this is the one place in the codebase where
 * an attempt is read without its owner, because the page only needs to show what
 * a marked paper looks like.
 */
async function pickResult(): Promise<LandingResult | null> {
  const [row] = await db
    .select({
      percentage: attempts.percentage,
      marks: attempts.score,
      totalMarks: attempts.totalMarks,
      correct: attempts.correctAnswers,
      incorrect: attempts.incorrectAnswers,
      unanswered: attempts.unanswered,
      timeTakenSeconds: attempts.timeTakenSeconds,
      status: attempts.status,
      quizTitle: quizzes.title,
      passingScore: quizzes.passingScore,
      category: categories.name,
    })
    .from(attempts)
    .innerJoin(quizzes, eq(attempts.quizId, quizzes.id))
    .innerJoin(categories, eq(quizzes.categoryId, categories.id))
    .where(inArray(attempts.status, GRADED))
    .orderBy(desc(attempts.completedAt))
    .limit(1);

  if (!row) return null;

  return {
    quizTitle: row.quizTitle,
    category: row.category,
    percentage: row.percentage,
    marks: row.marks,
    totalMarks: row.totalMarks,
    passed: row.status === 'PASSED',
    passingScore: row.passingScore,
    correct: row.correct,
    incorrect: row.incorrect,
    unanswered: row.unanswered,
    timeTakenSeconds: row.timeTakenSeconds,
  };
}

/** `DEMO_ACCOUNTS=0` turns the printed credentials off. On by default: this is a demo. */
export function demoEnabled(): boolean {
  return process.env.DEMO_ACCOUNTS !== '0';
}

/**
 * The seeded logins, filtered to the accounts that exist right now.
 *
 * A password cannot be read out of the database (that is the point of the hash),
 * so the credentials come from the shared seed constant while `exists` is
 * decided by a real query. A reseeded or renamed database therefore advertises
 * nothing that would fail to sign in.
 */
export async function resolveDemoAccounts() {
  if (!demoEnabled()) return [];

  const rows = await db
    .select({ email: users.email, role: users.role, status: users.status })
    .from(users)
    .where(
      inArray(
        users.email,
        SEED_DEMO_ACCOUNTS.map((account) => account.email),
      ),
    );

  const present = new Map(rows.map((row) => [row.email, row]));

  return SEED_DEMO_ACCOUNTS.filter((account) => present.has(account.email)).map((account) => ({
    role: account.role,
    email: account.email,
    password: account.password,
    exists: present.get(account.email)?.status === 'ACTIVE',
  }));
}

/**
 * The database the process is talking to, minus anything secret.
 *
 * Wrapped because this endpoint must answer even on a fresh checkout with no
 * credentials — an unconfigured database is a fact worth showing, not a 500.
 */
function safeConfig(): Pick<LandingPayload['database'], 'target' | 'urlHint'> {
  try {
    const config = getDatabaseConfig();
    return { target: config.target, urlHint: config.urlHint };
  } catch {
    return { target: 'unconfigured', urlHint: 'not configured' };
  }
}

/**
 * The payload a broken database gets.
 *
 * The page is entirely data-driven, so an unhandled 500 would leave it blank. This
 * answers with zeroes and `connected: false` instead: the copy still renders, the
 * components show their empty states, and the one thing the page never does is
 * invent a number.
 */
export function emptyLandingPayload(reason: unknown): LandingPayload {
  return {
    generatedAt: new Date().toISOString(),
    service: {
      name: 'quiz-api',
      version: APP_VERSION,
      runtime: `node ${process.version}`,
      nodeEnv: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
    },
    database: { ...safeConfig(), connected: false, latencyMs: null },
    counts: {
      users: 0,
      categories: 0,
      quizzes: 0,
      publishedQuizzes: 0,
      questions: 0,
      attempts: 0,
      gradedAttempts: 0,
      passedAttempts: 0,
      passRate: 0,
      averagePercentage: 0,
    },
    shape: buildShape([]),
    categories: [],
    quizzes: [],
    sampleQuestion: null,
    sampleResult: null,
    demo: { enabled: demoEnabled(), accounts: [] },
    unavailableReason:
      reason instanceof Error ? reason.message.slice(0, 120) : 'database unavailable',
  };
}
