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

import {
  answerMatches,
  isMultiSelect,
  QUESTION_TYPES,
  questionTypeSchema,
  type QuestionType,
} from './question-type';

/* -------------------------------------------------------------------------- */
/*  Grading                                                                   */
/* -------------------------------------------------------------------------- */

export interface GradableOption {
  id: string;
  isCorrect: boolean;
  /** The option's text. Only fill-in-the-blank needs it: there the text *is* the key. */
  text?: string;
}

export interface GradableQuestion {
  id: string;
  marks: number;
  /** Defaults to `MCQ` so a caller that predates §10 keeps grading the same way. */
  type?: QuestionType;
  options: readonly GradableOption[];
}

export interface GradableAnswer {
  questionId: string;
  selectedOptionId: string | null;
  /** The set picked on a `MULTI` question. Empty on every other type. */
  selectedOptionIds?: readonly string[];
  /** What the student typed on a `FILL_BLANK` question. */
  answerText?: string | null;
}

export interface GradeBreakdown {
  correctAnswers: number;
  incorrectAnswers: number;
  unanswered: number;
  /** Marks obtained after the penalty: never below zero. */
  score: number;
  totalMarks: number;
  /** 0–100, rounded to two decimals. */
  percentage: number;
  passingScore: number;
  passed: boolean;
  status: 'PASSED' | 'FAILED';
  /** Marks deducted for wrong answers on this attempt. */
  penalty: number;
  /** The per-wrong-answer penalty the paper was graded with. */
  negativeMarks: number;
  /** Per-format tally of the paper (§10). Empty only for a paper with no questions. */
  formats: FormatBreakdown[];
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
/** A typed answer counts as given only when something remains after trimming. */
function answerTextIsPresent(answer: GradableAnswer | undefined): boolean {
  return typeof answer?.answerText === 'string' && answer.answerText.trim() !== '';
}

/**
 * The options a student actually chose, restricted to ones this question has.
 *
 * A `MULTI` answer carries its set; every other type carries the single
 * selection, which is returned as a one-item list so both shapes share the
 * "did they pick anything" question above.
 */
function chosenOptions(
  question: GradableQuestion,
  answer: GradableAnswer | undefined,
): GradableOption[] {
  const ids = answer?.selectedOptionIds?.length
    ? answer.selectedOptionIds
    : answer?.selectedOptionId
      ? [answer.selectedOptionId]
      : [];

  return question.options.filter((option) => ids.includes(option.id));
}

/**
 * Was the question answered correctly?
 *
 * Three shapes, one per answer format:
 *
 * - single answer (`MCQ`, `TRUE_FALSE`, image and code questions) — the one
 *   chosen option is the key;
 * - `MULTI` — the chosen set equals the key set, so a half-right answer scores
 *   nothing. That is the strict reading of "multiple correct answers", and the
 *   alternative (partial credit) would make a paper's total depend on how many
 *   boxes the author ticked;
 * - `FILL_BLANK` — any accepted spelling matches, after `normaliseAnswer`.
 */
function isQuestionCorrect(
  question: GradableQuestion,
  type: QuestionType,
  answer: GradableAnswer | undefined,
): boolean {
  if (type === 'FILL_BLANK') {
    const accepted = question.options
      .filter((option) => option.isCorrect)
      .map((option) => option.text ?? '');
    return answerMatches(answer?.answerText ?? null, accepted);
  }

  const chosen = chosenOptions(question, answer);
  const key = question.options.filter((option) => option.isCorrect);

  if (isMultiSelect(type)) {
    if (chosen.length !== key.length) return false;
    const chosenIds = new Set(chosen.map((option) => option.id));
    return key.every((option) => chosenIds.has(option.id));
  }

  return chosen.length === 1 && chosen[0]!.isCorrect;
}

/**
 * The paper tallied by format (§10).
 *
 * One implementation, used by the grader and by every later read of a finished
 * attempt — the result card shows the same split whether it arrived from a
 * submit or from a page reload, because both come through here.
 */
export function formatBreakdown(input: {
  questions: readonly GradableQuestion[];
  answers: readonly GradableAnswer[];
}): FormatBreakdown[] {
  const byQuestion = new Map<string, GradableAnswer>();
  for (const answer of input.answers) byQuestion.set(answer.questionId, answer);

  const tally = new Map<QuestionType, { total: number; correct: number; unanswered: number }>();

  for (const question of input.questions) {
    const type = question.type ?? 'MCQ';
    const bucket = tally.get(type) ?? { total: 0, correct: 0, unanswered: 0 };
    const answer = byQuestion.get(question.id);

    bucket.total += 1;

    const answered =
      type === 'FILL_BLANK'
        ? answerTextIsPresent(answer)
        : chosenOptions(question, answer).length > 0;

    if (!answered) bucket.unanswered += 1;
    else if (isQuestionCorrect(question, type, answer)) bucket.correct += 1;

    tally.set(type, bucket);
  }

  return QUESTION_TYPES.filter((type) => tally.has(type)).map((type) => {
    const bucket = tally.get(type)!;
    return {
      type,
      total: bucket.total,
      correct: bucket.correct,
      incorrect: bucket.total - bucket.correct - bucket.unanswered,
      unanswered: bucket.unanswered,
    };
  });
}

export function gradeAttempt(input: {
  questions: readonly GradableQuestion[];
  answers: readonly GradableAnswer[];
  passingScore: number;
  /**
   * Marks removed for the *consequence* of a wrong answer. A skipped question
   * is never penalised: the penalty is for answering and being wrong, which is
   * what makes guessing a decision rather than a free roll.
   */
  negativeMarks?: number;
}): GradeBreakdown {
  const negativeMarks = Math.max(0, input.negativeMarks ?? 0);
  // Last write wins: the unique index makes duplicates impossible, but a caller
  // building the array by hand should not be able to double-count.
  const byQuestion = new Map<string, GradableAnswer>();
  for (const answer of input.answers) byQuestion.set(answer.questionId, answer);

  let correctAnswers = 0;
  let incorrectAnswers = 0;
  let unanswered = 0;
  let earned = 0;
  let totalMarks = 0;

  for (const question of input.questions) {
    totalMarks += question.marks;

    const answer = byQuestion.get(question.id);
    const type = question.type ?? 'MCQ';

    const answered =
      type === 'FILL_BLANK'
        ? answerTextIsPresent(answer)
        : chosenOptions(question, answer).length > 0;

    if (!answered) {
      unanswered += 1;
      continue;
    }

    if (isQuestionCorrect(question, type, answer)) {
      correctAnswers += 1;
      earned += question.marks;
    } else {
      incorrectAnswers += 1;
    }
  }

  // The penalty is charged per wrong answer, not per mark at stake, and the
  // floor is zero: a paper cannot score below nothing.
  const penalty = Math.round(negativeMarks * incorrectAnswers * 100) / 100;
  const score = Math.round(Math.max(0, earned - penalty) * 100) / 100;

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
    penalty,
    negativeMarks,
    // The paper's mix, in the spec's own order, so the result card can say what
    // was answered correctly *by format* rather than only in total.
    formats: formatBreakdown(input),
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

/**
 * How the paper was answered, by format.
 *
 * The result card shows "3 correct" today; §10's mix of formats makes "3 of 4
 * multiple choice, 1 of 2 fill in the blank" the more useful sentence, and the
 * split comes from the server so the client never re-grades to find it.
 */
export const formatBreakdownSchema = z.object({
  type: questionTypeSchema,
  total: z.number(),
  correct: z.number(),
  incorrect: z.number(),
  unanswered: z.number(),
});
export type FormatBreakdown = z.infer<typeof formatBreakdownSchema>;

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
  /** Marks taken off for wrong answers (0 on a quiz without a penalty). */
  penalty: z.number().default(0),
  /** The per-wrong-answer penalty that was applied. */
  negativeMarks: z.number().default(0),
  /**
   * The certificate this attempt earned, if it earned one.
   *
   * On the result rather than fetched separately: "you passed" and "here is the
   * proof" are the same moment, and a second request that could fail would leave
   * the screen telling half the story.
   */
  certificateCode: z.string().nullable().default(null),
  /** Per-format tally of the paper (§10). */
  formats: z.array(formatBreakdownSchema).default([]),
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
