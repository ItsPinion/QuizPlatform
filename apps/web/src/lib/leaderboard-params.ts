import type { LeaderboardMetric, LeaderboardPeriod } from '@quiz/shared/leaderboard';
import {
  DEFAULT_LEADERBOARD_LIMIT,
  LEADERBOARD_METRICS,
  LEADERBOARD_PERIODS,
} from '@quiz/shared/leaderboard';

export type SearchParamsInput = Record<string, string | string[] | undefined>;

export interface LeaderboardFilters {
  metric: LeaderboardMetric;
  period: LeaderboardPeriod;
  categoryId: string;
  /** Only ever the default here; the API accepts up to 50. */
  limit: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read the first value of a possibly-repeated query parameter. */
function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Turn raw `searchParams` into a leaderboard query.
 *
 * Everything unrecognised falls back to the default rather than throwing, so a
 * hand-edited `?metric=streak` still renders the average board; the API remains
 * the strict validator for anything that bypasses this screen.
 */
export function parseLeaderboardFilters(params: SearchParamsInput): LeaderboardFilters {
  const metric = single(params.metric).toLowerCase();
  const period = single(params.period).toLowerCase();
  const categoryId = single(params.categoryId).trim();

  return {
    metric: (LEADERBOARD_METRICS as readonly string[]).includes(metric)
      ? (metric as LeaderboardMetric)
      : 'average',
    period: (LEADERBOARD_PERIODS as readonly string[]).includes(period)
      ? (period as LeaderboardPeriod)
      : 'all',
    categoryId: UUID_RE.test(categoryId) ? categoryId : '',
    limit: DEFAULT_LEADERBOARD_LIMIT,
  };
}

/** The API query — only values the endpoint understands. */
export function toLeaderboardQuery(filters: LeaderboardFilters): Record<string, string> {
  const query: Record<string, string> = {
    metric: filters.metric,
    period: filters.period,
    limit: String(filters.limit),
  };

  if (filters.categoryId) query.categoryId = filters.categoryId;

  return query;
}

/** A board URL: the current metric and category, with one control replaced. */
export function leaderboardHref(
  filters: LeaderboardFilters,
  patch: Partial<Pick<LeaderboardFilters, 'metric' | 'period' | 'categoryId'>>,
): string {
  const next = { ...filters, ...patch };
  const query = new URLSearchParams();

  // Defaults stay out of the URL so the bare path is the default board.
  if (next.metric !== 'average') query.set('metric', next.metric);
  if (next.period !== 'all') query.set('period', next.period);
  if (next.categoryId) query.set('categoryId', next.categoryId);

  const search = query.toString();
  return search ? `/student/leaderboard?${search}` : '/student/leaderboard';
}

/** `Average score` / `Best score` / `Quizzes completed`. */
export function metricLabel(metric: LeaderboardMetric): string {
  switch (metric) {
    case 'best':
      return 'Best score';
    case 'completed':
      return 'Quizzes completed';
    default:
      return 'Average score';
  }
}

/** The short form used on the chips. */
export function metricShortLabel(metric: LeaderboardMetric): string {
  switch (metric) {
    case 'best':
      return 'Best';
    case 'completed':
      return 'Completed';
    default:
      return 'Average';
  }
}

/** `All time` / `This month` / `This week`. */
export function periodLabel(period: LeaderboardPeriod): string {
  switch (period) {
    case 'month':
      return 'This month';
    case 'week':
      return 'This week';
    default:
      return 'All time';
  }
}

/** The value a row is ranked on, formatted for its metric. */
export function metricValueLabel(
  entry: { averagePercentage: number; bestPercentage: number; quizzesCompleted: number },
  metric: LeaderboardMetric,
): string {
  switch (metric) {
    case 'best':
      return `${Number(entry.bestPercentage.toFixed(2))}%`;
    case 'completed':
      return `${entry.quizzesCompleted} quiz${entry.quizzesCompleted === 1 ? '' : 'zes'}`;
    default:
      return `${Number(entry.averagePercentage.toFixed(2))}%`;
  }
}

/** `1st`, `2nd`, `3rd`, `4th` … `11th`. */
export function ordinal(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;

  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

/** Class for the rank cell: gold, silver, bronze, then plain. */
export function rankTone(rank: number): string {
  if (rank === 1) return 'text-warning';
  if (rank === 2) return 'text-muted-foreground';
  if (rank === 3) return 'text-primary';
  return 'text-foreground';
}

/**
 * How far behind the row above, in the metric's own units.
 *
 * Ties say "Tied" instead of "0 behind", and the leader says nothing at all —
 * both are more honest than a number that means "no gap to measure".
 */
export function gapLabel(gap: number, rank: number, metric: LeaderboardMetric): string {
  if (rank === 1) return '—';
  if (gap <= 0) return 'Tied';

  const value = Number(gap.toFixed(2));

  if (metric === 'completed') {
    return `${value} ${value === 1 ? 'quiz' : 'quizzes'} behind`;
  }

  return `${value} pts behind`;
}

/** `Overall` or `Category · JavaScript` — the board's scope. */
export function scopeLabel(scope: {
  type: 'overall' | 'category';
  categoryName: string | null;
}): string {
  if (scope.type === 'category' && scope.categoryName) return scope.categoryName;
  return 'Overall';
}

/** `Of 12 students` — the caption under the heading. */
export function participantsLabel(participants: number): string {
  if (participants === 0) return 'No ranked students yet';
  return `${participants} student${participants === 1 ? '' : 's'} ranked`;
}

/** The caption for the caller's own card: rank plus where that sits. */
export function currentUserCaption(rank: number, participants: number): string {
  if (participants <= 0) return 'Not ranked yet';
  const top = Math.max(1, Math.round((rank / participants) * 100));
  return `${ordinal(rank)} of ${participants} · top ${top}%`;
}

/** Screen-reader summary of the board. */
export function boardSummary(
  entries: readonly { rank: number; name: string }[],
  metric: LeaderboardMetric,
): string {
  if (entries.length === 0) return 'Nobody has finished a quiz yet.';

  const leader = entries[0];
  return `Leaderboard by ${metricLabel(metric).toLowerCase()}: ${leader?.name ?? 'nobody'} first of ${entries.length}.`;
}
