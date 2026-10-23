import { describe, expect, it } from 'vitest';

import {
  attemptProgress,
  attemptSessionSchema,
  attemptTimerTone,
  formatClock,
  saveAnswerSchema,
  secondsRemaining,
  startDecision,
  studentQuizListQuerySchema,
} from './attempt';

describe('secondsRemaining', () => {
  const now = Date.parse('2026-01-01T12:00:00.000Z');

  it('counts whole seconds to the deadline', () => {
    expect(secondsRemaining('2026-01-01T12:00:30.000Z', now)).toBe(30);
    expect(secondsRemaining(new Date('2026-01-01T12:10:00.000Z'), now)).toBe(600);
  });

  it('rounds up, so a sub-second remainder still reads as one second', () => {
    expect(secondsRemaining(now + 400, now)).toBe(1);
  });

  it('never goes negative', () => {
    expect(secondsRemaining('2026-01-01T11:59:00.000Z', now)).toBe(0);
    expect(secondsRemaining(new Date(now - 60_000), now)).toBe(0);
  });

  it('accepts a timestamp number', () => {
    expect(secondsRemaining(now + 5_000, now)).toBe(5);
  });
});

describe('formatClock', () => {
  it('formats minutes and seconds below an hour', () => {
    expect(formatClock(872)).toBe('14:32');
    expect(formatClock(60)).toBe('01:00');
    expect(formatClock(9)).toBe('00:09');
    expect(formatClock(0)).toBe('00:00');
  });

  it('adds an hours field when needed', () => {
    expect(formatClock(3_872)).toBe('1:04:32');
    expect(formatClock(3_600)).toBe('1:00:00');
  });

  it('clamps negative input instead of printing a minus sign', () => {
    expect(formatClock(-30)).toBe('00:00');
  });
});

describe('startDecision', () => {
  const base = {
    status: 'PUBLISHED' as const,
    questionCount: 5,
    maxAttempts: 2,
    attemptsUsed: 0,
    inProgressAttemptId: null,
  };

  it('allows a fresh attempt with tries left', () => {
    expect(startDecision(base)).toEqual({ allowed: true, code: null, message: null });
  });

  it('refuses quizzes that are not published, whatever the attempts', () => {
    for (const status of ['DRAFT', 'UNPUBLISHED'] as const) {
      expect(startDecision({ ...base, status }).code).toBe('QUIZ_NOT_PUBLISHED');
    }
  });

  it('refuses an empty quiz', () => {
    expect(startDecision({ ...base, questionCount: 0 }).code).toBe('QUIZ_HAS_NO_QUESTIONS');
  });

  it('refuses once every attempt is used', () => {
    const decision = startDecision({ ...base, maxAttempts: 2, attemptsUsed: 2 });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('ATTEMPTS_EXHAUSTED');
    expect(decision.message).toContain('all 2 attempts');
  });

  it('says "attempt" in the singular', () => {
    expect(startDecision({ ...base, maxAttempts: 1, attemptsUsed: 1 }).message).toContain(
      'all 1 attempt for',
    );
  });

  it('lets a live attempt be resumed even when the attempts are spent', () => {
    const decision = startDecision({
      ...base,
      attemptsUsed: 2,
      inProgressAttemptId: 'attempt-1',
    });

    expect(decision.allowed).toBe(true);
  });
});

describe('attemptProgress', () => {
  const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];

  it('counts only answers to questions in this attempt', () => {
    expect(
      attemptProgress(questions, [
        { questionId: 'q1', selectedOptionId: 'o1' },
        { questionId: 'q2', selectedOptionId: null },
        { questionId: 'ghost', selectedOptionId: 'o9' },
      ]),
    ).toEqual({ answered: 1, unanswered: 2, total: 3 });
  });

  it('treats a cleared answer as unanswered', () => {
    expect(
      attemptProgress(
        questions,
        questions.map((question) => ({
          questionId: question.id,
          selectedOptionId: null,
        })),
      ),
    ).toEqual({ answered: 0, unanswered: 3, total: 3 });
  });

  it('handles an empty quiz', () => {
    expect(attemptProgress([], [])).toEqual({ answered: 0, unanswered: 0, total: 0 });
  });
});

describe('attemptTimerTone', () => {
  it('escalates as the deadline approaches', () => {
    expect(attemptTimerTone(900)).toBe('normal');
    expect(attemptTimerTone(300)).toBe('warning');
    expect(attemptTimerTone(60)).toBe('critical');
    expect(attemptTimerTone(0)).toBe('critical');
  });
});

describe('saveAnswerSchema', () => {
  const optionId = '11111111-1111-4111-8111-111111111111';

  it('accepts an option id or an explicit null', () => {
    expect(saveAnswerSchema.parse({ optionId }).optionId).toBe(optionId);
    expect(saveAnswerSchema.parse({ optionId: null }).optionId).toBeNull();
  });

  it('rejects a malformed id and a missing key', () => {
    expect(saveAnswerSchema.safeParse({ optionId: 'nope' }).success).toBe(false);
    expect(saveAnswerSchema.safeParse({}).success).toBe(false);
  });
});

describe('studentQuizListQuerySchema', () => {
  it('applies paging defaults', () => {
    const parsed = studentQuizListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(9);
    expect(parsed.sort).toBe('newest');
  });

  it('clamps the page size and rejects unknown sorts', () => {
    expect(studentQuizListQuerySchema.safeParse({ pageSize: 25 }).success).toBe(false);
    expect(studentQuizListQuerySchema.safeParse({ sort: 'popular' }).success).toBe(false);
  });
});

describe('attemptSessionSchema', () => {
  const session = {
    attempt: {
      id: 'a1',
      status: 'IN_PROGRESS',
      startedAt: '2026-01-01T12:00:00.000Z',
      expiresAt: '2026-01-01T12:20:00.000Z',
      secondsRemaining: 1200,
      expired: false,
      serverNow: '2026-01-01T12:00:00.000Z',
    },
    quiz: {
      id: 'q1',
      title: 'CSS',
      slug: 'css',
      description: null,
      durationMinutes: 20,
      passingScore: 60,
      questionCount: 1,
      totalMarks: 2,
    },
    questions: [
      {
        id: 'qq1',
        position: 0,
        questionText: 'Which one?',
        marks: 2,
        difficulty: 'EASY',
        options: [{ id: 'o1', text: 'A', position: 0 }],
      },
    ],
    answers: [{ questionId: 'qq1', selectedOptionId: null }],
  };

  it('accepts a well-formed payload', () => {
    expect(attemptSessionSchema.safeParse(session).success).toBe(true);
  });

  it('rejects an unknown attempt status', () => {
    expect(
      attemptSessionSchema.safeParse({
        ...session,
        attempt: { ...session.attempt, status: 'SUBMITTED' },
      }).success,
    ).toBe(false);
  });
});
