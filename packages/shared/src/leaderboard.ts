/**
 * Leaderboard contracts (Day 12).
 *
 * The spec asks for three ranking bases (highest score, average score, quizzes
 * completed), two scopes (overall and category) and two extra periods (monthly,
 * weekly). Those become three query parameters here — `metric`, `categoryId`
 * and `period` — over one ranked list.
 *
 * Two rules shape the file:
 *
 * 1. **Ranking is a pure function.** Sorting, tie handling and the "points
 *    behind the person above you" gap are decided here, not in SQL, so equal
 *    scores always produce equal ranks and the same order every time.
 * 2. **Only finished attempts count.** An `IN_PROGRESS` paper has no score and
 *    a `0` percentage; including it would put someone at the bottom of a board
 *    they have not finished playing on.
 */
import { z } from 'zod';

import { idSchema } from './index';

/* -------------------------------------------------------------------------- */
/*  Options                                                                   */
/* -------------------------------------------------------------------------- */

export const LEADERBOARD_METRICS = ['average', 'best', 'completed'] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export const LEADERBOARD_PERIODS = ['all', 'month', 'week'] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export const DEFAULT_LEADERBOARD_LIMIT = 20;
export const MAX_LEADERBOARD_LIMIT = 50;

/** Rolling windows: "this month" is the last 30 days, "this week" the last 7. */
export const PERIOD_DAYS: Record<LeaderboardPeriod, number | null> = {
  all: null,
  month: 30,
  week: 7,
};

/**
 * The start of a rolling period, or `null` for all time.
 *
 * Rolling rather than calendar: a leaderboard that empties itself at midnight on
 * the 1st looks broken, and a "weekly" board that resets on Monday morning is a
 * different product from the one people were looking at on Sunday night.
 */
export function periodStart(period: LeaderboardPeriod, now: Date = new Date()): Date | null {
  const days = PERIOD_DAYS[period];
  if (days == null) return null;

  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/* -------------------------------------------------------------------------- */
/*  Ranking                                                                   */
/* -------------------------------------------------------------------------- */

export interface LeaderboardCandidate {
  userId: string;
  name: string;
  averagePercentage: number;
  bestPercentage: number;
  attempts: number;
  quizzesCompleted: number;
  passed: number;
  failed: number;
  lastAttemptAt: string | null;
}

export interface LeaderboardEntry extends LeaderboardCandidate {
  rank: number;
  passRate: number | null;
  isCurrentUser: boolean;
  /** How far behind the entry above; 0 for rank 1 and for ties. */
  gapToNext: number;
}

/** The number a metric ranks on. Higher is always better. */
export function metricValue(
  entry: Pick<LeaderboardCandidate, 'averagePercentage' | 'bestPercentage' | 'quizzesCompleted'>,
  metric: LeaderboardMetric,
): number {
  switch (metric) {
    case 'best':
      return entry.bestPercentage;
    case 'completed':
      return entry.quizzesCompleted;
    default:
      return entry.averagePercentage;
  }
}

/**
 * Sort by the chosen metric, then by the other two, then by name.
 *
 * The tie-breakers exist so the order never depends on the database's row order:
 * two students on 80% average are separated by who has completed more quizzes,
 * then by their best score, and only then alphabetically.
 */
export function sortLeaderboard<T extends LeaderboardCandidate>(
  entries: readonly T[],
  metric: LeaderboardMetric,
): T[] {
  const value = (entry: T) => metricValue(entry, metric);

  return [...entries].sort(
    (a, b) =>
      value(b) - value(a) ||
      b.averagePercentage - a.averagePercentage ||
      b.bestPercentage - a.bestPercentage ||
      b.quizzesCompleted - a.quizzesCompleted ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Competition ranking: equal metric values share a rank, and the next entry
 * skips the numbers the tie consumed (1, 2, 2, 4).
 *
 * Ties are judged on the metric alone — the tie-breakers above only decide the
 * display order, so two students who both average 80% share second place even
 * though one is printed first.
 */
export function assignRanks<T extends LeaderboardCandidate>(
  sorted: readonly T[],
  metric: LeaderboardMetric,
): Array<T & { rank: number; gapToNext: number }> {
  const out: Array<T & { rank: number; gapToNext: number }> = [];

  let rank = 0;
  let previousValue: number | null = null;
  let position = 0;

  for (const entry of sorted) {
    position += 1;
    const value = metricValue(entry, metric);

    if (previousValue == null || value !== previousValue) {
      rank = position;
      previousValue = value;
    }

    const previous = out[out.length - 1];
    const gap = previous == null ? 0 : Math.max(0, round2(metricValue(previous, metric) - value));

    out.push({ ...entry, rank, gapToNext: gap });
  }

  return out;
}

/**
 * A whole board in one call: sort, rank, mark the caller and compute pass rates.
 *
 * `currentUserId` is optional so the same helper can build a board for an
 * anonymous caller in tests; the API always passes it.
 */
export function buildLeaderboard(
  candidates: readonly LeaderboardCandidate[],
  metric: LeaderboardMetric,
  currentUserId?: string,
): LeaderboardEntry[] {
  return assignRanks(sortLeaderboard(candidates, metric), metric).map((entry) => ({
    ...entry,
    passRate: passRateOf(entry.passed, entry.failed),
    isCurrentUser: entry.userId === currentUserId,
  }));
}

/** `passed / (passed + failed)`, or `null` for a student with no result. */
export function passRateOf(passed: number, failed: number): number | null {
  const graded = passed + failed;
  if (graded <= 0) return null;
  return round2((passed / graded) * 100);
}

/** Where a rank sits in the field, as "top 20%". */
export function topPercentOf(rank: number, participants: number): number | null {
  if (participants <= 0 || rank <= 0) return null;
  return Math.max(1, Math.round((rank / participants) * 100));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/*  Wire shape                                                                */
/* -------------------------------------------------------------------------- */

export const leaderboardQuerySchema = z.object({
  metric: z.enum(LEADERBOARD_METRICS).default('average'),
  period: z.enum(LEADERBOARD_PERIODS).default('all'),
  categoryId: idSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LEADERBOARD_LIMIT)
    .default(DEFAULT_LEADERBOARD_LIMIT),
});

export const leaderboardEntrySchema = z.object({
  rank: z.number(),
  userId: z.string(),
  name: z.string(),
  averagePercentage: z.number(),
  bestPercentage: z.number(),
  attempts: z.number(),
  quizzesCompleted: z.number(),
  passed: z.number(),
  failed: z.number(),
  passRate: z.number().nullable(),
  lastAttemptAt: z.string().nullable(),
  isCurrentUser: z.boolean(),
  gapToNext: z.number(),
});

/**
 * One entry in the category filter.
 *
 * The list is read from the categories table on every request, so a category an
 * admin adds appears on the next load without a deploy. `attempts` is how many
 * graded papers that category holds (all time, not just this period) — the UI
 * uses it to play down categories nobody has sat yet rather than hiding them.
 */
export const leaderboardCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  attempts: z.number(),
});

export const leaderboardResponseSchema = z.object({
  generatedAt: z.string(),
  metric: z.enum(LEADERBOARD_METRICS),
  period: z.enum(LEADERBOARD_PERIODS),
  scope: z.object({
    type: z.enum(['overall', 'category']),
    categoryId: z.string().nullable(),
    categoryName: z.string().nullable(),
  }),
  /** Every category in the database, ordered by name. */
  categories: z.array(leaderboardCategorySchema),
  entries: z.array(leaderboardEntrySchema),
  /** The caller's row, even when it falls outside `entries`. */
  currentUser: leaderboardEntrySchema.nullable(),
  totals: z.object({
    participants: z.number(),
    attempts: z.number(),
    quizzes: z.number(),
  }),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
export type LeaderboardEntryWire = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardCategoryWire = z.infer<typeof leaderboardCategorySchema>;
