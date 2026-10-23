import { describe, expect, it } from 'vitest';

import {
  activityCaption,
  activityHeight,
  activityScale,
  attemptsCaption,
  categoryBarWidth,
  categoryCaption,
  coverageLabel,
  deltaLabel,
  durationLabel,
  passRateLabel,
  percentLabel,
  toneFor,
  trendDateLabel,
  trendDelta,
  trendPointLabel,
  trendSummary,
  type TrendPoint,
} from './dashboard-params';

const point = (percentage: number, attemptId = `a-${percentage}`): TrendPoint => ({
  attemptId,
  quizTitle: 'CSS Essentials',
  percentage,
  passed: percentage >= 60,
  completedAt: '2026-03-12T10:00:00.000Z',
});

const day = (date: string, attempts: number) => ({
  date,
  label: date.slice(8),
  attempts,
  averagePercentage: attempts > 0 ? 70 : null,
});

describe('percentLabel', () => {
  it('formats a score and hides a missing one', () => {
    expect(percentLabel(72.444)).toBe('72.44%');
    expect(percentLabel(100)).toBe('100%');
    expect(percentLabel(0)).toBe('0%');
    expect(percentLabel(null)).toBe('—');
    expect(percentLabel(null, 'No score')).toBe('No score');
  });
});

describe('coverageLabel', () => {
  it('reads attempts against the published catalogue', () => {
    expect(coverageLabel(4, 8)).toBe('4 of 8 published');
    expect(coverageLabel(0, 8)).toBe('0 of 8 published');
  });

  it('falls back when there is nothing published', () => {
    expect(coverageLabel(0, 0)).toBe('0 attempted');
  });
});

describe('attemptsCaption', () => {
  it('surfaces unfinished attempts', () => {
    expect(attemptsCaption({ inProgress: 0 })).toBe('Nothing in progress');
    expect(attemptsCaption({ inProgress: 1 })).toBe('1 still running');
    expect(attemptsCaption({ inProgress: 3 })).toBe('3 still running');
  });
});

describe('durationLabel / passRateLabel', () => {
  it('formats durations and handles none', () => {
    expect(durationLabel(872)).toBe('14m');
    expect(durationLabel(3_872)).toBe('1h 4m');
    expect(durationLabel(null)).toBe('—');
  });

  it('formats a pass rate or hides it', () => {
    expect(passRateLabel(66.666)).toBe('66.67%');
    expect(passRateLabel(null)).toBe('—');
  });
});

describe('toneFor', () => {
  it('tones against the pass mark', () => {
    expect(toneFor(80)).toBe('text-success');
    expect(toneFor(55)).toBe('text-warning');
    expect(toneFor(20)).toBe('text-destructive');
    expect(toneFor(null)).toBe('text-warning');
    expect(toneFor(50, 40)).toBe('text-success');
  });
});

describe('trend', () => {
  it('labels the last point with a short date', () => {
    expect(trendDateLabel('2026-03-12T10:00:00.000Z')).toMatch(/1[12] Mar/);
    expect(trendDateLabel('nonsense')).toBe('');
  });

  it('builds a single-string tooltip per point', () => {
    // A single string, never an array: <title> cannot hold mixed children.
    const label = trendPointLabel(point(72.5));
    expect(typeof label).toBe('string');
    expect(label).toBe('CSS Essentials · 72.5% · 12 Mar');

    expect(trendPointLabel({ ...point(40), quizTitle: 'SQL' })).toBe('SQL · 40% · 12 Mar');
    expect(trendPointLabel({ ...point(40), completedAt: 'nonsense' })).toBe('CSS Essentials · 40%');
  });

  it('summarises the series for screen readers', () => {
    expect(trendSummary([])).toBe('No graded attempts yet.');
    expect(trendSummary([point(40), point(80)])).toBe('2 graded attempts, trending up: 40% → 80%.');
    expect(trendSummary([point(80), point(40)])).toContain('trending down');
    expect(trendSummary([point(60), point(60)])).toContain('trending flat');
    expect(trendSummary([point(70)])).toContain('1 graded attempt,');
  });

  it('measures the change across the window', () => {
    expect(trendDelta([point(40), point(80)])).toBe(40);
    expect(trendDelta([point(80), point(72.5)])).toBe(-7.5);
    expect(trendDelta([point(60)])).toBeNull();
    expect(trendDelta([])).toBeNull();
  });

  it('describes the delta in words', () => {
    expect(deltaLabel(null)).toBe('Not enough history');
    expect(deltaLabel(0)).toBe('Holding steady');
    expect(deltaLabel(12.5)).toBe('+12.5 pts since the first');
    expect(deltaLabel(-4)).toBe('-4 pts since the first');
  });
});

describe('activity', () => {
  it('scales bars against the busiest day', () => {
    const days = [day('2026-03-10', 0), day('2026-03-11', 2), day('2026-03-12', 4)];
    const scale = activityScale(days);

    expect(scale).toBe(4);
    expect(activityHeight(days[0]!, scale)).toBe(0);
    expect(activityHeight(days[1]!, scale)).toBe(50);
    expect(activityHeight(days[2]!, scale)).toBe(100);
  });

  it('never divides by zero', () => {
    expect(activityScale([])).toBe(1);
    expect(activityScale([day('2026-03-10', 0)])).toBe(1);
    expect(activityHeight(day('2026-03-10', 0), 0)).toBe(0);
  });

  it('captions the window', () => {
    expect(activityCaption([day('2026-03-10', 0), day('2026-03-11', 0)])).toBe(
      'No attempts in the last two weeks',
    );
    expect(activityCaption([day('2026-03-10', 1)])).toBe('1 attempt across 1 day');
    expect(activityCaption([day('2026-03-10', 1), day('2026-03-11', 2)])).toBe(
      '3 attempts across 2 days',
    );
  });
});

describe('categories', () => {
  it('scales bars to the full score range, not to the best category', () => {
    expect(categoryBarWidth(80)).toBe(80);
    expect(categoryBarWidth(-4)).toBe(0);
    expect(categoryBarWidth(140)).toBe(100);
    expect(categoryBarWidth(66.6)).toBe(67);
  });

  it('captions a category row', () => {
    expect(categoryCaption({ attempts: 1, bestPercentage: 90 })).toBe('1 attempt · best 90%');
    expect(categoryCaption({ attempts: 3, bestPercentage: 66.666 })).toBe(
      '3 attempts · best 66.67%',
    );
  });
});
