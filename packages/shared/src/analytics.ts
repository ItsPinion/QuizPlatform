/**
 * Admin analytics contracts (Day 11).
 *
 * The spec's admin dashboard wants six charts — attempts over time, student
 * registrations, average quiz scores, pass/fail ratio, most popular quizzes and
 * most popular categories — plus the student / quiz / attempt statistics behind
 * them. As on Day 10, the rules live here rather than in the SQL or the JSX:
 *
 * 1. **Every rate names its denominator.** `passRate` is passed / graded, never
 *    passed / all attempts: an attempt still running, or one that expired
 *    untouched, is not a failure.
 * 2. **Charts are testable.** The date buckets, the ratio slices and the bar
 *    scaling are pure functions, so zero-filled days, an all-zero series and a
 *    rounding drift that would print 99.9% are covered by unit tests.
 */
import { z } from 'zod';

import { utcDayKey } from './dashboard';

/* -------------------------------------------------------------------------- */
/*  Window                                                                    */
/* -------------------------------------------------------------------------- */

/** The four ranges the analytics screen offers. */
export const ANALYTICS_WINDOWS = [7, 14, 30, 90] as const;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

export const DEFAULT_ANALYTICS_WINDOW: AnalyticsWindow = 30;

/**
 * Coerce anything the query string can hold into a supported window.
 *
 * Falls back to the default instead of throwing: the API validates strictly
 * (`analyticsQuerySchema`), and the web filter parser must never crash a page
 * because someone hand-edited `?days=`.
 */
export function parseAnalyticsWindow(value: string | number | null | undefined): AnalyticsWindow {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);

  return (ANALYTICS_WINDOWS as readonly number[]).includes(parsed)
    ? (parsed as AnalyticsWindow)
    : DEFAULT_ANALYTICS_WINDOW;
}

/* -------------------------------------------------------------------------- */
/*  Daily buckets                                                             */
/* -------------------------------------------------------------------------- */

export interface DailyInput {
  /** `YYYY-MM-DD` (UTC) — the key the SQL grouping produces. */
  date: string;
  attempts?: number;
  registrations?: number;
  passed?: number;
  failed?: number;
  averagePercentage?: number | null;
}

export interface DailyPoint {
  date: string;
  label: string;
  attempts: number;
  registrations: number;
  passed: number;
  failed: number;
  averagePercentage: number | null;
}

/**
 * A fixed, zero-filled window ending today, oldest first.
 *
 * The empty days stay in: a chart that drops quiet days makes two bursts a week
 * apart look consecutive, and the bar widths would move every time the window
 * slid. Both the attempt series and the registration series share these
 * buckets, so the two charts are always aligned to the same dates.
 */
export function analyticsBuckets(
  rows: readonly DailyInput[],
  days: number = DEFAULT_ANALYTICS_WINDOW,
  now: Date = new Date(),
): DailyPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const count = Math.max(1, Math.floor(days));

  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: DailyPoint[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(end - offset * 24 * 60 * 60 * 1000);
    const key = utcDayKey(date);
    const row = byDate.get(key);

    out.push({
      date: key,
      label: `${date.getUTCDate()} ${date.toLocaleString('en-GB', {
        month: 'short',
        timeZone: 'UTC',
      })}`,
      attempts: row?.attempts ?? 0,
      registrations: row?.registrations ?? 0,
      passed: row?.passed ?? 0,
      failed: row?.failed ?? 0,
      averagePercentage: row?.averagePercentage ?? null,
    });
  }

  return out;
}

/** Total attempts / registrations over the window — the numbers above the chart. */
export function windowTotals(points: readonly DailyPoint[]): {
  attempts: number;
  registrations: number;
  passed: number;
  failed: number;
  busiest: DailyPoint | null;
} {
  let attempts = 0;
  let registrations = 0;
  let passed = 0;
  let failed = 0;
  let busiest: DailyPoint | null = null;

  for (const point of points) {
    attempts += point.attempts;
    registrations += point.registrations;
    passed += point.passed;
    failed += point.failed;

    if (point.attempts > 0 && (busiest == null || point.attempts > busiest.attempts)) {
      busiest = point;
    }
  }

  return { attempts, registrations, passed, failed, busiest };
}

/* -------------------------------------------------------------------------- */
/*  Pass / fail ratio                                                         */
/* -------------------------------------------------------------------------- */

export type OutcomeKind = 'passed' | 'failed' | 'expired';

export interface RatioSlice {
  kind: OutcomeKind;
  count: number;
  /** 0–100, one decimal. The slices of a non-empty set sum to exactly 100. */
  percentage: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The pass / fail donut, as numbers.
 *
 * Expired attempts are their own slice rather than a failure: the student never
 * submitted, so calling it a fail would overstate the failure rate. Rounding is
 * corrected on the largest slice so the printed percentages add up to 100 — a
 * legend reading `33.4 / 33.3 / 33.3` next to "3 attempts" is the kind of thing
 * that makes people distrust the whole dashboard.
 */
export function ratioSlices(passed: number, failed: number, expired = 0): RatioSlice[] {
  const counts: Array<[OutcomeKind, number]> = [
    ['passed', Math.max(0, passed)],
    ['failed', Math.max(0, failed)],
    ['expired', Math.max(0, expired)],
  ];
  const total = counts.reduce((sum, [, value]) => sum + value, 0);

  if (total === 0) {
    return counts.map(([kind, count]) => ({ kind, count, percentage: 0 }));
  }

  const slices = counts.map(([kind, count]) => ({
    kind,
    count,
    percentage: round1((count / total) * 100),
  }));

  const drift = round1(100 - slices.reduce((sum, slice) => sum + slice.percentage, 0));
  if (drift !== 0) {
    let largest = slices[0];
    for (const slice of slices) {
      if (slice.count > (largest?.count ?? -1)) largest = slice;
    }
    if (largest) largest.percentage = round1(largest.percentage + drift);
  }

  return slices;
}

/* -------------------------------------------------------------------------- */
/*  Bars and lines                                                            */
/* -------------------------------------------------------------------------- */

/** `part / total` as 0–100 with one decimal; 0 when the total is 0. */
export function sharePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return round1((Math.max(0, part) / total) * 100);
}

/**
 * Bar heights relative to the busiest value, 0–100.
 *
 * Relative rather than absolute on purpose: popularity means "compared with the
 * most popular", and a chart where every bar is 3% long is unreadable. The
 * caller labels the absolute number next to each bar.
 */
export function barScale(values: readonly number[]): number[] {
  const max = values.reduce((best, value) => Math.max(best, value), 0);
  if (max <= 0) return values.map(() => 0);
  return values.map((value) => round1((Math.max(0, value) / max) * 100));
}

export interface SeriesPoint {
  x: number;
  y: number;
  value: number;
}

/**
 * Map a count series onto SVG coordinates, scaled to its own peak.
 *
 * A flat series sits on the baseline rather than dividing by zero, and a single
 * point is drawn in the middle instead of at the left edge.
 */
export function seriesPoints(
  values: readonly number[],
  width: number,
  height: number,
  padding = 4,
): SeriesPoint[] {
  if (values.length === 0) return [];

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(0, height - padding * 2);
  const max = values.reduce((best, value) => Math.max(best, value), 0);

  const xFor = (index: number) =>
    values.length === 1
      ? padding + innerWidth / 2
      : padding + (index / (values.length - 1)) * innerWidth;

  const yFor = (value: number) =>
    max <= 0 ? height - padding : padding + (1 - Math.max(0, value) / max) * innerHeight;

  return values.map((value, index) => ({
    x: Math.round(xFor(index) * 100) / 100,
    y: Math.round(yFor(value) * 100) / 100,
    value,
  }));
}

/** `M … L …` path through the points, or `''` when there is nothing to draw. */
export function seriesPath(points: readonly SeriesPoint[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (!first) return '';

  return [`M ${first.x} ${first.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`)].join(' ');
}

/** The change from one window to the previous one, in percent, or `null`. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return round1(((current - previous) / previous) * 100);
}

/* -------------------------------------------------------------------------- */
/*  Wire shape                                                                */
/* -------------------------------------------------------------------------- */

export const analyticsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => (ANALYTICS_WINDOWS as readonly number[]).includes(value), {
      message: `days must be one of ${ANALYTICS_WINDOWS.join(', ')}`,
    })
    .default(DEFAULT_ANALYTICS_WINDOW)
    .transform((value) => value as AnalyticsWindow),
});

export const adminAnalyticsSchema = z.object({
  generatedAt: z.string(),
  windowDays: z.number(),
  students: z.object({
    total: z.number(),
    active: z.number(),
    inactive: z.number(),
    newInWindow: z.number(),
    newInPreviousWindow: z.number(),
    activeLearners: z.number(),
    /** Mean attempts per learner who has ever started a quiz, one decimal. */
    attemptsPerLearner: z.number().nullable(),
  }),
  quizzes: z.object({
    total: z.number(),
    published: z.number(),
    drafts: z.number(),
    unpublished: z.number(),
    questions: z.number(),
    attempted: z.number(),
    neverAttempted: z.number(),
    averageQuestions: z.number().nullable(),
  }),
  attempts: z.object({
    total: z.number(),
    graded: z.number(),
    passed: z.number(),
    failed: z.number(),
    expired: z.number(),
    inProgress: z.number(),
    averagePercentage: z.number().nullable(),
    passRate: z.number().nullable(),
    averageTimeSeconds: z.number().nullable(),
    questionsAnswered: z.number(),
    accuracy: z.number().nullable(),
    inWindow: z.number(),
    inPreviousWindow: z.number(),
  }),
  timeline: z.array(
    z.object({
      date: z.string(),
      label: z.string(),
      attempts: z.number(),
      registrations: z.number(),
      passed: z.number(),
      failed: z.number(),
      averagePercentage: z.number().nullable(),
    }),
  ),
  quizPerformance: z.array(
    z.object({
      quizId: z.string(),
      title: z.string(),
      slug: z.string(),
      categoryName: z.string(),
      status: z.string(),
      attempts: z.number(),
      learners: z.number(),
      averagePercentage: z.number().nullable(),
      bestPercentage: z.number().nullable(),
      passRate: z.number().nullable(),
      lastAttemptAt: z.string().nullable(),
    }),
  ),
  categories: z.array(
    z.object({
      categoryId: z.string(),
      name: z.string(),
      quizzes: z.number(),
      attempts: z.number(),
      learners: z.number(),
      averagePercentage: z.number().nullable(),
      passRate: z.number().nullable(),
    }),
  ),
});

export type AdminAnalytics = z.infer<typeof adminAnalyticsSchema>;
export type AnalyticsTimelinePoint = AdminAnalytics['timeline'][number];
export type QuizPerformanceRow = AdminAnalytics['quizPerformance'][number];
export type CategoryAnalyticsRow = AdminAnalytics['categories'][number];
