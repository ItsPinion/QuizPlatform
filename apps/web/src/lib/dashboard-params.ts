import type { ActivityDay, StudentDashboard } from '@quiz/shared/dashboard';
import { formatDuration, scoreTone } from '@quiz/shared/dashboard';

/**
 * Presentation helpers for the student dashboard.
 *
 * The numbers always come from the API; these functions only decide how they
 * read. Anything with an edge case worth arguing about (a student with no
 * attempts, a single data point, a missing pass mark) is a pure function so it
 * can be tested without a browser.
 */

/** `—` for a number the student has not earned yet, `72.4%` otherwise. */
export function percentLabel(value: number | null, fallback = '—'): string {
  if (value == null) return fallback;
  return `${Number(value.toFixed(2))}%`;
}

/** `8` of `10` — used by the "quizzes attempted" card. */
export function coverageLabel(attempted: number, available: number): string {
  if (available <= 0) return `${attempted} attempted`;
  return `${attempted} of ${available} published`;
}

/** The caption under the attempts card: unfinished work is worth surfacing. */
export function attemptsCaption(totals: Pick<StudentDashboard['totals'], 'inProgress'>): string {
  if (totals.inProgress === 0) return 'Nothing in progress';
  return `${totals.inProgress} still running`;
}

/** `14m` / `1h 4m` — delegates to the shared formatter so the API and UI agree. */
export function durationLabel(seconds: number | null): string {
  if (seconds == null) return '—';
  return formatDuration(seconds);
}

/** Pass rate as a sentence plus the numbers behind it. */
export function passRateLabel(passRate: number | null): string {
  return passRate == null ? '—' : `${Number(passRate.toFixed(2))}%`;
}

/**
 * The pass mark the dashboard draws its line at.
 *
 * There is no global pass mark: every quiz sets its own. The chart spans the
 * student's last twelve graded attempts, which can be twelve different papers, so
 * a single dashed line has to choose one number — the average of the quizzes this
 * student can actually sit. The range is returned too, because "pass 60%" over a
 * catalogue that passes at 50 and 70 is a small lie the label can avoid telling.
 *
 * `fallback` is only for the empty catalogue, and it is the product default that
 * the create form uses — never a guess about a quiz that exists.
 */
export function passMarkOf(
  quizzes: readonly { passingScore: number }[],
  fallback = 60,
): { mark: number; min: number | null; max: number | null } {
  const scores = quizzes
    .map((quiz) => quiz.passingScore)
    .filter((score) => Number.isFinite(score))
    .map((score) => Math.round(score));

  if (scores.length === 0) return { mark: fallback, min: null, max: null };

  const total = scores.reduce((sum, score) => sum + score, 0);

  return {
    mark: Math.round(total / scores.length),
    min: Math.min(...scores),
    max: Math.max(...scores),
  };
}

/** `pass 65%`, or `pass 50–70%` when the catalogue disagrees with itself. */
export function passMarkLabel({
  mark,
  min,
  max,
}: {
  mark: number;
  min: number | null;
  max: number | null;
}): string {
  if (min !== null && max !== null && min !== max) return `pass ${min}–${max}%`;

  return `pass ${mark}%`;
}

/** Tone for a score card, using the shared pass-mark rule. */
export function toneFor(percentage: number | null, passMark = 60): string {
  switch (scoreTone(percentage, passMark)) {
    case 'success':
      return 'text-success';
    case 'destructive':
      return 'text-destructive';
    default:
      return 'text-warning';
  }
}

/* -------------------------------------------------------------------------- */
/*  Charts                                                                    */
/* -------------------------------------------------------------------------- */

export interface TrendPoint {
  attemptId: string;
  quizTitle: string;
  percentage: number;
  passed: boolean;
  completedAt: string;
}

/** The label under the last point: `12 Mar`. */
export function trendDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })}`;
}

/** The tooltip for one point: `SQL Databases · 40% · 18 Feb`. */
export function trendPointLabel(
  point: Pick<TrendPoint, 'quizTitle' | 'percentage' | 'completedAt'>,
): string {
  const score = percentLabel(point.percentage);
  const when = trendDateLabel(point.completedAt);

  return when ? `${point.quizTitle} · ${score} · ${when}` : `${point.quizTitle} · ${score}`;
}

/** Screen-reader summary of the trend, since an SVG is otherwise silent. */
export function trendSummary(points: readonly TrendPoint[]): string {
  if (points.length === 0) return 'No graded attempts yet.';

  const first = points[0];
  const last = points[points.length - 1];
  const direction =
    first && last
      ? last.percentage > first.percentage
        ? 'up'
        : last.percentage < first.percentage
          ? 'down'
          : 'flat'
      : 'flat';

  return `${points.length} graded attempt${points.length === 1 ? '' : 's'}, trending ${direction}: ${points
    .map((point) => `${point.percentage}%`)
    .join(' → ')}.`;
}

/** `+12.5` / `-4` / `0` — the change between the first and last point. */
export function trendDelta(points: readonly TrendPoint[]): number | null {
  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;

  return Math.round((last.percentage - first.percentage) * 10) / 10;
}

export function deltaLabel(delta: number | null): string {
  if (delta == null) return 'Not enough history';
  if (delta === 0) return 'Holding steady';
  return `${delta > 0 ? '+' : ''}${delta} pts since the first`;
}

/* -------------------------------------------------------------------------- */
/*  Activity                                                                  */
/* -------------------------------------------------------------------------- */

/** The tallest bar drives the scale; a quiet fortnight still renders 0 rows. */
export function activityScale(days: readonly ActivityDay[]): number {
  return Math.max(1, ...days.map((day) => day.attempts));
}

/** Height in percent for one day's bar, 0 when nothing happened. */
export function activityHeight(day: ActivityDay, scale: number): number {
  if (scale <= 0) return 0;
  return Math.round((day.attempts / scale) * 100);
}

/** `3 attempts across 2 days` — the caption under the activity chart. */
export function activityCaption(days: readonly ActivityDay[]): string {
  const attempts = days.reduce((sum, day) => sum + day.attempts, 0);
  const activeDays = days.filter((day) => day.attempts > 0).length;

  if (attempts === 0) return 'No attempts in the last two weeks';

  return `${attempts} attempt${attempts === 1 ? '' : 's'} across ${activeDays} day${
    activeDays === 1 ? '' : 's'
  }`;
}

/** Category bars are scaled against 100%, not against the best category. */
export function categoryBarWidth(average: number): number {
  return Math.min(100, Math.max(0, Math.round(average)));
}

/** `3 attempts · best 90%` */
export function categoryCaption(category: { attempts: number; bestPercentage: number }): string {
  return `${category.attempts} attempt${category.attempts === 1 ? '' : 's'} · best ${Number(
    category.bestPercentage.toFixed(2),
  )}%`;
}
