import { describe, expect, it } from 'vitest';

import {
  ANALYTICS_WINDOWS,
  DEFAULT_ANALYTICS_WINDOW,
  analyticsBuckets,
  analyticsQuerySchema,
  adminAnalyticsSchema,
  barScale,
  parseAnalyticsWindow,
  percentChange,
  ratioSlices,
  seriesPath,
  seriesPoints,
  sharePercent,
  windowTotals,
} from './analytics';

const NOW = new Date('2026-03-15T12:00:00.000Z');

describe('parseAnalyticsWindow', () => {
  it('accepts the four supported ranges', () => {
    for (const days of ANALYTICS_WINDOWS) {
      expect(parseAnalyticsWindow(days)).toBe(days);
      expect(parseAnalyticsWindow(String(days))).toBe(days);
    }
  });

  it('falls back to the default for anything else', () => {
    expect(parseAnalyticsWindow(undefined)).toBe(DEFAULT_ANALYTICS_WINDOW);
    expect(parseAnalyticsWindow('')).toBe(DEFAULT_ANALYTICS_WINDOW);
    expect(parseAnalyticsWindow('365')).toBe(DEFAULT_ANALYTICS_WINDOW);
    expect(parseAnalyticsWindow('seven')).toBe(DEFAULT_ANALYTICS_WINDOW);
    expect(parseAnalyticsWindow('30abc')).toBe(30);
    expect(parseAnalyticsWindow('-7')).toBe(DEFAULT_ANALYTICS_WINDOW);
  });
});

describe('analyticsBuckets', () => {
  it('returns a zero-filled window ending today, oldest first', () => {
    const buckets = analyticsBuckets([], 7, NOW);

    expect(buckets).toHaveLength(7);
    expect(buckets[0]?.date).toBe('2026-03-09');
    expect(buckets[6]?.date).toBe('2026-03-15');
    expect(buckets.every((bucket) => bucket.attempts === 0)).toBe(true);
    expect(buckets.every((bucket) => bucket.registrations === 0)).toBe(true);
    expect(buckets.every((bucket) => bucket.averagePercentage === null)).toBe(true);
  });

  it('merges the rows it was given and keeps the quiet days', () => {
    const buckets = analyticsBuckets(
      [
        {
          date: '2026-03-10',
          attempts: 4,
          registrations: 2,
          passed: 3,
          failed: 1,
          averagePercentage: 72,
        },
        {
          date: '2026-03-15',
          attempts: 1,
          registrations: 0,
          passed: 0,
          failed: 1,
          averagePercentage: 40,
        },
      ],
      7,
      NOW,
    );

    expect(buckets.map((bucket) => bucket.attempts)).toEqual([0, 4, 0, 0, 0, 0, 1]);
    expect(buckets.map((bucket) => bucket.registrations)).toEqual([0, 2, 0, 0, 0, 0, 0]);
    expect(buckets[1]?.averagePercentage).toBe(72);
    expect(buckets[0]?.averagePercentage).toBeNull();
  });

  it('ignores rows outside the window', () => {
    const buckets = analyticsBuckets([{ date: '2026-01-01', attempts: 99 }], 7, NOW);
    expect(buckets.reduce((sum, bucket) => sum + bucket.attempts, 0)).toBe(0);
  });

  it('labels each day with its short date', () => {
    const buckets = analyticsBuckets([], 2, NOW);
    expect(buckets[0]?.label).toBe('14 Mar');
    expect(buckets[1]?.label).toBe('15 Mar');
  });

  it('never returns an empty window', () => {
    expect(analyticsBuckets([], 0, NOW)).toHaveLength(1);
  });
});

describe('windowTotals', () => {
  const buckets = analyticsBuckets(
    [
      { date: '2026-03-10', attempts: 2, registrations: 1, passed: 1, failed: 1 },
      { date: '2026-03-13', attempts: 5, registrations: 2, passed: 4, failed: 1 },
    ],
    7,
    NOW,
  );

  it('sums the window and names the busiest day', () => {
    const totals = windowTotals(buckets);
    expect(totals).toMatchObject({ attempts: 7, registrations: 3, passed: 5, failed: 2 });
    expect(totals.busiest?.date).toBe('2026-03-13');
  });

  it('has no busiest day when nothing happened', () => {
    expect(windowTotals(analyticsBuckets([], 7, NOW)).busiest).toBeNull();
  });
});

describe('ratioSlices', () => {
  it('splits a graded set into whole percentages', () => {
    const slices = ratioSlices(3, 1, 0);
    expect(slices.map((slice) => [slice.kind, slice.percentage])).toEqual([
      ['passed', 75],
      ['failed', 25],
      ['expired', 0],
    ]);
  });

  it('gives expired attempts their own slice instead of counting them as failures', () => {
    const slices = ratioSlices(1, 1, 2);
    expect(slices.find((slice) => slice.kind === 'expired')?.percentage).toBe(50);
    expect(slices.find((slice) => slice.kind === 'failed')?.percentage).toBe(25);
  });

  it('makes the printed percentages add up to 100', () => {
    const slices = ratioSlices(1, 1, 1);
    const total = slices.reduce((sum, slice) => sum + slice.percentage, 0);
    expect(Math.round(total * 10) / 10).toBe(100);
    expect(slices.every((slice) => slice.count === 1)).toBe(true);
  });

  it('reports zeroes when nothing has been graded', () => {
    const slices = ratioSlices(0, 0, 0);
    expect(slices.every((slice) => slice.percentage === 0)).toBe(true);
    expect(slices.every((slice) => slice.count === 0)).toBe(true);
  });

  it('clamps negative input rather than printing a negative slice', () => {
    expect(ratioSlices(-2, 2, 0).every((slice) => slice.count >= 0)).toBe(true);
  });
});

describe('sharePercent', () => {
  it('measures a part against its total', () => {
    expect(sharePercent(1, 4)).toBe(25);
    expect(sharePercent(9, 10)).toBe(90);
    expect(sharePercent(1, 3)).toBe(33.3);
  });

  it('is zero for an empty total', () => {
    expect(sharePercent(0, 0)).toBe(0);
    expect(sharePercent(5, 0)).toBe(0);
  });
});

describe('barScale', () => {
  it('scales against the largest value', () => {
    expect(barScale([2, 4, 8])).toEqual([25, 50, 100]);
    expect(barScale([10, 10])).toEqual([100, 100]);
  });

  it('is all zeroes for an empty or all-zero series', () => {
    expect(barScale([])).toEqual([]);
    expect(barScale([0, 0])).toEqual([0, 0]);
  });

  it('never produces a negative or over-long bar', () => {
    expect(barScale([-4, 2])).toEqual([0, 100]);
  });
});

describe('seriesPoints', () => {
  it('puts the peak at the top and zeroes on the baseline', () => {
    const points = seriesPoints([0, 4, 2], 120, 100, 0);
    expect(points[0]?.y).toBe(100);
    expect(points[1]?.y).toBe(0);
    expect(points[2]?.y).toBe(50);
    expect(points.map((point) => point.x)).toEqual([0, 60, 120]);
  });

  it('flattens a zero series onto the baseline instead of dividing by zero', () => {
    const points = seriesPoints([0, 0], 100, 80, 4);
    expect(points.every((point) => point.y === 76)).toBe(true);
    expect(points.every((point) => Number.isFinite(point.x))).toBe(true);
  });

  it('centres a single point', () => {
    const [point] = seriesPoints([5], 100, 100, 10);
    expect(point?.x).toBe(50);
  });

  it('returns no geometry for an empty series', () => {
    expect(seriesPoints([], 100, 100)).toEqual([]);
    expect(seriesPath([])).toBe('');
  });

  it('builds a path through every point', () => {
    expect(seriesPath(seriesPoints([0, 10], 100, 100, 0))).toBe('M 0 100 L 100 0');
  });
});

describe('percentChange', () => {
  it('measures growth against the previous window', () => {
    expect(percentChange(12, 8)).toBe(50);
    expect(percentChange(6, 8)).toBe(-25);
    expect(percentChange(8, 8)).toBe(0);
  });

  it('is null without a previous window to compare to', () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});

describe('analyticsQuerySchema', () => {
  it('defaults to thirty days', () => {
    expect(analyticsQuerySchema.parse({})).toEqual({ days: DEFAULT_ANALYTICS_WINDOW });
    expect(analyticsQuerySchema.parse({ days: '14' })).toEqual({ days: 14 });
  });

  it('rejects a range the screen does not offer', () => {
    expect(analyticsQuerySchema.safeParse({ days: '365' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ days: 'abc' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ days: '7.5' }).success).toBe(false);
  });
});

describe('adminAnalyticsSchema', () => {
  const valid = {
    generatedAt: '2026-03-15T12:00:00.000Z',
    windowDays: 30,
    students: {
      total: 3,
      active: 3,
      inactive: 0,
      newInWindow: 1,
      newInPreviousWindow: 0,
      activeLearners: 3,
      attemptsPerLearner: 4.7,
    },
    quizzes: {
      total: 10,
      published: 8,
      drafts: 2,
      unpublished: 0,
      questions: 47,
      attempted: 9,
      neverAttempted: 1,
      averageQuestions: 4.7,
    },
    attempts: {
      total: 14,
      graded: 14,
      passed: 9,
      failed: 5,
      expired: 0,
      inProgress: 0,
      averagePercentage: 64.2,
      passRate: 64.3,
      averageTimeSeconds: 480,
      questionsAnswered: 120,
      accuracy: 62.5,
      inWindow: 14,
      inPreviousWindow: 0,
    },
    timeline: [
      {
        date: '2026-03-15',
        label: '15 Mar',
        attempts: 2,
        registrations: 1,
        passed: 1,
        failed: 1,
        averagePercentage: 55,
      },
    ],
    quizPerformance: [
      {
        quizId: 'q1',
        title: 'CSS Essentials',
        slug: 'css-essentials',
        categoryName: 'CSS',
        status: 'PUBLISHED',
        attempts: 2,
        learners: 2,
        averagePercentage: 80,
        bestPercentage: 100,
        passRate: 50,
        lastAttemptAt: '2026-03-14T10:00:00.000Z',
      },
    ],
    categories: [
      {
        categoryId: 'c1',
        name: 'CSS',
        quizzes: 1,
        attempts: 2,
        learners: 2,
        averagePercentage: 80,
        passRate: 50,
      },
    ],
  };

  it('accepts a complete payload', () => {
    expect(adminAnalyticsSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a dashboard with no data at all', () => {
    const empty = {
      ...valid,
      students: { ...valid.students, attemptsPerLearner: null },
      quizzes: { ...valid.quizzes, averageQuestions: null },
      attempts: {
        ...valid.attempts,
        averagePercentage: null,
        passRate: null,
        averageTimeSeconds: null,
        accuracy: null,
      },
      timeline: [],
      quizPerformance: [],
      categories: [],
    };

    expect(adminAnalyticsSchema.safeParse(empty).success).toBe(true);
  });

  it('rejects a row missing a field the UI prints', () => {
    const broken = {
      ...valid,
      quizPerformance: [{ ...valid.quizPerformance[0], attempts: undefined }],
    };

    expect(adminAnalyticsSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a non-numeric window', () => {
    expect(adminAnalyticsSchema.safeParse({ ...valid, windowDays: '30' }).success).toBe(false);
  });
});
