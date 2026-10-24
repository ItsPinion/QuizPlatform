/**
 * Every attempt, and one student's whole record.
 *
 * "View individual student results" and "view quiz performance" are the same
 * rows read from two directions, so they share a query: the list filters by
 * quiz, by student, by status and by free text over both names, and the profile
 * is that list pinned to one account plus the aggregates a teacher would
 * otherwise add up by hand.
 */
import { and, asc, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm';

import type {
  AdminAttempt,
  AdminAttemptDetailResponse,
  AdminAttemptListResponse,
  AdminAttemptQuery,
  StudentProfile,
} from '@quiz/shared/admin-attempts';
import { wasAutoSubmitted } from '@quiz/shared/submission';
import { db, schema } from '@quiz/db';

import { ApiError } from './errors';

const { answers, attempts, categories, certificates, options, questions, quizzes, users } = schema;

/** Statuses that mean "graded". `EXPIRED` is stamped by older data. */
const FINISHED = ['PASSED', 'FAILED', 'EXPIRED'] as const;

const attemptSelection = {
  id: attempts.id,
  quizId: attempts.quizId,
  quizTitle: quizzes.title,
  categoryName: categories.name,
  userId: attempts.userId,
  userName: users.name,
  userEmail: users.email,
  status: attempts.status,
  percentage: attempts.percentage,
  score: attempts.score,
  totalMarks: attempts.totalMarks,
  correctAnswers: attempts.correctAnswers,
  incorrectAnswers: attempts.incorrectAnswers,
  unanswered: attempts.unanswered,
  timeTakenSeconds: attempts.timeTakenSeconds,
  startedAt: attempts.startedAt,
  expiresAt: attempts.expiresAt,
  completedAt: attempts.completedAt,
} as const;

type AttemptRow = {
  id: string;
  quizId: string;
  quizTitle: string;
  categoryName: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'EXPIRED';
  percentage: number;
  score: number;
  totalMarks: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unanswered: number;
  timeTakenSeconds: number;
  startedAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
};

function toAdminAttempt(row: AttemptRow): AdminAttempt {
  const completedAt = row.completedAt;

  return {
    id: row.id,
    quizId: row.quizId,
    quizTitle: row.quizTitle,
    categoryName: row.categoryName,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    status: row.status,
    percentage: Number(row.percentage),
    score: Number(row.score),
    totalMarks: Number(row.totalMarks),
    correctAnswers: Number(row.correctAnswers),
    incorrectAnswers: Number(row.incorrectAnswers),
    unanswered: Number(row.unanswered),
    timeTakenSeconds: Number(row.timeTakenSeconds),
    startedAt: row.startedAt.toISOString(),
    completedAt: completedAt ? completedAt.toISOString() : null,
    autoSubmitted: completedAt
      ? wasAutoSubmitted(completedAt, row.expiresAt)
      : wasAutoSubmitted(row.expiresAt, row.expiresAt),
  };
}

function attemptQuery() {
  return db
    .select(attemptSelection)
    .from(attempts)
    .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
    .innerJoin(categories, eq(categories.id, quizzes.categoryId))
    .innerJoin(users, eq(users.id, attempts.userId));
}

function filtersFor(query: AdminAttemptQuery) {
  const clauses = [];

  if (query.search) {
    const pattern = `%${query.search}%`;
    const match = or(
      like(users.name, pattern),
      like(users.email, pattern),
      like(quizzes.title, pattern),
    );
    if (match) clauses.push(match);
  }

  if (query.quizId) clauses.push(eq(attempts.quizId, query.quizId));
  if (query.userId) clauses.push(eq(attempts.userId, query.userId));

  if (query.status !== 'ALL') {
    // `EXPIRED` belongs with the finished attempts: it is graded, it is just
    // older data from before the clock settled rows into PASSED/FAILED.
    if (query.status === 'FAILED') {
      clauses.push(sql`${attempts.status} in ('FAILED', 'EXPIRED')`);
    } else {
      clauses.push(eq(attempts.status, query.status));
    }
  }

  return clauses.length > 0 ? and(...clauses) : undefined;
}

function orderFor(sort: AdminAttemptQuery['sort']) {
  switch (sort) {
    case 'oldest':
      return asc(attempts.startedAt);
    case 'score':
      return desc(attempts.percentage);
    case 'duration':
      return desc(attempts.timeTakenSeconds);
    default:
      return desc(attempts.startedAt);
  }
}

export async function listAttempts(query: AdminAttemptQuery): Promise<AdminAttemptListResponse> {
  const where = filtersFor(query);

  const [rows, [counted], [stats]] = await Promise.all([
    attemptQuery()
      .where(where)
      .orderBy(orderFor(query.sort))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ value: count() })
      .from(attempts)
      .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
      .innerJoin(users, eq(users.id, attempts.userId))
      .where(where),
    // The summary describes the filtered set, so the figures under the table
    // belong to the rows above it rather than to the whole platform.
    db
      .select({
        graded:
          sql<number>`coalesce(sum(case when ${attempts.status} in ('PASSED','FAILED','EXPIRED') then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        passed:
          sql<number>`coalesce(sum(case when ${attempts.status} = 'PASSED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        failed:
          sql<number>`coalesce(sum(case when ${attempts.status} in ('FAILED','EXPIRED') then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        participants: sql<number>`count(distinct ${attempts.userId})`.mapWith(Number),
        quizzes: sql<number>`count(distinct ${attempts.quizId})`.mapWith(Number),
        averagePercentage:
          sql<number>`coalesce(round(avg(case when ${attempts.status} in ('PASSED','FAILED','EXPIRED') then ${attempts.percentage} end), 2), 0)`.mapWith(
            Number,
          ),
      })
      .from(attempts)
      .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
      .innerJoin(users, eq(users.id, attempts.userId))
      .where(where),
  ]);

  const total = Number(counted?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    attempts: rows.map(toAdminAttempt),
    summary: {
      attempts: total,
      graded: Number(stats?.graded ?? 0),
      passed: Number(stats?.passed ?? 0),
      failed: Number(stats?.failed ?? 0),
      averagePercentage: Number(stats?.averagePercentage ?? 0),
      participants: Number(stats?.participants ?? 0),
      quizzes: Number(stats?.quizzes ?? 0),
    },
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1,
    },
    filters: {
      search: query.search ?? null,
      quizId: query.quizId ?? null,
      userId: query.userId ?? null,
      status: query.status,
      sort: query.sort,
    },
  };
}

/** One attempt with the answer key — the console's read-only copy of the paper. */
export async function getAttemptDetail(attemptId: string): Promise<AdminAttemptDetailResponse> {
  const [row] = await attemptQuery().where(eq(attempts.id, attemptId)).limit(1);

  if (!row) {
    throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'No attempt with that id exists.');
  }

  const [quiz] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      categoryName: categories.name,
      difficulty: quizzes.difficulty,
      passingScore: quizzes.passingScore,
      negativeMarks: quizzes.negativeMarks,
      shuffleQuestions: quizzes.shuffleQuestions,
      shuffleOptions: quizzes.shuffleOptions,
    })
    .from(quizzes)
    .innerJoin(categories, eq(categories.id, quizzes.categoryId))
    .where(eq(quizzes.id, row.quizId))
    .limit(1);

  if (!quiz) {
    throw new ApiError(404, 'QUIZ_NOT_FOUND', 'The quiz for this attempt no longer exists.');
  }

  const questionRows = await db
    .select({
      id: questions.id,
      position: questions.position,
      questionText: questions.questionText,
      marks: questions.marks,
      explanation: questions.explanation,
    })
    .from(questions)
    .where(eq(questions.quizId, row.quizId))
    .orderBy(asc(questions.position), asc(questions.createdAt));

  const questionIds = questionRows.map((question) => question.id);

  const optionRows =
    questionIds.length > 0
      ? await db
          .select({
            id: options.id,
            questionId: options.questionId,
            text: options.optionText,
            isCorrect: options.isCorrect,
          })
          .from(options)
          .where(inArray(options.questionId, questionIds))
          .orderBy(asc(options.position))
      : [];

  const answerRows = await db
    .select({ questionId: answers.questionId, selectedOptionId: answers.selectedOptionId })
    .from(answers)
    .where(eq(answers.attemptId, attemptId));

  const selected = new Map(
    answerRows.map((answer) => [answer.questionId, answer.selectedOptionId]),
  );

  return {
    attempt: toAdminAttempt(row),
    quiz,
    answers: questionRows.map((question) => {
      const own = optionRows.filter((option) => option.questionId === question.id);
      const selectedOptionId = selected.get(question.id) ?? null;
      const correct = own.find((option) => option.isCorrect);

      return {
        questionId: question.id,
        questionText: question.questionText,
        position: question.position,
        marks: question.marks,
        explanation: question.explanation,
        options: own.map((option) => ({
          id: option.id,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
        selectedOptionId,
        isCorrect: selectedOptionId === null || !correct ? null : selectedOptionId === correct.id,
      };
    }),
    penalty: 0,
  };
}

/**
 * One student's record.
 *
 * Aggregates are computed in SQL rather than by summing the history array in JS:
 * a prolific student's history is still bounded by the query below, and a total
 * that silently drops rows past the first page would be a wrong number on a
 * screen people trust.
 */
export async function getStudentProfile(userId: string): Promise<StudentProfile> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'No user with that id exists.');
  }

  const [stats] = await db
    .select({
      attempts: count(),
      completed:
        sql<number>`coalesce(sum(case when ${attempts.status} in ('PASSED','FAILED','EXPIRED') then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
      passed:
        sql<number>`coalesce(sum(case when ${attempts.status} = 'PASSED' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
      failed:
        sql<number>`coalesce(sum(case when ${attempts.status} in ('FAILED','EXPIRED') then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
      inProgress:
        sql<number>`coalesce(sum(case when ${attempts.status} = 'IN_PROGRESS' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
      averagePercentage:
        sql<number>`coalesce(round(avg(case when ${attempts.status} in ('PASSED','FAILED','EXPIRED') then ${attempts.percentage} end), 2), 0)`.mapWith(
          Number,
        ),
      bestPercentage: sql<
        number | null
      >`max(case when ${attempts.status} in ('PASSED','FAILED','EXPIRED') then ${attempts.percentage} end)`.mapWith(
        Number,
      ),
      worstPercentage: sql<
        number | null
      >`min(case when ${attempts.status} in ('PASSED','FAILED','EXPIRED') then ${attempts.percentage} end)`.mapWith(
        Number,
      ),
      questionsAnswered:
        sql<number>`coalesce(sum(${attempts.correctAnswers} + ${attempts.incorrectAnswers}), 0)`.mapWith(
          Number,
        ),
      questionsCorrect: sql<number>`coalesce(sum(${attempts.correctAnswers}), 0)`.mapWith(Number),
      timeSpentSeconds: sql<number>`coalesce(sum(${attempts.timeTakenSeconds}), 0)`.mapWith(Number),
      quizzesAttempted: sql<number>`count(distinct ${attempts.quizId})`.mapWith(Number),
    })
    .from(attempts)
    .where(eq(attempts.userId, userId));

  const [history, categoryRows, [certificateCount]] = await Promise.all([
    attemptQuery().where(eq(attempts.userId, userId)).orderBy(desc(attempts.startedAt)).limit(50),
    db
      .select({
        categoryId: categories.id,
        categoryName: categories.name,
        attempts: count(attempts.id),
        averagePercentage:
          sql<number>`coalesce(round(avg(case when ${attempts.status} in ('PASSED','FAILED','EXPIRED') then ${attempts.percentage} end), 2), 0)`.mapWith(
            Number,
          ),
      })
      .from(attempts)
      .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
      .innerJoin(categories, eq(categories.id, quizzes.categoryId))
      .where(eq(attempts.userId, userId))
      .groupBy(categories.id),
    db.select({ value: count() }).from(certificates).where(eq(certificates.userId, userId)),
  ]);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    },
    stats: {
      attempts: Number(stats?.attempts ?? 0),
      completed: Number(stats?.completed ?? 0),
      passed: Number(stats?.passed ?? 0),
      failed: Number(stats?.failed ?? 0),
      inProgress: Number(stats?.inProgress ?? 0),
      averagePercentage: Number(stats?.averagePercentage ?? 0),
      bestPercentage: stats?.bestPercentage == null ? null : Number(stats.bestPercentage),
      worstPercentage: stats?.worstPercentage == null ? null : Number(stats.worstPercentage),
      questionsAnswered: Number(stats?.questionsAnswered ?? 0),
      questionsCorrect: Number(stats?.questionsCorrect ?? 0),
      timeSpentSeconds: Number(stats?.timeSpentSeconds ?? 0),
      quizzesAttempted: Number(stats?.quizzesAttempted ?? 0),
      certificates: Number(certificateCount?.value ?? 0),
    },
    history: history.map((row) => ({
      id: row.id,
      quizId: row.quizId,
      quizTitle: row.quizTitle,
      categoryName: row.categoryName,
      status: row.status,
      percentage: Number(row.percentage),
      score: Number(row.score),
      totalMarks: Number(row.totalMarks),
      passed: row.status === 'PASSED',
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    })),
    categories: categoryRows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      attempts: Number(row.attempts),
      averagePercentage: Number(row.averagePercentage ?? 0),
    })),
  };
}

/** Shared by the student's own results screen and their dashboard. */
export async function countFinishedAttempts(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), inArray(attempts.status, [...FINISHED])));

  return Number(row?.value ?? 0);
}
