import type { QuizSort } from '@quiz/shared/quiz';

export type SearchParamsInput = Record<string, string | string[] | undefined>;

export type QuizStatusFilter = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | '';
export type QuizDifficultyFilter = 'EASY' | 'MEDIUM' | 'HARD' | '';

export interface QuizFilters {
  search: string;
  status: QuizStatusFilter;
  difficulty: QuizDifficultyFilter;
  categoryId: string;
  sort: QuizSort;
  page: number;
  pageSize: number;
}

export const DEFAULT_QUIZ_PAGE_SIZE = 10;
const SORTS: QuizSort[] = ['newest', 'oldest', 'title', 'questions'];
const STATUSES: QuizStatusFilter[] = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'];
const DIFFICULTIES: QuizDifficultyFilter[] = ['EASY', 'MEDIUM', 'HARD'];

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Same contract as the user directory (Day 4): unrecognised values fall back to
 * the default so a hand-edited URL still renders, and the API stays the strict
 * validator for anything that bypasses this screen.
 */
export function parseQuizFilters(params: SearchParamsInput): QuizFilters {
  const search = single(params.search).trim().slice(0, 120);
  const status = single(params.status).toUpperCase() as QuizStatusFilter;
  const difficulty = single(params.difficulty).toUpperCase() as QuizDifficultyFilter;
  const categoryId = single(params.categoryId);
  const sort = single(params.sort).toLowerCase();
  const page = Number.parseInt(single(params.page), 10);
  const pageSize = Number.parseInt(single(params.pageSize), 10);

  return {
    search,
    status: STATUSES.includes(status) ? status : '',
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : '',
    // A category id is opaque here; a bad one simply matches nothing.
    categoryId: /^[0-9a-f-]{36}$/i.test(categoryId) ? categoryId : '',
    sort: SORTS.includes(sort as QuizSort) ? (sort as QuizSort) : 'newest',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize:
      Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 50
        ? pageSize
        : DEFAULT_QUIZ_PAGE_SIZE,
  };
}

export function toQuizQuery(filters: QuizFilters): Record<string, string> {
  const query: Record<string, string> = {
    sort: filters.sort,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  };

  if (filters.search) query.search = filters.search;
  if (filters.status) query.status = filters.status;
  if (filters.difficulty) query.difficulty = filters.difficulty;
  if (filters.categoryId) query.categoryId = filters.categoryId;

  return query;
}

export function quizzesHref(filters: Partial<QuizFilters>): string {
  const params = new URLSearchParams();
  const merged = { ...parseQuizFilters({}), ...filters };

  if (merged.search) params.set('search', merged.search);
  if (merged.status) params.set('status', merged.status);
  if (merged.difficulty) params.set('difficulty', merged.difficulty);
  if (merged.categoryId) params.set('categoryId', merged.categoryId);
  if (merged.sort !== 'newest') params.set('sort', merged.sort);
  if (merged.page > 1) params.set('page', String(merged.page));
  if (merged.pageSize !== DEFAULT_QUIZ_PAGE_SIZE) params.set('pageSize', String(merged.pageSize));

  const query = params.toString();
  return query ? `/admin/quizzes?${query}` : '/admin/quizzes';
}

export function hasQuizFilters(filters: QuizFilters): boolean {
  return (
    Boolean(filters.search || filters.status || filters.difficulty || filters.categoryId) ||
    filters.sort !== 'newest'
  );
}

export function describeQuizFilters(filters: QuizFilters, categoryName?: string): string {
  const parts: string[] = [];

  if (filters.search) parts.push(`matching “${filters.search}”`);
  if (categoryName) parts.push(categoryName);
  if (filters.difficulty) parts.push(filters.difficulty.toLowerCase());
  if (filters.status) parts.push(filters.status.toLowerCase());
  if (filters.sort !== 'newest') parts.push(`sorted by ${filters.sort}`);

  return parts.length > 0 ? parts.join(' · ') : 'all quizzes, newest first';
}

/** `45` → `45 min`, `90` → `1h 30m`. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function statusTone(status: string): 'success' | 'warning' | 'outline' {
  if (status === 'PUBLISHED') return 'success';
  if (status === 'DRAFT') return 'warning';
  return 'outline';
}

export function difficultyTone(difficulty: string): 'success' | 'warning' | 'destructive' {
  if (difficulty === 'EASY') return 'success';
  if (difficulty === 'HARD') return 'destructive';
  return 'warning';
}

/**
 * Why a quiz cannot be published, or `null` when it can. Mirrors the API rule
 * (`canPublish`) so the button can explain itself instead of failing with 409.
 */
export function publishBlocker(questionCount: number): string | null {
  return questionCount === 0 ? 'Add at least one question first' : null;
}

/** Why a quiz cannot be deleted, or `null` when it can. Mirrors `canDelete`. */
export function deleteBlocker(attemptCount: number): string | null {
  return attemptCount > 0
    ? `${attemptCount} attempt${attemptCount === 1 ? '' : 's'} — unpublish instead`
    : null;
}
