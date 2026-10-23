import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { ATTEMPT_STATUSES, DIFFICULTIES, QUIZ_STATUSES, ROLES, USER_STATUSES } from '@quiz/shared';

/** Milliseconds since epoch, used for every timestamp column. */
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date());

/* -------------------------------------------------------------------------- */
/*  users                                                                     */
/* -------------------------------------------------------------------------- */

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name', { length: 120 }).notNull(),
    email: text('email', { length: 254 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ROLES }).notNull().default('STUDENT'),
    status: text('status', { enum: USER_STATUSES }).notNull().default('ACTIVE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    index('users_role_idx').on(table.role),
    index('users_status_idx').on(table.status),
  ],
);

/* -------------------------------------------------------------------------- */
/*  categories                                                                */
/* -------------------------------------------------------------------------- */

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name', { length: 80 }).notNull(),
    slug: text('slug', { length: 80 }).notNull(),
    description: text('description', { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('categories_name_unique').on(table.name),
    uniqueIndex('categories_slug_unique').on(table.slug),
  ],
);

/* -------------------------------------------------------------------------- */
/*  quizzes                                                                   */
/* -------------------------------------------------------------------------- */

export const quizzes = sqliteTable(
  'quizzes',
  {
    id: text('id').primaryKey(),
    title: text('title', { length: 160 }).notNull(),
    slug: text('slug', { length: 180 }).notNull(),
    description: text('description', { length: 2000 }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    difficulty: text('difficulty', { enum: DIFFICULTIES }).notNull().default('MEDIUM'),
    /** Duration in minutes; drives the server-validated attempt timer. */
    durationMinutes: integer('duration_minutes').notNull().default(20),
    /** Passing percentage, 0–100. */
    passingScore: integer('passing_score').notNull().default(60),
    maxAttempts: integer('max_attempts').notNull().default(2),
    status: text('status', { enum: QUIZ_STATUSES }).notNull().default('DRAFT'),
    thumbnailUrl: text('thumbnail_url'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('quizzes_slug_unique').on(table.slug),
    index('quizzes_category_idx').on(table.categoryId),
    index('quizzes_status_idx').on(table.status),
    index('quizzes_difficulty_idx').on(table.difficulty),
  ],
);

/* -------------------------------------------------------------------------- */
/*  questions & options                                                       */
/* -------------------------------------------------------------------------- */

export const questions = sqliteTable(
  'questions',
  {
    id: text('id').primaryKey(),
    quizId: text('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    questionText: text('question_text', { length: 2000 }).notNull(),
    explanation: text('explanation', { length: 2000 }),
    marks: integer('marks').notNull().default(1),
    difficulty: text('difficulty', { enum: DIFFICULTIES }).notNull().default('MEDIUM'),
    /** Display order inside the quiz. */
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('questions_quiz_idx').on(table.quizId),
    index('questions_position_idx').on(table.quizId, table.position),
  ],
);

export const options = sqliteTable(
  'options',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    optionText: text('option_text', { length: 1000 }).notNull(),
    isCorrect: integer('is_correct', { mode: 'boolean' }).notNull().default(false),
    position: integer('position').notNull().default(0),
  },
  (table) => [index('options_question_idx').on(table.questionId)],
);

/* -------------------------------------------------------------------------- */
/*  attempts & answers                                                        */
/* -------------------------------------------------------------------------- */

export const attempts = sqliteTable(
  'attempts',
  {
    id: text('id').primaryKey(),
    quizId: text('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Server-calculated score: obtained marks. */
    score: integer('score').notNull().default(0),
    totalMarks: integer('total_marks').notNull().default(0),
    /** 0–100, rounded to 2 decimals. */
    percentage: real('percentage').notNull().default(0),
    correctAnswers: integer('correct_answers').notNull().default(0),
    incorrectAnswers: integer('incorrect_answers').notNull().default(0),
    unanswered: integer('unanswered').notNull().default(0),
    timeTakenSeconds: integer('time_taken_seconds').notNull().default(0),
    status: text('status', { enum: ATTEMPT_STATUSES }).notNull().default('IN_PROGRESS'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    /** Server-enforced deadline: startedAt + quiz duration. */
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('attempts_user_idx').on(table.userId),
    index('attempts_quiz_idx').on(table.quizId),
    index('attempts_status_idx').on(table.status),
  ],
);

export const answers = sqliteTable(
  'answers',
  {
    id: text('id').primaryKey(),
    attemptId: text('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'cascade' }),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    selectedOptionId: text('selected_option_id').references(() => options.id, {
      onDelete: 'set null',
    }),
    /** Null while the attempt is in progress; set when the backend grades it. */
    isCorrect: integer('is_correct', { mode: 'boolean' }),
  },
  (table) => [
    uniqueIndex('answers_attempt_question_unique').on(table.attemptId, table.questionId),
    index('answers_attempt_idx').on(table.attemptId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  relations                                                                 */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  attempts: many(attempts),
  createdQuizzes: many(quizzes),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  quizzes: many(quizzes),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  category: one(categories, { fields: [quizzes.categoryId], references: [categories.id] }),
  author: one(users, { fields: [quizzes.createdBy], references: [users.id] }),
  questions: many(questions),
  attempts: many(attempts),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  quiz: one(quizzes, { fields: [questions.quizId], references: [quizzes.id] }),
  options: many(options),
  answers: many(answers),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  question: one(questions, { fields: [options.questionId], references: [questions.id] }),
}));

export const attemptsRelations = relations(attempts, ({ one, many }) => ({
  quiz: one(quizzes, { fields: [attempts.quizId], references: [quizzes.id] }),
  user: one(users, { fields: [attempts.userId], references: [users.id] }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  attempt: one(attempts, { fields: [answers.attemptId], references: [attempts.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
  selectedOption: one(options, { fields: [answers.selectedOptionId], references: [options.id] }),
}));

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                            */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type Option = typeof options.$inferSelect;
export type NewOption = typeof options.$inferInsert;
export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
