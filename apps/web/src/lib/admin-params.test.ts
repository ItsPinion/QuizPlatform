import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_SIZE,
  describeFilters,
  hasActiveFilters,
  initials,
  parseUserFilters,
  rangeLabel,
  relativeDay,
  toUserQuery,
  usersHref,
  type UserFilters,
} from './admin-params';

const defaults: UserFilters = {
  search: '',
  role: '',
  status: '',
  sort: 'newest',
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

describe('parseUserFilters', () => {
  it('falls back to the defaults for an empty query string', () => {
    expect(parseUserFilters({})).toEqual(defaults);
  });

  it('reads every supported filter', () => {
    expect(
      parseUserFilters({
        search: 'priya',
        role: 'STUDENT',
        status: 'ACTIVE',
        sort: 'name',
        page: '2',
      }),
    ).toEqual({
      ...defaults,
      search: 'priya',
      role: 'STUDENT',
      status: 'ACTIVE',
      sort: 'name',
      page: 2,
    });
  });

  it('trims the search term and caps its length', () => {
    expect(parseUserFilters({ search: '  rahul  ' }).search).toBe('rahul');
    expect(parseUserFilters({ search: 'x'.repeat(200) }).search).toHaveLength(120);
  });

  it('is case-insensitive for role and status', () => {
    const parsed = parseUserFilters({ role: 'admin', status: 'inactive' });
    expect(parsed.role).toBe('ADMIN');
    expect(parsed.status).toBe('INACTIVE');
  });

  it('ignores an unknown role, status or sort instead of failing', () => {
    const parsed = parseUserFilters({ role: 'TEACHER', status: 'PENDING', sort: 'random' });
    expect(parsed.role).toBe('');
    expect(parsed.status).toBe('');
    expect(parsed.sort).toBe('newest');
  });

  it('clamps an unusable page to 1', () => {
    expect(parseUserFilters({ page: '0' }).page).toBe(1);
    expect(parseUserFilters({ page: '-4' }).page).toBe(1);
    expect(parseUserFilters({ page: 'abc' }).page).toBe(1);
  });

  it('clamps an unusable page size to the default', () => {
    expect(parseUserFilters({ pageSize: '0' }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parseUserFilters({ pageSize: '999' }).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('uses the first value when a parameter is repeated', () => {
    expect(parseUserFilters({ role: ['ADMIN', 'STUDENT'] }).role).toBe('ADMIN');
  });
});

describe('toUserQuery', () => {
  it('omits empty filters and always sends paging + sort', () => {
    expect(toUserQuery(defaults)).toEqual({ sort: 'newest', page: '1', pageSize: '10' });
  });

  it('includes the filters that are set', () => {
    expect(
      toUserQuery({ ...defaults, search: 'amit', role: 'STUDENT', status: 'INACTIVE', page: 3 }),
    ).toEqual({
      sort: 'newest',
      page: '3',
      pageSize: '10',
      search: 'amit',
      role: 'STUDENT',
      status: 'INACTIVE',
    });
  });

  it('produces only strings, as the query string contract requires', () => {
    const query = toUserQuery({ ...defaults, page: 2, pageSize: 25 });
    expect(Object.values(query).every((value) => typeof value === 'string')).toBe(true);
  });
});

describe('usersHref', () => {
  it('returns the bare path when nothing is filtered', () => {
    expect(usersHref({})).toBe('/admin/users');
    expect(usersHref({ page: 1, sort: 'newest', pageSize: DEFAULT_PAGE_SIZE })).toBe(
      '/admin/users',
    );
  });

  it('round-trips a filter set through parseUserFilters', () => {
    const filters: UserFilters = {
      search: 'priya sharma',
      role: 'STUDENT',
      status: 'ACTIVE',
      sort: 'name',
      page: 2,
      pageSize: 25,
    };

    const href = usersHref(filters);
    const parsed = new URL(href, 'http://localhost');

    expect(parsed.pathname).toBe('/admin/users');
    expect(parsed.searchParams.get('search')).toBe('priya sharma');
    expect(parsed.searchParams.get('role')).toBe('STUDENT');
    expect(parsed.searchParams.get('sort')).toBe('name');
    expect(parsed.searchParams.get('page')).toBe('2');
    expect(parsed.searchParams.get('pageSize')).toBe('25');
  });

  it('encodes characters that would otherwise break the query', () => {
    expect(usersHref({ search: 'a&b=c?d' })).toContain('search=a%26b%3Dc%3Fd');
  });

  it('keeps existing filters when paging', () => {
    const href = usersHref({ ...defaults, search: 'rahul', page: 3 });
    expect(href).toContain('search=rahul');
    expect(href).toContain('page=3');
  });
});

describe('describeFilters', () => {
  it('describes the unfiltered state', () => {
    expect(describeFilters(defaults)).toBe('all accounts, newest first');
  });

  it('lists only the active criteria', () => {
    expect(describeFilters({ ...defaults, search: 'priya' })).toBe('matching “priya”');
    expect(describeFilters({ ...defaults, role: 'ADMIN', status: 'INACTIVE' })).toBe(
      'admins · inactive',
    );
    expect(describeFilters({ ...defaults, sort: 'attempts' })).toBe('sorted by attempts');
  });

  it('agrees with hasActiveFilters', () => {
    expect(hasActiveFilters(defaults)).toBe(false);
    expect(hasActiveFilters({ ...defaults, search: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...defaults, role: 'STUDENT' })).toBe(true);
    expect(hasActiveFilters({ ...defaults, status: 'INACTIVE' })).toBe(true);
    expect(hasActiveFilters({ ...defaults, sort: 'name' })).toBe(true);
    // Paging alone is not a filter.
    expect(hasActiveFilters({ ...defaults, page: 4 })).toBe(false);
  });
});

describe('rangeLabel', () => {
  const pagination = (page: number, total: number) => ({
    page,
    pageSize: 10,
    total,
    totalPages: Math.max(1, Math.ceil(total / 10)),
    hasNext: page * 10 < total,
    hasPrev: page > 1,
  });

  it('shows 0 of 0 for an empty result set', () => {
    expect(rangeLabel(pagination(1, 0))).toBe('0 of 0');
  });

  it('shows the visible window', () => {
    expect(rangeLabel(pagination(1, 24))).toBe('1–10 of 24');
    expect(rangeLabel(pagination(3, 24))).toBe('21–24 of 24');
  });

  it('degrades gracefully when the page is past the end', () => {
    expect(rangeLabel(pagination(9, 24))).toBe('24 of 24');
  });
});

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Priya Sharma')).toBe('PS');
    expect(initials('Alex')).toBe('A');
    expect(initials('  rahul   kumar  verma ')).toBe('RK');
  });

  it('handles an empty name', () => {
    expect(initials('')).toBe('');
  });
});

describe('relativeDay', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('labels today and yesterday', () => {
    expect(relativeDay('2026-06-15T09:00:00.000Z', now)).toBe('today');
    expect(relativeDay('2026-06-14T09:00:00.000Z', now)).toBe('yesterday');
  });

  it('counts days inside the last month', () => {
    expect(relativeDay('2026-06-10T09:00:00.000Z', now)).toBe('5 days ago');
  });

  it('falls back to a date beyond 30 days', () => {
    const label = relativeDay('2026-01-02T09:00:00.000Z', now);
    expect(label).toMatch(/2026/);
    expect(label).not.toMatch(/ago/);
  });
});
