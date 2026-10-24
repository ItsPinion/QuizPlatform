import type { StudentDurationFilter, StudentQuiz, StudentQuizSort } from '@quiz/shared/attempt';
import { DURATION_BUCKETS, formatClock, STUDENT_DURATION_FILTERS } from '@quiz/shared/attempt';
import type { AttemptResult } from '@quiz/shared/submission';

export type SearchParamsInput = Record<string, string | string[] | undefined>;
export type StudentDifficultyFilter = 'EASY' | 'MEDIUM' | 'HARD' | '';

export interface StudentFilters {
  search: string;
  categoryId: string;
  difficulty: StudentDifficultyFilter;
  /** Duration bucket. `ANY` is the absence of the filter, not a third state. */
  duration: StudentDurationFilter;
  sort: StudentQuizSort;
  page: number;
}

export const DEFAULT_STUDENT_PAGE_SIZE = 9;
const SORTS: StudentQuizSort[] = ['newest', 'title', 'duration', 'popular'];
const DIFFICULTIES: StudentDifficultyFilter[] = ['EASY', 'MEDIUM', 'HARD'];

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** Same contract as the admin directory: bad values fall back, the API stays strict. */
export function parseStudentFilters(params: SearchParamsInput): StudentFilters {
  const search = single(params.search).trim().slice(0, 120);
  const difficulty = single(params.difficulty).toUpperCase() as StudentDifficultyFilter;
  const categoryId = single(params.categoryId);
  const sort = single(params.sort).toLowerCase();
  const duration = single(params.duration).toUpperCase() as StudentDurationFilter;
  const page = Number.parseInt(single(params.page), 10);

  return {
    search,
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : '',
    categoryId: /^[0-9a-f-]{36}$/i.test(categoryId) ? categoryId : '',
    duration: STUDENT_DURATION_FILTERS.includes(duration) ? duration : 'ANY',
    sort: SORTS.includes(sort as StudentQuizSort) ? (sort as StudentQuizSort) : 'newest',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function toStudentQuery(filters: StudentFilters): Record<string, string> {
  const query: Record<string, string> = {
    sort: filters.sort,
    page: String(filters.page),
    pageSize: String(DEFAULT_STUDENT_PAGE_SIZE),
  };

  if (filters.search) query.search = filters.search;
  if (filters.difficulty) query.difficulty = filters.difficulty;
  if (filters.categoryId) query.categoryId = filters.categoryId;
  if (filters.duration !== 'ANY') query.duration = filters.duration;

  return query;
}

export function quizzesHref(filters: Partial<StudentFilters>): string {
  const merged = { ...parseStudentFilters({}), ...filters };
  const params = new URLSearchParams();

  if (merged.search) params.set('search', merged.search);
  // Never emit something `parseStudentFilters` would drop: a hand-built href
  // and a hand-edited URL must behave the same.
  if (DIFFICULTIES.includes(merged.difficulty)) params.set('difficulty', merged.difficulty);
  if (/^[0-9a-f-]{36}$/i.test(merged.categoryId)) params.set('categoryId', merged.categoryId);
  if (merged.sort !== 'newest') params.set('sort', merged.sort);
  if (merged.duration !== 'ANY') params.set('duration', merged.duration);
  if (merged.page > 1) params.set('page', String(merged.page));

  const query = params.toString();
  return query ? `/student/quizzes?${query}` : '/student/quizzes';
}

export function hasStudentFilters(filters: StudentFilters): boolean {
  return Boolean(
    filters.search || filters.difficulty || filters.categoryId || filters.duration !== 'ANY',
  );
}

export function describeStudentFilters(filters: StudentFilters, categoryName?: string): string[] {
  const parts: string[] = [];

  if (filters.search) parts.push(`“${filters.search}”`);
  if (categoryName) parts.push(categoryName);
  if (filters.difficulty) parts.push(filters.difficulty.toLowerCase());
  if (filters.duration !== 'ANY') parts.push(DURATION_BUCKETS[filters.duration].label);

  return parts;
}

/* -------------------------------------------------------------------------- */
/*  Attempt presentation                                                      */
/* -------------------------------------------------------------------------- */

export type AttemptStartState =
  'start' | 'resume' | 'exhausted' | 'unavailable' | 'scheduled' | 'closed';

/**
 * What the primary button on a quiz card should say.
 *
 * The order mirrors `startDecision` on the server: a live attempt outranks
 * everything (a paper that began while the quiz was open must stay finishable),
 * then an empty paper, then the window, then the attempt count. The UI never
 * decides anything the API would disagree with — `decideAccess`-style: the API
 * still refuses a start outside the window, this only explains it first.
 */
export function startState(quiz: StudentQuiz): AttemptStartState {
  if (quiz.inProgressAttemptId) return 'resume';
  if (quiz.questionCount === 0) return 'unavailable';
  if (quiz.availability === 'SCHEDULED') return 'scheduled';
  if (quiz.availability === 'CLOSED') return 'closed';
  if (quiz.attemptsUsed >= quiz.maxAttempts) return 'exhausted';
  return 'start';
}

export function startLabel(state: AttemptStartState): string {
  switch (state) {
    case 'resume':
      return 'Resume attempt';
    case 'exhausted':
      return 'No attempts left';
    case 'unavailable':
      return 'Not ready';
    case 'scheduled':
      return 'Opens later';
    case 'closed':
      return 'Closed';
    default:
      return 'Start quiz';
  }
}

/**
 * When a scheduled quiz opens, in the reader's own words.
 *
 * A date is fine on a detail page and useless on a card: what somebody deciding
 * whether to come back wants is "opens in 3 days". Falls back to the date when
 * the gap is too large to be useful as a countdown.
 */
export function opensLabel(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '';

  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return '';

  const minutes = Math.round((at - now) / 60_000);

  if (minutes <= 0) return 'any moment';
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  }

  const days = Math.round(minutes / (60 * 24));
  if (days <= 14) return `in ${days} day${days === 1 ? '' : 's'}`;

  return `on ${new Date(at).toISOString().slice(0, 10)}`;
}

/** The one-line note under a quiz card explaining a blocked or penalised paper. */
export function paperNote(
  quiz: Pick<StudentQuiz, 'availability' | 'availableFrom' | 'availableUntil' | 'negativeMarks'>,
  now: number = Date.now(),
): string | null {
  if (quiz.availability === 'SCHEDULED') {
    return quiz.availableFrom ? `Opens ${opensLabel(quiz.availableFrom, now)}` : 'Not open yet';
  }

  if (quiz.availability === 'CLOSED') {
    return quiz.availableUntil
      ? `Closed ${new Date(quiz.availableUntil).toISOString().slice(0, 10)}`
      : 'Closed';
  }

  if (quiz.negativeMarks > 0) {
    return `−${quiz.negativeMarks} per wrong answer`;
  }

  return null;
}

/** `2 of 3 attempts used` — the sentence that stops a surprise later. */
export function attemptsLabel(quiz: Pick<StudentQuiz, 'attemptsUsed' | 'maxAttempts'>): string {
  return `${quiz.attemptsUsed} of ${quiz.maxAttempts} attempt${quiz.maxAttempts === 1 ? '' : 's'} used`;
}

export function bestScoreLabel(quiz: Pick<StudentQuiz, 'bestPercentage'>): string {
  return quiz.bestPercentage == null ? 'No score yet' : `${Math.round(quiz.bestPercentage)}% best`;
}

export function progressPercent(answered: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((answered / total) * 100));
}

/** Screen-reader friendly clock text, e.g. "14 minutes 32 seconds left". */
export function describeClock(seconds: number): string {
  if (seconds <= 0) return 'Time is up';

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts: string[] = [];

  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (rest > 0) parts.push(`${rest} second${rest === 1 ? '' : 's'}`);

  return `${parts.join(' ')} left`;
}

export function clockLabel(seconds: number): string {
  return formatClock(seconds);
}

/** A, B, C… for option lists. */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Tone for the timer chip: green → amber → red. */
export function timerClass(seconds: number, expired: boolean): string {
  if (expired || seconds <= 0) return 'border-destructive/40 bg-destructive/10 text-destructive';
  if (seconds <= 60) return 'border-destructive/40 bg-destructive/10 text-destructive';
  if (seconds <= 300) return 'border-warning/40 bg-warning/10 text-warning';
  return 'border-border bg-background/60 text-foreground';
}

/* -------------------------------------------------------------------------- */
/*  Submission results                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `80%` / `66.67%` — trailing zeros are noise on a score card.
 *
 * The number itself is always the server's; this only formats it.
 */
export function formatPercentage(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

export function resultHeadline(result: Pick<AttemptResult, 'passed'>): string {
  return result.passed ? 'You passed' : 'Not this time';
}

export type ResultTone = 'success' | 'destructive';

export function resultTone(passed: boolean): ResultTone {
  return passed ? 'success' : 'destructive';
}

/** `8 of 10 marks`, the line under the big percentage. */
export function scoreFraction(result: Pick<AttemptResult, 'score' | 'totalMarks'>): string {
  return `${result.score} of ${result.totalMarks} mark${result.totalMarks === 1 ? '' : 's'}`;
}

/** Only shown when the clock, not the student, ended the attempt. */
export function autoSubmitNote(autoSubmitted: boolean): string | null {
  return autoSubmitted
    ? 'Time ran out — this attempt was submitted automatically at the deadline.'
    : null;
}

/** `14:21` — how long the attempt actually took. */
export function timeTakenLabel(seconds: number): string {
  return formatClock(seconds);
}

/** One-line verdict for screen readers and the result card header. */
export function resultSummary(result: AttemptResult): string {
  return `${result.passed ? 'Passed' : 'Failed'} with ${formatPercentage(
    result.percentage,
  )} — ${scoreFraction(result)}`;
}
