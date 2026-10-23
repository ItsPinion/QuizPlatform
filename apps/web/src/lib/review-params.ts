import type { AttemptHistoryQuery, ReviewFilter, ReviewVerdict } from '@quiz/shared/review';
import { REVIEW_FILTERS } from '@quiz/shared/review';

export type SearchParamsInput = Record<string, string | string[] | undefined>;
export type HistoryStatusFilter = 'PASSED' | 'FAILED' | 'IN_PROGRESS' | '';
export type HistorySort = 'newest' | 'oldest' | 'score';

export const HISTORY_PAGE_SIZE = 10;

export interface HistoryFilters {
  status: HistoryStatusFilter;
  quizId: string;
  sort: HistorySort;
  page: number;
}

const STATUSES: HistoryStatusFilter[] = ['PASSED', 'FAILED', 'IN_PROGRESS'];
const SORTS: HistorySort[] = ['newest', 'oldest', 'score'];
const UUID = /^[0-9a-f-]{36}$/i;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * The review screen's filter.
 *
 * A bad value falls back to `all` rather than erroring: this is a view of a
 * paper the student already has, so a hand-edited URL should never break it.
 */
export function parseReviewFilter(params: SearchParamsInput): ReviewFilter {
  const value = single(params.filter).toLowerCase();
  return (REVIEW_FILTERS as readonly string[]).includes(value) ? (value as ReviewFilter) : 'all';
}

export function reviewHref(attemptId: string, filter: ReviewFilter = 'all'): string {
  const base = `/student/attempt/${attemptId}/review`;
  return filter === 'all' ? base : `${base}?filter=${filter}`;
}

export function parseHistoryFilters(params: SearchParamsInput): HistoryFilters {
  const status = single(params.status).toUpperCase() as HistoryStatusFilter;
  const sort = single(params.sort).toLowerCase();
  const quizId = single(params.quizId);
  const page = Number.parseInt(single(params.page), 10);

  return {
    status: STATUSES.includes(status) ? status : '',
    sort: SORTS.includes(sort as HistorySort) ? (sort as HistorySort) : 'newest',
    quizId: UUID.test(quizId) ? quizId : '',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function toHistoryQuery(filters: HistoryFilters): AttemptHistoryQuery {
  const query: AttemptHistoryQuery = {
    sort: filters.sort,
    page: filters.page,
    pageSize: HISTORY_PAGE_SIZE,
  };

  if (filters.status) query.status = filters.status;
  if (filters.quizId) query.quizId = filters.quizId;

  return query;
}

/** Same contract as `quizzesHref`: never emit a value the parser would drop. */
export function historyHref(filters: Partial<HistoryFilters>): string {
  const merged = { ...parseHistoryFilters({}), ...filters };
  const params = new URLSearchParams();

  if (STATUSES.includes(merged.status)) params.set('status', merged.status);
  if (SORTS.includes(merged.sort) && merged.sort !== 'newest') params.set('sort', merged.sort);
  if (UUID.test(merged.quizId)) params.set('quizId', merged.quizId);
  if (merged.page > 1) params.set('page', String(merged.page));

  const query = params.toString();
  return query ? `/student/results?${query}` : '/student/results';
}

/* -------------------------------------------------------------------------- */
/*  Presentation                                                              */
/* -------------------------------------------------------------------------- */

export type VerdictTone = 'success' | 'destructive' | 'outline';

export function verdictTone(verdict: ReviewVerdict): VerdictTone {
  switch (verdict) {
    case 'CORRECT':
      return 'success';
    case 'INCORRECT':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function verdictLabel(verdict: ReviewVerdict): string {
  switch (verdict) {
    case 'CORRECT':
      return 'Correct';
    case 'INCORRECT':
      return 'Incorrect';
    default:
      return 'Not answered';
  }
}

/** `Question 3 of 10` — the review is ordered, so it keeps its numbering. */
export function reviewPositionLabel(index: number, total: number): string {
  return `Question ${index + 1} of ${total}`;
}

/** `+2 marks` / `0 of 2 marks` — what the question was worth. */
export function reviewMarksLabel(verdict: ReviewVerdict, marks: number): string {
  const plural = marks === 1 ? 'mark' : 'marks';
  return verdict === 'CORRECT' ? `+${marks} ${plural}` : `0 of ${marks} ${plural}`;
}

/** The line under a wrong answer: what the student picked, or that they skipped. */
export function reviewSelectionLabel(
  verdict: ReviewVerdict,
  selectedText: string | null,
  correctText: string | null,
): string {
  if (verdict === 'CORRECT') return 'Your answer was right.';
  if (verdict === 'UNANSWERED') return `Not answered — the right answer was ${correctText ?? '—'}.`;
  return `You picked ${selectedText ?? '—'}; the right answer was ${correctText ?? '—'}.`;
}

/** `8 of 10 correct` for the review header. */
export function reviewScoreLabel(correct: number, total: number): string {
  return `${correct} of ${total} correct`;
}

/** Filter chips with their counts, in a stable order. */
export function reviewFilterOptions(counts: {
  all: number;
  correct: number;
  incorrect: number;
  unanswered: number;
}): { value: ReviewFilter; label: string; count: number }[] {
  return [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'correct', label: 'Correct', count: counts.correct },
    { value: 'incorrect', label: 'Incorrect', count: counts.incorrect },
    { value: 'unanswered', label: 'Unanswered', count: counts.unanswered },
  ];
}

/** History row badge tone, reusing the badge variants the app already has. */
export function historyTone(status: string): VerdictTone {
  if (status === 'PASSED') return 'success';
  if (status === 'FAILED') return 'destructive';
  return 'outline';
}

/** `Today 14:32` / `12 Mar 2026` — enough to recognise a row at a glance. */
export function historyWhen(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return `Today ${time}`;

  return `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })} ${date.getFullYear()}`;
}
