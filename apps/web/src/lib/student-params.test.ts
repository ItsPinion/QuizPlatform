import type { StudentQuiz } from '@quiz/shared/attempt';
import type { AttemptResult } from '@quiz/shared/submission';
import { describe, expect, it } from 'vitest';

import {
  attemptsLabel,
  autoSubmitNote,
  bestScoreLabel,
  clockLabel,
  describeClock,
  describeStudentFilters,
  formatPercentage,
  hasStudentFilters,
  optionLetter,
  parseStudentFilters,
  progressPercent,
  quizzesHref,
  resultHeadline,
  resultSummary,
  resultTone,
  scoreFraction,
  startLabel,
  startState,
  timeTakenLabel,
  timerClass,
  toStudentQuery,
} from './student-params';

const QUIZ: StudentQuiz = {
  id: 'quiz-1',
  title: 'CSS Essentials',
  slug: 'css-essentials',
  description: null,
  categoryId: 'cat-1',
  categoryName: 'CSS',
  difficulty: 'MEDIUM',
  durationMinutes: 15,
  passingScore: 60,
  maxAttempts: 3,
  questionCount: 4,
  totalMarks: 4,
  thumbnailUrl: null,
  attemptsUsed: 0,
  attemptsRemaining: 3,
  bestPercentage: null,
  lastAttemptAt: null,
  inProgressAttemptId: null,
};

describe('parseStudentFilters', () => {
  it('applies defaults', () => {
    expect(parseStudentFilters({})).toEqual({
      search: '',
      categoryId: '',
      difficulty: '',
      sort: 'newest',
      page: 1,
    });
  });

  it('keeps valid values and trims the search', () => {
    expect(
      parseStudentFilters({
        search: '  css ',
        difficulty: 'easy',
        sort: 'title',
        page: '2',
      }),
    ).toEqual({ search: 'css', categoryId: '', difficulty: 'EASY', sort: 'title', page: 2 });
  });

  it('falls back for hand-edited URLs', () => {
    const parsed = parseStudentFilters({
      difficulty: 'impossible',
      sort: 'popular',
      page: '-4',
      categoryId: 'nope',
    });

    expect(parsed.difficulty).toBe('');
    expect(parsed.sort).toBe('newest');
    expect(parsed.page).toBe(1);
    expect(parsed.categoryId).toBe('');
  });

  it('accepts a uuid category id and takes the first of a repeated param', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(parseStudentFilters({ categoryId: id }).categoryId).toBe(id);
    expect(parseStudentFilters({ search: ['a', 'b'] }).search).toBe('a');
  });
});

describe('toStudentQuery', () => {
  it('sends only the filters that are set', () => {
    expect(toStudentQuery(parseStudentFilters({}))).toEqual({
      sort: 'newest',
      page: '1',
      pageSize: '9',
    });

    expect(
      toStudentQuery(
        parseStudentFilters({ search: 'css', difficulty: 'HARD', sort: 'duration', page: '3' }),
      ),
    ).toEqual({
      sort: 'duration',
      page: '3',
      pageSize: '9',
      search: 'css',
      difficulty: 'HARD',
    });
  });
});

describe('quizzesHref', () => {
  it('round-trips through parseStudentFilters', () => {
    const href = quizzesHref({ search: 'react hooks', categoryId: 'forgiven', page: 2 });
    expect(href).toBe('/student/quizzes?search=react+hooks&page=2');

    const parsed = parseStudentFilters(
      Object.fromEntries(new URL(href, 'http://x').searchParams.entries()),
    );

    expect(parsed.search).toBe('react hooks');
    expect(parsed.page).toBe(2);
  });

  it('omits defaults', () => {
    expect(quizzesHref({})).toBe('/student/quizzes');
    expect(quizzesHref({ sort: 'newest', page: 1 })).toBe('/student/quizzes');
    expect(quizzesHref({ sort: 'title' })).toBe('/student/quizzes?sort=title');
  });
});

describe('filter summaries', () => {
  it('knows when filters are active', () => {
    expect(hasStudentFilters(parseStudentFilters({}))).toBe(false);
    expect(hasStudentFilters(parseStudentFilters({ search: 'css' }))).toBe(true);
    expect(hasStudentFilters(parseStudentFilters({ difficulty: 'EASY' }))).toBe(true);
  });

  it('describes what is applied', () => {
    const filters = parseStudentFilters({ search: 'css', difficulty: 'EASY' });
    expect(describeStudentFilters(filters, 'CSS')).toEqual(['“css”', 'CSS', 'easy']);
    expect(describeStudentFilters(parseStudentFilters({}))).toEqual([]);
  });
});

describe('start state', () => {
  it('offers to start a quiz with tries left', () => {
    expect(startState(QUIZ)).toBe('start');
    expect(startLabel('start')).toBe('Start quiz');
  });

  it('prefers resuming a live attempt', () => {
    const quiz = { ...QUIZ, inProgressAttemptId: 'attempt-1' };
    expect(startState(quiz)).toBe('resume');
    expect(startLabel('resume')).toBe('Resume attempt');
  });

  it('reports exhaustion and unavailability differently', () => {
    expect(startState({ ...QUIZ, attemptsUsed: 3, attemptsRemaining: 0 })).toBe('exhausted');
    expect(startLabel('exhausted')).toBe('No attempts left');
    expect(startState({ ...QUIZ, questionCount: 0 })).toBe('unavailable');
  });
});

describe('labels', () => {
  it('formats attempts and best score', () => {
    expect(attemptsLabel({ attemptsUsed: 1, maxAttempts: 3 })).toBe('1 of 3 attempts used');
    expect(attemptsLabel({ attemptsUsed: 1, maxAttempts: 1 })).toBe('1 of 1 attempt used');
    expect(bestScoreLabel({ bestPercentage: 72.5 })).toBe('73% best');
    expect(bestScoreLabel({ bestPercentage: null })).toBe('No score yet');
  });

  it('formats the clock and its screen-reader text', () => {
    expect(clockLabel(872)).toBe('14:32');
    expect(describeClock(872)).toBe('14 minutes 32 seconds left');
    expect(describeClock(61)).toBe('1 minute 1 second left');
    expect(describeClock(0)).toBe('Time is up');
  });

  it('letters options from A', () => {
    expect(optionLetter(0)).toBe('A');
    expect(optionLetter(3)).toBe('D');
  });
});

describe('progressPercent', () => {
  it('rounds and clamps', () => {
    expect(progressPercent(0, 4)).toBe(0);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(4, 4)).toBe(100);
    expect(progressPercent(5, 4)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });
});

describe('timerClass', () => {
  it('escalates with the time left', () => {
    expect(timerClass(900, false)).toContain('border-border');
    expect(timerClass(240, false)).toContain('text-warning');
    expect(timerClass(30, false)).toContain('text-destructive');
    expect(timerClass(0, true)).toContain('text-destructive');
  });
});

describe('result presentation', () => {
  const passed: AttemptResult = {
    score: 8,
    totalMarks: 10,
    percentage: 80,
    correctAnswers: 16,
    incorrectAnswers: 3,
    unanswered: 1,
    passingScore: 60,
    passed: true,
    status: 'PASSED',
    timeTakenSeconds: 861,
    startedAt: '2026-01-01T12:00:00.000Z',
    completedAt: '2026-01-01T12:14:21.000Z',
    autoSubmitted: false,
  };

  it('formats a percentage without trailing zeros', () => {
    expect(formatPercentage(80)).toBe('80%');
    expect(formatPercentage(66.67)).toBe('66.67%');
    expect(formatPercentage(0)).toBe('0%');
    expect(formatPercentage(33.333)).toBe('33.33%');
  });

  it('turns pass/fail into a headline and a badge tone', () => {
    expect(resultHeadline(passed)).toBe('You passed');
    expect(resultHeadline({ passed: false })).toBe('Not this time');
    expect(resultTone(true)).toBe('success');
    expect(resultTone(false)).toBe('destructive');
  });

  it('shows the marks behind the percentage', () => {
    expect(scoreFraction(passed)).toBe('8 of 10 marks');
    expect(scoreFraction({ score: 0, totalMarks: 1 })).toBe('0 of 1 mark');
  });

  it('only mentions auto-submission when the clock ended the attempt', () => {
    expect(autoSubmitNote(false)).toBeNull();
    expect(autoSubmitNote(true)).toContain('Time ran out');
  });

  it('formats the time taken as a clock', () => {
    expect(timeTakenLabel(861)).toBe('14:21');
    expect(timeTakenLabel(0)).toBe('00:00');
  });

  it('summarises the verdict in one sentence', () => {
    expect(resultSummary(passed)).toBe('Passed with 80% — 8 of 10 marks');
    expect(resultSummary({ ...passed, passed: false, percentage: 40, score: 4 })).toBe(
      'Failed with 40% — 4 of 10 marks',
    );
  });
});
