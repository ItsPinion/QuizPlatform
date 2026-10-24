import { randomUUID } from 'node:crypto';

import { and, asc, count, desc, eq, gt, gte, inArray, like, lt, max, or, sql } from 'drizzle-orm';

import type {
  AttemptSession,
  SaveAnswerInput,
  SaveAnswerResponse,
  StartAttemptResponse,
  StudentQuiz,
  StudentQuizDetailResponse,
  StudentQuizListQuery,
  StudentQuizListResponse,
} from '@quiz/shared/attempt';
import {
  DURATION_BUCKETS,
  orderedBy,
  parseIdOrder,
  questionOrderFor,
  secondsRemaining,
  startDecision,
} from '@quiz/shared/attempt';
import { availabilityOf } from '@quiz/shared/availability';
import {
  hidesOptionsWhileRunning,
  isMultiSelect,
  type QuestionType,
} from '@quiz/shared/question-type';
import type { CategoryOption } from '@quiz/shared/quiz';
import { db, schema } from '@quiz/db';

import { ApiError } from './errors';
import { expireStaleAttempts, getAttemptResult } from './submissions';

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
    availableFrom: Date | null;
    availableUntil: Date | null;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    negativeMarks: number;
    certificateEnabled: boolean;
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
      availableFrom: row.availableFrom ? row.availableFrom.toISOString() : null,
      availableUntil: row.availableUntil ? row.availableUntil.toISOString() : null,
      availability: availabilityOf({
        availableFrom: row.availableFrom,
        availableUntil: row.availableUntil,
      }).state,
      negativeMarks: Number(row.negativeMarks ?? 0),
      certificateEnabled: Boolean(row.certificateEnabled),
      shuffleQuestions: Boolean(row.shuffleQuestions),
      shuffleOptions: Boolean(row.shuffleOptions),
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
  availableFrom: quizzes.availableFrom,
  availableUntil: quizzes.availableUntil,
  shuffleQuestions: quizzes.shuffleQuestions,
  shuffleOptions: quizzes.shuffleOptions,
  negativeMarks: quizzes.negativeMarks,
  certificateEnabled: quizzes.certificateEnabled,
} as const;

function filtersFor(query: StudentQuizListQuery) {
  const clauses = [PUBLISHED];

  if (query.search) {
    // Title *or* category: the spec asks for both, and a student who types
    // "react" should find the React quiz by either route.
    const pattern = `%${query.search}%`;
    const match = or(like(quizzes.title, pattern), like(categories.name, pattern));
    if (match) clauses.push(match);
  }

  if (query.categoryId) clauses.push(eq(quizzes.categoryId, query.categoryId));
  if (query.difficulty) clauses.push(eq(quizzes.difficulty, query.difficulty));

  // Duration buckets are inclusive at the floor and exclusive at the ceiling, so
  // the three ranges partition the catalogue with no quiz counted twice.
  if (query.duration !== 'ANY') {
    const bucket = DURATION_BUCKETS[query.duration];
    clauses.push(gte(quizzes.durationMinutes, bucket.min));
    if (bucket.max !== null) clauses.push(lt(quizzes.durationMinutes, bucket.max));
  }

  return and(...clauses);
}

/**
 * Order the catalogue.
 *
 * `popular` counts attempts across everyone, which is the only measure that
 * means anything to a visitor with no history of their own. Ties fall back to
 * newest so the order is stable rather than arbitrary.
 */
function orderFor(sort: StudentQuizListQuery['sort']) {
  switch (sort) {
    case 'title':
      return asc(quizzes.title);
    case 'duration':
      return asc(quizzes.durationMinutes);
    case 'popular':
      // A correlated count rather than a join: joining attempts would multiply
      // the quiz rows and break LIMIT. The subquery costs one index hit per row.
      return desc(
        sql<number>`(select count(*) from attempts where attempts.quiz_id = ${quizzes.id})`,
      );
    default:
      return desc(quizzes.createdAt);
  }
}

export async function listStudentQuizzes(
  query: StudentQuizListQuery,
  userId: string,
): Promise<StudentQuizListResponse> {
  // Grade anything this student let run out before reading their aggregates,
  // so "best score" and "attempts used" include the attempt the clock ended.
  await expireStaleAttempts(userId);

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
    db
      .select({ value: count() })
      .from(quizzes)
      .innerJoin(categories, eq(categories.id, quizzes.categoryId))
      .where(where),
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
      duration: query.duration,
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

  const decision = startDecision({
    status: 'PUBLISHED',
    ...quiz,
    availableFrom: quiz.availableFrom,
    availableUntil: quiz.availableUntil,
  });

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
  await expireStaleAttempts(userId);

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
  // A dead attempt must be graded before the rules are applied, otherwise it
  // would still look live and be "resumed" with no time left on it.
  await expireStaleAttempts(userId);

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

  const decision = startDecision({
    status: 'PUBLISHED',
    ...quiz,
    availableFrom: quiz.availableFrom,
    availableUntil: quiz.availableUntil,
  });

  if (!decision.allowed) {
    throw new ApiError(
      409,
      decision.code ?? 'ATTEMPT_BLOCKED',
      decision.message ?? 'Cannot start.',
    );
  }

  // Deal the paper once, here, and keep it. Everything the student later sees
  // reads this snapshot, so a refresh cannot reshuffle the questions under them.
  const [questionIds, optionIds] = await Promise.all([
    db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.quizId, quiz.id))
      .orderBy(asc(questions.position), asc(questions.createdAt)),
    db
      .select({ id: options.id })
      .from(options)
      .innerJoin(questions, eq(questions.id, options.questionId))
      .where(eq(questions.quizId, quiz.id))
      .orderBy(asc(options.position), asc(options.optionText)),
  ]);

  const questionOrder = questionOrderFor(
    questionIds.map((row) => row.id),
    quiz.shuffleQuestions,
  );
  const optionOrder = questionOrderFor(
    optionIds.map((row) => row.id),
    quiz.shuffleOptions,
  );

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
    questionOrder: questionOrder ? JSON.stringify(questionOrder) : null,
    optionOrder: optionOrder ? JSON.stringify(optionOrder) : null,
    negativeMarks: quiz.negativeMarks,
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
      questionOrder: attempts.questionOrder,
      optionOrder: attempts.optionOrder,
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
 * no explanation, no marks keyed to correctness. Once the paper is graded the
 * attempt carries a `result` summary (score, counts, pass/fail) and still no
 * answer key; correctness per question is the Day 9 review.
 */
export async function getAttemptSession(
  attemptId: string,
  userId: string,
): Promise<AttemptSession> {
  // Reaching this route is itself a chance to settle an attempt the clock ended.
  await expireStaleAttempts(userId);

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
      type: questions.type,
      questionText: questions.questionText,
      marks: questions.marks,
      difficulty: questions.difficulty,
      imageUrl: questions.imageUrl,
      codeSnippet: questions.codeSnippet,
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
      .select({
        questionId: answers.questionId,
        selectedOptionId: answers.selectedOptionId,
        selectedOptionIds: answers.selectedOptionIds,
        answerText: answers.answerText,
      })
      .from(answers)
      .where(eq(answers.attemptId, attemptId)),
  ]);

  // A shuffled paper is presented in the order frozen when it was dealt. A
  // question added after the start still appears — at the end, so the student's
  // place on the questions they already saw does not move.
  const questionOrder = parseIdOrder(attempt.questionOrder);
  const optionOrder = parseIdOrder(attempt.optionOrder);

  const presentedQuestions = orderedBy(questionRows, questionOrder);
  const presentedOptions = orderedBy(optionRows, optionOrder);

  const now = new Date();
  const finished = attempt.status !== 'IN_PROGRESS';
  const remaining = finished ? 0 : secondsRemaining(attempt.expiresAt, now.getTime());

  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      expiresAt: attempt.expiresAt.toISOString(),
      secondsRemaining: remaining,
      // A graded attempt is not "expired" in the UI sense — it is finished, and
      // `result.autoSubmitted` says whether the clock ended it.
      expired: !finished && remaining === 0,
      result: finished ? await getAttemptResult(attemptId, userId) : null,
      serverNow: now.toISOString(),
    },
    quiz: {
      id: quizRow.id,
      title: quizRow.title,
      slug: quizRow.slug,
      description: quizRow.description,
      durationMinutes: quizRow.durationMinutes,
      passingScore: quizRow.passingScore,
      questionCount: presentedQuestions.length,
      totalMarks: Number(attempt.totalMarks),
    },
    questions: presentedQuestions.map((question) => {
      const type = question.type as QuestionType;

      return {
        id: question.id,
        position: question.position,
        type,
        questionText: question.questionText,
        marks: question.marks,
        difficulty: question.difficulty,
        imageUrl: question.imageUrl,
        codeSnippet: question.codeSnippet,
        // The accepted answers *are* the answer key on a fill-in-the-blank, so a
        // running attempt is sent none of them (§27: the browser is never told
        // what is correct).
        options: hidesOptionsWhileRunning(type)
          ? []
          : presentedOptions
              .filter((option) => option.questionId === question.id)
              .map((option) => ({ id: option.id, text: option.text, position: option.position })),
      };
    }),
    answers: answerRows.map((row) => ({
      questionId: row.questionId,
      selectedOptionId: row.selectedOptionId,
      selectedOptionIds: parseIdOrder(row.selectedOptionIds),
      answerText: row.answerText,
    })),
  };
}

/**
 * Save (or clear) one answer.
 *
 * `PATCH`-like semantics with a full body, one question at a time: the attempt
 * screen writes as the student clicks, so a closed tab loses at most one
 * selection. Nothing is graded here — `is_correct` stays null until submission.
 *
 * The shape of the body is checked against the question's format (§10): a
 * multiple-answer question takes a set, a fill-in-the-blank takes text, and the
 * single-answer formats take one option. Sending the wrong shape is a `422`
 * rather than a silently ignored field.
 */
export async function saveAnswer(
  attemptId: string,
  questionId: string,
  input: SaveAnswerInput,
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
    .select({
      id: questions.id,
      quizId: questions.quizId,
      type: questions.type,
    })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);

  if (!question || question.quizId !== attempt.quizId) {
    throw new ApiError(422, 'QUESTION_NOT_FOUND', 'That question is not part of this attempt.');
  }

  const type = question.type as QuestionType;
  const shape = answerShape(input);

  const expected =
    type === 'FILL_BLANK' ? 'answerText' : isMultiSelect(type) ? 'optionIds' : 'optionId';

  if (shape !== expected) {
    throw new ApiError(
      422,
      'ANSWER_SHAPE_MISMATCH',
      type === 'FILL_BLANK'
        ? 'This question takes a typed answer.'
        : isMultiSelect(type)
          ? 'This question takes more than one option.'
          : 'This question takes a single option.',
    );
  }

  const optionIds = input.optionIds ?? (input.optionId ? [input.optionId] : []);

  if (optionIds.length > 0) {
    const rows = await db
      .select({ id: options.id, questionId: options.questionId })
      .from(options)
      .where(inArray(options.id, optionIds));

    if (rows.length !== optionIds.length || rows.some((row) => row.questionId !== questionId)) {
      throw new ApiError(422, 'OPTION_NOT_FOUND', 'That option does not belong to this question.');
    }
  }

  const selectedOptionId = isMultiSelect(type) ? null : (optionIds[0] ?? null);
  const selectedOptionIds = isMultiSelect(type) ? optionIds : [];
  const answerText =
    type === 'FILL_BLANK'
      ? input.answerText == null || input.answerText.trim() === ''
        ? null
        : input.answerText.trim()
      : null;

  const [existing] = await db
    .select({ id: answers.id })
    .from(answers)
    .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId)))
    .limit(1);

  const values = {
    selectedOptionId,
    selectedOptionIds: selectedOptionIds.length > 0 ? JSON.stringify(selectedOptionIds) : null,
    answerText,
    // Stamped by the grader on submission; never trusted from the client.
    isCorrect: null,
  };

  if (existing) {
    await db.update(answers).set(values).where(eq(answers.id, existing.id));
  } else {
    await db.insert(answers).values({ id: randomUUID(), attemptId, questionId, ...values });
  }

  const [answered] = await db
    .select({ value: count() })
    .from(answers)
    .where(
      and(
        eq(answers.attemptId, attemptId),
        // An answer counts as given when it holds a choice *or* typed text.
        sql`(${answers.selectedOptionId} is not null or ${answers.selectedOptionIds} is not null or (${answers.answerText} is not null and trim(${answers.answerText}) <> ''))`,
      ),
    );

  const totalRows = await db
    .select({ value: count() })
    .from(questions)
    .where(eq(questions.quizId, attempt.quizId));

  const total = totalRows[0]?.value ?? 0;

  const answeredCount = Number(answered?.value ?? 0);

  return {
    answer: { questionId, selectedOptionId, selectedOptionIds, answerText },
    progress: {
      answered: answeredCount,
      unanswered: Math.max(0, Number(total) - answeredCount),
      total: Number(total),
    },
  };
}

/** Which of the three answer shapes the body used. */
function answerShape(input: SaveAnswerInput): 'optionId' | 'optionIds' | 'answerText' {
  if (input.answerText !== undefined) return 'answerText';
  if (input.optionIds !== undefined) return 'optionIds';
  return 'optionId';
}
