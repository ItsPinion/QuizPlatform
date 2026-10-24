import { randomUUID } from 'node:crypto';

import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';

import type { AdminQuestion, QuestionInput, QuestionListResponse } from '@quiz/shared/question';
import { resolveQuestionInput } from '@quiz/shared/question';
import type { QuestionType } from '@quiz/shared/question-type';
import type { ImportQuestion } from '@quiz/shared/import';
import { db, schema } from '@quiz/db';

import { ApiError } from './errors';

const { answers, options, questions, quizzes } = schema;

type QuestionRow = typeof questions.$inferSelect;
type OptionRow = typeof options.$inferSelect;

/**
 * Hydrate questions with their options and answer counts in two extra queries
 * rather than one per question: the console loads a whole quiz at once.
 */
async function hydrate(rows: QuestionRow[]): Promise<AdminQuestion[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [optionRows, answerRows] = await Promise.all([
    db
      .select()
      .from(options)
      .where(inArray(options.questionId, ids))
      .orderBy(asc(options.position), asc(options.optionText)),
    db
      .select({ questionId: answers.questionId, value: count() })
      .from(answers)
      .where(inArray(answers.questionId, ids))
      .groupBy(answers.questionId),
  ]);

  const answersByQuestion = new Map(answerRows.map((row) => [row.questionId, Number(row.value)]));

  return rows.map((row) => toAdminQuestion(row, optionRows, answersByQuestion.get(row.id) ?? 0));
}

function toAdminQuestion(
  row: QuestionRow,
  optionRows: OptionRow[],
  answerCount: number,
): AdminQuestion {
  return {
    id: row.id,
    quizId: row.quizId,
    type: row.type as QuestionType,
    questionText: row.questionText,
    explanation: row.explanation,
    imageUrl: row.imageUrl,
    codeSnippet: row.codeSnippet,
    marks: row.marks,
    difficulty: row.difficulty,
    position: row.position,
    options: optionRows
      .filter((option) => option.questionId === row.id)
      .map((option) => ({
        id: option.id,
        text: option.optionText,
        isCorrect: Boolean(option.isCorrect),
        position: option.position,
      })),
    answerCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireQuiz(quizId: string) {
  const [row] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      slug: quizzes.slug,
      status: quizzes.status,
      durationMinutes: quizzes.durationMinutes,
    })
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!row) throw new ApiError(404, 'QUIZ_NOT_FOUND', 'No quiz with that id exists.');
  return row;
}

async function questionRow(id: string): Promise<QuestionRow> {
  const [row] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);

  if (!row) throw new ApiError(404, 'QUESTION_NOT_FOUND', 'No question with that id exists.');
  return row;
}

export async function listQuestions(quizId: string): Promise<QuestionListResponse> {
  const quiz = await requireQuiz(quizId);

  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId))
    .orderBy(asc(questions.position), asc(questions.createdAt));

  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      slug: quiz.slug,
      status: quiz.status,
      durationMinutes: quiz.durationMinutes,
    },
    questions: await hydrate(rows),
  };
}

export async function getQuestion(id: string): Promise<AdminQuestion> {
  const row = await questionRow(id);
  return (await hydrate([row]))[0] as AdminQuestion;
}

/**
 * Write an option set for a question.
 *
 * Options are reconciled by id, which is what keeps past answers intact: an
 * option that already existed is updated in place (same id, same
 * `selected_option_id` in every recorded answer), a new one is inserted, and a
 * missing one is deleted — unless someone has already picked it, in which case
 * the whole write is refused rather than blanking their answer.
 */
async function writeOptions(questionId: string, input: QuestionInput): Promise<void> {
  const resolved = resolveQuestionInput(input);
  const existing = await db.select().from(options).where(eq(options.questionId, questionId));

  const sentIds = input.options
    .map((option) => option.id)
    .filter((id): id is string => Boolean(id));

  // A true/false question writes its own pair, so the ids of the stored rows are
  // the ones to keep — the form never sends ids for it.
  const keptIds = resolved.type === 'TRUE_FALSE' ? existing.map((row) => row.id) : sentIds;

  const foreign = sentIds.filter((id) => !existing.some((row) => row.id === id));

  if (foreign.length > 0) {
    throw new ApiError(
      422,
      'OPTION_NOT_FOUND',
      'One of those options does not belong to this question.',
    );
  }

  const removed = existing.filter((row) => !keptIds.includes(row.id));

  if (removed.length > 0) {
    const used = await db
      .select({ optionId: answers.selectedOptionId })
      .from(answers)
      .where(
        inArray(
          answers.selectedOptionId,
          removed.map((row) => row.id),
        ),
      )
      .limit(1);

    if (used.length > 0) {
      throw new ApiError(
        409,
        'OPTION_HAS_ANSWERS',
        'A student has already chosen one of the options you removed. Keep it, or delete the question instead.',
      );
    }

    await db.delete(options).where(
      inArray(
        options.id,
        removed.map((row) => row.id),
      ),
    );
  }

  for (const [index, text] of resolved.options.entries()) {
    const isCorrect = resolved.correctIndexes.includes(index);
    const existingRow =
      resolved.type === 'TRUE_FALSE'
        ? existing[index]
        : existing.find((row) => row.id === sentIds[index]);

    if (existingRow) {
      await db
        .update(options)
        .set({ optionText: text, isCorrect, position: index })
        .where(eq(options.id, existingRow.id));
      continue;
    }

    await db.insert(options).values({
      id: randomUUID(),
      questionId,
      optionText: text,
      isCorrect,
      position: index,
    });
  }
}

export async function createQuestion(quizId: string, input: QuestionInput): Promise<AdminQuestion> {
  await requireQuiz(quizId);

  const rows = await db
    .select({ nextPosition: sql<number>`coalesce(max(${questions.position}), -1) + 1` })
    .from(questions)
    .where(eq(questions.quizId, quizId));

  const nextPosition = rows[0]?.nextPosition ?? 0;

  const id = randomUUID();

  await db.insert(questions).values({
    id,
    quizId,
    type: input.type ?? 'MCQ',
    questionText: input.questionText,
    explanation: input.explanation,
    marks: input.marks,
    difficulty: input.difficulty,
    imageUrl: input.imageUrl ?? null,
    codeSnippet: input.codeSnippet ?? null,
    position: Number(nextPosition),
  });

  await writeOptions(id, input);

  return getQuestion(id);
}

/**
 * Editing is a full replace (`PUT`), not a partial update.
 *
 * The reason is structural: an options array plus the correct index is only
 * consistent as a set. A partial patch could remove the correct option while
 * leaving the index alone, producing a question nobody can pass.
 *
 * The **format is not editable**. Everything else may change — the text, the
 * options, the marks, the media — but a question that was a set yesterday and a
 * typed answer today would make two students' reviews of the same question read
 * differently. The console disables the picker; this is the rule it is disabling
 * it for, and it is enforced here rather than trusted to the form.
 */
export async function replaceQuestion(id: string, input: QuestionInput): Promise<AdminQuestion> {
  const existing = await questionRow(id);
  const type = input.type ?? 'MCQ';

  if (type !== existing.type) {
    throw new ApiError(
      422,
      'QUESTION_TYPE_IMMUTABLE',
      'A question keeps the format it was created with. Delete it and write a new one instead.',
    );
  }

  await db
    .update(questions)
    .set({
      type,
      questionText: input.questionText,
      explanation: input.explanation,
      marks: input.marks,
      difficulty: input.difficulty,
      imageUrl: input.imageUrl ?? null,
      codeSnippet: input.codeSnippet ?? null,
    })
    .where(eq(questions.id, id));

  await writeOptions(id, input);

  return getQuestion(id);
}

/**
 * Deleting is refused in two situations, both about keeping the platform
 * coherent rather than protecting the admin from themselves:
 *
 * - the question has been answered (`409 QUESTION_HAS_ANSWERS`) — it is part of
 *   someone's result;
 * - it is the last question of a **published** quiz
 *   (`409 QUIZ_WOULD_HAVE_NO_QUESTIONS`) — a live quiz with nothing to ask is
 *   exactly what the publish rule forbids.
 */
export async function deleteQuestion(id: string): Promise<void> {
  const row = await questionRow(id);

  const [answerRow] = await db
    .select({ value: count() })
    .from(answers)
    .where(eq(answers.questionId, id));

  const answerCount = Number(answerRow?.value ?? 0);

  if (answerCount > 0) {
    throw new ApiError(
      409,
      'QUESTION_HAS_ANSWERS',
      `This question has ${answerCount} recorded answer${answerCount === 1 ? '' : 's'} and cannot be deleted.`,
    );
  }

  const quiz = await requireQuiz(row.quizId);

  const [countRow] = await db
    .select({ value: count() })
    .from(questions)
    .where(eq(questions.quizId, row.quizId));

  if (quiz.status === 'PUBLISHED' && Number(countRow?.value ?? 0) <= 1) {
    throw new ApiError(
      409,
      'QUIZ_WOULD_HAVE_NO_QUESTIONS',
      'This is the last question on a published quiz. Unpublish the quiz first, or add another question.',
    );
  }

  await db.delete(questions).where(eq(questions.id, id));

  // Close the gap so positions stay 0..n-1; the order endpoint relies on it.
  const remaining = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.quizId, row.quizId))
    .orderBy(asc(questions.position));

  await applyOrder(remaining.map((remainingRow) => remainingRow.id));
}

async function applyOrder(ids: string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    await db.update(questions).set({ position: index }).where(eq(questions.id, id));
  }
}

/**
 * Reorder a quiz's questions.
 *
 * The client sends the complete new order. A partial list would leave the
 * positions of the omitted questions ambiguous, so anything that is not an
 * exact permutation of this quiz's questions is rejected.
 */
export async function reorderQuestions(quizId: string, ids: string[]): Promise<AdminQuestion[]> {
  await requireQuiz(quizId);

  const rows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.quizId, quizId));

  const current = new Set(rows.map((row) => row.id));
  const sent = new Set(ids);

  if (
    sent.size !== ids.length ||
    current.size !== sent.size ||
    ids.some((id) => !current.has(id))
  ) {
    throw new ApiError(
      422,
      'QUESTION_ORDER_MISMATCH',
      'Send every question of this quiz exactly once, in the new order.',
    );
  }

  await applyOrder(ids);

  return (await listQuestions(quizId)).questions;
}

/** Used by the quiz detail screen: how many of a quiz's questions are answered. */
export async function countAnsweredQuestions(quizId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(answers)
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .where(and(eq(questions.quizId, quizId)));

  return Number(row?.value ?? 0);
}

/**
 * Append a batch of questions parsed from a CSV file.
 *
 * Reuses `createQuestion` rather than inserting in bulk so imported questions go
 * through exactly the same path as typed ones: position appended, options
 * written with the right flags, and the same validation already applied by
 * `parseQuestionImport`. A 200-row file is 200 small writes — slower than one
 * multi-row insert, and far more important that an import cannot bypass a rule
 * the form enforces.
 *
 * The parser has already resolved each row into what the format means — the
 * `True`/`False` pair for a true/false row, the accepted-answer list for a
 * fill-in-the-blank one — so nothing format-specific is decided here.
 */
export async function importQuestions(
  quizId: string,
  rows: readonly ImportQuestion[],
): Promise<{ created: string[] }> {
  await requireQuiz(quizId);

  const created: string[] = [];

  for (const row of rows) {
    const question = await createQuestion(quizId, {
      type: row.type,
      imageUrl: row.imageUrl,
      codeSnippet: row.codeSnippet,
      questionText: row.questionText,
      explanation: row.explanation,
      marks: row.marks,
      difficulty: row.difficulty,
      // `TRUE_FALSE` writes its own pair, and `createQuestion` rejects options it
      // was not expecting, so a true/false row sends none.
      options: row.type === 'TRUE_FALSE' ? [] : row.options.map((text) => ({ text })),
      correctIndex: row.correctIndexes[0] ?? 0,
      correctIndexes: row.correctIndexes,
    });

    created.push(question.id);
  }

  return { created };
}
