/**
 * Question authoring contracts (Day 6).
 *
 * A question is always multiple choice with **exactly one** correct option — the
 * spec's initial question type. Options are sent as an ordered array plus the
 * index of the correct one, because "which of these is right" is a property of
 * the set, not of a lone row: validating them together makes an inconsistent
 * question (zero or two correct answers) impossible to express.
 */
import { z } from 'zod';

import { difficultySchema, quizStatusSchema } from './index';
import {
  QUESTION_TYPES,
  questionTypeSchema,
  TRUE_FALSE_OPTIONS,
  type QuestionType,
} from './question-type';

/* -------------------------------------------------------------------------- */
/*  Limits                                                                    */
/* -------------------------------------------------------------------------- */

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_MARKS = 10;
/** A fill-in-the-blank question needs at least one accepted spelling. */
export const MIN_ACCEPTED_ANSWERS = 1;
export const MAX_ANSWER_TEXT = 1000;
export const MAX_IMAGE_URL = 1000;
export const MAX_CODE_SNIPPET = 4000;

const questionTextField = z
  .string()
  .trim()
  .min(5, 'Question must be at least 5 characters')
  .max(2000, 'Question must be at most 2000 characters');

const explanationField = z
  .string()
  .trim()
  .max(2000, 'Explanation must be at most 2000 characters')
  .nullish()
  .transform((value) => (value == null || value === '' ? null : value));

const optionTextField = z
  .string()
  .trim()
  .min(1, 'Option text is required')
  .max(1000, 'Option must be at most 1000 characters');

const marksField = z.coerce
  .number()
  .int('Use whole marks')
  .min(1, 'Marks must be at least 1')
  .max(MAX_MARKS, `Marks must be at most ${MAX_MARKS}`);

/* -------------------------------------------------------------------------- */
/*  Input                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * An option being written.
 *
 * `id` is present when the option already exists. The server reconciles by id:
 * it updates the ones it is given, inserts the ones without ids and deletes the
 * ones that are missing — but refuses to delete an option a student has already
 * picked, because that would blank out a past answer.
 */
export const questionOptionInputSchema = z.object({
  id: z.string().uuid('Invalid option id').optional(),
  text: optionTextField,
});
export type QuestionOptionInput = z.infer<typeof questionOptionInputSchema>;

const imageUrlField = z
  .string()
  .trim()
  .max(MAX_IMAGE_URL, `Image URL must be at most ${MAX_IMAGE_URL} characters`)
  .url('Enter a full image URL, including https://')
  .nullish()
  .transform((value) => (value == null || value === '' ? null : value));

const codeSnippetField = z
  .string()
  .max(MAX_CODE_SNIPPET, `Code must be at most ${MAX_CODE_SNIPPET} characters`)
  .nullish()
  .transform((value) => (value == null || value.trim() === '' ? null : value));

/**
 * The authoring payload.
 *
 * `type` decides what the rest of the object means, and the refinements at the
 * bottom are where that meaning is enforced: a `MULTI` question needs two or
 * more correct options, a `FILL_BLANK` question needs at least one accepted
 * answer and no correct index (every listed answer *is* correct), and a
 * `TRUE_FALSE` question may omit its options entirely because the server writes
 * `True`/`False` itself.
 */
const questionBase = z.object({
  type: questionTypeSchema.default('MCQ'),
  questionText: questionTextField,
  explanation: explanationField,
  marks: marksField.default(1),
  difficulty: difficultySchema.default('MEDIUM'),
  /** Rendered above the options. Presentation, not grading. */
  imageUrl: imageUrlField,
  /** Rendered in a monospace block above the options. Presentation, not grading. */
  codeSnippet: codeSnippetField,
  options: z
    .array(questionOptionInputSchema)
    .max(MAX_OPTIONS, `Use at most ${MAX_OPTIONS} options`)
    .default([]),
  /** Index into `options`, not an id: single-answer types pick one slot. */
  correctIndex: z.coerce.number().int('Choose the correct option').min(0).default(0),
  /** Indices into `options`; required for `MULTI`, ignored otherwise. */
  correctIndexes: z.array(z.coerce.number().int().min(0)).optional(),
});

export const questionInputSchema = questionBase.superRefine((value, ctx) => {
  const texts = value.options.map((option) => option.text.trim().toLowerCase());
  const distinct = new Set(texts).size === texts.length;

  if (value.type === 'FILL_BLANK') {
    if (value.options.length < MIN_ACCEPTED_ANSWERS) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'List at least one accepted answer.',
      });
    }

    if (!distinct) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Accepted answers must be different from each other',
      });
    }

    return;
  }

  if (value.type === 'TRUE_FALSE') {
    if (value.options.length !== 0 && value.options.length !== TRUE_FALSE_OPTIONS.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'A true/false question has exactly two options.',
      });
    }

    if (value.correctIndex > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctIndex'],
        message: 'Say whether the statement is true or false.',
      });
    }

    return;
  }

  if (value.options.length < MIN_OPTIONS) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: `Add at least ${MIN_OPTIONS} options`,
    });
  }

  if (!distinct) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: 'Options must be different from each other',
    });
  }

  if (value.type === 'MULTI') {
    const indexes = value.correctIndexes ?? [];

    if (indexes.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctIndexes'],
        message: 'Pick at least two correct options.',
      });
    }

    if (indexes.some((index) => index >= value.options.length)) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctIndexes'],
        message: 'Choose the correct options',
      });
    }

    if (new Set(indexes).size !== indexes.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctIndexes'],
        message: 'The same option is listed twice.',
      });
    }

    return;
  }

  if (value.correctIndex >= value.options.length) {
    ctx.addIssue({ code: 'custom', path: ['correctIndex'], message: 'Choose the correct option' });
  }
});

/**
 * The input, reduced to what the database stores.
 *
 * One function, used by create and by edit, so the two cannot disagree about
 * what a `TRUE_FALSE` question's options are. `correctIndexes` is always a
 * sorted, de-duplicated list of indices into `options` — for a single-answer
 * question that list has one entry.
 */
export function resolveQuestionInput(input: QuestionInput): {
  type: QuestionType;
  options: string[];
  correctIndexes: number[];
  imageUrl: string | null;
  codeSnippet: string | null;
} {
  const type = input.type ?? 'MCQ';
  const options =
    type === 'TRUE_FALSE'
      ? [...TRUE_FALSE_OPTIONS]
      : input.options.map((option) => option.text.trim());

  const correctIndexes =
    type === 'FILL_BLANK'
      ? options.map((_, index) => index)
      : type === 'MULTI'
        ? [...new Set(input.correctIndexes ?? [])].sort((left, right) => left - right)
        : [input.correctIndex];

  return {
    type,
    options,
    correctIndexes,
    imageUrl: input.imageUrl ?? null,
    codeSnippet: input.codeSnippet ?? null,
  };
}

export type QuestionInput = z.infer<typeof questionInputSchema>;
export type QuestionFormValues = z.input<typeof questionInputSchema>;

/** Reordering is a whole-list operation: the client sends the new order. */
export const questionOrderSchema = z.object({
  ids: z.array(z.string().uuid('Invalid question id')).min(1, 'Send at least one question'),
});
export type QuestionOrderInput = z.infer<typeof questionOrderSchema>;

/* -------------------------------------------------------------------------- */
/*  Output                                                                    */
/* -------------------------------------------------------------------------- */

export const adminOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  isCorrect: z.boolean(),
  position: z.number(),
});
export type AdminOption = z.infer<typeof adminOptionSchema>;

export const adminQuestionSchema = z.object({
  id: z.string(),
  quizId: z.string(),
  /** Absent from an older row only if the migration has not run; then `MCQ`. */
  type: questionTypeSchema.default('MCQ'),
  questionText: z.string(),
  explanation: z.string().nullable(),
  marks: z.number(),
  difficulty: difficultySchema,
  position: z.number(),
  imageUrl: z.string().nullable().default(null),
  codeSnippet: z.string().nullable().default(null),
  options: z.array(adminOptionSchema),
  /** How many recorded answers point at this question — drives the delete rule. */
  answerCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminQuestion = z.infer<typeof adminQuestionSchema>;

export const questionListResponseSchema = z.object({
  quiz: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    status: quizStatusSchema,
    durationMinutes: z.number(),
  }),
  questions: z.array(adminQuestionSchema),
});
export type QuestionListResponse = z.infer<typeof questionListResponseSchema>;

export const questionDetailResponseSchema = z.object({ question: adminQuestionSchema });
export type QuestionDetailResponse = z.infer<typeof questionDetailResponseSchema>;

export const deleteQuestionResponseSchema = z.object({ success: z.literal(true), id: z.string() });
export type DeleteQuestionResponse = z.infer<typeof deleteQuestionResponseSchema>;

/* -------------------------------------------------------------------------- */
/*  Rules the UI mirrors                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A question that has been answered is part of someone's result and can no
 * longer be deleted. Editing it is still allowed (the grade each answer carries
 * was snapshotted when it was submitted), but removing the record would leave a
 * result pointing at nothing.
 */
export function canDeleteQuestion(question: Pick<AdminQuestion, 'answerCount'>): boolean {
  return question.answerCount === 0;
}

/**
 * A published quiz must always have something to ask: deleting the final
 * question of a live quiz is refused rather than silently leaving students with
 * an empty attempt. Unpublish first, or add another question.
 */
export function canDeleteLastQuestion(
  quiz: { status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' },
  questionCount: number,
): boolean {
  return quiz.status !== 'PUBLISHED' || questionCount > 1;
}

/** Total marks on offer — what a perfect attempt is worth. */
export function totalMarks(questions: readonly { marks: number }[]): number {
  return questions.reduce((sum, question) => sum + question.marks, 0);
}
