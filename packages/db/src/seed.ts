import { randomUUID } from 'node:crypto';

import { hashPassword } from '@quiz/shared/crypto';

import { diagnoseDatabaseError, fetchRawResponse, formatDiagnosis } from './diagnostics';
import { db } from './index';
import { loadEnvFiles } from './load-env';
import { resolveDatabaseConfig } from './env';
import { certificateCode, normalizeCertificateCode } from '@quiz/shared/certificate';
import { readRuntimeMode } from '@quiz/shared/environment';
import type { QuestionType } from '@quiz/shared/question-type';
import { certificateEmail, resultEmail, welcomeEmail } from '@quiz/shared/email';

import {
  answers,
  attempts,
  categories,
  certificates,
  emailOutbox,
  options,
  passwordResetTokens,
  questions,
  quizzes,
  users,
  type NewAnswer,
  type NewAttempt,
  type NewCertificate,
  type NewEmailOutboxRow,
  type NewOption,
  type NewQuestion,
  type NewQuiz,
  type NewUser,
} from './schema';
import { categorySeeds, quizSeeds } from './seed-data';

loadEnvFiles();

const FORCE = process.argv.includes('--force');

/** Deterministic PRNG so repeated seeds produce similar dashboards. */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(42_042);

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('pick() called with an empty array');
  return item;
}

const DEMO_PASSWORD = 'Password123';
const ADMIN_PASSWORD = 'Admin12345';

interface StudentPlan {
  name: string;
  email: string;
  /** slug -> list of correctness ratios for each attempt */
  plan: Record<string, number[]>;
}

const studentPlans: StudentPlan[] = [
  {
    name: 'Rahul Verma',
    email: 'rahul@quiz.dev',
    plan: {
      'javascript-fundamentals': [0.55, 0.85],
      'react-basics': [0.9],
      'python-programming': [0.75],
      'sql-databases': [0.4],
      'html-fundamentals': [0.95],
    },
  },
  {
    name: 'Priya Nair',
    email: 'priya@quiz.dev',
    plan: {
      'css-essentials': [1],
      'react-basics': [0.85],
      'cyber-security-basics': [0.55],
      'python-programming': [0.85],
    },
  },
  {
    name: 'Amit Shah',
    email: 'amit@quiz.dev',
    plan: {
      'html-fundamentals': [0.4],
      'nodejs-rest-apis': [0.4],
      'sql-databases': [0.75],
      'python-programming': [0.45],
    },
  },
];

async function resetData() {
  console.log('▸ Resetting existing data (--force)');
  await db.delete(emailOutbox);
  await db.delete(certificates);
  await db.delete(passwordResetTokens);
  await db.delete(answers);
  await db.delete(attempts);
  await db.delete(options);
  await db.delete(questions);
  await db.delete(quizzes);
  await db.delete(categories);
  await db.delete(users);
}

async function main() {
  const config = resolveDatabaseConfig();

  /*
   * A production deployment does not get demo data unless somebody says so
   * twice.
   *
   * The seed writes fictional students, quizzes and graded attempts — useful to
   * look at a laptop, wrong in a real database. `--force` is already the "I mean
   * it" flag, so it doubles as the override here rather than inventing another.
   */
  const mode = readRuntimeMode({
    ENV_NODE: process.env.ENV_NODE,
    NODE_ENV: process.env.NODE_ENV,
  }).mode;

  if (mode === 'production' && config.target === 'turso' && !FORCE) {
    console.error(
      `✖ Refusing to seed demo data into ${config.urlHint}: this environment is production (ENV_NODE is unset).\n` +
        '  A showcase deployment should set ENV_NODE=demo. To seed this database deliberately, re-run with --force.',
    );
    process.exit(1);
  }

  console.log(`▸ Seeding ${config.urlHint} (${config.target})`);

  const existing = await db.select({ id: users.id }).from(users).limit(1);

  if (existing.length > 0) {
    if (!FORCE) {
      console.log(
        '✔ Database already contains users — skipping seed. Re-run with `bun run db:seed -- --force` to reset.',
      );
      return;
    }
    await resetData();
  }

  const now = Date.now();

  /* ------------------------------ categories ------------------------------ */
  const categoryRows = categorySeeds.map((category) => ({
    id: randomUUID(),
    ...category,
    createdAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
  }));
  await db.insert(categories).values(categoryRows);
  const categoryIdByName = new Map(categoryRows.map((row) => [row.name, row.id]));

  /* -------------------------------- users --------------------------------- */
  // Hash every account separately so each row carries its own salt.
  const [adminHash, ...demoHashes] = await Promise.all([
    hashPassword(ADMIN_PASSWORD),
    ...studentPlans.map(() => hashPassword(DEMO_PASSWORD)),
  ]);

  const admin: NewUser = {
    id: randomUUID(),
    name: 'Alex Admin',
    email: 'admin@quiz.dev',
    passwordHash: adminHash,
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
  };

  const studentRows: NewUser[] = studentPlans.map((student, index) => ({
    id: randomUUID(),
    name: student.name,
    email: student.email,
    passwordHash: demoHashes[index] ?? demoHashes[0]!,
    role: 'STUDENT',
    status: 'ACTIVE',
    // Inside the analytics window on purpose: a fresh install should show
    // registrations on the Day 11 chart, not an empty line.
    createdAt: new Date(now - (24 - index * 9) * 24 * 60 * 60 * 1000),
  }));

  await db.insert(users).values([admin, ...studentRows]);
  const studentIdByEmail = new Map(studentRows.map((row) => [row.email, row.id]));

  /* --------------------------- quizzes + questions ------------------------ */
  const quizIds = new Map<string, string>();
  const quizById = new Map<string, (typeof quizSeeds)[number]>();
  /** quiz slug -> the questions of that quiz, with their format and key */
  const questionMap = new Map<
    string,
    {
      id: string;
      marks: number;
      type: QuestionType;
      /** The key: one id on a single-answer question, the set on a `MULTI`. */
      correctOptionIds: string[];
      /** Every option id, in order — the wrong-answer pool for the simulation. */
      optionIds: string[];
      /** Accepted spellings, for a `FILL_BLANK`. */
      accepted: string[];
    }[]
  >();

  for (const [index, seed] of quizSeeds.entries()) {
    const categoryId = categoryIdByName.get(seed.category);
    if (!categoryId)
      throw new Error(`Unknown category "${seed.category}" for quiz "${seed.title}"`);

    const quizId = randomUUID();
    const createdAt = new Date(now - (50 - index * 3) * 24 * 60 * 60 * 1000);

    const quizRow: NewQuiz = {
      id: quizId,
      title: seed.title,
      slug: seed.slug,
      description: seed.description,
      categoryId,
      difficulty: seed.difficulty,
      durationMinutes: seed.durationMinutes,
      passingScore: seed.passingScore,
      maxAttempts: seed.maxAttempts,
      status: seed.status,
      createdBy: admin.id,
      createdAt,
      updatedAt: createdAt,
      // Scheduling is seeded relative to now so the demo states stay honest
      // whenever the database is rebuilt.
      availableFrom:
        seed.availableFromInDays == null
          ? null
          : new Date(now + seed.availableFromInDays * 24 * 60 * 60 * 1000),
      availableUntil:
        seed.availableUntilInDays == null
          ? null
          : new Date(now + seed.availableUntilInDays * 24 * 60 * 60 * 1000),
      shuffleQuestions: seed.shuffleQuestions ?? false,
      shuffleOptions: seed.shuffleOptions ?? false,
      negativeMarks: seed.negativeMarks ?? 0,
      certificateEnabled: seed.certificateEnabled ?? true,
    };

    const questionRows: NewQuestion[] = [];
    const optionRows: NewOption[] = [];
    const collected: {
      id: string;
      marks: number;
      type: QuestionType;
      correctOptionIds: string[];
      optionIds: string[];
      accepted: string[];
    }[] = [];

    seed.questions.forEach((question, questionIndex) => {
      const questionId = randomUUID();
      const questionMarks = question.marks ?? 1;
      const createdAtOffset = new Date(createdAt.getTime() + questionIndex * 60_000);

      const type: QuestionType = question.type ?? 'MCQ';
      const correctIndexes =
        type === 'FILL_BLANK'
          ? question.options.map((_, optionIndex) => optionIndex)
          : type === 'MULTI'
            ? (question.correctIndexes ?? [])
            : [question.correct ?? 0];

      questionRows.push({
        id: questionId,
        quizId,
        type,
        questionText: question.text,
        explanation: question.explanation,
        imageUrl: question.imageUrl ?? null,
        codeSnippet: question.codeSnippet ?? null,
        marks: questionMarks,
        difficulty: question.difficulty ?? seed.difficulty,
        position: questionIndex,
        createdAt: createdAtOffset,
        updatedAt: createdAtOffset,
      });

      const optionIds = question.options.map((optionText, optionIndex) => {
        const optionId = randomUUID();
        optionRows.push({
          id: optionId,
          questionId,
          optionText,
          isCorrect: correctIndexes.includes(optionIndex),
          position: optionIndex,
        });
        return optionId;
      });

      const correctOptionIds = correctIndexes.map((optionIndex) => optionIds[optionIndex]);
      if (correctOptionIds.some((id) => !id)) {
        throw new Error(`Invalid correct index for question "${question.text}"`);
      }

      collected.push({
        id: questionId,
        marks: questionMarks,
        type,
        correctOptionIds: correctOptionIds as string[],
        optionIds,
        accepted: question.options,
      });
    });

    await db.insert(quizzes).values(quizRow);
    await db.insert(questions).values(questionRows);
    await db.insert(options).values(optionRows);

    quizIds.set(seed.slug, quizId);
    quizById.set(quizId, seed);
    questionMap.set(seed.slug, collected);
  }

  /* ------------------------------- attempts ------------------------------- */
  const attemptRows: NewAttempt[] = [];
  const answerRows: NewAnswer[] = [];

  for (const student of studentPlans) {
    const userId = studentIdByEmail.get(student.email);
    if (!userId) throw new Error(`Missing seeded student ${student.email}`);

    const planEntries = Object.entries(student.plan);

    for (const [planIndex, [slug, ratios]] of planEntries.entries()) {
      const quizId = quizIds.get(slug);
      const quiz = quizBySlug(slug);
      const questionsForQuiz = questionMap.get(slug);
      if (!quizId || !quiz || !questionsForQuiz) continue;

      ratios.forEach((ratio, attemptIndex) => {
        // Spread attempts across the last two weeks, a different quiz every few
        // days and repeat attempts older — so the Day 10 activity chart has a
        // populated fortnight and the trend line has some movement.
        const daysAgo = Math.max(
          1,
          12 - planIndex * 3 - attemptIndex * 6 - Math.floor(random() * 3),
        );
        const startedAt = new Date(
          now - daysAgo * 24 * 60 * 60 * 1000 + Math.floor(random() * 6) * 3_600_000,
        );
        const durationMs = quiz.durationMinutes * 60_000;
        const timeTakenSeconds = Math.round((durationMs / 1000) * (0.35 + random() * 0.5));
        const attemptId = randomUUID();

        const ordered = [...questionsForQuiz].sort(() => random() - 0.5);
        const totalMarks = ordered.reduce((sum, question) => sum + question.marks, 0);
        const targetMarks = Math.round(ratio * totalMarks);
        // A struggling student often leaves the last question blank.
        const unansweredIndex = ratio < 0.65 ? ordered.length - 1 : -1;

        let obtained = 0;
        let correctCount = 0;
        let incorrectCount = 0;
        let unansweredCount = 0;
        let runningMarks = 0;

        const localAnswers: NewAnswer[] = [];

        ordered.forEach((question, index) => {
          const wrongOptions = question.optionIds.filter(
            (id) => !question.correctOptionIds.includes(id),
          );

          if (index === unansweredIndex) {
            unansweredCount += 1;
            return;
          }

          const isCorrect = runningMarks + question.marks <= targetMarks;
          if (isCorrect) {
            runningMarks += question.marks;
            obtained += question.marks;
            correctCount += 1;
          } else {
            incorrectCount += 1;
          }

          // Each format is answered the way a student would answer it, so the
          // seeded history exercises the same rows the API writes.
          if (question.type === 'FILL_BLANK') {
            localAnswers.push({
              id: randomUUID(),
              attemptId,
              questionId: question.id,
              selectedOptionId: null,
              answerText: isCorrect ? question.accepted[0]! : 'no idea',
              isCorrect,
            });
            return;
          }

          if (question.type === 'MULTI') {
            // A wrong answer picks part of the set: the common, plausible miss.
            const selectedOptionIds = isCorrect
              ? question.correctOptionIds
              : [question.correctOptionIds[0]!, ...(wrongOptions[0] ? [wrongOptions[0]] : [])];

            localAnswers.push({
              id: randomUUID(),
              attemptId,
              questionId: question.id,
              selectedOptionId: null,
              selectedOptionIds: JSON.stringify(selectedOptionIds),
              isCorrect,
            });
            return;
          }

          localAnswers.push({
            id: randomUUID(),
            attemptId,
            questionId: question.id,
            selectedOptionId: isCorrect ? question.correctOptionIds[0]! : pick(wrongOptions),
            isCorrect,
          });
        });

        // The paper's penalty, applied the same way the API applies it.
        const negativeMarks = quiz.negativeMarks ?? 0;
        const penalty = Math.round(negativeMarks * incorrectCount * 100) / 100;
        const score = Math.round(Math.max(0, obtained - penalty) * 100) / 100;
        const percentage = Math.round((score / totalMarks) * 10000) / 100;
        const status = percentage >= quiz.passingScore ? 'PASSED' : 'FAILED';

        attemptRows.push({
          id: attemptId,
          quizId,
          userId,
          score,
          totalMarks,
          percentage,
          correctAnswers: correctCount,
          incorrectAnswers: incorrectCount,
          unanswered: unansweredCount,
          timeTakenSeconds,
          status,
          negativeMarks,
          penalty,
          startedAt,
          expiresAt: new Date(startedAt.getTime() + durationMs),
          completedAt: new Date(startedAt.getTime() + timeTakenSeconds * 1000),
        });

        answerRows.push(...localAnswers);
      });
    }
  }

  if (attemptRows.length > 0) await db.insert(attempts).values(attemptRows);
  if (answerRows.length > 0) await db.insert(answers).values(answerRows);

  /* ----------------------------- certificates ----------------------------- */
  // A pass on a quiz that allows them. Seeded so the certificate screen and its
  // public verification page have something real to show on a fresh install.
  const certificateRows: NewCertificate[] = [];
  const outboxRows: NewEmailOutboxRow[] = [];
  const usedCodes = new Set<string>();

  for (const attempt of attemptRows) {
    if (attempt.status !== 'PASSED') continue;

    const quiz = quizById.get(attempt.quizId);
    if (!quiz || quiz.certificateEnabled === false) continue;

    let code = certificateCode();
    while (usedCodes.has(normalizeCertificateCode(code))) code = certificateCode();
    usedCodes.add(normalizeCertificateCode(code));

    certificateRows.push({
      id: randomUUID(),
      attemptId: attempt.id,
      userId: attempt.userId,
      quizId: attempt.quizId,
      code: normalizeCertificateCode(code),
    });
  }

  if (certificateRows.length > 0) await db.insert(certificates).values(certificateRows);

  /* ------------------------------- outbox -------------------------------- */
  // A few messages so the console's notification log is not empty: a welcome per
  // student, plus the result and certificate of the newest pass.
  for (const [index, student] of studentPlans.entries()) {
    const row = studentRows[index];
    if (!row) continue;

    const welcome = welcomeEmail({ name: student.name, email: student.email });
    outboxRows.push({
      id: randomUUID(),
      kind: welcome.kind,
      toEmail: welcome.to,
      subject: welcome.subject,
      body: welcome.body,
      status: 'SENT',
      sentAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
    });
  }

  const newestPass = [...certificateRows].sort((a, b) => (a.code < b.code ? -1 : 1)).at(-1);

  if (newestPass) {
    const attempt = attemptRows.find((row) => row.id === newestPass.attemptId);
    const quiz = attempt ? quizById.get(attempt.quizId) : undefined;
    const student = attempt
      ? studentPlans.find((_, index) => studentRows[index]?.id === attempt.userId)
      : undefined;

    if (attempt && quiz && student) {
      const result = resultEmail({
        name: student.name,
        email: student.email,
        quizTitle: quiz.title,
        attemptId: attempt.id,
        percentage: attempt.percentage ?? 0,
        score: Number(attempt.score ?? 0),
        totalMarks: Number(attempt.totalMarks ?? 0),
        passed: true,
        passingScore: quiz.passingScore,
      });

      outboxRows.push({
        id: randomUUID(),
        kind: result.kind,
        toEmail: result.to,
        subject: result.subject,
        body: result.body,
        status: 'SENT',
        relatedId: attempt.id,
        sentAt: new Date(attempt.completedAt ?? now),
        createdAt: new Date(attempt.completedAt ?? now),
      });

      const certificate = certificateEmail({
        name: student.name,
        email: student.email,
        quizTitle: quiz.title,
        code: newestPass.code,
        attemptId: attempt.id,
        percentage: attempt.percentage ?? 0,
        baseUrl: 'http://localhost:3000',
      });

      outboxRows.push({
        id: randomUUID(),
        kind: certificate.kind,
        toEmail: certificate.to,
        subject: certificate.subject,
        body: certificate.body,
        status: 'QUEUED',
        relatedId: attempt.id,
        createdAt: new Date(now - 60_000),
      });
    }
  }

  if (outboxRows.length > 0) await db.insert(emailOutbox).values(outboxRows);

  console.log('');
  console.log('✔ Seed complete');
  console.log(`  categories: ${categoryRows.length}`);
  console.log(`  users:      ${1 + studentRows.length}`);
  console.log(
    `  quizzes:    ${quizSeeds.length} (${quizSeeds.filter((q) => q.status === 'PUBLISHED').length} published)`,
  );
  console.log(`  attempts:   ${attemptRows.length}`);
  console.log(`  certificates: ${certificateRows.length}`);
  console.log(`  emails:     ${outboxRows.length}`);
  console.log('');
  console.log('  Demo accounts');
  console.log('  ┌──────────────┬───────────────────┬───────────────┐');
  console.log('  │ Role         │ Email             │ Password      │');
  console.log('  ├──────────────┼───────────────────┼───────────────┤');
  console.log(`  │ Admin        │ admin@quiz.dev    │ ${ADMIN_PASSWORD.padEnd(13)} │`);
  console.log(`  │ Student      │ rahul@quiz.dev    │ ${DEMO_PASSWORD.padEnd(13)} │`);
  console.log(`  │ Student      │ priya@quiz.dev    │ ${DEMO_PASSWORD.padEnd(13)} │`);
  console.log(`  │ Student      │ amit@quiz.dev     │ ${DEMO_PASSWORD.padEnd(13)} │`);
  console.log('  └──────────────┴───────────────────┴───────────────┘');
}

function quizBySlug(slug: string) {
  return quizSeeds.find((quiz) => quiz.slug === slug);
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    const config = (() => {
      try {
        return resolveDatabaseConfig();
      } catch {
        return undefined;
      }
    })();

    const diagnosis = diagnoseDatabaseError(error);
    if (config && (diagnosis.kind === 'rejected' || diagnosis.kind === 'auth')) {
      diagnosis.rawBody = await fetchRawResponse(config);
    }

    console.error(formatDiagnosis(diagnosis, config));

    if (process.env.DEBUG === '1') console.error(error);
    process.exit(1);
  });
