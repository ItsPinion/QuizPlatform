import { describe, expect, it } from 'vitest';

import {
  DEFAULT_QUIZ_PAGE_SIZE,
  deleteBlocker,
  describeQuizFilters,
  difficultyTone,
  formatDuration,
  hasQuizFilters,
  parseQuizFilters,
  publishBlocker,
  quizzesHref,
  rankCategories,
  statusTone,
  toQuizQuery,
  type QuizFilters,
} from './quiz-params';

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';

const defaults: QuizFilters = {
  search: '',
  status: '',
  difficulty: '',
  categoryId: '',
  sort: 'newest',
  page: 1,
  pageSize: DEFAULT_QUIZ_PAGE_SIZE,
};

describe('parseQuizFilters', () => {
  it('falls back to defaults for an empty query string', () => {
    expect(parseQuizFilters({})).toEqual(defaults);
  });

  it('reads every supported filter', () => {
    expect(
      parseQuizFilters({
        search: ' javascript ',
        status: 'published',
        difficulty: 'hard',
        categoryId: CATEGORY_ID,
        sort: 'title',
        page: '3',
      }),
    ).toEqual({
      ...defaults,
      search: 'javascript',
      status: 'PUBLISHED',
      difficulty: 'HARD',
      categoryId: CATEGORY_ID,
      sort: 'title',
      page: 3,
    });
  });

  it('ignores unknown enum values instead of failing', () => {
    expect(
      parseQuizFilters({ status: 'LIVE', difficulty: 'EXTREME', sort: 'random' }),
    ).toMatchObject({ status: '', difficulty: '', sort: 'newest' });
  });

  it('drops a malformed category id', () => {
    expect(parseQuizFilters({ categoryId: 'not-a-uuid' }).categoryId).toBe('');
  });

  it('clamps paging', () => {
    expect(parseQuizFilters({ page: '0' }).page).toBe(1);
    expect(parseQuizFilters({ page: 'abc' }).page).toBe(1);
    expect(parseQuizFilters({ pageSize: '999' }).pageSize).toBe(DEFAULT_QUIZ_PAGE_SIZE);
  });

  it('takes the first value of a repeated parameter', () => {
    expect(parseQuizFilters({ status: ['DRAFT', 'PUBLISHED'] }).status).toBe('DRAFT');
  });
});

describe('toQuizQuery', () => {
  it('always sends paging + sort and omits the rest', () => {
    expect(toQuizQuery(defaults)).toEqual({ sort: 'newest', page: '1', pageSize: '10' });
  });

  it('includes the filters that are set', () => {
    expect(
      toQuizQuery({ ...defaults, status: 'DRAFT', difficulty: 'EASY', categoryId: CATEGORY_ID }),
    ).toEqual({
      sort: 'newest',
      page: '1',
      pageSize: '10',
      status: 'DRAFT',
      difficulty: 'EASY',
      categoryId: CATEGORY_ID,
    });
  });
});

describe('quizzesHref', () => {
  it('returns the bare path when nothing is filtered', () => {
    expect(quizzesHref({})).toBe('/admin/quizzes');
  });

  it('round-trips the filters through the URL', () => {
    const href = quizzesHref({ ...defaults, search: 'html basics', status: 'PUBLISHED', page: 2 });
    const url = new URL(href, 'http://localhost');

    expect(url.pathname).toBe('/admin/quizzes');
    expect(url.searchParams.get('search')).toBe('html basics');
    expect(url.searchParams.get('status')).toBe('PUBLISHED');
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('keeps existing filters while paging', () => {
    const href = quizzesHref({ ...defaults, difficulty: 'HARD', page: 4 });
    expect(href).toContain('difficulty=HARD');
    expect(href).toContain('page=4');
  });
});

describe('describeQuizFilters', () => {
  it('describes the unfiltered state', () => {
    expect(describeQuizFilters(defaults)).toBe('all quizzes, newest first');
  });

  it('lists the active criteria, including the resolved category name', () => {
    expect(
      describeQuizFilters(
        { ...defaults, search: 'hooks', difficulty: 'HARD', status: 'DRAFT' },
        'React',
      ),
    ).toBe('matching “hooks” · React · hard · draft');
  });
});

describe('hasQuizFilters', () => {
  it('ignores paging but reacts to real filters', () => {
    expect(hasQuizFilters(defaults)).toBe(false);
    expect(hasQuizFilters({ ...defaults, page: 3 })).toBe(false);
    expect(hasQuizFilters({ ...defaults, search: 'x' })).toBe(true);
    expect(hasQuizFilters({ ...defaults, categoryId: CATEGORY_ID })).toBe(true);
    expect(hasQuizFilters({ ...defaults, sort: 'title' })).toBe(true);
  });
});

describe('formatDuration', () => {
  it('renders minutes, whole hours and mixed values', () => {
    expect(formatDuration(20)).toBe('20 min');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(180)).toBe('3h');
  });
});

describe('badge tones', () => {
  it('maps quiz status to a badge variant', () => {
    expect(statusTone('PUBLISHED')).toBe('success');
    expect(statusTone('DRAFT')).toBe('warning');
    expect(statusTone('UNPUBLISHED')).toBe('outline');
  });

  it('maps difficulty to a badge variant', () => {
    expect(difficultyTone('EASY')).toBe('success');
    expect(difficultyTone('MEDIUM')).toBe('warning');
    expect(difficultyTone('HARD')).toBe('destructive');
  });
});

describe('lifecycle hints', () => {
  it('explains why publishing is blocked', () => {
    expect(publishBlocker(0)).toBe('Add at least one question first');
    expect(publishBlocker(3)).toBeNull();
  });

  it('explains why deleting is blocked, with correct pluralisation', () => {
    expect(deleteBlocker(0)).toBeNull();
    expect(deleteBlocker(1)).toBe('1 attempt — unpublish instead');
    expect(deleteBlocker(4)).toBe('4 attempts — unpublish instead');
  });
});

describe('rankCategories', () => {
  const categories = [
    { name: 'Java' },
    { name: 'JavaScript' },
    { name: 'React' },
    { name: 'Node.js' },
    { name: 'Advanced JavaScript' },
  ];

  it('returns the list unchanged for an empty query', () => {
    expect(rankCategories('', categories)).toEqual(categories);
  });

  it('puts an exact match first, whatever the casing', () => {
    expect(rankCategories('javascript', categories)[0]?.name).toBe('JavaScript');
  });

  it('ranks prefix matches above substring matches', () => {
    const names = rankCategories('java', categories).map((category) => category.name);
    expect(names).toEqual(['Java', 'JavaScript', 'Advanced JavaScript']);
  });

  it('drops categories that do not match at all', () => {
    expect(rankCategories('xyz', categories)).toEqual([]);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(rankCategories('  JAVASCRIPT ', categories)[0]?.name).toBe('JavaScript');
  });

  it('honours the limit', () => {
    expect(rankCategories('', categories, 2)).toHaveLength(2);
    expect(rankCategories('a', categories, 1)).toHaveLength(1);
  });
});
