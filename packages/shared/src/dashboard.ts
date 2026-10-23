/**
 * Student dashboard contracts (Day 10).
 *
 * The spec asks for six numbers (attempted, passed, failed, average, highest,
 * questions answered) plus a performance chart and the recent history. Two rules
 * shape the file:
 *
 * 1. **One definition per number.** `averagePercentage` is over *graded* attempts
 *    only — an `IN_PROGRESS` row has `percentage = 0` and would otherwise drag
 *    the average down for no reason. Every rate here says what its denominator
 *    is, and the UI prints the same denominators.
 * 2. **The chart maths is testable.** The SVG geometry lives here as pure
 *    functions rather than in the component, so the awkward parts (a single
 *    point, an all-zero series, an empty series) are covered by unit tests
 *    instead of by squinting at a browser.
 */
import { z } from 'zod';

import { attemptHistoryItemSchema } from './review';
import { attemptStatusSchema } from './index';

/* -------------------------------------------------------------------------- */
/*  Arithmetic                                                                */
/* -------------------------------------------------------------------------- */

/** Mean of the numbers, or `null` when there is nothing to average. */
export function averageOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
}

/** `passed / (passed + failed)`, 0–100, or `null` before the first result. */
export function passRateOf(passed: number, failed: number): number | null {
  const graded = passed + failed;
  if (graded <= 0) return null;
  return Math.round((passed / graded) * 10_000) / 100;
}

/**
 * Consecutive passes, newest first.
 *
 * `best` is the longest run anywhere in the history, which is the number worth
 * showing: "current streak" alone resets to zero after a single miss.
 */
export function streakOf(statusesNewestFirst: readonly string[]): {
  current: number;
  best: number;
} {
  let current = 0;
  let best = 0;
  let running = 0;

  // Stop at the first non-pass; the passes already counted stay counted.
  for (const status of statusesNewestFirst) {
    if (status !== 'PASSED') break;
    current += 1;
  }

  // A second pass for `best`, walking the whole list oldest-first.
  for (const status of [...statusesNewestFirst].reverse()) {
    if (status === 'PASSED') {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 0;
    }
  }

  return { current, best };
}

/** `14:32` → `14m`, `1:04:32` → `1h 5m`. Long durations are easier to read. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/* -------------------------------------------------------------------------- */
/*  Activity window                                                           */
/* -------------------------------------------------------------------------- */

export interface ActivityInput {
  /** `YYYY-MM-DD`, the day the attempt finished. */
  date: string;
  attempts: number;
  averagePercentage: number | null;
}

export interface ActivityDay {
  date: string;
  label: string;
  attempts: number;
  averagePercentage: number | null;
}

/** `2026-03-04` — the key both the SQL grouping and the zero-filling use. */
export function utcDayKey(date: Date | string | number): string {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return value.toISOString().slice(0, 10);
}

/**
 * A fixed window of days ending today, oldest first, with the empty days kept.
 *
 * Kept zero-filled on purpose: a bar chart that silently omits quiet days makes
 * a burst of activity look continuous, and it makes the width of the chart jump
 * around between page loads.
 */
export function activityBuckets(
  rows: readonly ActivityInput[],
  days = 14,
  now: Date = new Date(),
): ActivityDay[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const out: ActivityDay[] = [];

  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (let offset = days - 1; offset >= 0; offset -= 1) {
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
      averagePercentage: row?.averagePercentage ?? null,
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  Chart geometry                                                            */
/* -------------------------------------------------------------------------- */

export interface ChartPoint {
  x: number;
  y: number;
  value: number;
}

/**
 * Map a series of 0–100 scores onto SVG coordinates.
 *
 * The y axis is fixed to the score range rather than to the data's own min/max:
 * a chart that rescales to 72–78% makes a tiny wobble look like a collapse.
 * A single point is drawn in the middle rather than at the left edge, and an
 * empty series returns no geometry at all (the component renders an empty state).
 */
export function scoreChartPoints(
  values: readonly number[],
  width: number,
  height: number,
  padding = 6,
): ChartPoint[] {
  if (values.length === 0) return [];

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(0, height - padding * 2);

  const xFor = (index: number) =>
    values.length === 1
      ? padding + innerWidth / 2
      : padding + (index / (values.length - 1)) * innerWidth;

  const yFor = (value: number) =>
    padding + (1 - Math.min(100, Math.max(0, value)) / 100) * innerHeight;

  return values.map((value, index) => ({ x: xFor(index), y: yFor(value), value }));
}

/** `M … L …` path for the line, or `''` when there is nothing to draw. */
export function scoreChartPath(points: readonly ChartPoint[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (!first) return '';

  return [
    `M ${round(first.x)} ${round(first.y)}`,
    ...rest.map((point) => `L ${round(point.x)} ${round(point.y)}`),
  ].join(' ');
}

/** Same line, closed along the baseline — the soft fill under the stroke. */
export function scoreChartArea(points: readonly ChartPoint[], height: number, padding = 6): string {
  if (points.length === 0) return '';
  const path = scoreChartPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';

  const baseline = round(height - padding);
  return `${path} L ${round(last.x)} ${baseline} L ${round(first.x)} ${baseline} Z`;
}

/** Where the pass-mark rule sits on the y axis, for a 0–100 chart. */
export function passMarkY(passMark: number, height: number, padding = 6): number {
  const innerHeight = Math.max(0, height - padding * 2);
  return round(padding + (1 - Math.min(100, Math.max(0, passMark)) / 100) * innerHeight);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/*  Presentation                                                              */
/* -------------------------------------------------------------------------- */

export type ScoreTone = 'success' | 'warning' | 'destructive';

/** A score is "good" from the pass mark up, "close" within ten points of it. */
export function scoreTone(percentage: number | null, passMark = 60): ScoreTone {
  if (percentage == null) return 'warning';
  if (percentage >= passMark) return 'success';
  if (percentage >= passMark - 10) return 'warning';
  return 'destructive';
}

/** `8 of 12 passed` — the sentence under the pass rate. */
export function passSentence(passed: number, failed: number): string {
  const graded = passed + failed;
  if (graded === 0) return 'No graded attempts yet';
  return `${passed} of ${graded} graded attempt${graded === 1 ? '' : 's'} passed`;
}

/* -------------------------------------------------------------------------- */
/*  Wire shape                                                                */
/* -------------------------------------------------------------------------- */

export const studentDashboardSchema = z.object({
  totals: z.object({
    attempts: z.number(),
    /** Distinct quizzes started, which is what "quizzes attempted" means. */
    quizzesAttempted: z.number(),
    quizzesAvailable: z.number(),
    passed: z.number(),
    failed: z.number(),
    inProgress: z.number(),
    averagePercentage: z.number().nullable(),
    bestPercentage: z.number().nullable(),
    worstPercentage: z.number().nullable(),
    passRate: z.number().nullable(),
    questionsAnswered: z.number(),
    questionsCorrect: z.number(),
    accuracy: z.number().nullable(),
    timeSpentSeconds: z.number(),
    averageTimeSeconds: z.number().nullable(),
  }),
  streak: z.object({ current: z.number(), best: z.number() }),
  /** Last graded attempts, oldest → newest, for the trend line. */
  trend: z.array(
    z.object({
      attemptId: z.string(),
      quizTitle: z.string(),
      percentage: z.number(),
      passed: z.boolean(),
      completedAt: z.string(),
    }),
  ),
  categories: z.array(
    z.object({
      categoryId: z.string(),
      categoryName: z.string(),
      attempts: z.number(),
      averagePercentage: z.number(),
      bestPercentage: z.number(),
      passed: z.number(),
      failed: z.number(),
    }),
  ),
  activity: z.array(
    z.object({
      date: z.string(),
      label: z.string(),
      attempts: z.number(),
      averagePercentage: z.number().nullable(),
    }),
  ),
  recent: z.array(attemptHistoryItemSchema),
  generatedAt: z.string(),
});
export type StudentDashboard = z.infer<typeof studentDashboardSchema>;

/** Statuses that carry a real score. Used by the API and by the tests. */
export const GRADED_STATUSES = ['PASSED', 'FAILED'] as const;

export function isGradedStatus(status: string): boolean {
  return (GRADED_STATUSES as readonly string[]).includes(status);
}

/** Re-exported so a component can narrow a status without a second import. */
export const dashboardAttemptStatusSchema = attemptStatusSchema;
