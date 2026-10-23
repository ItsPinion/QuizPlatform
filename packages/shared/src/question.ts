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

/* -------------------------------------------------------------------------- */
/*  Limits                                                                    */
/* -------------------------------------------------------------------------- */

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_MARKS = 10;

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

export const questionInputSchema = z
  .object({
    questionText: questionTextField,
    explanation: explanationField,
    marks: marksField.default(1),
    difficulty: difficultySchema.default('MEDIUM'),
    options: z
      .array(questionOptionInputSchema)
      .min(MIN_OPTIONS, `Add at least ${MIN_OPTIONS} options`)
      .max(MAX_OPTIONS, `Use at most ${MAX_OPTIONS} options`),
    /** Index into `options`, not an id: the correct answer is one of the option slots. */
    correctIndex: z.coerce.number().int('Choose the correct option').min(0),
  })
  .refine((value) => value.correctIndex < value.options.length, {
    message: 'Choose the correct option',
    path: ['correctIndex'],
  })
  .refine(
    (value) =>
      new Set(value.options.map((option) => option.text.trim().toLowerCase())).size ===
      value.options.length,
    { message: 'Options must be different from each other', path: ['options'] },
  );
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
  questionText: z.string(),
  explanation: z.string().nullable(),
  marks: z.number(),
  difficulty: difficultySchema,
  position: z.number(),
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
