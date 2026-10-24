import { and, eq, inArray, lte } from 'drizzle-orm';

import type { AttemptResult, SubmitAttemptResponse } from '@quiz/shared/submission';
import {
  gradeAttempt,
  timeTakenSeconds,
  wasAutoSubmitted,
  type GradableAnswer,
  type GradableQuestion,
} from '@quiz/shared/submission';
import { db, schema } from '@quiz/db';

import { certificateEmail, resultEmail } from '@quiz/shared/email';

import { issueCertificate } from './certificates';
import { publicBaseUrl, queueEmail } from './emails';
import { ApiError } from './errors';

const { answers, attempts, certificates, options, questions, quizzes, users } = schema;

/** How many stale attempts one request will settle before giving up. */
const STALE_LIMIT = 50;

interface AttemptRow {
  id: string;
  quizId: string;
  status: 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'EXPIRED';
  score: number;
  totalMarks: number;
  percentage: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unanswered: number;
  timeTakenSeconds: number;
  penalty: number;
  negativeMarks: number;
  startedAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
}

/**
 * The stored attempt, plus the quiz's pass mark.
 *
 * Owner-scoped on purpose: another student's attempt must look exactly like a
 * missing one, which is the same contract the Day 7 routes already keep.
 */
async function loadAttempt(attemptId: string, userId: string) {
  const [row] = await db
    .select({
      id: attempts.id,
      quizId: attempts.quizId,
      status: attempts.status,
      score: attempts.score,
      totalMarks: attempts.totalMarks,
      percentage: attempts.percentage,
      correctAnswers: attempts.correctAnswers,
      incorrectAnswers: attempts.incorrectAnswers,
      unanswered: attempts.unanswered,
      timeTakenSeconds: attempts.timeTakenSeconds,
      penalty: attempts.penalty,
      negativeMarks: attempts.negativeMarks,
      startedAt: attempts.startedAt,
      expiresAt: attempts.expiresAt,
      completedAt: attempts.completedAt,
      passingScore: quizzes.passingScore,
      // The penalty in force is the one frozen onto the attempt at start time;
      // the quiz's current value is the fallback for rows written before this
      // column existed.
      quizNegativeMarks: quizzes.negativeMarks,
      certificateEnabled: quizzes.certificateEnabled,
    })
    .from(attempts)
    .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1);

  if (!row) {
    throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'No attempt with that id belongs to you.');
  }

  return row;
}

/**
 * Turn a graded row back into the wire shape.
 *
 * Used for every retry: once an attempt is finished its result is read from the
 * columns, never recomputed from answers that could have changed since.
 */
async function certificateCodeFor(attemptId: string): Promise<string | null> {
  const [row] = await db
    .select({ code: certificates.code })
    .from(certificates)
    .where(eq(certificates.attemptId, attemptId))
    .limit(1);

  return row?.code ?? null;
}

function toResult(
  row: AttemptRow & {
    passingScore: number;
    completedAt: Date | null;
    quizNegativeMarks: number;
  },
  certificateCode: string | null = null,
): AttemptResult {
  const completedAt = row.completedAt ?? row.expiresAt;
  const passed =
    row.status === 'PASSED' ||
    // `EXPIRED` is reserved but a row carrying it still knows its percentage.
    (row.status === 'EXPIRED' && row.totalMarks > 0 && row.percentage >= row.passingScore);

  return {
    score: row.score,
    totalMarks: row.totalMarks,
    percentage: row.percentage,
    correctAnswers: row.correctAnswers,
    incorrectAnswers: row.incorrectAnswers,
    unanswered: row.unanswered,
    passingScore: row.passingScore,
    passed,
    status: passed ? 'PASSED' : 'FAILED',
    timeTakenSeconds: row.timeTakenSeconds,
    startedAt: row.startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    autoSubmitted: wasAutoSubmitted(completedAt, row.expiresAt),
    penalty: Number(row.penalty ?? 0),
    negativeMarks: Number(row.negativeMarks ?? row.quizNegativeMarks ?? 0),
    certificateCode,
  };
}

/**
 * Grade one attempt and write the outcome down.
 *
 * Two writes: the attempt row gets score, totals, counts, percentage, status,
 * time taken and `completedAt`; the answer rows get `is_correct` stamped so the
 * review screen has a per-question verdict without a second grading pass.
 *
 * `completedAt` is clamped to the deadline: a client that submits a minute late
 * (or a tab reconnecting after the clock ran out) is recorded as finishing when
 * time ran out, never after it.
 */
async function gradeAndStore(
  row: AttemptRow & {
    passingScore: number;
    quizNegativeMarks: number;
    certificateEnabled: boolean;
  },
): Promise<SubmitAttemptResponse> {
  const questionRows = await db
    .select({ id: questions.id, marks: questions.marks })
    .from(questions)
    .where(eq(questions.quizId, row.quizId));

  const questionIds = questionRows.map((question) => question.id);

  const [optionRows, answerRows] = await Promise.all([
    questionIds.length > 0
      ? db
          .select({
            id: options.id,
            questionId: options.questionId,
            isCorrect: options.isCorrect,
          })
          .from(options)
          .where(inArray(options.questionId, questionIds))
      : Promise.resolve([]),
    db
      .select({ questionId: answers.questionId, selectedOptionId: answers.selectedOptionId })
      .from(answers)
      .where(eq(answers.attemptId, row.id)),
  ]);

  const optionsByQuestion = new Map<string, { id: string; isCorrect: boolean }[]>();

  for (const option of optionRows) {
    const list = optionsByQuestion.get(option.questionId) ?? [];
    list.push({ id: option.id, isCorrect: option.isCorrect });
    optionsByQuestion.set(option.questionId, list);
  }

  const gradable: GradableQuestion[] = questionRows.map((question) => ({
    id: question.id,
    marks: question.marks,
    options: optionsByQuestion.get(question.id) ?? [],
  }));

  const savedAnswers: GradableAnswer[] = answerRows.map((answer) => ({
    questionId: answer.questionId,
    selectedOptionId: answer.selectedOptionId,
  }));

  // Wrong answers cost marks on a quiz that says so. The value is the attempt's
  // own (frozen at start), so an admin editing the quiz mid-week cannot change
  // the terms of a paper somebody already sat.
  const negativeMarks = Number(row.negativeMarks ?? row.quizNegativeMarks ?? 0);

  const breakdown = gradeAttempt({
    questions: gradable,
    answers: savedAnswers,
    passingScore: row.passingScore,
    negativeMarks,
  });

  const now = new Date();
  const completedAt = now.getTime() >= row.expiresAt.getTime() ? row.expiresAt : now;
  const timeTaken = timeTakenSeconds(row.startedAt, completedAt);

  await db
    .update(attempts)
    .set({
      score: breakdown.score,
      totalMarks: breakdown.totalMarks,
      percentage: breakdown.percentage,
      correctAnswers: breakdown.correctAnswers,
      incorrectAnswers: breakdown.incorrectAnswers,
      unanswered: breakdown.unanswered,
      timeTakenSeconds: timeTaken,
      penalty: breakdown.penalty,
      negativeMarks,
      status: breakdown.status,
      completedAt,
    })
    .where(eq(attempts.id, row.id));

  // Stamp correctness on the saved rows. Only a real selection can be right or
  // wrong; a cleared answer keeps `is_correct = null`.
  const correctIds = new Set(
    gradable.flatMap((question) =>
      question.options.filter((option) => option.isCorrect).map((option) => option.id),
    ),
  );

  for (const answer of answerRows) {
    if (!answer.selectedOptionId) continue;

    await db
      .update(answers)
      .set({ isCorrect: correctIds.has(answer.selectedOptionId) })
      .where(and(eq(answers.attemptId, row.id), eq(answers.questionId, answer.questionId)));
  }

  const { certificateCode } = await notifyStudent(row, {
    ...breakdown,
    timeTakenSeconds: timeTaken,
    completedAt: completedAt.toISOString(),
  });

  return {
    attemptId: row.id,
    quizId: row.quizId,
    alreadySubmitted: false,
    result: {
      ...breakdown,
      timeTakenSeconds: timeTaken,
      startedAt: row.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      autoSubmitted: wasAutoSubmitted(completedAt, row.expiresAt),
      negativeMarks,
      certificateCode,
    },
  };
}

/**
 * After grading: a certificate if they earned one, a result mail either way.
 *
 * Both are best-effort by construction — `queueEmail` records a failure instead
 * of raising, so a broken mail path cannot turn a successful submission into an
 * error the student sees.
 */
async function notifyStudent(
  row: AttemptRow & { quizId: string; certificateEnabled: boolean },
  result: Pick<
    AttemptResult,
    'score' | 'totalMarks' | 'percentage' | 'passed' | 'timeTakenSeconds' | 'completedAt'
  >,
): Promise<{ certificateCode: string | null }> {
  const [context] = await db
    .select({
      name: users.name,
      email: users.email,
      quizTitle: quizzes.title,
      passingScore: quizzes.passingScore,
    })
    .from(attempts)
    .innerJoin(users, eq(users.id, attempts.userId))
    .innerJoin(quizzes, eq(quizzes.id, attempts.quizId))
    .where(eq(attempts.id, row.id))
    .limit(1);

  if (!context) return { certificateCode: null };

  let certificateCode: string | null = null;

  if (result.passed && row.certificateEnabled) {
    const [owner] = await db
      .select({ userId: attempts.userId })
      .from(attempts)
      .where(eq(attempts.id, row.id))
      .limit(1);

    if (owner) {
      const certificate = await issueCertificate({
        attemptId: row.id,
        userId: owner.userId,
        quizId: row.quizId,
      });

      certificateCode = certificate.code;

      // Only mail a brand-new certificate: a retried submission must not send a
      // second copy of the same document.
      if (certificate.created) {
        await queueEmail(
          certificateEmail({
            name: context.name,
            email: context.email,
            quizTitle: context.quizTitle,
            code: certificate.code,
            attemptId: row.id,
            percentage: certificate.percentage,
            baseUrl: publicBaseUrl(),
          }),
        );
      }
    }
  }

  await queueEmail(
    resultEmail({
      name: context.name,
      email: context.email,
      quizTitle: context.quizTitle,
      attemptId: row.id,
      percentage: result.percentage,
      score: result.score,
      totalMarks: result.totalMarks,
      passed: result.passed,
      passingScore: context.passingScore,
    }),
  );

  return { certificateCode };
}

/**
 * Submit an attempt — the student's click, or the clock running out.
 *
 * Idempotent: a second call (a double click, a retry, or the client and the
 * server both noticing the deadline) returns the stored result and
 * `alreadySubmitted: true` instead of grading again.
 */
export async function submitAttempt(
  attemptId: string,
  userId: string,
): Promise<SubmitAttemptResponse> {
  const row = await loadAttempt(attemptId, userId);

  if (row.status !== 'IN_PROGRESS') {
    return {
      attemptId: row.id,
      quizId: row.quizId,
      alreadySubmitted: true,
      result: toResult(row, await certificateCodeFor(row.id)),
    };
  }

  return gradeAndStore(row);
}

/**
 * Settle attempts whose deadline has passed.
 *
 * There is no cron in this project, so expiry is *lazy*: every student read
 * (catalogue, quiz detail, attempt) first grades anything of theirs that ran out
 * of time. The client's own auto-submit does the same work through
 * `submitAttempt`; whichever arrives first wins and the other sees
 * `alreadySubmitted: true`. Bounded so a single request never grades an
 * unbounded backlog.
 */
export async function expireStaleAttempts(userId: string, now: Date = new Date()): Promise<number> {
  const stale = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.status, 'IN_PROGRESS'),
        lte(attempts.expiresAt, now),
      ),
    )
    .limit(STALE_LIMIT);

  for (const attempt of stale) {
    const row = await loadAttempt(attempt.id, userId);
    if (row.status === 'IN_PROGRESS') await gradeAndStore(row);
  }

  return stale.length;
}

/** The graded result of a finished attempt, or `null` while it is still open. */
export async function getAttemptResult(
  attemptId: string,
  userId: string,
): Promise<AttemptResult | null> {
  const row = await loadAttempt(attemptId, userId);
  return row.status === 'IN_PROGRESS' ? null : toResult(row, await certificateCodeFor(row.id));
}
