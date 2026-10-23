import { describe, expect, it } from 'vitest';

import {
  boardSummary,
  currentUserCaption,
  gapLabel,
  leaderboardHref,
  metricLabel,
  metricShortLabel,
  metricValueLabel,
  ordinal,
  participantsLabel,
  parseLeaderboardFilters,
  periodLabel,
  rankTone,
  scopeLabel,
  toLeaderboardQuery,
} from './leaderboard-params';

const CATEGORY = '11111111-1111-4111-8111-111111111111';

describe('parseLeaderboardFilters', () => {
  it('defaults to the overall average board', () => {
    expect(parseLeaderboardFilters({})).toEqual({
      metric: 'average',
      period: 'all',
      categoryId: '',
      limit: 20,
    });
  });

  it('reads a full set of filters', () => {
    expect(
      parseLeaderboardFilters({ metric: 'best', period: 'week', categoryId: CATEGORY }),
    ).toMatchObject({ metric: 'best', period: 'week', categoryId: CATEGORY });
  });

  it('falls back for anything it does not recognise', () => {
    expect(parseLeaderboardFilters({ metric: 'streak', period: 'year' })).toMatchObject({
      metric: 'average',
      period: 'all',
    });
    expect(parseLeaderboardFilters({ categoryId: 'not-a-uuid' }).categoryId).toBe('');
    expect(parseLeaderboardFilters({ metric: ['best', 'completed'] }).metric).toBe('best');
  });
});

describe('toLeaderboardQuery', () => {
  it('emits only what the API accepts', () => {
    expect(toLeaderboardQuery(parseLeaderboardFilters({}))).toEqual({
      metric: 'average',
      period: 'all',
      limit: '20',
    });
    expect(toLeaderboardQuery(parseLeaderboardFilters({ metric: 'best' }))).toMatchObject({
      metric: 'best',
    });
    expect(toLeaderboardQuery(parseLeaderboardFilters({ categoryId: CATEGORY }))).toMatchObject({
      categoryId: CATEGORY,
    });
  });
});

describe('leaderboardHref', () => {
  const base = parseLeaderboardFilters({});

  it('keeps the default board as a bare path', () => {
    expect(leaderboardHref(base, {})).toBe('/student/leaderboard');
  });

  it('names a non-default metric or period', () => {
    expect(leaderboardHref(base, { metric: 'completed' })).toBe(
      '/student/leaderboard?metric=completed',
    );
    expect(leaderboardHref(base, { period: 'week' })).toBe('/student/leaderboard?period=week');
  });

  it('keeps the other controls when one changes', () => {
    const filters = parseLeaderboardFilters({
      metric: 'best',
      period: 'month',
      categoryId: CATEGORY,
    });

    expect(leaderboardHref(filters, { period: 'week' })).toBe(
      `/student/leaderboard?metric=best&period=week&categoryId=${CATEGORY}`,
    );
  });

  it('round-trips through the parser', () => {
    const filters = parseLeaderboardFilters({
      metric: 'completed',
      period: 'week',
      categoryId: CATEGORY,
    });
    const href = leaderboardHref(filters, {});
    const query = Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''));

    expect(parseLeaderboardFilters(query)).toEqual(filters);
  });
});

describe('labels', () => {
  it('names metrics and periods', () => {
    expect(metricLabel('average')).toBe('Average score');
    expect(metricLabel('best')).toBe('Best score');
    expect(metricLabel('completed')).toBe('Quizzes completed');
    expect(metricShortLabel('completed')).toBe('Completed');
    expect(periodLabel('all')).toBe('All time');
    expect(periodLabel('month')).toBe('This month');
    expect(periodLabel('week')).toBe('This week');
  });

  it('formats the value a row is ranked on', () => {
    const entry = { averagePercentage: 72.456, bestPercentage: 96, quizzesCompleted: 1 };
    expect(metricValueLabel(entry, 'average')).toBe('72.46%');
    expect(metricValueLabel(entry, 'best')).toBe('96%');
    expect(metricValueLabel(entry, 'completed')).toBe('1 quiz');
    expect(metricValueLabel({ ...entry, quizzesCompleted: 3 }, 'completed')).toBe('3 quizzes');
  });

  it('describes the scope and the field size', () => {
    expect(scopeLabel({ type: 'overall', categoryName: null })).toBe('Overall');
    expect(scopeLabel({ type: 'category', categoryName: 'JavaScript' })).toBe('JavaScript');
    expect(participantsLabel(0)).toBe('No ranked students yet');
    expect(participantsLabel(1)).toBe('1 student ranked');
    expect(participantsLabel(12)).toBe('12 students ranked');
  });
});

describe('ordinal', () => {
  it('spells the places a leaderboard actually shows', () => {
    expect([1, 2, 3, 4, 5].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '5th']);
    expect([11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
      '111th',
    ]);
  });

  it('tones the podium', () => {
    expect(rankTone(1)).toBe('text-warning');
    expect(rankTone(2)).toBe('text-muted-foreground');
    expect(rankTone(3)).toBe('text-primary');
    expect(rankTone(7)).toBe('text-foreground');
  });
});

describe('gapLabel', () => {
  it('says nothing for the leader and "Tied" for equal scores', () => {
    expect(gapLabel(0, 1, 'average')).toBe('—');
    expect(gapLabel(0, 2, 'average')).toBe('Tied');
    expect(gapLabel(0, 3, 'best')).toBe('Tied');
  });

  it('measures the gap in the metric’s units', () => {
    expect(gapLabel(5, 2, 'average')).toBe('5 pts behind');
    expect(gapLabel(7.5, 3, 'best')).toBe('7.5 pts behind');
    expect(gapLabel(1, 2, 'completed')).toBe('1 quiz behind');
    expect(gapLabel(2, 4, 'completed')).toBe('2 quizzes behind');
  });
});

describe('currentUserCaption', () => {
  it('combines the rank with the size of the field', () => {
    expect(currentUserCaption(2, 10)).toBe('2nd of 10 · top 20%');
    expect(currentUserCaption(1, 3)).toBe('1st of 3 · top 33%');
    expect(currentUserCaption(1, 0)).toBe('Not ranked yet');
  });
});

describe('boardSummary', () => {
  it('names the leader and the metric', () => {
    expect(boardSummary([{ rank: 1, name: 'Rahul' }], 'average')).toBe(
      'Leaderboard by average score: Rahul first of 1.',
    );
  });

  it('copes with an empty board', () => {
    expect(boardSummary([], 'best')).toBe('Nobody has finished a quiz yet.');
  });
});
