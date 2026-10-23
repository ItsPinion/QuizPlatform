import { z } from 'zod';

/**
 * The landing payload.
 *
 * Everything the front page displays comes from here: counts, the shape of the
 * published catalogue, one real question (without its key) and one anonymised
 * graded result. Nothing on the page is typed by hand, so nothing on the page can
 * go stale — a seeded database and an empty one produce different pages from the
 * same components.
 *
 * Two rules this schema exists to enforce:
 *
 *   • **No answer key.** The sample question carries option text only. If a
 *     field for correctness ever appears here, a visitor can read the answers off
 *     the marketing page.
 *   • **No people.** The sample result is an attempt with the student removed:
 *     marks, counts and a pass flag. No ids, no names, no emails.
 */

export const landingCountsSchema = z.object({
  users: z.number().int(),
  categories: z.number().int(),
  quizzes: z.number().int(),
  publishedQuizzes: z.number().int(),
  questions: z.number().int(),
  attempts: z.number().int(),
  gradedAttempts: z.number().int(),
  passedAttempts: z.number().int(),
  /** 0–100, two decimals. Zero graded papers means zero, not null. */
  passRate: z.number(),
  /** Average percentage across graded papers. */
  averagePercentage: z.number(),
});

export type LandingCounts = z.infer<typeof landingCountsSchema>;

/** What the published catalogue looks like, as a set of ranges rather than a list. */
export const landingShapeSchema = z.object({
  minDurationMinutes: z.number().int(),
  maxDurationMinutes: z.number().int(),
  averageDurationMinutes: z.number(),
  minPassingScore: z.number().int(),
  maxPassingScore: z.number().int(),
  minQuestions: z.number().int(),
  maxQuestions: z.number().int(),
  totalQuestions: z.number().int(),
});

export type LandingShape = z.infer<typeof landingShapeSchema>;

export const landingCategorySchema = z.object({
  name: z.string(),
  quizzes: z.number().int(),
  published: z.number().int(),
});

export const landingQuizSchema = z.object({
  title: z.string(),
  category: z.string(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  durationMinutes: z.number().int(),
  passingScore: z.number().int(),
  maxAttempts: z.number().int(),
  questions: z.number().int(),
});

/** A question a student would see mid-attempt: text and options, no key. */
export const landingQuestionSchema = z.object({
  quizTitle: z.string(),
  category: z.string(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  durationMinutes: z.number().int(),
  /** 1-based position in the paper. */
  index: z.number().int(),
  total: z.number().int(),
  text: z.string(),
  marks: z.number().int(),
  options: z.array(z.string()).min(2),
});

/** A graded paper with the student stripped out. */
export const landingResultSchema = z.object({
  quizTitle: z.string(),
  category: z.string(),
  percentage: z.number(),
  marks: z.number().int(),
  totalMarks: z.number().int(),
  passed: z.boolean(),
  passingScore: z.number().int(),
  correct: z.number().int(),
  incorrect: z.number().int(),
  unanswered: z.number().int(),
  timeTakenSeconds: z.number().int(),
});

export const landingDemoAccountSchema = z.object({
  role: z.enum(['ADMIN', 'STUDENT']),
  email: z.string(),
  password: z.string(),
  /** True when the account exists in the database right now. */
  exists: z.boolean(),
});

export const landingPayloadSchema = z.object({
  generatedAt: z.string(),
  service: z.object({
    name: z.string(),
    version: z.string(),
    runtime: z.string(),
    nodeEnv: z.string(),
    uptimeSeconds: z.number().int(),
  }),
  database: z.object({
    target: z.enum(['turso', 'file', 'unconfigured']),
    urlHint: z.string(),
    connected: z.boolean(),
    latencyMs: z.number().nullable(),
  }),
  counts: landingCountsSchema,
  shape: landingShapeSchema,
  categories: z.array(landingCategorySchema),
  quizzes: z.array(landingQuizSchema),
  sampleQuestion: landingQuestionSchema.nullable(),
  sampleResult: landingResultSchema.nullable(),
  demo: z.object({
    enabled: z.boolean(),
    accounts: z.array(landingDemoAccountSchema),
  }),
  /** Set only when the database could not be read: the page shows an empty state, not a 500. */
  unavailableReason: z.string().nullable(),
});

export type LandingCategory = z.infer<typeof landingCategorySchema>;
export type LandingQuiz = z.infer<typeof landingQuizSchema>;
export type LandingQuestion = z.infer<typeof landingQuestionSchema>;
export type LandingResult = z.infer<typeof landingResultSchema>;
export type LandingDemoAccount = z.infer<typeof landingDemoAccountSchema>;
export type LandingPayload = z.infer<typeof landingPayloadSchema>;

/* -------------------------------------------------------------------------- */
/*  Seed accounts                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The accounts `bun run db:seed` creates, with their passwords.
 *
 * The passwords live here because a hash cannot be reversed — the only way to
 * advertise a demo login is to know what it was set to. This is the *same*
 * constant the seed script uses, so renaming an account in one place cannot
 * leave the landing page pointing at a login that no longer works.
 */
export const SEED_DEMO_ACCOUNTS = [
  { role: 'ADMIN', name: 'Alex Admin', email: 'admin@quiz.dev', password: 'Admin12345' },
  { role: 'STUDENT', name: 'Rahul Sharma', email: 'rahul@quiz.dev', password: 'Password123' },
  { role: 'STUDENT', name: 'Priya Patel', email: 'priya@quiz.dev', password: 'Password123' },
  { role: 'STUDENT', name: 'Amit Verma', email: 'amit@quiz.dev', password: 'Password123' },
] as const;

/* -------------------------------------------------------------------------- */
/*  Display helpers (pure — tested without a database)                         */
/* -------------------------------------------------------------------------- */

/** `15–30` for a range, `20` when every quiz is the same length. */
export function rangeLabel(min: number, max: number, suffix = ''): string {
  return min === max ? `${min}${suffix}` : `${min}–${max}${suffix}`;
}

/** `15–30 min` — the attempt clock card. */
export function durationRangeLabel(shape: LandingShape): string {
  return rangeLabel(shape.minDurationMinutes, shape.maxDurationMinutes, ' min');
}

/** `50–70%` — what it takes to pass. */
export function passingRangeLabel(shape: LandingShape): string {
  return rangeLabel(shape.minPassingScore, shape.maxPassingScore, '%');
}

/** `5–8` — questions per paper. */
export function questionRangeLabel(shape: LandingShape): string {
  return rangeLabel(shape.minQuestions, shape.maxQuestions);
}

/** Percentage with at most one decimal: `53.3%`, `100%`, `0%`. */
export function percentLabel(value: number): string {
  const rounded = Math.round(value * 10) / 10;

  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** `42s`, `7m`, `3h 12m` — how long the process has been up. */
export function uptimeLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));

  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);

  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** `12m 04s` from seconds. */
export function durationLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;

  return `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

/**
 * Whether the page has enough to show a real product shot.
 *
 * The landing page renders from whatever the API returns; when the database is
 * empty or unreachable there is no question and no result, and the components
 * fall back to an empty state instead of inventing content.
 */
export function hasSampleContent(payload: LandingPayload): boolean {
  return payload.sampleQuestion !== null && payload.counts.publishedQuizzes > 0;
}

/** The four headline numbers, derived — never typed into the page. */
export function headlineNumbers(payload: LandingPayload): { value: string; label: string }[] {
  const { counts } = payload;

  return [
    { value: String(counts.categories), label: 'categories' },
    { value: String(counts.questions), label: 'questions' },
    { value: String(counts.publishedQuizzes), label: 'published quizzes' },
    { value: String(counts.gradedAttempts), label: 'papers graded' },
  ];
}
