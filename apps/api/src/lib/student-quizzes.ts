import { randomUUID } from 'node:crypto';

import { and, asc, count, desc, eq, gt, inArray, like, max, sql } from 'drizzle-orm';

import type {
  AttemptSession,
  SaveAnswerResponse,
  StartAttemptResponse,
  StudentQuiz,
  StudentQuizDetailResponse,
  StudentQuizListQuery,
  StudentQuizListResponse,
} from '@quiz/shared/attempt';
import { secondsRemaining, startDecision } from '@quiz/shared/attempt';
import type { CategoryOption } from '@quiz/shared/quiz';
import { db, schema } from '@quiz/db';

import { ApiError } from './errors';

const { answers, attempts, categories, options, questions, quizzes } = schema;

/** Only published quizzes exist as far as a student is concerned. */
const PUBLISHED = eq(quizzes.status, 'PUBLISHED');

/**
 * A student's quizzes, with the three aggregates the catalogue needs.
 *
 * Deliberately four small queries instead of one big join: counting questions,
 * summing marks and aggregating attempts in a single query multiplies the rows
 * (4 questions × 3 attempts = 12) and every aggregate would need `distinct`
 * gymnastics. Two `inArray` passes are cheaper to read and impossible to get
 * subtly wrong.
 */
async function decorate(
  rows: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    categoryId: string;
    categoryName: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    durationMinutes: number;
    passingScore: number;
    maxAttempts: number;
    thumbnailUrl: string | null;
  }[],
  userId: string,
): Promise<StudentQuiz[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [questionRows, attemptRows] = await Promise.all([
    db
      .select({
        quizId: questions.quizId,
        questionCount: count(questions.id),
        totalMarks: sql<number>`coalesce(sum(${questions.marks}), 0)`.mapWith(Number),
      })
      .from(questions)
      .where(inArray(questions.quizId, ids))
      .groupBy(questions.quizId),
    db
      .select({
        quizId: attempts.quizId,
        used: count(attempts.id),
        best: max(attempts.percentage),
        last: max(attempts.startedAt),
      })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), inArray(attempts.quizId, ids)))
      .groupBy(attempts.quizId),
  ]);

  // A live attempt is the only one that may be resumed: past its deadline it
  // counts as used but can no longer be written to.
  const liveRows = await db
    .select({ id: attempts.id, quizId: attempts.quizId, expiresAt: attempts.expiresAt })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.status, 'IN_PROGRESS'),
        inArray(attempts.quizId, ids),
        gt(attempts.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(attempts.startedAt));

  const questionsByQuiz = new Map(questionRows.map((row) => [row.quizId, row]));
  const attemptsByQuiz = new Map(attemptRows.map((row) => [row.quizId, row]));
  const liveByQuiz = new Map(liveRows.map((row) => [row.quizId, row.id]));

  return rows.map((row) => {
    const questionStats = questionsByQuiz.get(row.id);
    const attemptStats = attemptsByQuiz.get(row.id);
    const used = Number(attemptStats?.used ?? 0);

    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      difficulty: row.difficulty,
      durationMinutes: row.durationMinutes,
      passingScore: row.passingScore,
      maxAttempts: row.maxAttempts,
      questionCount: Number(questionStats?.questionCount ?? 0),
      totalMarks: Number(questionStats?.totalMarks ?? 0),
      thumbnailUrl: row.thumbnailUrl,
      attemptsUsed: used,
      attemptsRemaining: Math.max(0, row.maxAttempts - used),
      bestPercentage: attemptStats?.best == null ? null : Number(attemptStats.best),
      lastAttemptAt: attemptStats?.last ? new Date(attemptStats.last).toISOString() : null,
      inProgressAttemptId: liveByQuiz.get(row.id) ?? null,
    };
  });
}

const quizColumns = {
  id: quizzes.id,
  title: quizzes.title,
  slug: quizzes.slug,
  description: quizzes.description,
  categoryId: quizzes.categoryId,
  categoryName: categories.name,
  difficulty: quizzes.difficulty,
  durationMinutes: quizzes.durationMinutes,
  passingScore: quizzes.passingScore,
  maxAttempts: quizzes.maxAttempts,
  thumbnailUrl: quizzes.thumbnailUrl,
} as const;

function filtersFor(query: StudentQuizListQuery) {
  const clauses = [PUBLISHED];

  if (query.search) clauses.push(like(quizzes.title, `%${query.search}%`));
  if (query.categoryId) clauses.push(eq(quizzes.categoryId, query.categoryId));
  if (query.difficulty) clauses.push(eq(quizzes.difficulty, query.difficulty));

  return and(...clauses);
}

function orderFor(sort: StudentQuizListQuery['sort']) {
  switch (sort) {
    case 'title':
      return asc(quizzes.title);
    case 'duration':
      return asc(quizzes.durationMinutes);
    default:
      return desc(quizzes.createdAt);
  }
}

export async function listStudentQuizzes(
  query: StudentQuizListQuery,
  userId: string,
): Promise<StudentQuizListResponse> {
  const where = filtersFor(query);

  const [rows, [totals]] = await Promise.all([
    db
      .select(quizColumns)
      .from(quizzes)
      .innerJoin(categories, eq(categories.id, quizzes.categoryId))
      .where(where)
      .orderBy(orderFor(query.sort))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(quizzes).where(where),
  ]);

  const total = Number(totals?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    quizzes: await decorate(rows, userId),
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
      categoryId: query.categoryId ?? null,
      difficulty: query.difficulty ?? null,
      sort: query.sort,
    },
  };
}

async function loadQuiz(quizId: string, userId: string): Promise<StudentQuizDetailResponse | null> {
  const [row] = await db
    .select(quizColumns)
    .from(quizzes)
    .innerJoin(categories, eq(categories.id, quizzes.categoryId))
    .where(and(eq(quizzes.id, quizId), PUBLISHED))
    .limit(1);

  if (!row) return null;

  const [quiz] = await decorate([row], userId);
  if (!quiz) return null;

  const decision = startDecision({ status: 'PUBLISHED', ...quiz });

  return {
    quiz,
    start: { allowed: decision.allowed, code: decision.code, message: decision.message },
  };
}

/**
 * A draft or unpublished quiz answers exactly like a missing one: `404`.
 * Telling a student that a quiz exists but is not published leaks the catalogue
 * an admin has not released yet.
 */
/**
 * Categories that actually have something to take.
 *
 * The admin list is behind `requireAdmin`; a student needs the same names for
 * the catalogue filter, but only for quizzes they can see — a category whose
 * only quiz is a draft is not part of their world.
 */
export async function listStudentCategories(): Promise<CategoryOption[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      quizCount: count(quizzes.id),
    })
    .from(categories)
    .innerJoin(quizzes, and(eq(quizzes.categoryId, categories.id), PUBLISHED))
    .groupBy(categories.id)
    .orderBy(asc(categories.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    quizCount: Number(row.quizCount ?? 0),
  }));
}

export async function getStudentQuiz(
  quizId: string,
  userId: string,
): Promise<StudentQuizDetailResponse> {
  const detail = await loadQuiz(quizId, userId);

  if (!detail) {
    throw new ApiError(404, 'QUIZ_NOT_FOUND', 'No published quiz with that id exists.');
  }

  return detail;
}

/**
 * Start a quiz, or hand back the attempt already in flight.
 *
 * Resuming is not a new attempt: it returns the same row and deadline, so a
 * refresh (or a closed tab) never costs the student one of their tries. A new
 * attempt is only created when the rules allow it.
 */
export async function startAttempt(quizId: string, userId: string): Promise<StartAttemptResponse> {
  const detail = await loadQuiz(quizId, userId);

  if (!detail) {
    throw new ApiError(404, 'QUIZ_NOT_FOUND', 'No published quiz with that id exists.');
  }

  const { quiz } = detail;

  if (quiz.inProgressAttemptId) {
    const [row] = await db
      .select({ startedAt: attempts.startedAt, expiresAt: attempts.expiresAt })
      .from(attempts)
      .where(eq(attempts.id, quiz.inProgressAttemptId))
      .limit(1);

    if (row) {
      return {
        attemptId: quiz.inProgressAttemptId,
        quizId: quiz.id,
        resumed: true,
        startedAt: row.startedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        secondsRemaining: secondsRemaining(row.expiresAt),
      };
    }
  }

  const decision = startDecision({ status: 'PUBLISHED', ...quiz });

  if (!decision.allowed) {
    throw new ApiError(
      409,
      decision.code ?? 'ATTEMPT_BLOCKED',
      decision.message ?? 'Cannot start.',
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + quiz.durationMinutes * 60_000);
  const id = randomUUID();

  await db.insert(attempts).values({
    id,
    quizId: quiz.id,
    userId,
    score: 0,
    totalMarks: quiz.totalMarks,
    startedAt: now,
    expiresAt,
    status: 'IN_PROGRESS',
  });

  return {
    attemptId: id,
    quizId: quiz.id,
    resumed: false,
    startedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    secondsRemaining: secondsRemaining(expiresAt),
  };
}

/** Owner-only, like everything else on this router — a wrong id is simply missing. */
async function loadAttempt(attemptId: string, userId: string) {
  const [row] = await db
    .select({
      id: attempts.id,
      quizId: attempts.quizId,
      userId: attempts.userId,
      status: attempts.status,
      startedAt: attempts.startedAt,
      expiresAt: attempts.expiresAt,
      totalMarks: attempts.totalMarks,
    })
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1);

  if (!row) {
    throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'No attempt with that id belongs to you.');
  }

  return row;
}

/**
 * The payload the quiz taker renders.
 *
 * Options are returned in their stored order with text only — no `isCorrect`,
 * no explanation, no marks keyed to correctness. Grading is a Day 8 concern and
 * the browser is never given the material to do it early.
 */
export async function getAttemptSession(
  attemptId: string,
  userId: string,
): Promise<AttemptSession> {
  const attempt = await loadAttempt(attemptId, userId);

  const [quizRow] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      slug: quizzes.slug,
      description: quizzes.description,
      durationMinutes: quizzes.durationMinutes,
      passingScore: quizzes.passingScore,
    })
    .from(quizzes)
    .where(eq(quizzes.id, attempt.quizId))
    .limit(1);

  if (!quizRow) {
    throw new ApiError(404, 'QUIZ_NOT_FOUND', 'The quiz for this attempt no longer exists.');
  }

  const questionRows = await db
    .select({
      id: questions.id,
      position: questions.position,
      questionText: questions.questionText,
      marks: questions.marks,
      difficulty: questions.difficulty,
    })
    .from(questions)
    .where(eq(questions.quizId, attempt.quizId))
    .orderBy(asc(questions.position), asc(questions.createdAt));

  const questionIds = questionRows.map((question) => question.id);

  const [optionRows, answerRows] = await Promise.all([
    questionIds.length > 0
      ? db
          .select({
            id: options.id,
            questionId: options.questionId,
            text: options.optionText,
            position: options.position,
          })
          .from(options)
          .where(inArray(options.questionId, questionIds))
          .orderBy(asc(options.position), asc(options.optionText))
      : Promise.resolve([]),
    db
      .select({ questionId: answers.questionId, selectedOptionId: answers.selectedOptionId })
      .from(answers)
      .where(eq(answers.attemptId, attemptId)),
  ]);

  const now = new Date();
  const remaining = secondsRemaining(attempt.expiresAt, now.getTime());

  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      expiresAt: attempt.expiresAt.toISOString(),
      secondsRemaining: remaining,
      expired: remaining === 0,
      serverNow: now.toISOString(),
    },
    quiz: {
      id: quizRow.id,
      title: quizRow.title,
      slug: quizRow.slug,
      description: quizRow.description,
      durationMinutes: quizRow.durationMinutes,
      passingScore: quizRow.passingScore,
      questionCount: questionRows.length,
      totalMarks: Number(attempt.totalMarks),
    },
    questions: questionRows.map((question) => ({
      id: question.id,
      position: question.position,
      questionText: question.questionText,
      marks: question.marks,
      difficulty: question.difficulty,
      options: optionRows
        .filter((option) => option.questionId === question.id)
        .map((option) => ({ id: option.id, text: option.text, position: option.position })),
    })),
    answers: answerRows.map((row) => ({
      questionId: row.questionId,
      selectedOptionId: row.selectedOptionId,
    })),
  };
}

/**
 * Save (or clear) one answer.
 *
 * `PATCH`-like semantics with a full body, one question at a time: the attempt
 * screen writes as the student clicks, so a closed tab loses at most one
 * selection. Nothing is graded here — `is_correct` stays null until submission.
 */
export async function saveAnswer(
  attemptId: string,
  questionId: string,
  optionId: string | null,
  userId: string,
): Promise<SaveAnswerResponse> {
  const attempt = await loadAttempt(attemptId, userId);

  if (attempt.status !== 'IN_PROGRESS') {
    throw new ApiError(
      409,
      'ATTEMPT_NOT_ACTIVE',
      'This attempt is already finished and can no longer be edited.',
    );
  }

  if (secondsRemaining(attempt.expiresAt) === 0) {
    throw new ApiError(409, 'ATTEMPT_EXPIRED', 'Time is up for this attempt. Answers are locked.');
  }

  const [question] = await db
    .select({ id: questions.id, quizId: questions.quizId })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);

  if (!question || question.quizId !== attempt.quizId) {
    throw new ApiError(422, 'QUESTION_NOT_FOUND', 'That question is not part of this attempt.');
  }

  if (optionId) {
    const [option] = await db
      .select({ id: options.id, questionId: options.questionId })
      .from(options)
      .where(eq(options.id, optionId))
      .limit(1);

    if (!option || option.questionId !== questionId) {
      throw new ApiError(422, 'OPTION_NOT_FOUND', 'That option does not belong to this question.');
    }
  }

  const [existing] = await db
    .select({ id: answers.id })
    .from(answers)
    .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId)))
    .limit(1);

  if (existing) {
    await db
      .update(answers)
      .set({ selectedOptionId: optionId, isCorrect: null })
      .where(eq(answers.id, existing.id));
  } else {
    await db.insert(answers).values({
      id: randomUUID(),
      attemptId,
      questionId,
      selectedOptionId: optionId,
      // Graded on submission (Day 8); never trusted from the client.
      isCorrect: null,
    });
  }

  const [answered] = await db
    .select({ value: count() })
    .from(answers)
    .where(and(eq(answers.attemptId, attemptId), sql`${answers.selectedOptionId} is not null`));

  const totalRows = await db
    .select({ value: count() })
    .from(questions)
    .where(eq(questions.quizId, attempt.quizId));

  const total = totalRows[0]?.value ?? 0;

  const answeredCount = Number(answered?.value ?? 0);

  return {
    answer: { questionId, selectedOptionId: optionId },
    progress: {
      answered: answeredCount,
      unanswered: Math.max(0, Number(total) - answeredCount),
      total: Number(total),
    },
  };
}
