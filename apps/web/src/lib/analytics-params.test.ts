import { describe, expect, it } from 'vitest';

import {
  WINDOW_OPTIONS,
  analyticsWindow,
  categoryCaption,
  changeLabel,
  changeTone,
  outcomeLabel,
  outcomeTone,
  passRateCaption,
  popularityCaption,
  scoreBarWidth,
  timelineSummary,
  windowHref,
  windowLabel,
  windowSpan,
} from './analytics-params';

describe('analyticsWindow', () => {
  it('reads a supported window from the query string', () => {
    expect(analyticsWindow({ days: '7' })).toBe(7);
    expect(analyticsWindow({ days: '90' })).toBe(90);
  });

  it('falls back to thirty days for anything else', () => {
    expect(analyticsWindow({})).toBe(30);
    expect(analyticsWindow({ days: '' })).toBe(30);
    expect(analyticsWindow({ days: '365' })).toBe(30);
    expect(analyticsWindow({ days: ['14', '90'] })).toBe(14);
  });

  it('offers exactly four ranges', () => {
    expect(WINDOW_OPTIONS).toEqual([7, 14, 30, 90]);
  });
});

describe('windowHref', () => {
  it('keeps the default path bare and names the others', () => {
    expect(windowHref(30)).toBe('/admin/analytics');
    expect(windowHref(7)).toBe('/admin/analytics?days=7');
    expect(windowHref(90)).toBe('/admin/analytics?days=90');
  });

  it('round-trips through the parser', () => {
    for (const days of WINDOW_OPTIONS) {
      const href = windowHref(days);
      const query = href.split('?')[1] ?? '';
      expect(analyticsWindow(Object.fromEntries(new URLSearchParams(query)))).toBe(days);
    }
  });
});

describe('windowLabel', () => {
  it('names the range for people', () => {
    expect(windowLabel(7)).toBe('Last 7 days');
    expect(windowLabel(30)).toBe('Last 30 days');
    expect(windowSpan(1)).toBe('1 day');
    expect(windowSpan(14)).toBe('14 days');
  });
});

describe('changeLabel', () => {
  it('describes growth, decline and a flat window', () => {
    expect(changeLabel(50, 30)).toBe('+50% more than the previous 30 days');
    expect(changeLabel(-25, 7)).toBe('25% fewer than the previous 7 days');
    expect(changeLabel(0, 30)).toBe('Same volume as the previous 30 days');
  });

  it('says so when there is no previous window to compare against', () => {
    expect(changeLabel(null, 30)).toBe('No attempts in the previous 30 days');
    expect(changeLabel(null, 1)).toBe('No attempts in the previous 1 day');
  });

  it('tones the change to match the palette', () => {
    expect(changeTone(5)).toBe('text-success');
    expect(changeTone(-5)).toBe('text-destructive');
    expect(changeTone(0)).toBe('text-muted-foreground');
    expect(changeTone(null)).toBe('text-muted-foreground');
  });
});

describe('outcomes', () => {
  it('labels and tones each slice', () => {
    expect(outcomeLabel('passed')).toBe('Passed');
    expect(outcomeLabel('failed')).toBe('Failed');
    expect(outcomeLabel('expired')).toBe('Expired');
    expect(outcomeTone('passed')).toBe('bg-success/70');
    expect(outcomeTone('failed')).toBe('bg-destructive/70');
    expect(outcomeTone('expired')).toBe('bg-warning/70');
  });
});

describe('popularity captions', () => {
  it('spells out the singular', () => {
    expect(popularityCaption({ attempts: 1, learners: 1 })).toBe('1 attempt · 1 learner');
    expect(popularityCaption({ attempts: 4, learners: 2 })).toBe('4 attempts · 2 learners');
  });

  it('pluralises categories', () => {
    expect(categoryCaption({ quizzes: 1, attempts: 3 })).toBe('1 quiz · 3 attempts');
    expect(categoryCaption({ quizzes: 2, attempts: 1 })).toBe('2 quizzes · 1 attempt');
  });
});

describe('bars and rates', () => {
  it('clamps a score bar to the track', () => {
    expect(scoreBarWidth(72.5)).toBe(73);
    expect(scoreBarWidth(0)).toBe(0);
    expect(scoreBarWidth(120)).toBe(100);
    expect(scoreBarWidth(-10)).toBe(0);
    expect(scoreBarWidth(null)).toBe(0);
  });

  it('formats a pass rate or says there is none', () => {
    expect(passRateCaption(66.67)).toBe('66.7% pass rate');
    expect(passRateCaption(100)).toBe('100% pass rate');
    expect(passRateCaption(null)).toBe('No graded attempts');
  });
});

describe('timelineSummary', () => {
  it('summarises the window and names the busiest day', () => {
    const summary = timelineSummary([
      { label: '1 Mar', attempts: 2, registrations: 1 },
      { label: '2 Mar', attempts: 5, registrations: 0 },
    ]);

    expect(summary).toContain('7 attempts');
    expect(summary).toContain('1 registration');
    expect(summary).toContain('busiest day 2 Mar with 5');
  });

  it('copes with an empty window', () => {
    expect(timelineSummary([])).toBe('No activity in this window.');
  });
});
