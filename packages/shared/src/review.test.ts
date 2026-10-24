import { describe, expect, it } from 'vitest';

import {
  attemptHistoryQuerySchema,
  attemptHistoryResponseSchema,
  attemptReviewSchema,
  earnedMarks,
  historyStatusLabel,
  reviewCounts,
  reviewVerdict,
  verdictMatchesFilter,
} from './review';

const result = {
  score: 3,
  totalMarks: 4,
  percentage: 75,
  correctAnswers: 2,
  incorrectAnswers: 1,
  unanswered: 0,
  passingScore: 60,
  passed: true,
  status: 'PASSED' as const,
  timeTakenSeconds: 300,
  startedAt: '2026-01-01T12:00:00.000Z',
  completedAt: '2026-01-01T12:05:00.000Z',
  autoSubmitted: false,
  penalty: 0,
  negativeMarks: 0,
  certificateCode: null,
  formats: [{ type: 'MCQ' as const, total: 4, correct: 2, incorrect: 1, unanswered: 1 }],
};

const question = {
  id: 'q1',
  position: 0,
  type: 'MCQ' as const,
  questionText: 'Which one?',
  imageUrl: null,
  codeSnippet: null,
  marks: 2,
  difficulty: 'EASY' as const,
  explanation: 'Because it is.',
  selectedOptionId: 'o1',
  selectedOptionIds: ['o1'],
  correctOptionId: 'o1',
  answerText: null,
  verdict: 'CORRECT' as const,
  earnedMarks: 2,
  options: [
    { id: 'o1', text: 'Right', position: 0, isCorrect: true, selected: true },
    { id: 'o2', text: 'Wrong', position: 1, isCorrect: false, selected: false },
  ],
};

const review = {
  attempt: {
    id: 'a1',
    status: 'PASSED' as const,
    startedAt: '2026-01-01T12:00:00.000Z',
    completedAt: '2026-01-01T12:05:00.000Z',
    timeTakenSeconds: 300,
    autoSubmitted: false,
  },
  quiz: {
    id: 'z1',
    title: 'CSS Essentials',
    slug: 'css-essentials',
    categoryName: 'CSS',
    difficulty: 'EASY' as const,
    passingScore: 60,
  },
  result,
  questions: [question],
  counts: { all: 1, correct: 1, incorrect: 0, unanswered: 0 },
};

describe('reviewVerdict', () => {
  it('splits correct, incorrect and unanswered', () => {
    expect(reviewVerdict('o1', 'o1')).toBe('CORRECT');
    expect(reviewVerdict('o2', 'o1')).toBe('INCORRECT');
    expect(reviewVerdict(null, 'o1')).toBe('UNANSWERED');
  });

  it('never calls a selection "correct" without a key to compare', () => {
    expect(reviewVerdict('o1', null)).toBe('INCORRECT');
    expect(reviewVerdict(null, null)).toBe('UNANSWERED');
  });
});

describe('earnedMarks', () => {
  it('pays only for correct', () => {
    expect(earnedMarks('CORRECT', 3)).toBe(3);
    expect(earnedMarks('INCORRECT', 3)).toBe(0);
    expect(earnedMarks('UNANSWERED', 3)).toBe(0);
  });
});

describe('reviewCounts', () => {
  it('tallies verdicts and keeps the total', () => {
    expect(
      reviewCounts([
        { verdict: 'CORRECT' },
        { verdict: 'INCORRECT' },
        { verdict: 'INCORRECT' },
        { verdict: 'UNANSWERED' },
      ]),
    ).toEqual({ all: 4, correct: 1, incorrect: 2, unanswered: 1 });

    expect(reviewCounts([])).toEqual({ all: 0, correct: 0, incorrect: 0, unanswered: 0 });
  });
});

describe('verdictMatchesFilter', () => {
  it('matches the filter and always allows "all"', () => {
    expect(verdictMatchesFilter('CORRECT', 'all')).toBe(true);
    expect(verdictMatchesFilter('CORRECT', 'correct')).toBe(true);
    expect(verdictMatchesFilter('CORRECT', 'incorrect')).toBe(false);
    expect(verdictMatchesFilter('UNANSWERED', 'unanswered')).toBe(true);
    expect(verdictMatchesFilter('INCORRECT', 'incorrect')).toBe(true);
  });
});

describe('review payload', () => {
  it('parses a full review', () => {
    expect(attemptReviewSchema.parse(review)).toEqual(review);
  });

  it('rejects a verdict outside the three-way split', () => {
    expect(() =>
      attemptReviewSchema.parse({
        ...review,
        questions: [{ ...question, verdict: 'MAYBE' }],
      }),
    ).toThrow();
  });

  it('requires a completedAt — a review only exists for a finished attempt', () => {
    expect(() =>
      attemptReviewSchema.parse({
        ...review,
        attempt: { ...review.attempt, completedAt: null },
      }),
    ).toThrow();
  });
});

describe('attempt history', () => {
  it('defaults the query', () => {
    expect(attemptHistoryQuerySchema.parse({})).toEqual({
      sort: 'newest',
      page: 1,
      pageSize: 10,
    });
  });

  it('coerces paging and caps the page size', () => {
    expect(attemptHistoryQuerySchema.parse({ page: '3', pageSize: '25' }).page).toBe(3);
    expect(attemptHistoryQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false);
    expect(attemptHistoryQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('rejects unknown statuses and sorts', () => {
    expect(attemptHistoryQuerySchema.safeParse({ status: 'EXPIRED' }).success).toBe(false);
    expect(attemptHistoryQuerySchema.safeParse({ sort: 'random' }).success).toBe(false);
  });

  it('parses a history page', () => {
    const page = {
      attempts: [
        {
          id: 'a1',
          quizId: 'z1',
          quizTitle: 'CSS Essentials',
          quizSlug: 'css-essentials',
          categoryName: 'CSS',
          difficulty: 'EASY' as const,
          status: 'PASSED' as const,
          passed: true,
          score: 3,
          totalMarks: 4,
          percentage: 75,
          correctAnswers: 2,
          incorrectAnswers: 1,
          unanswered: 0,
          passingScore: 60,
          startedAt: '2026-01-01T12:00:00.000Z',
          completedAt: '2026-01-01T12:05:00.000Z',
          timeTakenSeconds: 300,
          autoSubmitted: false,
          inProgress: false,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
      filters: { quizId: null, status: null, sort: 'newest' as const },
      totals: { attempts: 1, passed: 1, failed: 0, inProgress: 0, bestPercentage: 75 },
    };

    expect(attemptHistoryResponseSchema.parse(page)).toEqual(page);
  });

  it('labels every attempt status', () => {
    expect(historyStatusLabel({ status: 'PASSED' })).toBe('Passed');
    expect(historyStatusLabel({ status: 'FAILED' })).toBe('Failed');
    expect(historyStatusLabel({ status: 'IN_PROGRESS' })).toBe('In progress');
    expect(historyStatusLabel({ status: 'EXPIRED' })).toBe('Expired');
  });
});
