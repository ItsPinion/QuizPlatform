/**
 * Submission and scoring contracts (Day 8).
 *
 * Grading is a pure function of what is already in the database — the questions,
 * their options, the answer key and the answers the student saved. Nothing in
 * this file reads the client's opinion of its own score, and the same function
 * runs on a manual submit and on an automatic one, so a closed tab and a click
 * on **Submit** cannot produce two different results.
 *
 * The result is stored on the attempt row (score, totals, counts, percentage,
 * pass/fail, time taken) and `answers.is_correct` is stamped at the same time,
 * which is what the Day 9 review screen will read.
 */
import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/*  Grading                                                                   */
/* -------------------------------------------------------------------------- */

export interface GradableOption {
  id: string;
  isCorrect: boolean;
}

export interface GradableQuestion {
  id: string;
  marks: number;
  options: readonly GradableOption[];
}

export interface GradableAnswer {
  questionId: string;
  selectedOptionId: string | null;
}

export interface GradeBreakdown {
  correctAnswers: number;
  incorrectAnswers: number;
  unanswered: number;
  score: number;
  totalMarks: number;
  /** 0–100, rounded to two decimals. */
  percentage: number;
  passingScore: number;
  passed: boolean;
  status: 'PASSED' | 'FAILED';
}

/**
 * The one grading implementation.
 *
 * A question counts as **unanswered** when there is no saved selection, or when
 * the saved selection is not one of that question's options (an option deleted
 * while the attempt was open). It counts as **incorrect** when a real option was
 * chosen and it is not the key. Marks are the question's own, so a quiz with
 * weighted questions scores correctly.
 *
 * `totalMarks` is recomputed from the questions that exist now rather than
 * trusting the snapshot taken at start: the two only diverge if an admin edits
 * the quiz mid-attempt, and grading against what is actually on the paper is the
 * defensible choice (see docs/submission-and-scoring.md).
 */
export function gradeAttempt(input: {
  questions: readonly GradableQuestion[];
  answers: readonly GradableAnswer[];
  passingScore: number;
}): GradeBreakdown {
  // Last write wins: the unique index makes duplicates impossible, but a caller
  // building the array by hand should not be able to double-count.
  const byQuestion = new Map<string, string | null>();
  for (const answer of input.answers) byQuestion.set(answer.questionId, answer.selectedOptionId);

  let correctAnswers = 0;
  let incorrectAnswers = 0;
  let unanswered = 0;
  let score = 0;
  let totalMarks = 0;

  for (const question of input.questions) {
    totalMarks += question.marks;

    const selectedId = byQuestion.get(question.id) ?? null;
    const selected = selectedId
      ? (question.options.find((option) => option.id === selectedId) ?? null)
      : null;

    if (!selected) {
      unanswered += 1;
    } else if (selected.isCorrect) {
      correctAnswers += 1;
      score += question.marks;
    } else {
      incorrectAnswers += 1;
    }
  }

  const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 10_000) / 100 : 0;

  // An empty paper can never be a pass, even when the pass mark is 0.
  const passed = totalMarks > 0 && percentage >= input.passingScore;

  return {
    correctAnswers,
    incorrectAnswers,
    unanswered,
    score,
    totalMarks,
    percentage,
    passingScore: input.passingScore,
    passed,
    status: passed ? 'PASSED' : 'FAILED',
  };
}

/* -------------------------------------------------------------------------- */
/*  Time                                                                      */
/* -------------------------------------------------------------------------- */

function toMillis(value: string | number | Date): number {
  const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

/**
 * Seconds between starting and finishing, never negative.
 *
 * The caller clamps `completedAt` to `expiresAt`, so an automatic submission
 * always reports the full duration and a late one cannot report more than the
 * quiz allowed.
 */
export function timeTakenSeconds(
  startedAt: string | number | Date,
  completedAt: string | number | Date,
): number {
  return Math.max(0, Math.round((toMillis(completedAt) - toMillis(startedAt)) / 1000));
}

/**
 * Was this attempt finished by the clock rather than by the student?
 *
 * An attempt completed at (or after) its deadline was auto-submitted. Both the
 * API and the UI derive it from the stored timestamps instead of carrying a
 * separate flag, so there is no second source of truth to drift.
 */
export function wasAutoSubmitted(
  completedAt: string | number | Date,
  expiresAt: string | number | Date,
): boolean {
  return toMillis(completedAt) >= toMillis(expiresAt);
}

/* -------------------------------------------------------------------------- */
/*  Wire shapes                                                               */
/* -------------------------------------------------------------------------- */

export const attemptResultStatusSchema = z.enum(['PASSED', 'FAILED']);
export type AttemptResultStatus = z.infer<typeof attemptResultStatusSchema>;

export const attemptResultSchema = z.object({
  score: z.number(),
  totalMarks: z.number(),
  percentage: z.number(),
  correctAnswers: z.number(),
  incorrectAnswers: z.number(),
  unanswered: z.number(),
  passingScore: z.number(),
  passed: z.boolean(),
  status: attemptResultStatusSchema,
  timeTakenSeconds: z.number(),
  startedAt: z.string(),
  completedAt: z.string(),
  /** `true` when the deadline finished the attempt, not the student. */
  autoSubmitted: z.boolean(),
});
export type AttemptResult = z.infer<typeof attemptResultSchema>;

export const submitAttemptResponseSchema = z.object({
  attemptId: z.string(),
  quizId: z.string(),
  /**
   * `true` when this attempt had already been submitted. The call is
   * idempotent: a retry after a flaky connection returns the same stored result
   * instead of grading the paper twice.
   */
  alreadySubmitted: z.boolean(),
  result: attemptResultSchema,
});
export type SubmitAttemptResponse = z.infer<typeof submitAttemptResponseSchema>;

/** Attempt statuses that mean grading has run. `EXPIRED` is reserved. */
export const FINISHED_ATTEMPT_STATUSES = ['PASSED', 'FAILED', 'EXPIRED'] as const;

export function isFinishedAttempt(status: string): boolean {
  return (FINISHED_ATTEMPT_STATUSES as readonly string[]).includes(status);
}
