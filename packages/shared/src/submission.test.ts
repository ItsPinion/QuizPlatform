import { describe, expect, it } from 'vitest';

import {
  attemptResultSchema,
  gradeAttempt,
  isFinishedAttempt,
  submitAttemptResponseSchema,
  timeTakenSeconds,
  wasAutoSubmitted,
} from './submission';

/** A two-question paper: q1 worth 1, q2 worth 2. */
const questions = [
  {
    id: 'q1',
    marks: 1,
    options: [
      { id: 'q1-a', isCorrect: false },
      { id: 'q1-b', isCorrect: true },
    ],
  },
  {
    id: 'q2',
    marks: 2,
    options: [
      { id: 'q2-a', isCorrect: true },
      { id: 'q2-b', isCorrect: false },
    ],
  },
];

describe('gradeAttempt', () => {
  it('counts correct, incorrect and unanswered answers', () => {
    const result = gradeAttempt({
      questions,
      answers: [{ questionId: 'q1', selectedOptionId: 'q1-b' }],
      passingScore: 60,
    });

    expect(result.correctAnswers).toBe(1);
    expect(result.incorrectAnswers).toBe(0);
    expect(result.unanswered).toBe(1);
    expect(result.score).toBe(1);
    expect(result.totalMarks).toBe(3);
    expect(result.percentage).toBe(33.33);
    expect(result.status).toBe('FAILED');
    expect(result.passed).toBe(false);
  });

  it('weights marks per question', () => {
    const result = gradeAttempt({
      questions,
      answers: [
        { questionId: 'q1', selectedOptionId: 'q1-a' },
        { questionId: 'q2', selectedOptionId: 'q2-a' },
      ],
      passingScore: 60,
    });

    expect(result.incorrectAnswers).toBe(1);
    expect(result.correctAnswers).toBe(1);
    expect(result.score).toBe(2);
    expect(result.totalMarks).toBe(3);
    expect(result.percentage).toBe(66.67);
    expect(result.passed).toBe(true);
    expect(result.status).toBe('PASSED');
  });

  it('treats a selection outside the question’s options as unanswered', () => {
    const result = gradeAttempt({
      questions,
      // `q2-a` is a real option — of the other question.
      answers: [{ questionId: 'q1', selectedOptionId: 'q2-a' }],
      passingScore: 50,
    });

    expect(result.unanswered).toBe(2);
    expect(result.incorrectAnswers).toBe(0);
    expect(result.score).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it('treats an unknown question id as nothing at all', () => {
    const result = gradeAttempt({
      questions,
      answers: [{ questionId: 'gone', selectedOptionId: 'q1-b' }],
      passingScore: 50,
    });

    expect(result.unanswered).toBe(2);
    expect(result.score).toBe(0);
  });

  it('lets the last row win when a question is answered twice', () => {
    const result = gradeAttempt({
      questions: [questions[0]!],
      answers: [
        { questionId: 'q1', selectedOptionId: 'q1-b' },
        { questionId: 'q1', selectedOptionId: 'q1-a' },
      ],
      passingScore: 50,
    });

    expect(result.correctAnswers).toBe(0);
    expect(result.incorrectAnswers).toBe(1);
    expect(result.score).toBe(0);
  });

  it('passes exactly on the pass mark', () => {
    const result = gradeAttempt({
      questions,
      answers: [
        { questionId: 'q1', selectedOptionId: 'q1-b' },
        { questionId: 'q2', selectedOptionId: 'q2-a' },
      ],
      passingScore: 100,
    });

    expect(result.percentage).toBe(100);
    expect(result.passed).toBe(true);
  });

  it('fails one point below the pass mark', () => {
    const result = gradeAttempt({
      questions,
      answers: [{ questionId: 'q1', selectedOptionId: 'q1-b' }],
      passingScore: 34,
    });

    expect(result.percentage).toBe(33.33);
    expect(result.passed).toBe(false);
  });

  it('never passes an empty paper, even with a zero pass mark', () => {
    const result = gradeAttempt({ questions: [], answers: [], passingScore: 0 });

    expect(result.totalMarks).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.unanswered).toBe(0);
  });

  it('rounds percentages to two decimals', () => {
    const three = [
      { id: 'a', marks: 1, options: [{ id: 'a1', isCorrect: true }] },
      { id: 'b', marks: 1, options: [{ id: 'b1', isCorrect: true }] },
      { id: 'c', marks: 1, options: [{ id: 'c1', isCorrect: true }] },
    ];

    const result = gradeAttempt({
      questions: three,
      answers: [{ questionId: 'a', selectedOptionId: 'a1' }],
      passingScore: 50,
    });

    expect(result.percentage).toBe(33.33);
  });

  it('leaves nullable selections out of the counts', () => {
    const result = gradeAttempt({
      questions,
      answers: [{ questionId: 'q1', selectedOptionId: null }],
      passingScore: 50,
    });

    expect(result.unanswered).toBe(2);
    expect(result.incorrectAnswers).toBe(0);
  });
});

describe('timeTakenSeconds', () => {
  const started = Date.parse('2026-01-01T12:00:00.000Z');

  it('measures whole seconds between start and finish', () => {
    expect(timeTakenSeconds(started, started + 14 * 60_000 + 21_000)).toBe(861);
    expect(timeTakenSeconds(new Date(started), new Date(started + 90_000))).toBe(90);
  });

  it('rounds to the nearest second', () => {
    expect(timeTakenSeconds(started, started + 1_400)).toBe(1);
    expect(timeTakenSeconds(started, started + 1_600)).toBe(2);
  });

  it('never reports a negative duration', () => {
    expect(timeTakenSeconds(started, started - 5_000)).toBe(0);
  });
});

describe('wasAutoSubmitted', () => {
  const started = Date.parse('2026-01-01T12:00:00.000Z');
  const expires = started + 20 * 60_000;

  it('is false for a submission inside the window', () => {
    expect(wasAutoSubmitted(started + 60_000, expires)).toBe(false);
  });

  it('is true exactly at the deadline and after it', () => {
    expect(wasAutoSubmitted(expires, expires)).toBe(true);
    expect(wasAutoSubmitted(new Date(expires + 1), new Date(expires))).toBe(true);
  });
});

describe('result wire shape', () => {
  const result = {
    score: 8,
    totalMarks: 10,
    percentage: 80,
    correctAnswers: 16,
    incorrectAnswers: 3,
    unanswered: 1,
    passingScore: 60,
    passed: true,
    status: 'PASSED' as const,
    timeTakenSeconds: 861,
    startedAt: '2026-01-01T12:00:00.000Z',
    completedAt: '2026-01-01T12:14:21.000Z',
    autoSubmitted: false,
  };

  it('parses a graded result', () => {
    expect(attemptResultSchema.parse(result)).toEqual(result);
  });

  it('parses the submit envelope', () => {
    const body = {
      attemptId: 'attempt-1',
      quizId: 'quiz-1',
      alreadySubmitted: false,
      result,
    };

    expect(submitAttemptResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects a status outside the pass/fail pair', () => {
    expect(() => attemptResultSchema.parse({ ...result, status: 'IN_PROGRESS' })).toThrow();
  });

  it('knows which attempt statuses are finished', () => {
    expect(isFinishedAttempt('PASSED')).toBe(true);
    expect(isFinishedAttempt('FAILED')).toBe(true);
    expect(isFinishedAttempt('EXPIRED')).toBe(true);
    expect(isFinishedAttempt('IN_PROGRESS')).toBe(false);
    expect(isFinishedAttempt('nope')).toBe(false);
  });
});
