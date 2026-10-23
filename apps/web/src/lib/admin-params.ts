import type { UserListResponse, UserSort } from '@quiz/shared/admin';

export type SearchParamsInput = Record<string, string | string[] | undefined>;

export type RoleFilter = 'ADMIN' | 'STUDENT' | '';
export type StatusFilter = 'ACTIVE' | 'INACTIVE' | '';

export interface UserFilters {
  search: string;
  role: RoleFilter;
  status: StatusFilter;
  sort: UserSort;
  page: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 10;
const SORTS: UserSort[] = ['newest', 'oldest', 'name', 'attempts'];

/** Read the first value of a possibly-repeated query parameter. */
function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Turn raw `searchParams` into filters the API will accept.
 *
 * Anything unrecognised falls back to the default instead of erroring: a
 * hand-edited URL should still render a page, and the API remains the strict
 * validator for anything that bypasses this screen.
 */
export function parseUserFilters(params: SearchParamsInput): UserFilters {
  const search = single(params.search).trim().slice(0, 120);
  const role = single(params.role).toUpperCase();
  const status = single(params.status).toUpperCase();
  const sort = single(params.sort).toLowerCase();
  const page = Number.parseInt(single(params.page), 10);
  const pageSize = Number.parseInt(single(params.pageSize), 10);

  return {
    search,
    role: role === 'ADMIN' || role === 'STUDENT' ? role : '',
    status: status === 'ACTIVE' || status === 'INACTIVE' ? status : '',
    sort: SORTS.includes(sort as UserSort) ? (sort as UserSort) : 'newest',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize:
      Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 50 ? pageSize : DEFAULT_PAGE_SIZE,
  };
}

/** Only the non-default filters, so the API sees exactly what the UI shows. */
export function toUserQuery(filters: UserFilters): Record<string, string> {
  const query: Record<string, string> = {
    sort: filters.sort,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  };

  if (filters.search) query.search = filters.search;
  if (filters.role) query.role = filters.role;
  if (filters.status) query.status = filters.status;

  return query;
}

/** Round-trip a filter set back into an `/admin/users` href for pagination links. */
export function usersHref(filters: Partial<UserFilters>): string {
  const params = new URLSearchParams();
  const merged = { ...parseUserFilters({}), ...filters };

  if (merged.search) params.set('search', merged.search);
  if (merged.role) params.set('role', merged.role);
  if (merged.status) params.set('status', merged.status);
  if (merged.sort !== 'newest') params.set('sort', merged.sort);
  if (merged.page > 1) params.set('page', String(merged.page));
  if (merged.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(merged.pageSize));

  const query = params.toString();
  return query ? `/admin/users?${query}` : '/admin/users';
}

/** True when the screen is showing a filtered (not "everything") result set. */
export function hasActiveFilters(filters: UserFilters): boolean {
  return Boolean(filters.search || filters.role || filters.status) || filters.sort !== 'newest';
}

/** Human summary used in the results header, e.g. `3 students · inactive`. */
export function describeFilters(filters: UserFilters): string {
  const parts: string[] = [];

  if (filters.search) parts.push(`matching “${filters.search}”`);
  if (filters.role) parts.push(filters.role === 'ADMIN' ? 'admins' : 'students');
  if (filters.status) parts.push(filters.status === 'ACTIVE' ? 'active' : 'inactive');
  if (filters.sort !== 'newest') parts.push(`sorted by ${filters.sort}`);

  return parts.length > 0 ? parts.join(' · ') : 'all accounts, newest first';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** `1–10 of 24` for the page footer; safe when the page is past the end. */
export function rangeLabel(pagination: UserListResponse['pagination']): string {
  if (pagination.total === 0) return '0 of 0';

  const start = (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.total, start + pagination.pageSize - 1);

  if (start > pagination.total) return `${pagination.total} of ${pagination.total}`;
  return `${start}–${end} of ${pagination.total}`;
}

export function relativeDay(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);

  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;

  return then.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
