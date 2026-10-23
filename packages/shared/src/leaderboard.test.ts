import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LEADERBOARD_LIMIT,
  LEADERBOARD_METRICS,
  LEADERBOARD_PERIODS,
  MAX_LEADERBOARD_LIMIT,
  assignRanks,
  buildLeaderboard,
  leaderboardQuerySchema,
  leaderboardResponseSchema,
  metricValue,
  passRateOf,
  periodStart,
  sortLeaderboard,
  topPercentOf,
  type LeaderboardCandidate,
} from './leaderboard';

const candidate = (
  name: string,
  averagePercentage: number,
  extra: Partial<LeaderboardCandidate> = {},
): LeaderboardCandidate => ({
  userId: `user-${name.toLowerCase()}`,
  name,
  averagePercentage,
  bestPercentage: extra.bestPercentage ?? averagePercentage,
  attempts: extra.attempts ?? 3,
  quizzesCompleted: extra.quizzesCompleted ?? 2,
  passed: extra.passed ?? 2,
  failed: extra.failed ?? 1,
  lastAttemptAt: extra.lastAttemptAt ?? '2026-03-12T10:00:00.000Z',
});

describe('metricValue', () => {
  it('reads the number each metric ranks on', () => {
    const entry = { averagePercentage: 72.5, bestPercentage: 95, quizzesCompleted: 4 };
    expect(metricValue(entry, 'average')).toBe(72.5);
    expect(metricValue(entry, 'best')).toBe(95);
    expect(metricValue(entry, 'completed')).toBe(4);
  });
});

describe('sortLeaderboard', () => {
  it('sorts by the chosen metric, best first', () => {
    const entries = [candidate('Amit', 61), candidate('Priya', 93), candidate('Rahul', 84)];
    expect(sortLeaderboard(entries, 'average').map((entry) => entry.name)).toEqual([
      'Priya',
      'Rahul',
      'Amit',
    ]);
  });

  it('ranks on the best score when asked', () => {
    const entries = [
      candidate('A', 60, { bestPercentage: 100 }),
      candidate('B', 80, { bestPercentage: 85 }),
    ];
    expect(sortLeaderboard(entries, 'best').map((entry) => entry.name)).toEqual(['A', 'B']);
  });

  it('ranks on completed quizzes when asked', () => {
    const entries = [
      candidate('A', 90, { quizzesCompleted: 1 }),
      candidate('B', 60, { quizzesCompleted: 4 }),
    ];
    expect(sortLeaderboard(entries, 'completed').map((entry) => entry.name)).toEqual(['B', 'A']);
  });

  it('breaks ties deterministically: average, best, quizzes, then name', () => {
    const entries = [
      candidate('Zoe', 80, { bestPercentage: 80, quizzesCompleted: 2 }),
      candidate('Amy', 80, { bestPercentage: 90, quizzesCompleted: 2 }),
      candidate('Ned', 80, { bestPercentage: 80, quizzesCompleted: 3 }),
    ];

    expect(sortLeaderboard(entries, 'average').map((entry) => entry.name)).toEqual([
      'Amy',
      'Ned',
      'Zoe',
    ]);
  });

  it('does not mutate the input', () => {
    const entries = [candidate('A', 50), candidate('B', 90)];
    sortLeaderboard(entries, 'average');
    expect(entries.map((entry) => entry.name)).toEqual(['A', 'B']);
  });
});

describe('assignRanks', () => {
  it('uses competition ranking so ties share a place', () => {
    const sorted = sortLeaderboard(
      [candidate('A', 90), candidate('B', 80), candidate('C', 80), candidate('D', 70)],
      'average',
    );
    const ranked = assignRanks(sorted, 'average');

    expect(ranked.map((entry) => [entry.name, entry.rank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 2],
      ['D', 4],
    ]);
  });

  it('measures the gap to the entry above, and zero for ties', () => {
    const ranked = assignRanks(
      sortLeaderboard([candidate('A', 95), candidate('B', 90), candidate('C', 90)], 'average'),
      'average',
    );

    expect(ranked.map((entry) => entry.gapToNext)).toEqual([0, 5, 0]);
  });

  it('handles an empty board', () => {
    expect(assignRanks([], 'average')).toEqual([]);
  });

  it('gaps in quiz counts for the completed metric', () => {
    const ranked = assignRanks(
      sortLeaderboard(
        [candidate('A', 50, { quizzesCompleted: 6 }), candidate('B', 90, { quizzesCompleted: 2 })],
        'completed',
      ),
      'completed',
    );

    expect(ranked.map((entry) => [entry.name, entry.rank, entry.gapToNext])).toEqual([
      ['A', 1, 0],
      ['B', 2, 4],
    ]);
  });
});

describe('buildLeaderboard', () => {
  const entries = [
    candidate('Rahul', 96),
    candidate('Priya', 93),
    candidate('Amit', 61, { passed: 0, failed: 3 }),
  ];

  it('ranks, marks the caller and computes each pass rate', () => {
    const board = buildLeaderboard(entries, 'average', 'user-priya');

    expect(board.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(board.map((entry) => entry.isCurrentUser)).toEqual([false, true, false]);
    expect(board[0]?.passRate).toBe(66.67);
    expect(board[2]?.passRate).toBe(0);
  });

  it('marks nobody when the caller is not on the board', () => {
    const board = buildLeaderboard(entries, 'average', 'user-nobody');
    expect(board.some((entry) => entry.isCurrentUser)).toBe(false);
  });

  it('leaves pass rates null for a student with no result', () => {
    const [only] = buildLeaderboard([candidate('New', 0, { passed: 0, failed: 0 })], 'average');
    expect(only?.passRate).toBeNull();
  });
});

describe('passRateOf', () => {
  it('is over finished attempts only', () => {
    expect(passRateOf(3, 1)).toBe(75);
    expect(passRateOf(1, 2)).toBe(33.33);
    expect(passRateOf(0, 0)).toBeNull();
  });
});

describe('topPercentOf', () => {
  it('describes a rank as a slice of the field', () => {
    expect(topPercentOf(1, 10)).toBe(10);
    expect(topPercentOf(5, 10)).toBe(50);
    expect(topPercentOf(9, 10)).toBe(90);
    expect(topPercentOf(1, 200)).toBe(1);
  });

  it('is null without a field', () => {
    expect(topPercentOf(1, 0)).toBeNull();
    expect(topPercentOf(0, 10)).toBeNull();
  });
});

describe('periodStart', () => {
  const now = new Date('2026-03-15T12:00:00.000Z');

  it('is null for all time', () => {
    expect(periodStart('all', now)).toBeNull();
  });

  it('is a rolling thirty- and seven-day window', () => {
    expect(periodStart('month', now)?.toISOString()).toBe('2026-02-13T12:00:00.000Z');
    expect(periodStart('week', now)?.toISOString()).toBe('2026-03-08T12:00:00.000Z');
  });
});

describe('leaderboardQuerySchema', () => {
  it('defaults to the overall average board', () => {
    expect(leaderboardQuerySchema.parse({})).toEqual({
      metric: 'average',
      period: 'all',
      limit: DEFAULT_LEADERBOARD_LIMIT,
    });
  });

  it('accepts every metric, period and a category filter', () => {
    for (const metric of LEADERBOARD_METRICS) {
      expect(leaderboardQuerySchema.parse({ metric }).metric).toBe(metric);
    }
    for (const period of LEADERBOARD_PERIODS) {
      expect(leaderboardQuerySchema.parse({ period }).period).toBe(period);
    }

    const parsed = leaderboardQuerySchema.parse({
      metric: 'best',
      period: 'week',
      categoryId: '11111111-1111-4111-8111-111111111111',
      limit: '5',
    });

    expect(parsed).toMatchObject({ metric: 'best', period: 'week', limit: 5 });
  });

  it('rejects unknown metrics, periods, ids and limits', () => {
    expect(leaderboardQuerySchema.safeParse({ metric: 'streak' }).success).toBe(false);
    expect(leaderboardQuerySchema.safeParse({ period: 'year' }).success).toBe(false);
    expect(leaderboardQuerySchema.safeParse({ categoryId: 'nope' }).success).toBe(false);
    expect(leaderboardQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(
      leaderboardQuerySchema.safeParse({ limit: String(MAX_LEADERBOARD_LIMIT + 1) }).success,
    ).toBe(false);
  });
});

describe('leaderboardResponseSchema', () => {
  const valid = {
    generatedAt: '2026-03-15T12:00:00.000Z',
    metric: 'average' as const,
    period: 'all' as const,
    scope: { type: 'overall' as const, categoryId: null, categoryName: null },
    entries: [
      {
        rank: 1,
        userId: 'u1',
        name: 'Rahul',
        averagePercentage: 96,
        bestPercentage: 100,
        attempts: 4,
        quizzesCompleted: 3,
        passed: 4,
        failed: 0,
        passRate: 100,
        lastAttemptAt: '2026-03-14T10:00:00.000Z',
        isCurrentUser: false,
        gapToNext: 0,
      },
    ],
    currentUser: null,
    totals: { participants: 1, attempts: 4, quizzes: 3 },
  };

  it('accepts a complete board', () => {
    expect(leaderboardResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an empty board', () => {
    expect(
      leaderboardResponseSchema.safeParse({
        ...valid,
        entries: [],
        totals: { participants: 0, attempts: 0, quizzes: 0 },
      }).success,
    ).toBe(true);
  });

  it('rejects a row without a rank', () => {
    const broken = { ...valid, entries: [{ ...valid.entries[0], rank: undefined }] };
    expect(leaderboardResponseSchema.safeParse(broken).success).toBe(false);
  });
});
