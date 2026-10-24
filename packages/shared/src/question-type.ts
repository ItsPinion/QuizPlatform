/**
 * Question formats (§10).
 *
 * The spec asks for multiple choice first and lists the rest as later work:
 * multiple correct answers, true/false, fill in the blanks, image-based and
 * code-based questions. All of them ship here, and the list below is the whole
 * vocabulary — one enum that the database, the API, the grader and both consoles
 * read, so a new format cannot exist in one place and be unknown in another.
 *
 * Two of the six are not new *grading* shapes, they are new *presentations* of
 * one, which is why they are flags rather than types:
 *
 * - **image-based** and **code-based** questions are multiple choice with an
 *   image or a code block above the options. Their answer is still one option,
 *   so they grade through exactly the same path as `MCQ`. Inventing a fourth
 *   grading branch for "a question with a picture" would have been three code
 *   paths pretending to be one.
 * - **true/false** is a two-option multiple choice, but it gets its own type
 *   because the authoring screen should not make anyone type the words "True"
 *   and "False" and get them the wrong way round.
 *
 * `MULTI` is graded as a set: every correct option and nothing else. `FILL_BLANK`
 * is graded against a list of accepted answers, compared after normalisation
 * (`normaliseAnswer`) so "  HyperText  Markup Language." is the same answer as
 * "hypertext markup language".
 */
import { z } from 'zod';

export const QUESTION_TYPES = ['MCQ', 'MULTI', 'TRUE_FALSE', 'FILL_BLANK'] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof questionTypeSchema>;

/** Human labels for the console, the catalogue and the review screen. */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MCQ: 'Multiple choice',
  MULTI: 'Multiple answers',
  TRUE_FALSE: 'True / false',
  FILL_BLANK: 'Fill in the blank',
};

/** One line of help, shown next to the type picker. */
export const QUESTION_TYPE_HINTS: Record<QuestionType, string> = {
  MCQ: 'Four options, exactly one of them correct.',
  MULTI: 'Several options are correct; the student picks every one.',
  TRUE_FALSE: 'A statement, and two buttons. Correct is either true or false.',
  FILL_BLANK: 'The student types the answer. List every spelling you will accept.',
};

/** The fixed pair a `TRUE_FALSE` question stores, in this order. */
export const TRUE_FALSE_OPTIONS = ['True', 'False'] as const;

/** Does this type ask the student to pick options at all? */
export function isChoiceType(type: QuestionType): boolean {
  return type !== 'FILL_BLANK';
}

/** Does it accept more than one selected option? */
export function isMultiSelect(type: QuestionType): boolean {
  return type === 'MULTI';
}

/** Types where the options *are* the answer key, so they must never be sent to a student. */
export function hidesOptionsWhileRunning(type: QuestionType): boolean {
  return type === 'FILL_BLANK';
}

/**
 * Normalise a typed answer before comparing it.
 *
 * Deliberately forgiving about the things a person cannot see — case, leading
 * and trailing space, runs of space, curly quotes, a full stop at the end — and
 * strict about everything else, because "postgres" and "postgre" are different
 * answers. `NFKC` folds the wide/fancy forms a phone keyboard produces.
 */
export function normaliseAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.;]+$/, '')
    .toLowerCase();
}

/** Is a typed answer one of the accepted answers for this question? */
export function answerMatches(
  value: string | null | undefined,
  accepted: readonly string[],
): boolean {
  if (value == null) return false;

  const normalised = normaliseAnswer(value);
  if (normalised === '') return false;

  return accepted.some((option) => normaliseAnswer(option) === normalised);
}
