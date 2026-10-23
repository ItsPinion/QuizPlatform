import { describe, expect, it } from 'vitest';

import type { HistorySort, HistoryStatusFilter } from './review-params';
import {
  historyHref,
  historyTone,
  historyWhen,
  parseHistoryFilters,
  parseReviewFilter,
  reviewFilterOptions,
  reviewHref,
  reviewMarksLabel,
  reviewPositionLabel,
  reviewScoreLabel,
  reviewSelectionLabel,
  toHistoryQuery,
  verdictLabel,
  verdictTone,
} from './review-params';

describe('parseReviewFilter', () => {
  it('accepts the four filters', () => {
    expect(parseReviewFilter({ filter: 'correct' })).toBe('correct');
    expect(parseReviewFilter({ filter: 'INCORRECT' })).toBe('incorrect');
    expect(parseReviewFilter({ filter: ['unanswered', 'correct'] })).toBe('unanswered');
    expect(parseReviewFilter({ filter: 'all' })).toBe('all');
  });

  it('falls back to all for anything else', () => {
    expect(parseReviewFilter({})).toBe('all');
    expect(parseReviewFilter({ filter: 'maybe' })).toBe('all');
    expect(parseReviewFilter({ filter: '' })).toBe('all');
  });
});

describe('reviewHref', () => {
  it('keeps the bare URL for "all"', () => {
    expect(reviewHref('a1')).toBe('/student/attempt/a1/review');
    expect(reviewHref('a1', 'all')).toBe('/student/attempt/a1/review');
  });

  it('round-trips every filter through the parser', () => {
    for (const filter of ['correct', 'incorrect', 'unanswered'] as const) {
      const href = reviewHref('a1', filter);
      const query = href.split('?')[1] ?? '';
      const params = Object.fromEntries(new URLSearchParams(query));

      expect(parseReviewFilter(params)).toBe(filter);
    }
  });
});

describe('history filters', () => {
  it('defaults and normalises', () => {
    expect(parseHistoryFilters({})).toEqual({
      status: '',
      quizId: '',
      sort: 'newest',
      page: 1,
    });

    expect(parseHistoryFilters({ status: 'failed', sort: 'SCORE', page: '3' })).toEqual({
      status: 'FAILED',
      quizId: '',
      sort: 'score',
      page: 3,
    });
  });

  it('drops invalid values', () => {
    const parsed = parseHistoryFilters({
      status: 'EXPIRED',
      sort: 'random',
      quizId: 'nope',
      page: '-2',
    });

    expect(parsed).toEqual({ status: '', quizId: '', sort: 'newest', page: 1 });
  });

  it('builds the API query without empty fields', () => {
    expect(toHistoryQuery(parseHistoryFilters({}))).toEqual({
      sort: 'newest',
      page: 1,
      pageSize: 10,
    });

    const query = toHistoryQuery(
      parseHistoryFilters({ status: 'PASSED', quizId: '11111111-1111-1111-1111-111111111111' }),
    );

    expect(query.status).toBe('PASSED');
    expect(query.quizId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('never emits a value the parser would drop', () => {
    expect(historyHref({})).toBe('/student/results');
    expect(historyHref({ status: 'PASSED' })).toBe('/student/results?status=PASSED');
    expect(historyHref({ sort: 'newest', page: 1 })).toBe('/student/results');
    // Values the parser would drop never reach the URL, even when a caller
    // casts them through (which is what a hand-built link amounts to).
    expect(
      historyHref({
        status: 'EXPIRED' as unknown as HistoryStatusFilter,
        quizId: 'nope',
        sort: 'random' as unknown as HistorySort,
      }),
    ).toBe('/student/results');

    for (const href of [
      historyHref({ status: 'FAILED', sort: 'score', page: 2 }),
      historyHref({ quizId: '11111111-1111-1111-1111-111111111111' }),
    ]) {
      const query = href.split('?')[1] ?? '';
      const params = Object.fromEntries(new URLSearchParams(query));
      const parsed = parseHistoryFilters(params);

      expect(historyHref(parsed)).toBe(href);
    }
  });
});

describe('review presentation', () => {
  it('maps verdicts to labels and badge tones', () => {
    expect(verdictLabel('CORRECT')).toBe('Correct');
    expect(verdictLabel('INCORRECT')).toBe('Incorrect');
    expect(verdictLabel('UNANSWERED')).toBe('Not answered');

    expect(verdictTone('CORRECT')).toBe('success');
    expect(verdictTone('INCORRECT')).toBe('destructive');
    expect(verdictTone('UNANSWERED')).toBe('outline');
  });

  it('numbers questions from one', () => {
    expect(reviewPositionLabel(0, 10)).toBe('Question 1 of 10');
    expect(reviewPositionLabel(9, 10)).toBe('Question 10 of 10');
  });

  it('states the marks earned', () => {
    expect(reviewMarksLabel('CORRECT', 2)).toBe('+2 marks');
    expect(reviewMarksLabel('CORRECT', 1)).toBe('+1 mark');
    expect(reviewMarksLabel('INCORRECT', 2)).toBe('0 of 2 marks');
    expect(reviewMarksLabel('UNANSWERED', 3)).toBe('0 of 3 marks');
  });

  it('describes the selection in one sentence', () => {
    expect(reviewSelectionLabel('CORRECT', 'const', 'const')).toBe('Your answer was right.');
    expect(reviewSelectionLabel('INCORRECT', 'let', 'const')).toBe(
      'You picked let; the right answer was const.',
    );
    expect(reviewSelectionLabel('UNANSWERED', null, 'const')).toBe(
      'Not answered — the right answer was const.',
    );
    expect(reviewSelectionLabel('UNANSWERED', null, null)).toContain('—');
  });

  it('summarises correct out of total', () => {
    expect(reviewScoreLabel(8, 10)).toBe('8 of 10 correct');
  });

  it('lists the filter chips in a stable order with counts', () => {
    expect(
      reviewFilterOptions({ all: 10, correct: 6, incorrect: 3, unanswered: 1 }).map((option) => [
        option.value,
        option.count,
      ]),
    ).toEqual([
      ['all', 10],
      ['correct', 6],
      ['incorrect', 3],
      ['unanswered', 1],
    ]);
  });

  it('tones history rows by status', () => {
    expect(historyTone('PASSED')).toBe('success');
    expect(historyTone('FAILED')).toBe('destructive');
    expect(historyTone('IN_PROGRESS')).toBe('outline');
  });

  it('formats history timestamps', () => {
    const now = new Date('2026-03-12T18:00:00.000Z');

    expect(historyWhen(null)).toBe('—');
    expect(historyWhen('nonsense')).toBe('—');
    expect(historyWhen(new Date('2026-03-12T14:32:00.000Z').toISOString(), now)).toMatch(/^Today /);
    expect(historyWhen(new Date('2026-01-04T10:00:00.000Z').toISOString(), now)).toBe('4 Jan 2026');
  });
});
