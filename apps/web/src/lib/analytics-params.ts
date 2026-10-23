import type {
  AnalyticsWindow,
  CategoryAnalyticsRow,
  QuizPerformanceRow,
  RatioSlice,
} from '@quiz/shared/analytics';
import {
  ANALYTICS_WINDOWS,
  DEFAULT_ANALYTICS_WINDOW,
  parseAnalyticsWindow,
} from '@quiz/shared/analytics';

export type SearchParamsInput = Record<string, string | string[] | undefined>;

/** Read the first value of a possibly-repeated query parameter. */
function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * The analytics window from the URL.
 *
 * Unrecognised values fall back to the default rather than erroring, so a
 * hand-edited `?days=365` still renders a page; the API stays the strict
 * validator for anything that bypasses this screen.
 */
export function analyticsWindow(params: SearchParamsInput): AnalyticsWindow {
  return parseAnalyticsWindow(single(params.days));
}

/** The URL for a window — the default gets a bare path, so links stay short. */
export function windowHref(days: AnalyticsWindow): string {
  return days === DEFAULT_ANALYTICS_WINDOW ? '/admin/analytics' : `/admin/analytics?days=${days}`;
}

/** `Last 30 days` — the caption under the heading. */
export function windowLabel(days: number): string {
  return `Last ${days} day${days === 1 ? '' : 's'}`;
}

/** `30 days` — used inside sentences about the previous window. */
export function windowSpan(days: number): string {
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * `+18.5% vs the previous 30 days`, `—` when there is nothing to compare to.
 *
 * A window with no history prints words rather than `+100%`: growth from zero
 * is not a percentage.
 */
export function changeLabel(change: number | null, days: number): string {
  if (change == null) return `No attempts in the previous ${windowSpan(days)}`;

  const arrow = change > 0 ? '+' : '';
  const tone = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const word = tone === 'up' ? 'more' : tone === 'down' ? 'fewer' : 'the same';

  if (change === 0) return `Same volume as the previous ${windowSpan(days)}`;

  return `${arrow}${Math.abs(change)}% ${word} than the previous ${windowSpan(days)}`;
}

/** Tone class for a change value, matched to the app's palette. */
export function changeTone(change: number | null): string {
  if (change == null) return 'text-muted-foreground';
  if (change > 0) return 'text-success';
  if (change < 0) return 'text-destructive';
  return 'text-muted-foreground';
}

/** `Passed`, `Failed`, `Expired` — the donut legend. */
export function outcomeLabel(kind: RatioSlice['kind']): string {
  switch (kind) {
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    default:
      return 'Expired';
  }
}

/** Fill/tone class per outcome, kept in one place so legend and bar agree. */
export function outcomeTone(kind: RatioSlice['kind']): string {
  switch (kind) {
    case 'passed':
      return 'bg-success/70';
    case 'failed':
      return 'bg-destructive/70';
    default:
      return 'bg-warning/70';
  }
}

/** `3 attempts · 2 learners`, with the singular spelled out. */
export function popularityCaption(row: Pick<QuizPerformanceRow, 'attempts' | 'learners'>): string {
  const attempts = `${row.attempts} attempt${row.attempts === 1 ? '' : 's'}`;
  const learners = `${row.learners} learner${row.learners === 1 ? '' : 's'}`;
  return `${attempts} · ${learners}`;
}

/** `2 quizzes · 5 attempts` — the category list caption. */
export function categoryCaption(row: Pick<CategoryAnalyticsRow, 'quizzes' | 'attempts'>): string {
  return `${row.quizzes} quiz${row.quizzes === 1 ? '' : 'zes'} · ${row.attempts} attempt${
    row.attempts === 1 ? '' : 's'
  }`;
}

/** A score bar measured against 100%, clamped so a bad value cannot overflow. */
export function scoreBarWidth(value: number | null): number {
  if (value == null) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** `Pass 72%` / `No graded attempts` — the caption next to a quiz bar. */
export function passRateCaption(rate: number | null): string {
  if (rate == null) return 'No graded attempts';
  return `${Number(rate.toFixed(1))}% pass rate`;
}

/** Screen-reader summary of the attempts chart, since an SVG is otherwise silent. */
export function timelineSummary(
  points: readonly { label: string; attempts: number; registrations: number }[],
): string {
  if (points.length === 0) return 'No activity in this window.';

  const attempts = points.reduce((sum, point) => sum + point.attempts, 0);
  const registrations = points.reduce((sum, point) => sum + point.registrations, 0);
  const peak = points.reduce(
    (best, point) => (point.attempts > best.attempts ? point : best),
    points[0]!,
  );

  return `${attempts} attempt${attempts === 1 ? '' : 's'} and ${registrations} registration${
    registrations === 1 ? '' : 's'
  } across ${points.length} days; busiest day ${peak.label} with ${peak.attempts}.`;
}

/** The four chips, in display order. */
export const WINDOW_OPTIONS = ANALYTICS_WINDOWS;
