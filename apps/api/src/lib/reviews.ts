import { and, asc, count, desc, eq, inArray, max, sql } from 'drizzle-orm';

import type {
  AttemptHistoryItem,
  AttemptHistoryQuery,
  AttemptHistoryResponse,
  AttemptReview,
  ReviewQuestion,
} from '@quiz/shared/review';
import { earnedMarks, reviewCounts, reviewVerdict } from '@quiz/shared/review';
import type { AttemptResult } from '@quiz/shared/submission';
import { timeTakenSeconds, wasAutoSubmitted } from '@quiz/shared/submission';
import { db, schema } from '@quiz/db';

import { ApiError } from './errors';
import { expireStaleAttempts } from './submissions';

const { answers, attempts, categories, options, questions, quizzes } = schema;

/**
 * The review of one finished attempt.
 *
 * This is the **only** payload in the product that ships the answer key, and it
 * is gated twice: the attempt must belong to the caller, and it must be
 * finished. An attempt that is still running answers `409 ATTEMPT_NOT_ACTIVE`
 * rather than a half-review with the key in it — that would hand a student the
 * answers mid-quiz.
 */
export async function getAttemptReview(attemptId: string, userId: string): Promise<AttemptReview> {
  // A deadline that passed a moment ago should be reviewable, not "in progress".
  await expireStaleAttempts(userId);

  const [attempt] = await db
    .select({
      id: attempts.id,
      quizId: attempts.quizId,
      status: attempts.status,
      startedAt: attempts.startedAt,
      expiresAt: attempts.expiresAt,
      completedAt: attempts.completedAt,
      score: attempts.score,
      totalMarks: attempts.totalMarks,
      percentage: attempts.percentage,
      correctAnswers: attempts.correctAnswers,
      incorrectAnswers: attempts.incorrectAnswers,
      unanswered: attempts.unanswered,
      timeTakenSeconds: attempts.timeTakenSeconds,
    })
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1);

  if (!attempt) {
    throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'No attempt with that id belongs to you.');
  }

  if (attempt.status === 'IN_PROGRESS') {
    throw new ApiError(
      409,
      'ATTEMPT_NOT_ACTIVE',
      'Submit this attempt before reviewing it — the answer key stays hidden until then.',
    );
  }

  const [quiz] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      slug: quizzes.slug,
      difficulty: quizzes.difficulty,
      passingScore: quizzes.passingScore,
      categoryName: categories.name,
    })
    .from(quizzes)
    .innerJoin(categories, eq(categories.id, quizzes.categoryId))
    .where(eq(quizzes.id, attempt.quizId))
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
      difficulty: questions.difficulty,
      explanation: questions.explanation,
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
            isCorrect: options.isCorrect,
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

  const selectedByQuestion = new Map(
    answerRows.map((answer) => [answer.questionId, answer.selectedOptionId]),
  );

  const reviewQuestions: ReviewQuestion[] = questionRows.map((question) => {
    const questionOptions = optionRows
      .filter((option) => option.questionId === question.id)
      .map((option) => ({
        id: option.id,
        text: option.text,
        position: option.position,
        isCorrect: option.isCorrect,
        selected: option.id === selectedByQuestion.get(question.id),
      }));

    const correctOptionId = questionOptions.find((option) => option.isCorrect)?.id ?? null;
    // Only a selection that is one of *this* question's options counts; a stale
    // answer row from a deleted option reads as unanswered, exactly like Day 8's
    // grader so the review and the score cannot disagree.
    const saved = selectedByQuestion.get(question.id) ?? null;
    const selectedOptionId = questionOptions.some((option) => option.id === saved) ? saved : null;

    const verdict = reviewVerdict(selectedOptionId, correctOptionId);

    return {
      id: question.id,
      position: question.position,
      questionText: question.questionText,
      marks: question.marks,
      difficulty: question.difficulty,
      explanation: question.explanation,
      selectedOptionId,
      correctOptionId,
      verdict,
      earnedMarks: earnedMarks(verdict, question.marks),
      options: questionOptions,
    };
  });

  const completedAt = attempt.completedAt ?? attempt.expiresAt;

  const result: AttemptResult = {
    score: attempt.score,
    totalMarks: attempt.totalMarks,
    percentage: attempt.percentage,
    correctAnswers: attempt.correctAnswers,
    incorrectAnswers: attempt.incorrectAnswers,
    unanswered: attempt.unanswered,
    passingScore: quiz.passingScore,
    passed: attempt.status === 'PASSED',
    status: attempt.status === 'PASSED' ? 'PASSED' : 'FAILED',
    timeTakenSeconds: attempt.timeTakenSeconds,
    startedAt: attempt.startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    autoSubmitted: wasAutoSubmitted(completedAt, attempt.expiresAt),
  };

  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      timeTakenSeconds: attempt.timeTakenSeconds,
      autoSubmitted: result.autoSubmitted,
    },
    quiz: {
      id: quiz.id,
      title: quiz.title,
      slug: quiz.slug,
      categoryName: quiz.categoryName,
      difficulty: quiz.difficulty,
      passingScore: quiz.passingScore,
    },
    result,
    questions: reviewQuestions,
    counts: reviewCounts(reviewQuestions),
  };
}

/* -------------------------------------------------------------------------- */
/*  Attempt history                                                           */
/* -------------------------------------------------------------------------- */

function orderFor(sort: AttemptHistoryQuery['sort']) {
  switch (sort) {
    case 'oldest':
      return asc(attempts.startedAt);
    case 'score':
      return desc(attempts.percentage);
    default:
      return desc(attempts.startedAt);
  }
}

export async function listAttemptHistory(
  query: AttemptHistoryQuery,
  userId: string,
): Promise<AttemptHistoryResponse> {
  // Settle anything the clock ended, so "in progress" means genuinely live.
  await expireStaleAttempts(userId);

  const clauses = [eq(attempts.userId, userId)];

  if (query.quizId) clauses.push(eq(attempts.quizId, query.quizId));
  if (query.status) clauses.push(eq(attempts.status, query.status));

  const where = and(...clauses);

  const [rows, [pageTotal], totalsRows, [best]] = await Promise.all([
    db
      .select({
        id: attempts.id,
        quizId: attempts.quizId,
        quizTitle: quizzes.title,
        quizSlug: quizzes.slug,
        categoryName: categories.name,
        difficulty: quizzes.difficulty,
        status: attempts.status,
        score: attempts.score,
        totalMarks: attempts.totalMarks,
        percentage: attempts.percentage,
        correctAnswers: attempts.correctAnswers,
        incorrectAnswers: attempts.incorrectAnswers,
        unanswered: attempts.unanswered,
        passingScore: quizzes.passingScore,
        startedAt: attempts.startedAt,
        expiresAt: attempts.expiresAt,
        completedAt: attempts.completedAt,
        timeTakenSeconds: attempts.timeTakenSeconds,
      })
      .from(attempts)
      .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
      .innerJoin(categories, eq(categories.id, quizzes.categoryId))
      .where(where)
      .orderBy(orderFor(query.sort))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(attempts).where(where),
    db
      .select({ status: attempts.status, value: count() })
      .from(attempts)
      .where(eq(attempts.userId, userId))
      .groupBy(attempts.status),
    db
      .select({ value: max(attempts.percentage) })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), sql`${attempts.status} in ('PASSED', 'FAILED')`)),
  ]);

  const items: AttemptHistoryItem[] = rows.map((row) => {
    const completedAt = row.completedAt ?? (row.status === 'IN_PROGRESS' ? null : row.expiresAt);

    return {
      id: row.id,
      quizId: row.quizId,
      quizTitle: row.quizTitle,
      quizSlug: row.quizSlug,
      categoryName: row.categoryName,
      difficulty: row.difficulty,
      status: row.status,
      passed: row.status === 'PASSED',
      score: row.score,
      totalMarks: row.totalMarks,
      percentage: row.percentage,
      correctAnswers: row.correctAnswers,
      incorrectAnswers: row.incorrectAnswers,
      unanswered: row.unanswered,
      passingScore: row.passingScore,
      startedAt: row.startedAt.toISOString(),
      completedAt: completedAt ? completedAt.toISOString() : null,
      timeTakenSeconds: completedAt
        ? row.timeTakenSeconds
        : timeTakenSeconds(row.startedAt, new Date()),
      autoSubmitted: completedAt ? wasAutoSubmitted(completedAt, row.expiresAt) : false,
      inProgress: row.status === 'IN_PROGRESS',
    };
  });

  const total = Number(pageTotal?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  const tally = { PASSED: 0, FAILED: 0, IN_PROGRESS: 0, EXPIRED: 0 };
  for (const row of totalsRows) tally[row.status] = Number(row.value);

  return {
    attempts: items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1,
    },
    filters: {
      quizId: query.quizId ?? null,
      status: query.status ?? null,
      sort: query.sort,
    },
    totals: {
      attempts: tally.PASSED + tally.FAILED + tally.IN_PROGRESS + tally.EXPIRED,
      passed: tally.PASSED,
      failed: tally.FAILED,
      inProgress: tally.IN_PROGRESS,
      bestPercentage: best?.value == null ? null : Number(best.value),
    },
  };
}
