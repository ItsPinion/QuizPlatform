import { describe, expect, it } from 'vitest';

import {
  activityBuckets,
  averageOf,
  formatDuration,
  isGradedStatus,
  passMarkY,
  passRateOf,
  passSentence,
  scoreChartArea,
  scoreChartPath,
  scoreChartPoints,
  scoreTone,
  streakOf,
  studentDashboardSchema,
  utcDayKey,
} from './dashboard';

describe('averageOf', () => {
  it('averages and rounds to two decimals', () => {
    expect(averageOf([80, 60])).toBe(70);
    expect(averageOf([100, 66.67, 50])).toBe(72.22);
    expect(averageOf([0])).toBe(0);
  });

  it('returns null for an empty series', () => {
    expect(averageOf([])).toBeNull();
  });
});

describe('passRateOf', () => {
  it('is passed over graded, not over all attempts', () => {
    expect(passRateOf(3, 1)).toBe(75);
    expect(passRateOf(1, 2)).toBe(33.33);
    expect(passRateOf(5, 0)).toBe(100);
  });

  it('is null before the first graded attempt', () => {
    expect(passRateOf(0, 0)).toBeNull();
  });
});

describe('streakOf', () => {
  it('counts the run of passes at the newest end', () => {
    expect(streakOf(['PASSED', 'PASSED', 'FAILED', 'PASSED'])).toEqual({ current: 2, best: 2 });
    expect(streakOf(['FAILED', 'PASSED'])).toEqual({ current: 0, best: 1 });
  });

  it('keeps the longest run as best even after a break', () => {
    expect(streakOf(['PASSED', 'FAILED', 'PASSED', 'PASSED', 'PASSED'])).toEqual({
      current: 1,
      best: 3,
    });
  });

  it('handles empty and all-failed histories', () => {
    expect(streakOf([])).toEqual({ current: 0, best: 0 });
    expect(streakOf(['FAILED', 'FAILED'])).toEqual({ current: 0, best: 0 });
  });

  it('ignores in-progress attempts at the head only if they are not passes', () => {
    // An unfinished attempt is not a pass, so it breaks the streak.
    expect(streakOf(['IN_PROGRESS', 'PASSED', 'PASSED'])).toEqual({ current: 0, best: 2 });
  });
});

describe('formatDuration', () => {
  it('drops the seconds once there are minutes', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(872)).toBe('14m');
    expect(formatDuration(3_872)).toBe('1h 4m');
    expect(formatDuration(0)).toBe('0s');
  });

  it('never renders a negative duration', () => {
    expect(formatDuration(-10)).toBe('0s');
  });
});

describe('utcDayKey', () => {
  it('formats a UTC date key', () => {
    expect(utcDayKey('2026-03-04T23:30:00.000Z')).toBe('2026-03-04');
    expect(utcDayKey(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
  });

  it('returns an empty string for nonsense', () => {
    expect(utcDayKey('not a date')).toBe('');
  });
});

describe('activityBuckets', () => {
  const now = new Date('2026-03-14T12:00:00.000Z');

  it('fills a fixed window, oldest first, including quiet days', () => {
    const days = activityBuckets(
      [
        { date: '2026-03-14', attempts: 2, averagePercentage: 70 },
        { date: '2026-03-10', attempts: 1, averagePercentage: 40 },
      ],
      5,
      now,
    );

    expect(days.map((day) => day.date)).toEqual([
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-14',
    ]);
    expect(days[0]).toMatchObject({ attempts: 1, averagePercentage: 40 });
    expect(days[1]).toMatchObject({ attempts: 0, averagePercentage: null });
    expect(days[4]).toMatchObject({ attempts: 2, averagePercentage: 70 });
  });

  it('labels days for the axis', () => {
    const [day] = activityBuckets([], 1, now);
    expect(day?.label).toBe('14 Mar');
  });

  it('ignores rows outside the window', () => {
    const days = activityBuckets(
      [{ date: '2025-01-01', attempts: 9, averagePercentage: 10 }],
      3,
      now,
    );

    expect(days.every((day) => day.attempts === 0)).toBe(true);
  });
});

describe('scoreChartPoints', () => {
  it('spreads points across the width, 100 at the top', () => {
    const points = scoreChartPoints([0, 50, 100], 110, 60, 5);

    expect(points[0]).toMatchObject({ x: 5, y: 55, value: 0 });
    expect(points[1]).toMatchObject({ x: 55, y: 30, value: 50 });
    expect(points[2]).toMatchObject({ x: 105, y: 5, value: 100 });
  });

  it('centres a single point instead of pinning it to the left edge', () => {
    const [point] = scoreChartPoints([80], 100, 40, 0);
    expect(point?.x).toBe(50);
  });

  it('clamps values outside 0–100 into the chart', () => {
    const [low] = scoreChartPoints([-20], 100, 100, 0);
    const [high] = scoreChartPoints([140], 100, 100, 0);

    expect(low?.y).toBe(100);
    expect(high?.y).toBe(0);
  });

  it('returns nothing for an empty series', () => {
    expect(scoreChartPoints([], 100, 50)).toEqual([]);
  });
});

describe('scoreChartPath / scoreChartArea', () => {
  const points = scoreChartPoints([40, 80], 100, 50, 0);

  it('draws a moveto followed by linetos', () => {
    expect(scoreChartPath(points)).toBe('M 0 30 L 100 10');
  });

  it('closes the area along the baseline', () => {
    expect(scoreChartArea(points, 50, 0)).toBe('M 0 30 L 100 10 L 100 50 L 0 50 Z');
  });

  it('returns empty strings when there is nothing to draw', () => {
    expect(scoreChartPath([])).toBe('');
    expect(scoreChartArea([], 50)).toBe('');
  });
});

describe('passMarkY', () => {
  it('places the pass mark on the 0–100 axis', () => {
    expect(passMarkY(60, 100, 0)).toBe(40);
    expect(passMarkY(0, 100, 0)).toBe(100);
    expect(passMarkY(100, 100, 0)).toBe(0);
  });
});

describe('presentation', () => {
  it('tones a score against the pass mark', () => {
    expect(scoreTone(85, 60)).toBe('success');
    expect(scoreTone(60, 60)).toBe('success');
    expect(scoreTone(55, 60)).toBe('warning');
    expect(scoreTone(40, 60)).toBe('destructive');
    expect(scoreTone(null)).toBe('warning');
  });

  it('describes the graded split', () => {
    expect(passSentence(3, 1)).toBe('3 of 4 graded attempts passed');
    expect(passSentence(1, 0)).toBe('1 of 1 graded attempt passed');
    expect(passSentence(0, 0)).toBe('No graded attempts yet');
  });

  it('knows which statuses carry a score', () => {
    expect(isGradedStatus('PASSED')).toBe(true);
    expect(isGradedStatus('FAILED')).toBe(true);
    expect(isGradedStatus('IN_PROGRESS')).toBe(false);
    expect(isGradedStatus('EXPIRED')).toBe(false);
  });
});

describe('studentDashboardSchema', () => {
  const dashboard = {
    totals: {
      attempts: 6,
      quizzesAttempted: 4,
      quizzesAvailable: 8,
      passed: 4,
      failed: 2,
      inProgress: 0,
      averagePercentage: 71.43,
      bestPercentage: 100,
      worstPercentage: 40,
      passRate: 66.67,
      questionsAnswered: 30,
      questionsCorrect: 21,
      accuracy: 70,
      timeSpentSeconds: 5_400,
      averageTimeSeconds: 900,
    },
    streak: { current: 2, best: 3 },
    trend: [
      {
        attemptId: 'a1',
        quizTitle: 'CSS Essentials',
        percentage: 80,
        passed: true,
        completedAt: '2026-01-01T12:00:00.000Z',
      },
    ],
    categories: [
      {
        categoryId: 'c1',
        categoryName: 'CSS',
        attempts: 2,
        averagePercentage: 80,
        bestPercentage: 90,
        passed: 2,
        failed: 0,
      },
    ],
    activity: [{ date: '2026-01-01', label: '1 Jan', attempts: 1, averagePercentage: 80 }],
    recent: [],
    generatedAt: '2026-01-01T12:00:00.000Z',
  };

  it('parses a full dashboard payload', () => {
    expect(studentDashboardSchema.parse(dashboard)).toEqual(dashboard);
  });

  it('accepts nulls for a student with no graded attempts', () => {
    const empty = {
      ...dashboard,
      totals: {
        ...dashboard.totals,
        attempts: 0,
        quizzesAttempted: 0,
        passed: 0,
        failed: 0,
        averagePercentage: null,
        bestPercentage: null,
        worstPercentage: null,
        passRate: null,
        questionsAnswered: 0,
        questionsCorrect: 0,
        accuracy: null,
        timeSpentSeconds: 0,
        averageTimeSeconds: null,
      },
      trend: [],
      categories: [],
      activity: [],
      recent: [],
    };

    expect(studentDashboardSchema.safeParse(empty).success).toBe(true);
  });

  it('rejects a non-numeric total', () => {
    expect(() =>
      studentDashboardSchema.parse({
        ...dashboard,
        totals: { ...dashboard.totals, attempts: 'six' },
      }),
    ).toThrow();
  });
});
